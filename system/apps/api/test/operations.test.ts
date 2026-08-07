import { describe, expect, it } from "vitest";
import { reconcileExecutionFills } from "../src/operational-math.js";

describe("migrated operational controls", () => {
  const planned = [
    { ticker: "AAPL", exchangeCode: "NASDAQ", side: "BUY" as const, targetValue: 10_000 },
    { ticker: "MSFT", exchangeCode: "NASDAQ", side: "BUY" as const, targetValue: 8_000 },
  ];

  it("matches broker fills within the configured value tolerance", () => {
    const result = reconcileExecutionFills(planned, [
      { ticker: "AAPL", exchangeCode: "NASDAQ", side: "BUY", quantity: 100, price: 100 },
      { ticker: "MSFT", exchangeCode: "NASDAQ", side: "BUY", quantity: 80, price: 100 },
    ], 2);
    expect(result.summary).toMatchObject({ matched: 2, exceptions: 0 });
  });

  it("flags missing, unplanned and out-of-tolerance fills", () => {
    const result = reconcileExecutionFills(planned, [
      { ticker: "AAPL", exchangeCode: "NASDAQ", side: "BUY", quantity: 80, price: 100 },
      { ticker: "NVDA", exchangeCode: "NASDAQ", side: "BUY", quantity: 10, price: 100 },
    ], 2);
    expect(result.summary.exceptions).toBe(3);
    expect(result.lines.find((line) => line.ticker === "MSFT")).toMatchObject({ tradeValue: 0, status: "exception" });
    expect(result.lines.find((line) => line.ticker === "NVDA")).toMatchObject({ status: "unplanned" });
  });
});
