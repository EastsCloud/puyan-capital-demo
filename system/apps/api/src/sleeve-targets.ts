import type { FastifyInstance } from "fastify";
import { capmTargetBeta, decomposeTargetFloor, hasPermission, type SleeveReference } from "@isater/domain";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";

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

async function effectiveParameters(organizationId: string): Promise<Record<string, unknown>> {
  const effective = await pool.query(
    "SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1",
    [organizationId],
  );
  if (effective.rows[0]) return jsonValue<Record<string, unknown>>(effective.rows[0].parameters);
  const defaults = await pool.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
  return jsonValue<Record<string, unknown>>(defaults.rows[0].parameters);
}

async function buildContext(workflowId: string, organizationId: string) {
  const approvedTarget = await pool.query(
    `SELECT t.*, p.recommendation, p.scenario, p.id AS annual_data_package_id
       FROM target_return_versions t
       JOIN annual_data_packages p ON p.id = t.annual_data_package_id
       JOIN workflow_cases w ON w.id = t.workflow_case_id
      WHERE t.workflow_case_id = $1 AND w.organization_id = $2 AND t.approved_at IS NOT NULL
      ORDER BY t.version DESC LIMIT 1`,
    [workflowId, organizationId],
  );
  if (!approvedTarget.rows[0]) throw invalidState("An approved target return is required");
  const row = approvedTarget.rows[0];
  const recommendation = jsonValue<{
    assetWeights: Record<"equity" | "bond" | "alternative" | "cash", number>;
    sleeveWeights: Record<"us" | "developedNonUs" | "emerging", number>;
    marketWeights: Record<"us" | "japan" | "chinaA" | "hongKong", number>;
    statistics: Record<string, { annualizedReturn: number; maximumDrawdown: number }>;
  }>(row.recommendation);
  const emergingMarketWeight = recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong;
  const emergingReferenceReturn = (
    recommendation.statistics.chinaA.annualizedReturn * recommendation.marketWeights.chinaA
    + recommendation.statistics.hongKong.annualizedReturn * recommendation.marketWeights.hongKong
  ) / emergingMarketWeight;
  const emergingDrawdown = (
    recommendation.statistics.chinaA.maximumDrawdown * recommendation.marketWeights.chinaA
    + recommendation.statistics.hongKong.maximumDrawdown * recommendation.marketWeights.hongKong
  ) / emergingMarketWeight;
  const equityWeight = recommendation.assetWeights.equity;
  const references: SleeveReference[] = [
    { key: "us", kind: "equity", weight: equityWeight * recommendation.sleeveWeights.us, referenceReturn: recommendation.statistics.us.annualizedReturn },
    { key: "developedNonUs", kind: "equity", weight: equityWeight * recommendation.sleeveWeights.developedNonUs, referenceReturn: recommendation.statistics.japan.annualizedReturn },
    { key: "emerging", kind: "equity", weight: equityWeight * recommendation.sleeveWeights.emerging, referenceReturn: emergingReferenceReturn },
    { key: "bond", kind: "bond", weight: recommendation.assetWeights.bond, referenceReturn: recommendation.statistics.bond.annualizedReturn },
    { key: "alternative", kind: "alternative", weight: recommendation.assetWeights.alternative, referenceReturn: recommendation.statistics.alternative.annualizedReturn },
    { key: "cash", kind: "cash", weight: recommendation.assetWeights.cash, referenceReturn: recommendation.statistics.cash.annualizedReturn },
  ];
  const decomposition = decomposeTargetFloor(Number(row.target_return_rate), references);
  const parameters = await effectiveParameters(organizationId);
  const riskFreeRates = (parameters.riskFreeRatesPct ?? { us: 4.5, japan: 0.5, hongKong: 4.2, chinaA: 1.8 }) as Record<string, number>;
  const ratioPolicy = (parameters.returnDrawdownRatio ?? { low: 0.6, high: 0.8 }) as { low: number; high: number };
  const ratioMidpoint = (ratioPolicy.low + ratioPolicy.high) / 2;
  const emergingRiskFreeRate = (
    riskFreeRates.chinaA * recommendation.marketWeights.chinaA
    + riskFreeRates.hongKong * recommendation.marketWeights.hongKong
  ) / emergingMarketWeight / 100;
  const marketReferenceReturns = {
    us: recommendation.statistics.us.annualizedReturn,
    developedNonUs: recommendation.statistics.japan.annualizedReturn,
    emerging: emergingReferenceReturn,
  };
  const riskFreeBySleeve = { us: riskFreeRates.us / 100, developedNonUs: riskFreeRates.japan / 100, emerging: emergingRiskFreeRate };
  const historicalDrawdowns = {
    us: recommendation.statistics.us.maximumDrawdown,
    developedNonUs: recommendation.statistics.japan.maximumDrawdown,
    emerging: emergingDrawdown,
  };
  const equityTargets = decomposition.sleeves.filter((item) => item.kind === "equity").map((item) => {
    const key = item.key as keyof typeof marketReferenceReturns;
    const capm = capmTargetBeta(item.targetReturn, marketReferenceReturns[key], riskFreeBySleeve[key]);
    const effectiveTargetReturn = capm.effectiveTargetReturn;
    const ratioBasedDrawdown = -Math.abs(effectiveTargetReturn / ratioMidpoint);
    return {
      ...item,
      rawDecomposedTargetReturn: item.targetReturn,
      targetReturn: effectiveTargetReturn,
      targetContribution: item.weight * effectiveTargetReturn,
      withinEquityWeight: item.weight / equityWeight,
      marketReferenceReturn: marketReferenceReturns[key],
      riskFreeRate: riskFreeBySleeve[key],
      targetBeta: capm.beta,
      betaControlActive: capm.betaControlActive,
      capm,
      maximumDrawdownLimit: -Math.min(0.5, Math.max(Math.abs(historicalDrawdowns[key]), Math.abs(ratioBasedDrawdown))),
      drawdownMethod: { historicalDrawdown: historicalDrawdowns[key], returnDrawdownRatio: ratioMidpoint },
    };
  });
  return {
    targetReturnVersionId: row.id,
    targetReturnRate: Number(row.target_return_rate),
    scenario: row.scenario,
    decomposition,
    equityTargets,
    policy: { riskFreeRatesPct: riskFreeRates, returnDrawdownRatio: ratioPolicy },
  };
}

