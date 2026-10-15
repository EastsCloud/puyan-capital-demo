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

describe('percentage and trading-lot reconciliation evidence',()=>{
  it('uses percentage limits rather than a 10000-dollar threshold',()=>{
    const plan=[{ticker:'6861',exchangeCode:'TSE',side:'BUY' as const,targetValue:225000}];
    const result=reconcileExecutionFills(plan,[{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity:500,price:398.2}],2,{lotSizes:{'6861|TSE':100}});
    expect(result.lines[0]).toMatchObject({status:'exception',varianceValue:-25900,detail:{reason:'board_lot_rounding_review',lotSize:100,roundedQuantity:500,toleranceValue:4500,lotRoundingCandidate:true}});expect(result.lines[0].varianceRate).toBeCloseTo(-25900/225000);
    expect(reconcileExecutionFills([{...plan[0],targetValue:10000000}],[{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity:1,price:9975000}],2).lines[0].status).toBe('matched');
    expect(reconcileExecutionFills([{...plan[0],targetValue:100000}],[{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity:1,price:91000}],2).lines[0].status).toBe('exception');
  });
  it('does not excuse overspending, non-lot quantities or zero-value plans',()=>{
    const p=[{ticker:'6861',exchangeCode:'TSE',side:'BUY' as const,targetValue:225000}],ref={lotSizes:{'6861|TSE':100}};
    for(const quantity of [501,600]){const line=reconcileExecutionFills(p,[{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity,price:398.2}],2,ref).lines[0];expect(line.status).toBe('exception');expect(line.detail.lotRoundingCandidate).toBe(false);}
    expect(reconcileExecutionFills([{...p[0],targetValue:0}],[{ticker:'6861',exchangeCode:'TSE',side:'BUY',quantity:0,price:1}],2).lines[0].status).toBe('exception');
  });
  it('uses only explicitly supplied identity corrections and retains source-plan identity',()=>{
    const plan=[{ticker:'COST',exchangeCode:'NYSE',side:'BUY' as const,targetValue:1000}];const fills=[{ticker:'COST',exchangeCode:'NASDAQ',side:'BUY' as const,quantity:1,price:1000}];
    expect(reconcileExecutionFills(plan,fills,2).summary.exceptions).toBe(2);
    const result=reconcileExecutionFills(plan,fills,2,{corrections:[{id:'correction',oldTicker:'COST',oldExchange:'NYSE',ticker:'COST',exchangeCode:'NASDAQ'}]});
    expect(result.lines[0]).toMatchObject({status:'matched',detail:{identityCorrections:[{id:'correction'}]}});expect(plan[0].exchangeCode).toBe('NYSE');
  });
});
