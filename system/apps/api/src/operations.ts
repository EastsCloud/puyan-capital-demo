import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";
import { config } from "./config.js";
import { reconcileExecutionFills } from "./operational-math.js";

const fillSchema = z.object({
  ticker: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  exchangeCode: z.string().trim().min(1).max(24).transform((value) => value.toUpperCase()),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().nonnegative(),
  price: z.number().nonnegative(),
  externalTradeId: z.string().trim().max(120).optional(),
});

const fillBatchSchema = z.object({
  businessDate: z.string().date(),
  filename: z.string().trim().min(1).max(255),
  content: z.string().max(10_000_000),
  fills: z.array(fillSchema).min(1).max(5_000),
  valueTolerancePct: z.number().min(0).max(25).default(2),
});

const cashFlowSchema = z.object({
  flowDate: z.string().date(),
  amount: z.number().positive(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  flowType: z.enum(["contribution", "withdrawal"]),
  reference: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1_000).optional(),
});

const distributionSchema = z.object({
  channel: z.enum(["email", "meeting", "secure_link", "other"]),
  recipients: z.string().trim().min(1).max(2_000),
  status: z.enum(["prepared", "sent", "acknowledged"]),
  note: z.string().trim().max(2_000).optional(),
});
const demoResetSchema = z.object({ confirmation: z.literal("RESET DEMO") });

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

