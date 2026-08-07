import { describe, expect, it, vi } from "vitest";
import { eodhdSymbol, fetchEodhdPrices } from "../src/eodhd-client.js";

describe("EODHD adapter", () => {
  it("maps the four supported markets to EODHD symbols", () => {
    expect(eodhdSymbol("AAPL", "US")).toBe("AAPL.US");
    expect(eodhdSymbol("7203", "JP")).toBe("7203.TSE");
    expect(eodhdSymbol("0700", "HK")).toBe("0700.HK");
    expect(eodhdSymbol("600519", "CN_A")).toBe("600519.SHG");
    expect(eodhdSymbol("000001", "CN_A")).toBe("000001.SHE");
  });

  it("uses adjusted close and never exposes the API token in source metadata", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      { date: "2026-07-01", close: 201, adjusted_close: 199.5 },
      { date: "2026-07-02", close: 203, adjusted_close: 201.25 },
    ]), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    const result = await fetchEodhdPrices("super-secret-token", "AAPL.US", {
      from: "2026-07-01", to: "2026-07-02", period: "d",
    }, fetcher);
    expect(result.points).toEqual([
      { date: "2026-07-01", value: 199.5 },
      { date: "2026-07-02", value: 201.25 },
    ]);
    expect(result.sourceUrl).not.toContain("super-secret-token");
    const requested = String(fetcher.mock.calls[0][0]);
    expect(requested).toContain("api_token=super-secret-token");
  });

  it("returns a clear invalid-token error without echoing the token", async () => {
    const fetcher = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchEodhdPrices("do-not-echo", "AAPL.US", {
      from: "2026-07-01", to: "2026-07-02", period: "d",
    }, fetcher)).rejects.toThrow("API Token is invalid");
    await expect(fetchEodhdPrices("do-not-echo", "AAPL.US", {
      from: "2026-07-01", to: "2026-07-02", period: "d",
    }, fetcher)).rejects.not.toThrow("do-not-echo");
  });
});
