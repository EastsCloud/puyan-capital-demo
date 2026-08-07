import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://isater:test@localhost:5432/isater_test";
const { annualPolicyFromParameters, normalizedAnnualAllocation } = await import("../src/annual-policy.js");

describe("annual allocation business parameters", () => {
  it("maps maintained percentage values into the live domain policy", () => {
    const policy = annualPolicyFromParameters({
      annualAllocation: {
        calibrationYears: 15,
        minimumScenarioMonths: 24,
        bullThresholdPct: 6,
        bearThresholdPct: -4,
        allocationStepPct: 5,
        assetBoundsPct: { bear: { bond: { min: 40, max: 65 } } },
        marketBoundsPct: { japan: { min: 15, max: 40 } },
        riskAversion: { bear: 0.95 },
      },
    });
    expect(policy.calibrationYears).toBe(15);
    expect(policy.minimumScenarioMonths).toBe(24);
    expect(policy.bullThreshold).toBeCloseTo(0.06);
    expect(policy.bearThreshold).toBeCloseTo(-0.04);
    expect(policy.assetBounds.bear.bond).toEqual({ min: 0.4, max: 0.65 });
    expect(policy.marketBounds.japan).toEqual({ min: 0.15, max: 0.4 });
    expect(policy.riskAversion.bear).toBe(0.95);
  });

  it("removes legacy display-only fields from normalized active parameters", () => {
    const result = normalizedAnnualAllocation({
      scenarioBands: { bull: { low: 7 }, bear: { high: -5 } },
      allocationDefaults: { bear: { assets: { bond: 50 } } },
      backtest: { defaultMonths: 36 },
    });
    expect(result).not.toHaveProperty("scenarioBands");
    expect(result).not.toHaveProperty("allocationDefaults");
    expect(result.annualAllocation.bullThresholdPct).toBe(7);
    expect(result.annualAllocation.bearThresholdPct).toBe(-5);
    expect(result.backtest.defaultMonths).toBe(36);
  });
});
