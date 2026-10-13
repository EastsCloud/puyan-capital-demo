export type Sleeve = "us" | "developedNonUs" | "emerging";
export interface Security {
  id: string; ticker: string; exchange_code: string; name_en: string; name_zh: string;
  market: "US" | "JP" | "HK" | "CN_A"; sleeve: Sleeve; style: "growth" | "value"; source_url: string;
  data_coverage?: { observations: number; provider: string; status: string; checkedAt: string } | null;
}
export interface Holding { tickerUniverseId: string; weight: number }
export interface ConstructionPolicy { maxSingleSecurityWeightPct: number; styleTickerMin: number; styleTickerMax: number }
export interface ImportRow { key: string; ticker: string; exchange: string; weight: number; securityId: string; problem: string | null }
export interface PreviewRow { key: string; imported?: ImportRow; existing?: Holding; action: "import" | "keep" | "remove" }
export const sleeves: Sleeve[] = ["us", "developedNonUs", "emerging"];
export const sleeveName = (sleeve: Sleeve, zh: boolean) => ({
  us: zh ? "美股" : "U.S. equity", developedNonUs: zh ? "日本" : "Japan", emerging: zh ? "新兴市场（A股及港股）" : "Emerging markets (China A / Hong Kong)",
})[sleeve];

// Preserve identifiers and quoted fields; spreadsheet exports often contain delimiter-only trailing rows.
export function readCsv(content: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const input = content.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      row = []; cell = ""; if (char === "\r" && input[i + 1] === "\n") i++;
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 引号未闭合 / Unclosed CSV quote");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function findSecurity(ticker: string, exchange: string, universe: Security[]): Security[] {
  const raw = ticker.trim().toUpperCase(); const venue = exchange.trim().toUpperCase();
  const aliases: Record<string, string[]> = { HK: ["HKEX"], JP: ["TSE"], TYO: ["TSE"], SH: ["SSE"], SS: ["SSE"], SZ: ["SZSE"], "CN-A": ["SSE", "SZSE"], CN_A: ["SSE", "SZSE"], US: ["NASDAQ", "NYSE", "AMEX"] };
  return universe.filter((item) => {
    if (venue && !(aliases[venue] ?? [venue]).includes(item.exchange_code)) return false;
    const suffixes = [item.exchange_code, item.market, ...(item.market === "HK" ? ["HK"] : item.market === "JP" ? ["T", "JP"] : item.exchange_code === "SSE" ? ["SS", "SH"] : item.exchange_code === "SZSE" ? ["SZ"] : ["US"])];
    const candidates = [raw, ...suffixes.flatMap((suffix) => raw.endsWith(suffix) && raw.length > suffix.length ? [raw.slice(0, -suffix.length).replace(/[._-]+$/, "")] : [])];
    return candidates.some((value) => value === item.ticker.toUpperCase() || (item.market !== "US" && /^\d+$/.test(value) && Number(value) === Number(item.ticker)));
  });
}

export function parsePortfolioCsv(content: string, universe: Security[], zh: boolean): ImportRow[] {
  const rows = readCsv(content);
  if (rows.length < 2) throw new Error(zh ? "CSV 没有股票记录。" : "CSV has no security rows.");
  const headers = rows[0].map((value) => value.toLowerCase().replace(/[\s_-]/g, ""));
  const tickerIndex = headers.findIndex((value) => ["ticker", "symbol", "股票代码"].includes(value));
  const weightIndex = headers.findIndex((value) => ["weightpercent", "weightpct", "weight", "权重"].includes(value));
  const exchangeIndex = headers.findIndex((value) => ["exchange", "exchangecode", "股票市场", "交易所"].includes(value));
  if (tickerIndex < 0 || weightIndex < 0) throw new Error(zh ? "CSV 必须包含 Ticker、WeightPercent 列；可选 Exchange 列。" : "Required columns: Ticker, WeightPercent. Exchange is optional.");
  return rows.slice(1).map((row, index) => {
    const ticker = row[tickerIndex] ?? ""; const exchange = exchangeIndex < 0 ? "" : row[exchangeIndex] ?? "";
    const text = row[weightIndex] ?? ""; const value = Number(text.replace(/%$/, ""));
    const weight = headers[weightIndex] === "weight" && !text.endsWith("%") && value <= 1 ? value : value / 100;
    const matches = findSecurity(ticker, exchange, universe);
    const problem = row.length !== headers.length ? (zh ? "列数与表头不一致" : "Column count differs from header")
      : !ticker ? (zh ? "股票代码为空" : "Missing ticker")
      : !text || !Number.isFinite(weight) || weight <= 0 ? (zh ? "权重必须是大于0的数字" : "Weight must be a positive number")
      : matches.length !== 1 ? (zh ? (matches.length ? "代码对应多只证券，请选择交易所" : "股票库未收录，请联系管理员补充") : (matches.length ? "Ambiguous ticker: choose an exchange" : "Unknown security: ask an administrator to add it")) : null;
    return { key: `csv-${index}`, ticker, exchange, weight, securityId: matches.length === 1 ? matches[0].id : "", problem };
  });
}

