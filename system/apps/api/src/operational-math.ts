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

export interface IdentityCorrection {id:string;oldTicker:string;oldExchange:string;ticker:string;exchangeCode:string}
export interface ReconciliationReference {corrections?:IdentityCorrection[];lotSizes?:Record<string,number>}
export function correctedSecurity(ticker:string,exchangeCode:string,corrections:IdentityCorrection[]=[]){
  let result=normalizeSecurity(ticker,exchangeCode);const applied:IdentityCorrection[]=[];const seen=new Set<string>();
  for(let i=0;i<=corrections.length;i++){
    const key=`${result.ticker}|${result.exchangeCode}`;if(seen.has(key))throw Object.assign(new Error('Security correction cycle'),{statusCode:409});seen.add(key);
    const correction=corrections.find(c=>c.oldTicker===result.ticker&&c.oldExchange===result.exchangeCode);if(!correction)return {...result,corrections:applied};
    applied.push(correction);result={ticker:correction.ticker,exchangeCode:correction.exchangeCode};
  }
  throw Object.assign(new Error('Security correction chain is too long'),{statusCode:409});
}

export function reconcileExecutionFills(
  planned: Array<{ ticker: string; exchangeCode?: string; market?: string; side: "BUY" | "SELL"; targetValue: number }>,
  fills: Array<{ ticker: string; exchangeCode: string; side: "BUY" | "SELL"; quantity: number; price: number; externalTradeId?: string }>,
  valueTolerancePct: number,
  reference:ReconciliationReference={},
) {
  const plannedMap = new Map<string, (typeof planned)[number] & { ticker: string; exchangeCode: string }>(planned.map((order) => {
    const security = correctedSecurity(order.ticker, String(order.exchangeCode ?? order.market),reference.corrections);
    return [`${security.ticker}|${security.exchangeCode}|${order.side}`, { ...order, ...security }];
  }));
  if(plannedMap.size!==planned.length)throw Object.assign(new Error('Approved plan has duplicate securities after identity correction; review the plan before importing'),{statusCode:409});
  const actualKeys = new Set<string>();
  const lines: Array<any> = fills.map((fill) => {
    const security = correctedSecurity(fill.ticker, fill.exchangeCode,reference.corrections);
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
    const status = !order ? "unplanned" : plannedValue>0&&Math.abs(varianceRate!) <= valueTolerancePct / 100+1e-12 ? "matched" : "exception";
    const lotSize=reference.lotSizes?.[`${security.ticker}|${security.exchangeCode}`]??null;
    const roundedQuantity=lotSize&&fill.price>0?Math.floor((plannedValue/fill.price+1e-9)/lotSize)*lotSize:null;
    const lotRoundingCandidate=status==='exception'&&fill.side==='BUY'&&varianceValue<0&&lotSize&&roundedQuantity!==null&&fill.quantity>0&&Math.abs(fill.quantity-roundedQuantity)<1e-8;
    const detail={reason:!order?'unplanned':plannedValue<=0?'invalid_plan_value':status==='matched'?'within_percentage_tolerance':lotRoundingCandidate?'board_lot_rounding_review':'percentage_tolerance_exceeded',valueTolerancePct,toleranceValue:plannedValue*valueTolerancePct/100,
      identityCorrections:[...new Map([...(order as any)?.corrections??[],...security.corrections].map(c=>[c.id,c])).values()],lotSize,lotValue:lotSize?lotSize*fill.price:null,roundedQuantity,lotRoundingCandidate:Boolean(lotRoundingCandidate),currencyAssumption:'Price and plan value must already use the same base currency; no FX conversion performed'};
    return { ...fill, ...security, tradeValue, plannedValue, varianceValue, varianceRate, status,detail };
  });
  for (const [key, order] of plannedMap.entries()) {
    if (!actualKeys.has(key)) lines.push({
      ticker: order.ticker, exchangeCode: order.exchangeCode, side: order.side,
      quantity: 0, price: 0, externalTradeId: undefined, tradeValue: 0, plannedValue: Number(order.targetValue),
      varianceValue: -Number(order.targetValue), varianceRate: -1, status: "exception",
      detail:{reason:'missing_fill',valueTolerancePct,toleranceValue:Number(order.targetValue)*valueTolerancePct/100,identityCorrections:(order as any).corrections??[]},
    });
  }
  const exceptions = lines.filter((line) => line.status !== "matched").length;
  return { lines, summary: { plannedOrders: planned.length, importedFills: fills.length, matched: lines.length - exceptions, exceptions, valueTolerancePct } };
}
