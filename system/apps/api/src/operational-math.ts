export function reconcileExecutionFills(
  planned: Array<{ ticker: string; exchangeCode?: string; market?: string; side: "BUY" | "SELL"; targetValue: number }>,
  fills: Array<{ ticker: string; exchangeCode: string; side: "BUY" | "SELL"; quantity: number; price: number; externalTradeId?: string }>,
  valueTolerancePct: number,
) {
  const plannedMap = new Map(planned.map((order) => [`${String(order.ticker).toUpperCase()}|${String(order.exchangeCode ?? order.market).toUpperCase()}|${order.side}`, order]));
  const actualKeys = new Set<string>();
  const lines: Array<any> = fills.map((fill) => {
    const key = `${fill.ticker}|${fill.exchangeCode}|${fill.side}`;
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
    return { ...fill, tradeValue, plannedValue, varianceValue, varianceRate, status };
  });
  for (const [key, order] of plannedMap.entries()) {
    if (!actualKeys.has(key)) lines.push({
      ticker: String(order.ticker).toUpperCase(), exchangeCode: String(order.exchangeCode ?? order.market).toUpperCase(), side: order.side,
      quantity: 0, price: 0, externalTradeId: undefined, tradeValue: 0, plannedValue: Number(order.targetValue),
      varianceValue: -Number(order.targetValue), varianceRate: -1, status: "exception",
    });
  }
  const exceptions = lines.filter((line) => line.status !== "matched").length;
  return { lines, summary: { plannedOrders: planned.length, importedFills: fills.length, matched: lines.length - exceptions, exceptions, valueTolerancePct } };
}
