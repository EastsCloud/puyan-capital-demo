import { describe, expect, it } from "vitest";
import type { OptimizerHolding } from "../src/optimization.js";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://isater:test@localhost:5432/isater_test";
const { oneWayTurnover, replacementCandidateSets } = await import("../src/optimization.js");

function holding(ticker: string, style: "growth" | "value", weight = 0): OptimizerHolding {
  return {
    ticker,
    exchangeCode: "TSE",
    market: "JP",
    sleeve: "developedNonUs",
    style,
    weight,
    locked: false,
  };
}

describe("sleeve optimizer replacement search", () => {
  const original = [
    holding("G1", "growth", 0.25), holding("G2", "growth", 0.25),
    holding("V1", "value", 0.25), holding("V2", "value", 0.25),
  ];
  const universe = [
    ...original.map((item) => ({ ...item, weight: 0 })),
    holding("G3", "growth"), holding("G4", "growth"),
    holding("V3", "value"), holding("V4", "value"),
  ];

  it("orders candidate sets by the minimum number of ticker replacements", () => {
    const sets = replacementCandidateSets(original, universe);
    expect(sets[0].replacements).toBe(0);
    expect(sets.find((item) => item.replacements > 0)?.replacements).toBe(1);
    expect(sets.every((item) => item.holdings.filter((holding) => holding.style === "growth").length === 2)).toBe(true);
    expect(sets.every((item) => item.holdings.filter((holding) => holding.style === "value").length === 2)).toBe(true);
  });

  it("counts both the sale and replacement purchase as one-way turnover", () => {
    const proposed = [original[0], holding("G3", "growth"), original[2], original[3]];
    expect(oneWayTurnover(original, proposed, [0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25, 8);
  });
});
