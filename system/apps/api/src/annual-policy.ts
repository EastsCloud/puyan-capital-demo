import {
  defaultAnnualAllocationPolicy,
  type AnnualAllocationPolicy,
  type MarketScenario,
} from "@isater/domain";
import { pool } from "./db.js";

type ParameterRecord = {
  id?: string;
  version: number;
  parameters: Record<string, any> | string;
  effective_from?: string;
  created_at?: string;
  created_by?: string;
};

const scenarios: MarketScenario[] = ["bull", "balanced", "bear"];
const assets = ["equity", "bond", "alternative", "cash"] as const;
const markets = ["us", "japan", "chinaA", "hongKong"] as const;

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fraction(value: unknown, fallback: number): number {
  return finite(value, fallback * 100) / 100;
}

export function annualPolicyFromParameters(parameters: Record<string, any>): AnnualAllocationPolicy {
  const active = parameters.annualAllocation ?? {};
  const legacy = parameters.scenarioBands ?? {};
  const defaults = defaultAnnualAllocationPolicy;
  const policy: AnnualAllocationPolicy = {
    calibrationYears: finite(active.calibrationYears, defaults.calibrationYears),
    minimumScenarioMonths: finite(active.minimumScenarioMonths, defaults.minimumScenarioMonths),
    bullThreshold: fraction(active.bullThresholdPct ?? legacy.bull?.low, defaults.bullThreshold),
    bearThreshold: fraction(active.bearThresholdPct ?? legacy.bear?.high, defaults.bearThreshold),
    allocationStep: fraction(active.allocationStepPct, defaults.allocationStep),
    assetBounds: structuredClone(defaults.assetBounds),
    marketBounds: structuredClone(defaults.marketBounds),
    riskAversion: structuredClone(defaults.riskAversion),
  };
  scenarios.forEach((scenario) => assets.forEach((asset) => {
    policy.assetBounds[scenario][asset] = {
      min: fraction(active.assetBoundsPct?.[scenario]?.[asset]?.min, defaults.assetBounds[scenario][asset].min),
      max: fraction(active.assetBoundsPct?.[scenario]?.[asset]?.max, defaults.assetBounds[scenario][asset].max),
    };
  }));
  markets.forEach((market) => {
    policy.marketBounds[market] = {
      min: fraction(active.marketBoundsPct?.[market]?.min, defaults.marketBounds[market].min),
      max: fraction(active.marketBoundsPct?.[market]?.max, defaults.marketBounds[market].max),
    };
  });
  scenarios.forEach((scenario) => {
    policy.riskAversion[scenario] = finite(active.riskAversion?.[scenario], defaults.riskAversion[scenario]);
  });
  validateAnnualPolicy(policy);
  return policy;
}

function validateBounds(label: string, bounds: Array<{ min: number; max: number }>): void {
  bounds.forEach((bound) => {
    if (bound.min < 0 || bound.max > 1 || bound.min > bound.max) throw new Error(`${label} bounds must satisfy 0 <= min <= max <= 100%`);
  });
  const minimum = bounds.reduce((sum, bound) => sum + bound.min, 0);
  const maximum = bounds.reduce((sum, bound) => sum + bound.max, 0);
  if (minimum > 1 + 1e-9 || maximum < 1 - 1e-9) throw new Error(`${label} bounds do not permit weights summing to 100%`);
}

export function validateAnnualPolicy(policy: AnnualAllocationPolicy): void {
  if (!Number.isInteger(policy.calibrationYears) || policy.calibrationYears < 3 || policy.calibrationYears > 50) throw new Error("Annual allocation calibration years must be an integer between 3 and 50");
  if (!Number.isInteger(policy.minimumScenarioMonths) || policy.minimumScenarioMonths < 12) throw new Error("Minimum scenario months must be an integer of at least 12");
  if (policy.bearThreshold >= policy.bullThreshold) throw new Error("Bear threshold must be below bull threshold");
  if (policy.allocationStep <= 0 || policy.allocationStep > 0.25) throw new Error("Allocation step must be above 0% and at most 25%");
  scenarios.forEach((scenario) => {
    validateBounds(`${scenario} asset`, assets.map((asset) => policy.assetBounds[scenario][asset]));
    if (policy.riskAversion[scenario] < 0) throw new Error(`${scenario} risk aversion cannot be negative`);
  });
  validateBounds("market", markets.map((market) => policy.marketBounds[market]));
}

export function normalizedAnnualAllocation(parameters: Record<string, any>): Record<string, any> {
  const policy = annualPolicyFromParameters(parameters);
  const pct = (value: number) => Number((value * 100).toFixed(8));
  const annualAllocation = {
    calibrationYears: policy.calibrationYears,
    minimumScenarioMonths: policy.minimumScenarioMonths,
    bullThresholdPct: pct(policy.bullThreshold),
    bearThresholdPct: pct(policy.bearThreshold),
    allocationStepPct: pct(policy.allocationStep),
    assetBoundsPct: Object.fromEntries(scenarios.map((scenario) => [scenario,
      Object.fromEntries(assets.map((asset) => [asset, {
        min: pct(policy.assetBounds[scenario][asset].min),
        max: pct(policy.assetBounds[scenario][asset].max),
      }]))])),
    marketBoundsPct: Object.fromEntries(markets.map((market) => [market, {
      min: pct(policy.marketBounds[market].min), max: pct(policy.marketBounds[market].max),
    }])),
    riskAversion: policy.riskAversion,
  };
  const { scenarioBands: _scenarioBands, allocationDefaults: _allocationDefaults, ...rest } = parameters;
  return { ...rest, annualAllocation };
}

export async function effectiveAnnualPolicy(organizationId: string): Promise<{
  source: "organization" | "system_default";
  parameterSet: ParameterRecord;
  policy: AnnualAllocationPolicy;
}> {
  const effective = await pool.query(
    `SELECT id, version, parameters, effective_from, created_at, created_by
       FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1`,
    [organizationId],
  );
  const fallback = effective.rows[0] ? null : await pool.query(
    "SELECT version, parameters, created_at FROM default_business_parameters ORDER BY version DESC LIMIT 1",
  );
  const parameterSet = (effective.rows[0] ?? fallback!.rows[0]) as ParameterRecord;
  return {
    source: effective.rows[0] ? "organization" : "system_default",
    parameterSet,
    policy: annualPolicyFromParameters(jsonValue(parameterSet.parameters)),
  };
}
