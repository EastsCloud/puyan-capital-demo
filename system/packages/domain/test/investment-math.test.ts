import { describe, expect, it } from "vitest";
import {
  annualTargetReturn,
  betaControl,
  capmTargetBeta,
  decomposeTargetFloor,
  drawdownControl,
  returnControl,
} from "../src/investment-math.js";

describe("annual target and sleeve decomposition", () => {
  it("adds operating cost, CPI and the selected scenario adjustment", () => {
    expect(annualTargetReturn({ operatingCostRate: 0.02, expectedCpiRate: 0.0346, scenarioAdjustmentRate: 0.01 }))
      .toBeCloseTo(0.0646, 10);
  });

  it("allocates only a positive shortfall across equity sleeves", () => {
    const result = decomposeTargetFloor(0.08, [
      { key: "us", kind: "equity", weight: 0.4, referenceReturn: 0.075 },
      { key: "japan", kind: "equity", weight: 0.1, referenceReturn: 0.058 },
      { key: "emerging", kind: "equity", weight: 0.05, referenceReturn: 0.0644 },
      { key: "bond", kind: "bond", weight: 0.25, referenceReturn: 0.036 },
      { key: "alternative", kind: "alternative", weight: 0.12, referenceReturn: 0.046 },
      { key: "cash", kind: "cash", weight: 0.08, referenceReturn: 0.024 },
    ]);
    expect(result.shortfallAllocatedToEquity).toBeGreaterThan(0);
    expect(result.allocatedReturn).toBeCloseTo(0.08, 10);
    expect(result.reconciliationDifference).toBeCloseTo(0, 12);
  });

  it("keeps an expected return above the target floor instead of forcing it down", () => {
    const result = decomposeTargetFloor(0.06, [
      { key: "equity", kind: "equity", weight: 0.6, referenceReturn: 0.09 },
      { key: "bond", kind: "bond", weight: 0.3, referenceReturn: 0.04 },
      { key: "cash", kind: "cash", weight: 0.1, referenceReturn: 0.03 },
    ]);
    expect(result.shortfallAllocatedToEquity).toBe(0);
    expect(result.expectedBuffer).toBeCloseTo(0.009, 10);
    expect(result.allocatedReturn).toBeCloseTo(0.069, 10);
  });
});

describe("market-specific CAPM", () => {
  it("uses the relevant local risk-free rate", () => {
    const us = capmTargetBeta(0.09, 0.10, 0.045);
    const japan = capmTargetBeta(0.09, 0.10, 0.005);
    expect(us.beta).not.toBeCloseTo(japan.beta, 6);
    expect(us.riskFreeRate).toBe(0.045);
    expect(japan.riskFreeRate).toBe(0.005);
  });

  it("keeps CAPM consistent by recording minimum-positive adjustments", () => {
    const result = capmTargetBeta(0.02, 0.04, 0.042);
    expect(result.adjustedForNonPositiveExcessReturn).toBe(true);
    expect(result.adjustedForLowMarketRiskPremium).toBe(true);
    expect(result.effectiveTargetReturn).toBeCloseTo(0.047, 10);
    expect(result.effectiveMarketReturn).toBeCloseTo(0.047, 10);
  });
});

describe("backtest controls", () => {
  it("treats return as a floor and high return as review rather than failure", () => {
    expect(returnControl(0.096, 0.10).hardPass).toBe(true);
    expect(returnControl(0.094, 0.10).hardPass).toBe(false);
    expect(returnControl(0.16, 0.10)).toMatchObject({ hardPass: true, review: true });
  });

  it("applies drawdown tolerance as a relative ratio", () => {
    expect(drawdownControl(-0.219, -0.20, null).hardPass).toBe(true);
    expect(drawdownControl(-0.221, -0.20, null).hardPass).toBe(false);
  });

  it("allows low beta as review only when return and drawdown pass", () => {
    const target = capmTargetBeta(0.09, 0.10, 0.045);
    expect(betaControl(target.beta * 0.8, target, true, true)).toMatchObject({ hardPass: true, review: true });
    expect(betaControl(target.beta * 0.8, target, false, true).hardPass).toBe(false);
    expect(betaControl(target.beta * 1.06, target, true, true).hardPass).toBe(false);
  });
});
