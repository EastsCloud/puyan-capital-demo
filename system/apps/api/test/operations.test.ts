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

  it("treats broker market aliases and ticker suffixes as the same security", () => {
    const regionalPlan = [
      { ticker: "0005", exchangeCode: "HKEX", side: "BUY" as const, targetValue: 130_200 },
      { ticker: "6758", exchangeCode: "TSE", side: "BUY" as const, targetValue: 131_100 },
      { ticker: "002594", exchangeCode: "SZSE", side: "BUY" as const, targetValue: 131_300 },
    ];
    const result = reconcileExecutionFills(regionalPlan, [
      { ticker: "0005HKEX", exchangeCode: "HK", side: "BUY", quantity: 6_200, price: 21 },
      { ticker: "6758JP", exchangeCode: "JP", side: "BUY", quantity: 5_700, price: 23 },
      { ticker: "002594CN-A", exchangeCode: "CN-A", side: "BUY", quantity: 10_100, price: 13 },
    ], 2);
    expect(result.summary).toMatchObject({ matched: 3, exceptions: 0 });
    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ ticker: "0005", exchangeCode: "HKEX", status: "matched" }),
      expect.objectContaining({ ticker: "6758", exchangeCode: "TSE", status: "matched" }),
      expect.objectContaining({ ticker: "002594", exchangeCode: "SZSE", status: "matched" }),
    ]));
  });
});