function requireAdmin(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (user.role !== "system_admin") throw forbidden();
  return user;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export async function registerOperationalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/demo-reset/status", async (request) => {
    requireAdmin(request);
    return { enabled: config.ENABLE_DEMO_RESET };
  });

  app.post("/api/admin/demo-reset", async (request) => {
    const admin = requireAdmin(request);
    if (!config.ENABLE_DEMO_RESET) throw forbidden("Demo reset is disabled");
    demoResetSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ids = await client.query(`SELECT id FROM workflow_cases WHERE organization_id = $1 FOR UPDATE`, [admin.organizationId]);
      const workflowIds = ids.rows.map((row) => row.id);
      if (workflowIds.length) {
        await client.query(`DELETE FROM report_distributions WHERE report_version_id IN (SELECT r.id FROM report_versions r WHERE r.workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM report_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM external_cash_flows WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM execution_fill_lines WHERE batch_id IN (SELECT id FROM execution_fill_batches WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM execution_fill_batches WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM rebalance_followups WHERE rebalance_plan_id IN (SELECT p.id FROM rebalance_plans p JOIN rebalance_checks c ON c.id = p.rebalance_check_id WHERE c.workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM rebalance_plans WHERE rebalance_check_id IN (SELECT id FROM rebalance_checks WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM rebalance_checks WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM non_equity_nav_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM report_benchmark_observations WHERE benchmark_version_id IN (SELECT id FROM report_benchmark_versions WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM report_benchmark_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM optimization_runs WHERE proposed_portfolio_version_id IN (SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM backtest_runs WHERE proposed_portfolio_version_id IN (SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM proposed_holdings WHERE proposed_portfolio_version_id IN (SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM proposed_portfolio_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM sleeve_target_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM target_return_versions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM annual_data_packages WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM public_data_runs WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM approval_votes WHERE approval_round_id IN (SELECT id FROM approval_rounds WHERE workflow_case_id = ANY($1::uuid[]))`, [workflowIds]);
        await client.query(`DELETE FROM approval_rounds WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM maker_checker_actions WHERE workflow_case_id = ANY($1::uuid[])`, [workflowIds]);
        await client.query(`DELETE FROM workflow_cases WHERE id = ANY($1::uuid[])`, [workflowIds]);
      }
      const portfolios = await client.query(`SELECT id FROM portfolios WHERE organization_id = $1`, [admin.organizationId]);
      const portfolioIds = portfolios.rows.map((row) => row.id);
      if (portfolioIds.length) {
        await client.query(`DELETE FROM equity_value_observations WHERE portfolio_id = ANY($1::uuid[])`, [portfolioIds]);
        await client.query(`DELETE FROM position_snapshot_lines WHERE position_snapshot_id IN (SELECT id FROM position_snapshots WHERE portfolio_id = ANY($1::uuid[]))`, [portfolioIds]);
        await client.query(`DELETE FROM position_snapshots WHERE portfolio_id = ANY($1::uuid[])`, [portfolioIds]);
      }
      await client.query(`DELETE FROM source_files WHERE organization_id = $1`, [admin.organizationId]);
      await client.query(`DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`, [admin.organizationId]);
      await writeAudit(client, { organizationId: admin.organizationId, actorUserId: admin.id, action: "demo.reset", entityType: "organization", entityId: admin.organizationId, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { workflowCount: workflowIds.length, preserved: ["users", "parameters", "portfolio", "external data credentials", "audit"] } });
      await client.query("COMMIT");
      return { ok: true, deletedWorkflows: workflowIds.length };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.get("/api/admin/source-files", async (request) => {
    const admin = requireAdmin(request);
    const result = await pool.query(
      `SELECT sf.id, sf.source_type, sf.original_filename, sf.content_type, sf.byte_size, sf.sha256,
              sf.business_date, sf.imported_at, sf.retain_until, u.display_name AS imported_by_name
         FROM source_files sf JOIN users u ON u.id = sf.imported_by
        WHERE sf.organization_id = $1 ORDER BY sf.imported_at DESC LIMIT 250`,
      [admin.organizationId],
    );
    return { sourceFiles: result.rows };
  });

  app.get("/api/workflows/:workflowId/execution-evidence/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      `SELECT id, current_step FROM workflow_cases WHERE id = $1 AND organization_id = $2`,
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const [actionResult, batchResult, cashResult] = await Promise.all([
      pool.query(
        `SELECT payload FROM maker_checker_actions
          WHERE workflow_case_id = $1 AND action_type = 'confirm_implementation' AND status = 'approved'
          ORDER BY reviewed_at DESC LIMIT 1`,
        [workflowId],
      ),
      pool.query(
        `SELECT b.*, sf.original_filename,
                COALESCE(json_agg(json_build_object(
                  'ticker', l.ticker, 'exchangeCode', l.exchange_code, 'side', l.side,
                  'quantity', l.quantity, 'price', l.price, 'tradeValue', l.trade_value,
                  'externalTradeId', l.external_trade_id, 'plannedValue', l.planned_value,
                  'varianceValue', l.variance_value, 'varianceRate', l.variance_rate,
                  'status', l.reconciliation_status
                ) ORDER BY l.ticker) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
           FROM execution_fill_batches b
           JOIN source_files sf ON sf.id = b.source_file_id
           LEFT JOIN execution_fill_lines l ON l.batch_id = b.id
          WHERE b.workflow_case_id = $1
          GROUP BY b.id, sf.original_filename
          ORDER BY b.business_date DESC, b.imported_at DESC LIMIT 1`,
        [workflowId],
      ),
      pool.query(
        `SELECT * FROM external_cash_flows WHERE workflow_case_id = $1 ORDER BY flow_date, recorded_at`,
        [workflowId],
      ),
    ]);
    const payload = actionResult.rows[0] ? jsonValue<{ orders?: Array<Record<string, unknown>> }>(actionResult.rows[0].payload) : {};
    return {
      workflowStep: workflow.rows[0].current_step,
      approvedOrders: payload.orders ?? [],
      latestFillBatch: batchResult.rows[0] ? { ...batchResult.rows[0], summary: jsonValue(batchResult.rows[0].summary), lines: jsonValue(batchResult.rows[0].lines) } : null,
      cashFlows: cashResult.rows,
    };
  });

  app.post("/api/workflows/:workflowId/execution-fills", async (request, reply) => {
    const user = requireExecution(request);
    const input = fillBatchSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const workflow = await client.query(
        `SELECT id, current_step FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active' FOR UPDATE`,
        [workflowId, user.organizationId],
      );
      if (!workflow.rows[0]) throw invalidState("Active workflow not found");
      if (!["monitoring", "non_equity_nav", "reporting"].includes(workflow.rows[0].current_step)) throw invalidState("Execution fills are available after implementation approval");
      const action = await client.query(
        `SELECT payload FROM maker_checker_actions
          WHERE workflow_case_id = $1 AND action_type = 'confirm_implementation' AND status = 'approved'
          ORDER BY reviewed_at DESC LIMIT 1`,
        [workflowId],
      );
      if (!action.rows[0]) throw invalidState("An approved maker-checker implementation plan is required");
      const planned = jsonValue<{ orders?: Array<any> }>(action.rows[0].payload).orders ?? [];
      const { lines, summary } = reconcileExecutionFills(planned, input.fills, input.valueTolerancePct);
      const exceptions = summary.exceptions;
      const sha = createHash("sha256").update(input.content).digest("hex");
      const source = await client.query(
        `INSERT INTO source_files (organization_id, source_type, original_filename, object_key, content_type, byte_size, sha256, business_date, imported_by, retain_until)
         VALUES ($1,'execution_fills',$2,$3,'text/csv',$4,$5,$6,$7,($6::date + interval '7 years')::date) RETURNING id`,
        [user.organizationId, input.filename, `database://execution-fill/${workflowId}/${input.businessDate}/${sha}`, Buffer.byteLength(input.content), sha, input.businessDate, user.id],
      );
      const batch = await client.query(
        `INSERT INTO execution_fill_batches (workflow_case_id, source_file_id, business_date, status, summary, imported_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
        [workflowId, source.rows[0].id, input.businessDate, exceptions ? "exceptions" : "matched", JSON.stringify(summary), user.id],
      );
      for (const line of lines) await client.query(
        `INSERT INTO execution_fill_lines (batch_id,ticker,exchange_code,side,quantity,price,trade_value,external_trade_id,planned_value,variance_value,variance_rate,reconciliation_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [batch.rows[0].id, line.ticker, line.exchangeCode, line.side, line.quantity, line.price, line.tradeValue, line.externalTradeId ?? null, line.plannedValue, line.varianceValue, line.varianceRate, line.status],
      );
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "execution.fills.import", entityType: "execution_fill_batch", entityId: batch.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: summary });
      await client.query("COMMIT");
      return reply.code(201).send({ fillBatch: { ...batch.rows[0], summary, lines } });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.post("/api/workflows/:workflowId/cash-flows", async (request, reply) => {
    const user = requireExecution(request);
    const input = cashFlowSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(`SELECT id FROM workflow_cases WHERE id = $1 AND organization_id = $2`, [workflowId, user.organizationId]);
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const amount = input.flowType === "withdrawal" ? -input.amount : input.amount;
    const saved = await pool.query(
      `INSERT INTO external_cash_flows (workflow_case_id,flow_date,amount,currency,flow_type,reference,note,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [workflowId, input.flowDate, amount, input.currency, input.flowType, input.reference ?? null, input.note ?? null, user.id],
    );
    await writeAudit(pool, { organizationId: user.organizationId, actorUserId: user.id, action: "cash_flow.record", entityType: "external_cash_flow", entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { flowDate: input.flowDate, amount, currency: input.currency } });
    return reply.code(201).send({ cashFlow: saved.rows[0] });
  });

  app.get("/api/reports/:reportId/distributions", async (request) => {
    const user = requirePasswordChanged(request);
    const { reportId } = request.params as { reportId: string };
    const report = await pool.query(`SELECT r.id FROM report_versions r JOIN workflow_cases w ON w.id = r.workflow_case_id WHERE r.id = $1 AND w.organization_id = $2`, [reportId, user.organizationId]);
    if (!report.rows[0]) throw invalidState("Report not found");
    const result = await pool.query(
      `SELECT d.*, u.display_name AS distributed_by_name FROM report_distributions d JOIN users u ON u.id = d.distributed_by WHERE d.report_version_id = $1 ORDER BY d.distributed_at DESC`,
      [reportId],
    );
    return { distributions: result.rows };
  });

  app.post("/api/reports/:reportId/distributions", async (request, reply) => {
    const user = requireExecution(request);
    const input = distributionSchema.parse(request.body);
    const { reportId } = request.params as { reportId: string };
    const report = await pool.query(`SELECT r.id, r.status FROM report_versions r JOIN workflow_cases w ON w.id = r.workflow_case_id WHERE r.id = $1 AND w.organization_id = $2`, [reportId, user.organizationId]);
    if (!report.rows[0]) throw invalidState("Report not found");
    if (report.rows[0].status !== "published") throw invalidState("Publish the report before recording distribution");
    const saved = await pool.query(
      `INSERT INTO report_distributions (report_version_id,channel,recipients,status,note,distributed_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [reportId, input.channel, input.recipients, input.status, input.note ?? null, user.id],
    );
    await writeAudit(pool, { organizationId: user.organizationId, actorUserId: user.id, action: "report.distribute", entityType: "report_distribution", entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { reportId, channel: input.channel, status: input.status } });
    return reply.code(201).send({ distribution: saved.rows[0] });
  });
}
