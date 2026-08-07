import type { FastifyInstance } from "fastify";
import { hasPermission } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";

const saveSchema = z.object({
  holdings: z.array(z.object({ tickerUniverseId: z.string().uuid(), weight: z.number().positive().max(1) })).min(12).max(30),
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

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

async function constructionPolicy(organizationId: string) {
  const effective = await pool.query(
    "SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1",
    [organizationId],
  );
  const defaults = effective.rows[0] ? null : await pool.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
  const parameters = jsonValue<Record<string, unknown>>((effective.rows[0] ?? defaults!.rows[0]).parameters);
  return (parameters.portfolioConstruction ?? {
    maxSingleSecurityWeightPct: 35, styleTickerMin: 2, styleTickerMax: 5, equityMarkets: ["US", "JP", "HK", "CN_A"],
  }) as { maxSingleSecurityWeightPct: number; styleTickerMin: number; styleTickerMax: number; equityMarkets: string[] };
}

export async function registerProposedPortfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/portfolio-approval/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const result = await pool.query(
      `SELECT p.*, s.targets, b.id AS backtest_run_id, b.start_date, b.end_date, b.metrics, b.data_manifest,
              COALESCE(json_agg(h ORDER BY h.sleeve, h.style, h.ticker)
                FILTER (WHERE h.id IS NOT NULL), '[]') AS holdings
         FROM proposed_portfolio_versions p
         JOIN workflow_cases w ON w.id = p.workflow_case_id
         JOIN sleeve_target_versions s ON s.id = p.sleeve_target_version_id
         JOIN backtest_runs b ON b.proposed_portfolio_version_id = p.id AND b.hard_control_pass = true
         LEFT JOIN proposed_holdings h ON h.proposed_portfolio_version_id = p.id
        WHERE p.workflow_case_id = $1 AND w.organization_id = $2 AND p.status IN ('backtest_passed', 'approved')
        GROUP BY p.id, s.targets, b.id ORDER BY p.version DESC, b.run_at DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    if (!result.rows[0]) throw invalidState("Backtest-passed portfolio not found");
    return { portfolio: result.rows[0] };
  });
  app.get("/api/workflows/:workflowId/proposed-portfolio/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      "SELECT id FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0]) throw invalidState("Active workflow not found");
    const universe = await pool.query("SELECT * FROM ticker_universe WHERE enabled = true ORDER BY sleeve, style, ticker");
    const policy = await constructionPolicy(user.organizationId);
    const defaults: Array<{ tickerUniverseId: string; weight: number }> = [];
    for (const sleeve of ["us", "developedNonUs", "emerging"]) {
      for (const style of ["growth", "value"]) {
        universe.rows.filter((row) => row.sleeve === sleeve && row.style === style).slice(0, 2)
          .forEach((row) => defaults.push({ tickerUniverseId: row.id, weight: 0.25 }));
      }
    }
    const latest = await pool.query(
      `SELECT p.*, COALESCE(json_agg(h ORDER BY h.sleeve, h.style, h.ticker)
        FILTER (WHERE h.id IS NOT NULL), '[]') AS holdings
       FROM proposed_portfolio_versions p
       LEFT JOIN proposed_holdings h ON h.proposed_portfolio_version_id = p.id
       WHERE p.workflow_case_id = $1
       GROUP BY p.id ORDER BY p.version DESC LIMIT 1`,
      [workflowId],
    );
    return { universe: universe.rows, policy, recommendedHoldings: defaults, proposedPortfolioVersion: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/proposed-portfolio/versions", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "portfolio:prepare")) throw forbidden();
    const input = saveSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      "SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "proposed_portfolio") throw invalidState("Proposed portfolio is not the current workflow step");
    if (new Set(input.holdings.map((item) => item.tickerUniverseId)).size !== input.holdings.length) throw invalidState("A ticker can appear only once");
    const universe = await pool.query(
      "SELECT * FROM ticker_universe WHERE enabled = true AND id = ANY($1::uuid[])",
      [input.holdings.map((item) => item.tickerUniverseId)],
    );
    if (universe.rows.length !== input.holdings.length) throw invalidState("One or more tickers are not in the approved universe");
    const policy = await constructionPolicy(user.organizationId);
    const allowedMarkets = new Set(policy.equityMarkets);
    const byId = new Map(universe.rows.map((row) => [String(row.id), row]));
    const resolved = input.holdings.map((item) => ({ ...byId.get(item.tickerUniverseId), weight: item.weight }));
    if (resolved.some((item) => !allowedMarkets.has(item.market))) throw invalidState("A ticker is outside the approved markets");
    if (resolved.some((item) => item.weight > policy.maxSingleSecurityWeightPct / 100 + 1e-12)) {
      throw invalidState(`Single-security weight cannot exceed ${policy.maxSingleSecurityWeightPct}% of its sleeve`);
    }
    for (const sleeve of ["us", "developedNonUs", "emerging"]) {
      const items = resolved.filter((item) => item.sleeve === sleeve);
      const weight = items.reduce((sum, item) => sum + item.weight, 0);
      if (Math.abs(weight - 1) > 1e-8) throw invalidState(`Weights for ${sleeve} must sum to 100%`);
      for (const style of ["growth", "value"]) {
        const count = items.filter((item) => item.style === style).length;
        if (count < policy.styleTickerMin || count > policy.styleTickerMax) {
          throw invalidState(`${sleeve} ${style} must contain ${policy.styleTickerMin}-${policy.styleTickerMax} tickers`);
        }
      }
    }
    const sleeveTarget = await pool.query(
      "SELECT id FROM sleeve_target_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1",
      [workflowId],
    );
    if (!sleeveTarget.rows[0]) throw invalidState("Sleeve targets are required");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query(
        "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM proposed_portfolio_versions WHERE workflow_case_id = $1",
        [workflowId],
      );
      const saved = await client.query(
        `INSERT INTO proposed_portfolio_versions
          (workflow_case_id, sleeve_target_version_id, version, status, created_by, submitted_at)
         VALUES ($1, $2, $3, 'submitted', $4, now()) RETURNING *`,
        [workflowId, sleeveTarget.rows[0].id, next.rows[0].version, user.id],
      );
      for (const item of resolved) {
        await client.query(
          `INSERT INTO proposed_holdings
            (proposed_portfolio_version_id, ticker, exchange_code, market, sleeve, style, weight)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [saved.rows[0].id, item.ticker, item.exchange_code, item.market, item.sleeve, item.style, item.weight],
        );
      }
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "proposed_portfolio.submit",
        entityType: "proposed_portfolio_version", entityId: saved.rows[0].id, outcome: "allowed",
        requestId: request.id, ipAddress: request.ip,
        detail: { version: saved.rows[0].version, holdingCount: resolved.length, policy },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ proposedPortfolioVersion: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