export async function registerSleeveTargetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/sleeve-targets/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const latest = await pool.query(
      `SELECT s.* FROM sleeve_target_versions s
        JOIN workflow_cases w ON w.id = s.workflow_case_id
       WHERE s.workflow_case_id = $1 AND w.organization_id = $2
       ORDER BY s.version DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    return { context: await buildContext(workflowId, user.organizationId), sleeveTargetVersion: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/sleeve-targets/versions", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "portfolio:prepare")) throw forbidden();
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      "SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "sleeve_targets") throw invalidState("Sleeve targets are not the current workflow step");
    const context = await buildContext(workflowId, user.organizationId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query(
        "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM sleeve_target_versions WHERE workflow_case_id = $1",
        [workflowId],
      );
      const saved = await client.query(
        `INSERT INTO sleeve_target_versions
          (workflow_case_id, target_return_version_id, version, targets, reconciliation_difference, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [workflowId, context.targetReturnVersionId, next.rows[0].version, context,
          context.decomposition.reconciliationDifference, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "sleeve_targets.generate",
        entityType: "sleeve_target_version", entityId: saved.rows[0].id, outcome: "allowed",
        requestId: request.id, ipAddress: request.ip,
        detail: { version: saved.rows[0].version, targetReturnVersionId: context.targetReturnVersionId },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ sleeveTargetVersion: saved.rows[0], context });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
