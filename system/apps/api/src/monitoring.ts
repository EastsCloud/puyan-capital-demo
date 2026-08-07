import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool, type DatabaseClient, type DatabasePool } from "./db.js";
import { addTradingDays, calculateGroups, type GroupResult } from "./monitoring-reporting-math.js";

const holdingSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  exchangeCode: z.string().trim().min(1).max(24),
  quantity: z.number().nonnegative(),
  marketPrice: z.number().nonnegative(),
  marketValue: z.number().nonnegative(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});

const importSchema = z.object({
  businessDate: z.string().date(),
  filename: z.string().trim().min(1).max(255),
  content: z.string().max(10_000_000),
  holdings: z.array(holdingSchema).min(1).max(2_000),
});

function forbidden(message = "Forbidden") {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 403;
  return error;
}

function invalidState(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 409;
  return error;
}

function requireExecution(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (user.role !== "execution_team") throw forbidden();
  return user;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function effectiveParameters(client: DatabaseClient, organizationId: string): Promise<Record<string, any>> {
  const effective = await client.query(
    `SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1`,
    [organizationId],
  );
  if (effective.rows[0]) return jsonValue(effective.rows[0].parameters);
  const defaults = await client.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
  return jsonValue(defaults.rows[0]?.parameters ?? {});
}

async function workflowRecord(client: DatabaseClient | DatabasePool, workflowId: string, organizationId: string) {
  const result = await client.query(
    `SELECT w.*, p.base_currency FROM workflow_cases w
      JOIN portfolios p ON p.id = w.portfolio_id
     WHERE w.id = $1 AND w.organization_id = $2 AND w.status = 'active'`,
    [workflowId, organizationId],
  );
  if (!result.rows[0]) throw invalidState("Active workflow not found");
  return result.rows[0];
}

async function approvedPortfolio(client: DatabaseClient | DatabasePool, workflowId: string) {
  const result = await client.query(
    `SELECT pp.id, pp.version, st.targets,
            COALESCE(json_agg(json_build_object(
              'ticker', h.ticker, 'exchangeCode', h.exchange_code, 'market', h.market,
              'sleeve', h.sleeve, 'style', h.style, 'weight', h.weight
            ) ORDER BY h.sleeve, h.style, h.ticker) FILTER (WHERE h.id IS NOT NULL), '[]') AS holdings
       FROM proposed_portfolio_versions pp
       JOIN sleeve_target_versions st ON st.id = pp.sleeve_target_version_id
       LEFT JOIN proposed_holdings h ON h.proposed_portfolio_version_id = pp.id
      WHERE pp.workflow_case_id = $1 AND pp.status = 'approved'
      GROUP BY pp.id, st.targets
      ORDER BY pp.version DESC LIMIT 1`,
    [workflowId],
  );
  if (!result.rows[0]) throw invalidState("Approved portfolio not found");
  return {
    ...result.rows[0],
    targets: jsonValue<any>(result.rows[0].targets),
    holdings: jsonValue<Array<any>>(result.rows[0].holdings),
  };
}

function planOrders(
  groups: GroupResult[],
  approvedHoldings: Array<any>,
  totalValue: number,
  mode: "boundary" | "target",
) {
  return groups.flatMap((group) => {
    if (group.status === "within" || !group.tradeSide) return [];
    const tradeValue = mode === "boundary"
      ? group.minimumTradeValue
      : group.tradeSide === "BUY"
        ? (group.targetWeight * totalValue - group.currentWeight * totalValue) / (1 - group.targetWeight)
        : (group.currentWeight * totalValue - group.targetWeight * totalValue) / (1 - group.targetWeight);
    const names = approvedHoldings.filter((holding) => holding.sleeve === group.sleeve && holding.style === group.style);
    const denominator = names.reduce((sum, holding) => sum + Number(holding.weight), 0);
    return names.map((holding) => ({
      ticker: holding.ticker,
      exchangeCode: holding.exchangeCode,
      sleeve: group.sleeve,
      style: group.style,
      side: group.tradeSide,
      value: Math.max(0, tradeValue) * Number(holding.weight) / denominator,
    }));
  });
}

async function createRebalanceNotifications(
  client: DatabaseClient,
  organizationId: string,
  status: "completed" | "overdue",
  context: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO notifications (user_id, category, title_key, body_key, context)
     SELECT id, 'rebalance_followup', $2, $3, $4::jsonb
       FROM users
      WHERE organization_id = $1
        AND role IN ('decision_committee', 'execution_team')
        AND status = 'active'`,
    [
      organizationId,
      status === "completed" ? "rebalance.completed.title" : "rebalance.overdue.title",
      status === "completed" ? "rebalance.completed.body" : "rebalance.overdue.body",
      JSON.stringify(context),
    ],
  );
}

async function verifyAcceptedRebalance(
  client: DatabaseClient,
  workflowId: string,
  organizationId: string,
  actorUserId: string,
  snapshot: { id: string; business_date: unknown },
  approved: Awaited<ReturnType<typeof approvedPortfolio>>,
  normalizedLines: Array<any>,
) {
  const planResult = await client.query(
    `SELECT p.* FROM rebalance_plans p
       JOIN rebalance_checks c ON c.id = p.rebalance_check_id
      WHERE c.workflow_case_id = $1 AND p.status IN ('accepted', 'overdue')
      ORDER BY p.accepted_at DESC LIMIT 1 FOR UPDATE OF p`,
    [workflowId],
  );
  const plan = planResult.rows[0];
  if (!plan || dateString(snapshot.business_date) < dateString(plan.completion_due_date)) return null;

  const parameters = await effectiveParameters(client, organizationId);
  const lowerRelative = Number(parameters.rebalance?.lowerRelativeDriftPct ?? -20) / 100;
  const upperRelative = Number(parameters.rebalance?.upperRelativeDriftPct ?? 20) / 100;
  const results = calculateGroups(approved, normalizedLines, lowerRelative, upperRelative);
  const breachedGroups = results.filter((result) => result.status !== "within");
  const status = breachedGroups.length === 0 ? "completed" : "overdue";
  const followup = await client.query(
    `INSERT INTO rebalance_followups (rebalance_plan_id, position_snapshot_id, verification_date, status, results, verified_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT (rebalance_plan_id, position_snapshot_id) DO UPDATE
       SET status = EXCLUDED.status, results = EXCLUDED.results, verified_by = EXCLUDED.verified_by, verified_at = now()
     RETURNING *`,
    [plan.id, snapshot.id, dateString(snapshot.business_date), status, JSON.stringify(results), actorUserId],
  );
  await client.query(
    `UPDATE rebalance_plans
        SET status = $2,
            completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE NULL END
      WHERE id = $1`,
    [plan.id, status],
  );
  await createRebalanceNotifications(client, organizationId, status, {
    workflowId,
    planId: plan.id,
    optionKey: plan.option_key,
    dueDate: dateString(plan.completion_due_date),
    verificationDate: dateString(snapshot.business_date),
    breachedGroups: breachedGroups.map((result) => result.key),
  });
  return { ...followup.rows[0], results, breachedGroups: breachedGroups.map((result) => result.key) };
}

export async function registerMonitoringRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/notifications", async (request) => {
    const user = requirePasswordChanged(request);
    const result = await pool.query(
      `SELECT id, category, title_key, body_key, context, email_status, read_at, created_at
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [user.id],
    );
    return { notifications: result.rows.map((row) => ({ ...row, context: jsonValue(row.context) })) };
  });

  app.post("/api/notifications/:notificationId/read", async (request) => {
    const user = requirePasswordChanged(request);
    const { notificationId } = request.params as { notificationId: string };
    await pool.query(`UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`, [notificationId, user.id]);
    return { ok: true };
  });

  app.get("/api/workflows/:workflowId/monitoring/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await workflowRecord(pool, workflowId, user.organizationId);
    const approved = await approvedPortfolio(pool, workflowId);
    const [curve, snapshot, check, plans, followup] = await Promise.all([
      pool.query(`SELECT business_date, market_value, currency FROM equity_value_observations WHERE portfolio_id = $1 ORDER BY business_date`, [workflow.portfolio_id]),
      pool.query(`SELECT ps.id, ps.business_date, ps.adapter_name, ps.status, ps.imported_at, sf.original_filename,
                         COALESCE(json_agg(json_build_object('ticker', l.ticker, 'exchangeCode', l.exchange_code, 'quantity', l.quantity,
                           'marketPrice', l.market_price, 'marketValue', l.market_value, 'currency', l.currency, 'classification', l.classification)
                           ORDER BY l.ticker) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
                    FROM position_snapshots ps JOIN source_files sf ON sf.id = ps.source_file_id
                    LEFT JOIN position_snapshot_lines l ON l.position_snapshot_id = ps.id
                   WHERE ps.portfolio_id = $1 GROUP BY ps.id, sf.original_filename ORDER BY ps.business_date DESC, ps.imported_at DESC LIMIT 1`, [workflow.portfolio_id]),
      pool.query(`SELECT * FROM rebalance_checks WHERE workflow_case_id = $1 ORDER BY check_date DESC, checked_at DESC LIMIT 1`, [workflowId]),
      pool.query(`SELECT p.* FROM rebalance_plans p
                    JOIN rebalance_checks c ON c.id = p.rebalance_check_id
                   WHERE c.workflow_case_id = $1
                     AND c.id = (SELECT id FROM rebalance_checks WHERE workflow_case_id = $1 ORDER BY check_date DESC, checked_at DESC LIMIT 1)
                   ORDER BY p.option_key`, [workflowId]),
      pool.query(`SELECT f.*, p.option_key, p.completion_due_date
                    FROM rebalance_followups f
                    JOIN rebalance_plans p ON p.id = f.rebalance_plan_id
                    JOIN rebalance_checks c ON c.id = p.rebalance_check_id
                   WHERE c.workflow_case_id = $1
                   ORDER BY f.verification_date DESC, f.verified_at DESC LIMIT 1`, [workflowId]),
    ]);
    return {
      workflowStep: workflow.current_step,
      approvedHoldings: approved.holdings,
      curve: curve.rows,
      latestSnapshot: snapshot.rows[0] ? { ...snapshot.rows[0], lines: jsonValue(snapshot.rows[0].lines) } : null,
      latestCheck: check.rows[0] ? { ...check.rows[0], results: jsonValue(check.rows[0].results) } : null,
      plans: plans.rows.map((row) => ({ ...row, orders: jsonValue(row.orders), expected_results: jsonValue(row.expected_results) })),
      latestFollowup: followup.rows[0] ? { ...followup.rows[0], results: jsonValue(followup.rows[0].results) } : null,
    };
  });

  app.post("/api/workflows/:workflowId/position-imports", async (request, reply) => {
    const user = requireExecution(request);
    const input = importSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await workflowRecord(client, workflowId, user.organizationId);
      if (workflow.current_step !== "monitoring") throw invalidState("Position imports are available during monitoring");
      const approved = await approvedPortfolio(client, workflowId);
      const approvedMap = new Map<string, any>(approved.holdings.map((holding: any) => [`${holding.ticker}|${holding.exchangeCode}`, holding]));
      const uniqueKeys = new Set<string>();
      const normalized = input.holdings.map((holding) => {
        const key = `${holding.ticker.toUpperCase()}|${holding.exchangeCode.toUpperCase()}`;
        if (uniqueKeys.has(key)) throw invalidState(`Duplicate holding ${key}`);
        uniqueKeys.add(key);
        const match = approvedMap.get(key);
        if (!match) throw invalidState(`Ticker is not in the approved portfolio: ${key}`);
        const calculated = holding.quantity * holding.marketPrice;
        const tolerance = Math.max(0.01, holding.marketValue * 0.001);
        if (Math.abs(calculated - holding.marketValue) > tolerance) throw invalidState(`Market value does not reconcile for ${holding.ticker}`);
        return { ...holding, ticker: holding.ticker.toUpperCase(), exchangeCode: holding.exchangeCode.toUpperCase(), classification: { sleeve: match.sleeve, style: match.style, market: match.market } };
      });
      const missing = approved.holdings.filter((holding: any) => !uniqueKeys.has(`${holding.ticker}|${holding.exchangeCode}`));
      if (missing.length > 0) throw invalidState(`Approved holdings missing from import: ${missing.map((holding: any) => holding.ticker).join(", ")}`);
      const sha = createHash("sha256").update(input.content).digest("hex");
      const source = await client.query(
        `INSERT INTO source_files (organization_id, source_type, original_filename, object_key, content_type, byte_size, sha256, business_date, imported_by, retain_until)
         VALUES ($1, 'futu_positions', $2, $3, 'text/csv', $4, $5, $6, $7, ($6::date + interval '5 years')::date) RETURNING *`,
        [user.organizationId, input.filename, `database://position-import/${input.businessDate}/${sha}`, Buffer.byteLength(input.content), sha, input.businessDate, user.id],
      );
      const snapshot = await client.query(
        `INSERT INTO position_snapshots (portfolio_id, business_date, source_file_id, adapter_name, adapter_version, status, imported_by)
         VALUES ($1, $2, $3, 'futu-csv', '1.0.0', 'effective', $4) RETURNING *`,
        [workflow.portfolio_id, input.businessDate, source.rows[0].id, user.id],
      );
      for (const holding of normalized) {
        await client.query(
          `INSERT INTO position_snapshot_lines (position_snapshot_id, ticker, exchange_code, quantity, market_price, market_value, currency, classification)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [snapshot.rows[0].id, holding.ticker, holding.exchangeCode, holding.quantity, holding.marketPrice, holding.marketValue, holding.currency, JSON.stringify(holding.classification)],
        );
      }
      const total = normalized.reduce((sum, holding) => sum + holding.marketValue, 0);
      await client.query(
        `INSERT INTO equity_value_observations (portfolio_id, position_snapshot_id, business_date, market_value, currency)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (portfolio_id, business_date) DO UPDATE
           SET position_snapshot_id = EXCLUDED.position_snapshot_id,
               market_value = EXCLUDED.market_value,
               currency = EXCLUDED.currency`,
        [workflow.portfolio_id, snapshot.rows[0].id, input.businessDate, total, workflow.base_currency],
      );
      const rebalanceFollowup = await verifyAcceptedRebalance(client, workflowId, user.organizationId, user.id, snapshot.rows[0], approved, normalized.map((holding) => ({ market_value: holding.marketValue, classification: holding.classification })));
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "positions.import", entityType: "position_snapshot", entityId: snapshot.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { businessDate: input.businessDate, filename: input.filename, lines: normalized.length, total, rebalanceFollowup: rebalanceFollowup ? { status: rebalanceFollowup.status, breachedGroups: rebalanceFollowup.breachedGroups } : null } });
      await client.query("COMMIT");
      return reply.code(201).send({ positionSnapshot: snapshot.rows[0], equityMarketValue: total, rebalanceFollowup });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.post("/api/workflows/:workflowId/rebalance-checks", async (request, reply) => {
    const user = requireExecution(request);
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await workflowRecord(client, workflowId, user.organizationId);
      if (workflow.current_step !== "monitoring") throw invalidState("Rebalancing is available during monitoring");
      const snapshot = await client.query(`SELECT * FROM position_snapshots WHERE portfolio_id = $1 AND status = 'effective' ORDER BY business_date DESC, imported_at DESC LIMIT 1`, [workflow.portfolio_id]);
      if (!snapshot.rows[0]) throw invalidState("Import an effective position file before the monthly check");
      const lines = await client.query(`SELECT *, classification FROM position_snapshot_lines WHERE position_snapshot_id = $1`, [snapshot.rows[0].id]);
      const normalizedLines = lines.rows.map((line) => ({ ...line, classification: jsonValue(line.classification) }));
      const parameters = await effectiveParameters(client, user.organizationId);
      const lowerRelative = Number(parameters.rebalance?.lowerRelativeDriftPct ?? -20) / 100;
      const upperRelative = Number(parameters.rebalance?.upperRelativeDriftPct ?? 20) / 100;
      const completionDays = Number(parameters.rebalance?.completionTradingDays ?? 3);
      const approved = await approvedPortfolio(client, workflowId);
      const results = calculateGroups(approved, normalizedLines, lowerRelative, upperRelative);
      const triggered = results.some((result) => result.status !== "within");
      const check = await client.query(
        `INSERT INTO rebalance_checks (workflow_case_id, position_snapshot_id, check_date, check_frequency, corridor_lower_relative, corridor_upper_relative, results, triggered, checked_by)
         VALUES ($1,$2,$3,'monthly',$4,$5,$6::jsonb,$7,$8)
         ON CONFLICT (workflow_case_id, check_date) DO UPDATE
           SET position_snapshot_id = EXCLUDED.position_snapshot_id,
               corridor_lower_relative = EXCLUDED.corridor_lower_relative,
               corridor_upper_relative = EXCLUDED.corridor_upper_relative,
               results = EXCLUDED.results,
               triggered = EXCLUDED.triggered,
               checked_by = EXCLUDED.checked_by,
               checked_at = now()
         RETURNING *`,
        [workflowId, snapshot.rows[0].id, snapshot.rows[0].business_date, lowerRelative, upperRelative, JSON.stringify(results), triggered, user.id],
      );
      await client.query(
        `UPDATE rebalance_plans SET status = 'cancelled'
          WHERE status = 'proposed'
            AND rebalance_check_id IN (SELECT id FROM rebalance_checks WHERE workflow_case_id = $1 AND id <> $2)`,
        [workflowId, check.rows[0].id],
      );
      const plans = [];
      if (triggered) {
        const total = normalizedLines.reduce((sum, line) => sum + Number(line.market_value), 0);
        for (const [optionKey, label, mode] of [["minimum", "Minimum trade to corridor", "boundary"], ["target", "Return to target weight", "target"]] as const) {
          const orders = planOrders(results, approved.holdings, total, mode);
          const plan = await client.query(
            `INSERT INTO rebalance_plans (rebalance_check_id, option_key, label, orders, expected_results, status, completion_due_date)
             VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'proposed',$6)
             ON CONFLICT (rebalance_check_id, option_key) DO UPDATE
               SET label = EXCLUDED.label,
                   orders = EXCLUDED.orders,
                   expected_results = EXCLUDED.expected_results,
                   status = 'proposed',
                   completion_due_date = EXCLUDED.completion_due_date,
                   accepted_by = NULL,
                   accepted_at = NULL
             RETURNING *`,
            [check.rows[0].id, optionKey, label, JSON.stringify(orders), JSON.stringify({ mode, affectedGroups: results.filter((item) => item.status !== "within").map((item) => item.key) }), addTradingDays(snapshot.rows[0].business_date, completionDays)],
          );
          plans.push({ ...plan.rows[0], orders });
        }
      }
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "rebalance.monthly_check", entityType: "rebalance_check", entityId: check.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { checkDate: snapshot.rows[0].business_date, triggered, breachedGroups: results.filter((item) => item.status !== "within").map((item) => item.key) } });
      await client.query("COMMIT");
      return reply.code(201).send({ rebalanceCheck: { ...check.rows[0], results }, plans });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.post("/api/rebalance-plans/:planId/accept", async (request) => {
    const user = requireExecution(request);
    const { planId } = request.params as { planId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT p.*, c.workflow_case_id, w.organization_id FROM rebalance_plans p
          JOIN rebalance_checks c ON c.id = p.rebalance_check_id JOIN workflow_cases w ON w.id = c.workflow_case_id
         WHERE p.id = $1 AND w.organization_id = $2 FOR UPDATE OF p`, [planId, user.organizationId],
      );
      if (!found.rows[0] || found.rows[0].status !== "proposed") throw invalidState("Proposed rebalance plan not found");
      await client.query(`UPDATE rebalance_plans SET status = 'cancelled' WHERE rebalance_check_id = $1 AND status = 'proposed' AND id <> $2`, [found.rows[0].rebalance_check_id, planId]);
      const accepted = await client.query(`UPDATE rebalance_plans SET status = 'accepted', accepted_by = $2, accepted_at = now() WHERE id = $1 RETURNING *`, [planId, user.id]);
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "rebalance.plan.accept", entityType: "rebalance_plan", entityId: planId, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { optionKey: found.rows[0].option_key, completionDueDate: found.rows[0].completion_due_date } });
      await client.query("COMMIT");
      return { rebalancePlan: { ...accepted.rows[0], orders: jsonValue(accepted.rows[0].orders) } };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
}
