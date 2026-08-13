const exchangeAliases: Record<string, string> = {
  HK: "HKEX", HKEX: "HKEX",
  JP: "TSE", TSE: "TSE", TYO: "TSE",
  "CN-A": "SZSE", CN_A: "SZSE", CNA: "SZSE", SZ: "SZSE", SZSE: "SZSE",
};

const tickerSuffixes: Record<string, string[]> = {
  HKEX: ["HKEX", "HK"],
  TSE: ["TSE", "JP"],
  SZSE: ["SZSE", "CN-A", "CN_A", "CNA"],
};

function normalizeSecurity(ticker: string, exchangeCode: string) {
  const rawExchange = String(exchangeCode).trim().toUpperCase();
  const exchange = exchangeAliases[rawExchange] ?? rawExchange;
  let normalizedTicker = String(ticker).trim().toUpperCase().replace(/\s+/g, "");
  for (const suffix of tickerSuffixes[exchange] ?? [exchange]) {
    if (normalizedTicker.length > suffix.length && normalizedTicker.endsWith(suffix)) {
      normalizedTicker = normalizedTicker.slice(0, -suffix.length).replace(/[._-]+$/, "");
      break;
    }
  }
  return { ticker: normalizedTicker, exchangeCode: exchange };
}

export function reconcileExecutionFills(
  planned: Array<{ ticker: string; exchangeCode?: string; market?: string; side: "BUY" | "SELL"; targetValue: number }>,
  fills: Array<{ ticker: string; exchangeCode: string; side: "BUY" | "SELL"; quantity: number; price: number; externalTradeId?: string }>,
  valueTolerancePct: number,
) {
  const plannedMap = new Map<string, (typeof planned)[number] & { ticker: string; exchangeCode: string }>(planned.map((order) => {
    const security = normalizeSecurity(order.ticker, String(order.exchangeCode ?? order.market));
    return [`${security.ticker}|${security.exchangeCode}|${order.side}`, { ...order, ...security }];
  }));
  const actualKeys = new Set<string>();
  const lines: Array<any> = fills.map((fill) => {
    const security = normalizeSecurity(fill.ticker, fill.exchangeCode);
    const key = `${security.ticker}|${security.exchangeCode}|${fill.side}`;
    if (actualKeys.has(key)) {
      const error = new Error(`Duplicate execution fill: ${key}`) as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
    actualKeys.add(key);
    const order = plannedMap.get(key);
    const tradeValue = fill.quantity * fill.price;
    const plannedValue = Number(order?.targetValue ?? 0);
    const varianceValue = tradeValue - plannedValue;
    const varianceRate = plannedValue > 0 ? varianceValue / plannedValue : null;
    const status = !order ? "unplanned" : Math.abs(varianceRate ?? 0) <= valueTolerancePct / 100 ? "matched" : "exception";
    return { ...fill, ...security, tradeValue, plannedValue, varianceValue, varianceRate, status };
  });
  for (const [key, order] of plannedMap.entries()) {
    if (!actualKeys.has(key)) lines.push({
      ticker: order.ticker, exchangeCode: order.exchangeCode, side: order.side,
      quantity: 0, price: 0, externalTradeId: undefined, tradeValue: 0, plannedValue: Number(order.targetValue),
      varianceValue: -Number(order.targetValue), varianceRate: -1, status: "exception",
    });
  }
  const exceptions = lines.filter((line) => line.status !== "matched").length;
  return { lines, summary: { plannedOrders: planned.length, importedFills: fills.length, matched: lines.length - exceptions, exceptions, valueTolerancePct } };
}
