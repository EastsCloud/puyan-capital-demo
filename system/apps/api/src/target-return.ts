import type { FastifyInstance } from "fastify";
import { annualTargetReturn, hasPermission, type MarketScenario } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";

const prepareSchema = z.object({ targetReturnRate: z.number().finite().positive().max(1) });

const fallbackPolicy = {
  operatingCostPct: 1,
  bandsPct: {
    bull: { low: 7, high: 12 },
    balanced: { low: 4, high: 8 },
    bear: { low: 2, high: 6 },
  },
};

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

async function effectiveTargetPolicy(organizationId: string) {
  const effective = await pool.query(
    "SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1",
    [organizationId],
  );
  const parameters = effective.rows[0] ? jsonValue<Record<string, unknown>>(effective.rows[0].parameters) : {};
  const configured = parameters.targetReturn as typeof fallbackPolicy | undefined;
  return configured ?? fallbackPolicy;
}

function recommendationContext(packageRow: Record<string, unknown>, policy: typeof fallbackPolicy) {
  const scenario = packageRow.scenario as MarketScenario;
  type RecommendationShape = {
    objective: { expectedReturn: number };
    latestIndicators: { inflationYearOverYear: number };
  };
  const recommendation = jsonValue<RecommendationShape>(packageRow.recommendation as string | RecommendationShape);
  const band = policy.bandsPct[scenario];
  const operatingCostRate = policy.operatingCostPct / 100;
  const expectedCpiRate = recommendation.latestIndicators.inflationYearOverYear;
  const minimumEconomicFloor = operatingCostRate + expectedCpiRate;
  const rawSuggestion = Math.max(recommendation.objective.expectedReturn, minimumEconomicFloor);
  const suggestedTargetReturnRate = Math.min(band.high / 100, Math.max(band.low / 100, rawSuggestion));
  return {
    scenario,
    band: { low: band.low / 100, high: band.high / 100 },
    operatingCostRate,
    expectedCpiRate,
    publicDataExpectedReturn: recommendation.objective.expectedReturn,
    minimumEconomicFloor,
    suggestedTargetReturnRate,
  };
}

export async function registerTargetReturnRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/target-return/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const annualPackage = await pool.query(
      `SELECT p.* FROM annual_data_packages p
        JOIN workflow_cases w ON w.id = p.workflow_case_id
       WHERE p.workflow_case_id = $1 AND w.organization_id = $2 AND p.accepted_at IS NOT NULL
       ORDER BY p.version DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    if (!annualPackage.rows[0]) throw invalidState("An approved annual data package is required");
    const latest = await pool.query(
      `SELECT * FROM target_return_versions
        WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1`,
      [workflowId],
    );
    const policy = await effectiveTargetPolicy(user.organizationId);
    return { context: recommendationContext(annualPackage.rows[0], policy), targetReturnVersion: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/target-return/versions", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "target:prepare")) throw forbidden();
    const input = prepareSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      "SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "target_return") throw invalidState("Target return is not the current workflow step");
    const annualPackage = await pool.query(
      `SELECT * FROM annual_data_packages WHERE workflow_case_id = $1 AND accepted_at IS NOT NULL
        ORDER BY version DESC LIMIT 1`,
      [workflowId],
    );
    if (!annualPackage.rows[0]) throw invalidState("An approved annual data package is required");
    const policy = await effectiveTargetPolicy(user.organizationId);
    const context = recommendationContext(annualPackage.rows[0], policy);
    if (input.targetReturnRate < context.band.low - 1e-12 || input.targetReturnRate > context.band.high + 1e-12) {
      throw invalidState(`Target return must remain within ${(context.band.low * 100).toFixed(1)}% to ${(context.band.high * 100).toFixed(1)}%`);
    }
    const scenarioAdjustmentRate = input.targetReturnRate - context.operatingCostRate - context.expectedCpiRate;
    const calculated = annualTargetReturn({
      operatingCostRate: context.operatingCostRate,
      expectedCpiRate: context.expectedCpiRate,
      scenarioAdjustmentRate,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query(
        "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM target_return_versions WHERE workflow_case_id = $1",
        [workflowId],
      );
      const saved = await client.query(
        `INSERT INTO target_return_versions
          (workflow_case_id, version, annual_data_package_id, operating_cost_rate, expected_cpi_rate,
           scenario_adjustment_rate, target_return_rate, calculation, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [workflowId, next.rows[0].version, annualPackage.rows[0].id, context.operatingCostRate,
          context.expectedCpiRate, scenarioAdjustmentRate, calculated,
          { ...context, selectedTargetReturnRate: input.targetReturnRate, formulaVersion: "target-floor-v1.0.0" }, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "target_return.prepare",
        entityType: "target_return_version", entityId: saved.rows[0].id, outcome: "allowed",
        requestId: request.id, ipAddress: request.ip,
        detail: { version: saved.rows[0].version, targetReturnRate: calculated, annualDataPackageId: annualPackage.rows[0].id },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ targetReturnVersion: saved.rows[0], context });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
