import { describe, expect, it } from "vitest";
import { buildAnnualAllocationRecommendation, type MonthlyObservation } from "../src/annual-allocation.js";

function levels(monthlyReturns: number[], startYear = 2000): MonthlyObservation[] {
  let level = 100;
  return monthlyReturns.map((value, index) => {
    level *= 1 + value;
    const date = new Date(Date.UTC(startYear, index, 1));
    return { month: date.toISOString().slice(0, 7), value: level };
  });
}

function constant(value: number, count: number, startYear = 2000): MonthlyObservation[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(startYear, index, 1));
    return { month: date.toISOString().slice(0, 7), value };
  });
}

describe("annual public-data allocation model", () => {
  it("derives bounded weights from historical regime observations", () => {
    const months = 240;
    const cycle = Array.from({ length: months }, (_, index) => index % 36 < 16 ? 0.018 : index % 36 < 26 ? -0.012 : 0.002);
    const result = buildAnnualAllocationRecommendation("bull", {
      usEquity: levels(cycle),
      japanEquity: levels(cycle.map((value) => value * 0.85)),
      chinaEquity: levels(cycle.map((value) => value * 1.15)),
      hongKongEquity: levels(cycle.map((value) => value * 1.05)),
      usCpi: levels(Array.from({ length: months }, () => 0.002)),
      usTenYearYieldPct: constant(4, months),
      usTBillYieldPct: constant(3, months),
      globalCommodity: levels(cycle.map((value) => value * 0.45)),
    });
    expect(Object.values(result.assetWeights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(Object.values(result.marketWeights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
    expect(result.assetWeights.equity).toBeGreaterThanOrEqual(0.45);
    expect(result.assetWeights.equity).toBeLessThanOrEqual(0.8);
    expect(result.sleeveWeights.emerging).toBeCloseTo(result.marketWeights.chinaA + result.marketWeights.hongKong, 8);
    expect(result.scenarioSampleMonths).toBeGreaterThanOrEqual(18);
    expect(result.statistics.bond.annualizedReturn).toBeCloseTo(0.04, 8);
    expect(result.statistics.cash.annualizedReturn).toBeCloseTo(0.03, 8);
    expect(result.fixedIncomeMethod).toEqual({
      bond: "current_yield_carry",
      cash: "current_short_rate_carry",
      durationAdjustmentApplied: false,
      bondExpectedReturn: 0.04,
      cashExpectedReturn: 0.03,
    });
    expect(result.modelVersion).toBe("annual-regime-allocation-v1.1.0");
  });
});
