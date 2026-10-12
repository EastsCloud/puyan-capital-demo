import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findSecurity, parsePortfolioCsv, previewRows, previewHoldings, validateHoldings, type Security } from "./proposed-portfolio-model";

const names = [
  ["AAPL", "MSFT", "NVDA", "AMZN", "JPM", "XOM", "JNJ", "KO"],
  ["6758", "9984", "6861", "8035", "7203", "8306", "9432", "8058"],
  ["0700", "9988", "300750", "002594", "0005", "1299", "600036", "601318"],
];
const universe: Security[] = names.flatMap((tickers, sleeveIndex) => tickers.map((ticker, index) => ({
  id: `${sleeveIndex}-${index}`, ticker, exchange_code: sleeveIndex === 0 ? index < 4 ? "NASDAQ" : "NYSE" : sleeveIndex === 1 ? "TSE" : index === 2 || index === 3 ? "SZSE" : index > 5 ? "SSE" : "HKEX",
  sleeve: (["us", "developedNonUs", "emerging"] as const)[sleeveIndex], market: sleeveIndex === 0 ? "US" : sleeveIndex === 1 ? "JP" : index === 2 || index === 3 || index > 5 ? "CN_A" : "HK",
  style: index < 4 ? "growth" : "value", name_en: ticker, name_zh: ticker, source_url: "https://example.com",
})));
const policy = { maxSingleSecurityWeightPct: 35, styleTickerMin: 2, styleTickerMax: 5 };
const csv = readFileSync(new URL("../public/templates/proposed-portfolio-template.csv", import.meta.url), "utf8");
const baseline = [{ tickerUniverseId: "0-0", weight: 0.5 }, { tickerUniverseId: "0-1", weight: 0.5 }];

describe("proposed holdings imports", () => {
  it("loads all 24 template names, with eight names and 100% in each market sleeve", () => {
    const imported = parsePortfolioCsv(csv, universe, true);
    expect(imported).toHaveLength(24);
    const result = previewHoldings(previewRows(imported, [], "replace"), true);
    expect(result.errors).toEqual([]);
    expect(validateHoldings(result.holdings, universe, policy, true)).toEqual([]);
  });
  it("ignores delimiter-only rows and handles BOM, quoted cells and CRLF", () => {
    const rows = parsePortfolioCsv('\uFEFFTicker,WeightPercent\r\n"AAPL",1\r\n,\r\n"MSFT",99\r\n', universe, true);
    expect(rows).toHaveLength(2);
    expect(rows[0].weight).toBe(0.01);
    expect(rows[1].weight).toBe(0.99);
  });
  it("retains every unknown stock in preview instead of silently dropping it", () => {
    const rows = parsePortfolioCsv("Ticker,WeightPercent\nAAPL,50\nUNKNOWN,50", universe, true);
    expect(rows).toHaveLength(2); expect(rows[1].problem).toContain("未收录");
    expect(previewHoldings(previewRows(rows, baseline, "replace"), true).errors).toHaveLength(1);
    expect(baseline).toEqual([{ tickerUniverseId: "0-0", weight: 0.5 }, { tickerUniverseId: "0-1", weight: 0.5 }]);
  });
  it("distinguishes replacement, merging, keep and skip without changing the baseline", () => {
    const imported = parsePortfolioCsv("Ticker,WeightPercent\nAAPL,25\nNVDA,25", universe, true);
    const replacement = previewRows(imported, baseline, "replace");
    expect(previewHoldings(replacement, true).holdings).toEqual([{ tickerUniverseId: "0-0", weight: 0.25 }, { tickerUniverseId: "0-2", weight: 0.25 }]);
    const merge = previewRows(imported, baseline, "merge");
    merge[0].action = "keep"; merge[1].action = "remove";
    expect(previewHoldings(merge, true).holdings).toEqual(baseline);
  });
  it("blocks duplicate securities and ambiguous exchange mappings", () => {
    const imported = parsePortfolioCsv("Ticker,WeightPercent\nAAPL,50\nAAPL,50", universe, false);
    expect(previewHoldings(previewRows(imported, [], "replace"), false).errors).toContain("Duplicate securities: keep one row per security.");
    const ambiguous = [...universe, { ...universe[0], id: "other", exchange_code: "NYSE" }];
    expect(parsePortfolioCsv("Ticker,WeightPercent\nAAPL,25", ambiguous, false)[0].problem).toContain("Ambiguous");
    expect(parsePortfolioCsv("Ticker,Exchange,WeightPercent\nAAPL,NASDAQ,25", ambiguous, false)[0].securityId).toBe("0-0");
  });
  it("resolves regional suffixes and leading zeroes without accepting a wrong exchange", () => {
    expect(findSecurity("5.HK", "HK", universe)[0].ticker).toBe("0005");
    expect(findSecurity("6758.T", "JP", universe)[0].ticker).toBe("6758");
    expect(findSecurity("002594.SZ", "SZSE", universe)[0].ticker).toBe("002594");
    expect(findSecurity("JNJ", "NASDAQ", universe)).toEqual([]);
  });
  it("shows weight, style-count and missing-market errors before submission", () => {
    const invalid = [{ tickerUniverseId: "0-0", weight: 0.6 }, { tickerUniverseId: "0-0", weight: 0.3 }];
    const errors = validateHoldings(invalid, universe, policy, true);
    expect(errors.some((error) => error.includes("重复"))).toBe(true);
    expect(errors.some((error) => error.includes("不超过"))).toBe(true);
    expect(errors.some((error) => error.includes("合计"))).toBe(true);
    expect(errors.some((error) => error.includes("风格"))).toBe(true);
  });
  it("rejects malformed CSV and invalid weights instead of saving partial data", () => {
    expect(() => parsePortfolioCsv('Ticker,WeightPercent\n"AAPL,25', universe, true)).toThrow("引号");
    expect(parsePortfolioCsv("Ticker,WeightPercent\nAAPL,nope", universe, true)[0].problem).toContain("权重");
    expect(parsePortfolioCsv("Ticker,WeightPercent\nAAPL,25,extra", universe, true)[0].problem).toContain("列数");
  });
});
