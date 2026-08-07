import { describe, expect, it } from "vitest";
import { addTradingDays, brinsonFachlerAttribution, calculateGroups, isoBusinessDate, modifiedDietzReturn, performance, valuationDateMatchesLatestEquitySnapshot } from "../src/monitoring-reporting-math.js";

describe("monitoring and reporting controls", () => {
  it("normalizes portfolio equity weights before testing style corridors", () => {
    const approved = {
      targets: { equityTargets: [
        { key: "us", weight: 0.245 },
        { key: "developedNonUs", weight: 0.0525 },
        { key: "emerging", weight: 0.0525 },
      ] },
      holdings: [
        { sleeve: "us", style: "growth", weight: 0.25 }, { sleeve: "us", style: "growth", weight: 0.25 },
        { sleeve: "us", style: "value", weight: 0.25 }, { sleeve: "us", style: "value", weight: 0.25 },
        { sleeve: "developedNonUs", style: "growth", weight: 0.25 }, { sleeve: "developedNonUs", style: "growth", weight: 0.25 },
        { sleeve: "developedNonUs", style: "value", weight: 0.25 }, { sleeve: "developedNonUs", style: "value", weight: 0.25 },
        { sleeve: "emerging", style: "growth", weight: 0.25 }, { sleeve: "emerging", style: "growth", weight: 0.25 },
        { sleeve: "emerging", style: "value", weight: 0.25 }, { sleeve: "emerging", style: "value", weight: 0.25 },
      ],
    };
    const line = (sleeve: string, style: string, marketValue: number) => ({ market_value: marketValue, classification: { sleeve, style } });
    const groups = calculateGroups(approved, [
      line("us", "growth", 400_000), line("us", "value", 2_050_000),
      line("developedNonUs", "growth", 262_500), line("developedNonUs", "value", 262_500),
      line("emerging", "growth", 262_500), line("emerging", "value", 262_500),
    ], -0.2, 0.2);

    const usGrowth = groups.find((group) => group.key === "us:growth")!;
    const usValue = groups.find((group) => group.key === "us:value")!;
    expect(usGrowth.targetWeight).toBeCloseTo(0.35, 10);
    expect(usGrowth).toMatchObject({ status: "below", tradeSide: "BUY" });
    expect(usValue.targetWeight).toBeCloseTo(0.35, 10);
    expect(usValue).toMatchObject({ status: "above", tradeSide: "SELL" });
    expect(groups.filter((group) => !group.key.startsWith("us:")).every((item) => item.status === "within")).toBe(true);
  });

  it("calculates a three-trading-day deadline from database Date values", () => {
    expect(addTradingDays(new Date("2026-08-04T00:00:00.000Z"), 3)).toBe("2026-08-07");
  });

  it("requires non-equity NAV and the latest effective equity snapshot to share one business date", () => {
    expect(isoBusinessDate(new Date("2026-08-10T00:00:00.000Z"))).toBe("2026-08-10");
    expect(valuationDateMatchesLatestEquitySnapshot("2026-08-10", new Date("2026-08-10T00:00:00.000Z"))).toBe(true);
    expect(valuationDateMatchesLatestEquitySnapshot("2026-08-05", "2026-08-10")).toBe(false);
  });

  it("does not publish unstable Sharpe or Sortino values from three observations", () => {
    const result = performance([
      { date: "2026-07-31", value: 2_400_000 },
      { date: "2026-08-03", value: 2_420_000 },
      { date: "2026-08-04", value: 2_450_000 },
    ]);
    expect(result.periodReturn).toBeCloseTo(0.0208333, 5);
    expect(result.sharpe).toBeNull();
    expect(result.sortino).toBeNull();
  });

  it("reconciles market, allocation, selection and interaction attribution", () => {
    const result = brinsonFachlerAttribution([
      { key: "us", portfolioWeight: 0.60, benchmarkWeight: 0.70, portfolioReturn: 0.08, benchmarkReturn: 0.06 },
      { key: "developedNonUs", portfolioWeight: 0.20, benchmarkWeight: 0.15, portfolioReturn: 0.03, benchmarkReturn: 0.04 },
      { key: "emerging", portfolioWeight: 0.20, benchmarkWeight: 0.15, portfolioReturn: -0.01, benchmarkReturn: 0.02 },
    ]);
    expect(result.portfolioReturn).toBeCloseTo(0.052);
    expect(result.benchmarkReturn).toBeCloseTo(0.051);
    expect(result.benchmarkReturn + result.allocationEffect + result.selectionEffect + result.interactionEffect)
      .toBeCloseTo(result.portfolioReturn);
    expect(result.allocationEffect + result.selectionEffect + result.interactionEffect).toBeCloseTo(result.excessReturn);
  });

  it("removes external cash flows from reported investment return", () => {
    const result = modifiedDietzReturn(1_000, 1_160, "2026-01-01", "2026-12-31", [
      { date: "2026-07-02", amount: 100 },
    ]);
    expect(result.netFlow).toBe(100);
    expect(result.weightedFlow).toBeCloseTo(50, 0);
    expect(result.returnRate).toBeCloseTo(60 / 1050, 3);
  });
});
