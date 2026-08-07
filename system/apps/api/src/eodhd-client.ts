export interface EodhdPriceRow {
  date?: string;
  adjusted_close?: number;
  close?: number;
}

export function eodhdSymbol(ticker: string, market: string): string {
  if (market === "JP") return `${ticker}.TSE`;
  if (market === "HK") return `${ticker}.HK`;
  if (market === "CN_A") return `${ticker}.${ticker.startsWith("6") ? "SHG" : "SHE"}`;
  return `${ticker}.US`;
}

export async function fetchEodhdPrices(
  token: string,
  symbol: string,
  options: { from: string; to: string; period: "d" | "w" },
  fetcher: typeof fetch = fetch,
): Promise<{ points: Array<{ date: string; value: number }>; sourceUrl: string }> {
  const url = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(symbol)}`);
  url.searchParams.set("api_token", token);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("from", options.from);
  url.searchParams.set("to", options.to);
  url.searchParams.set("period", options.period);
  url.searchParams.set("order", "a");
  const sourceUrl = `${url.origin}${url.pathname}?from=${options.from}&to=${options.to}&period=${options.period}&fmt=json`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetcher(url, { signal: AbortSignal.timeout(25_000) });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 2) {
      const reason = response.status === 401 ? "API Token is invalid" : response.status === 403 ? "subscription does not cover this dataset" : `HTTP ${response.status}`;
      throw new Error(`EODHD ${symbol}: ${reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  const rows = await response!.json() as EodhdPriceRow[] | { error?: string };
  if (!Array.isArray(rows)) throw new Error(`EODHD ${symbol}: ${rows.error ?? "invalid response"}`);
  const points = rows.flatMap((row) => {
    const value = row.adjusted_close ?? row.close;
    if (!row.date || typeof value !== "number" || !Number.isFinite(value) || value <= 0) return [];
    return [{ date: row.date, value }];
  });
  if (!points.length) throw new Error(`EODHD ${symbol}: no adjusted-price observations returned`);
  return { points, sourceUrl };
}