export function previewRows(imported: ImportRow[], baseline: Holding[], mode: "replace" | "merge"): PreviewRow[] {
  const incomingIds = new Set(imported.map((row) => row.securityId).filter(Boolean));
  return [
    ...imported.map((row): PreviewRow => ({ key: row.key, imported: row, existing: baseline.find((holding) => holding.tickerUniverseId === row.securityId), action: "import" })),
    ...baseline.filter((holding) => !incomingIds.has(holding.tickerUniverseId)).map((holding): PreviewRow => ({ key: `existing-${holding.tickerUniverseId}`, existing: holding, action: mode === "replace" ? "remove" : "keep" })),
  ];
}

export function previewHoldings(rows: PreviewRow[], zh: boolean): { holdings: Holding[]; errors: string[] } {
  const holdings: Holding[] = []; const errors: string[] = [];
  for (const row of rows) {
    if (row.action === "remove") continue;
    if (row.action === "keep" && row.existing) { holdings.push({ ...row.existing }); continue; }
    if (!row.imported || row.imported.problem || !row.imported.securityId) {
      errors.push(`${row.imported?.ticker || "?"}: ${row.imported?.problem ?? (zh ? "请选择对应股票" : "Select a security")}`); continue;
    }
    holdings.push({ tickerUniverseId: row.imported.securityId, weight: row.imported.weight });
  }
  if (new Set(holdings.map((item) => item.tickerUniverseId)).size !== holdings.length) errors.push(zh ? "存在重复股票，请只保留一行。" : "Duplicate securities: keep one row per security.");
  if (!holdings.length) errors.push(zh ? "至少选择一只股票。" : "Select at least one security.");
  return { holdings, errors };
}

export function validateHoldings(holdings: Holding[], universe: Security[], policy: ConstructionPolicy, zh: boolean): string[] {
  const errors: string[] = []; const byId = new Map(universe.map((item) => [item.id, item]));
  if (new Set(holdings.map((item) => item.tickerUniverseId)).size !== holdings.length) errors.push(zh ? "同一只股票不能重复。" : "A security can appear only once.");
  for (const holding of holdings) {
    const security = byId.get(holding.tickerUniverseId);
    if (!security) errors.push(zh ? "有股票尚未选择或不在股票库中。" : "A security is missing or not in the universe.");
    if (!Number.isFinite(holding.weight) || holding.weight <= 0 || holding.weight > policy.maxSingleSecurityWeightPct / 100 + 1e-12) errors.push(zh ? `${security?.ticker ?? "?"}：权重须大于0且不超过 ${policy.maxSingleSecurityWeightPct}%。` : `${security?.ticker ?? "?"}: weight must be positive and at most ${policy.maxSingleSecurityWeightPct}%.`);
  }
  for (const sleeve of sleeves) {
    const items = holdings.filter((item) => byId.get(item.tickerUniverseId)?.sleeve === sleeve);
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-8) errors.push(zh ? `${sleeveName(sleeve, zh)}权重合计须为100%（当前 ${(total * 100).toFixed(2)}%）。` : `${sleeveName(sleeve, zh)} weights must total 100% (currently ${(total * 100).toFixed(2)}%).`);
    for (const style of ["growth", "value"] as const) {
      const count = items.filter((item) => byId.get(item.tickerUniverseId)?.style === style).length;
      if (count < policy.styleTickerMin || count > policy.styleTickerMax) errors.push(zh ? `${sleeveName(sleeve, zh)}${style === "growth" ? "成长" : "价值"}风格须有 ${policy.styleTickerMin}–${policy.styleTickerMax} 只（当前${count}只）。` : `${sleeveName(sleeve, zh)} ${style}: ${policy.styleTickerMin}–${policy.styleTickerMax} names required (${count} now).`);
    }
  }
  return errors;
}

export function convertImportWeights(holdings: Holding[], universe: Security[], basis: "sleeve" | "portfolio", zh: boolean) {
  const byId = new Map(universe.map(item => [item.id, item]));
  const totals = sleeves.map(sleeve => ({ sleeve, total: holdings.filter(item => byId.get(item.tickerUniverseId)?.sleeve === sleeve).reduce((sum, item) => sum + item.weight, 0) }));
  const errors: string[] = [];
  if (basis === "sleeve") return { holdings: holdings.map(item => ({ ...item })), totals, errors };
  const total = holdings.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-8) errors.push(zh ? `全股票组合权重须合计100%（当前${(total * 100).toFixed(2)}%）。` : `Whole-equity weights must total 100% (currently ${(total * 100).toFixed(2)}%).`);
  for (const group of totals) if (!Number.isFinite(group.total) || group.total <= 0) errors.push(zh ? `${sleeveName(group.sleeve, zh)}缺少有效权重。` : `${sleeveName(group.sleeve, zh)} has no valid weight.`);
  const converted = holdings.map(item => {
    const sleeve = byId.get(item.tickerUniverseId)?.sleeve;
    const total = totals.find(group => group.sleeve === sleeve)?.total ?? 0;
    return { ...item, weight: total > 0 ? item.weight / total : NaN };
  });
  return { holdings: converted, totals, errors };
}
