# Investment Management System Simulation

Generated at: 2026-07-14T05:13:36.895Z

## 1. Roles and permission test

| Actor | Group | Action | Result |
| --- | --- | --- | --- |
| System Administrator | System Administrator | create and maintain users | allowed |
| System Administrator | System Administrator | approve annual target | blocked |
| Decision Committee Approver | Decision Committee | approve annual target | allowed |
| Decision Committee Approver | Decision Committee | edit proposed holdings | blocked |
| Execution Team Approver | Execution Team | approve trade orders | allowed |
| Execution Manager | Execution Team | edit proposed holdings | allowed |
| Execution Manager | Execution Team | import actual holdings and trades | allowed |
| Decision Committee Approver | Decision Committee | approve portfolio version | allowed |

## 2. Annual target and target beta

- Operating cost input: 4.00%
- CPI estimate: 2.80% from 3 selected market forecasts
- Market scenario: Balanced, allowed range -2.00% to 2.00%, selected 0.00%
- Total annual target return: 6.80%
- Sleeve contribution total: 6.80%; gap to target: 0.00%
- US equity sleeve target return: 8.50%
- US equity target beta by CAPM: 0.889 using VTI, risk-free 4.50%, market return 9.00%
- Target max drawdown band: -14.17% to -10.63%

## 3. Proposal validation

- Current default proposal: failed
  - VTI single equity weight 35.00% exceeds max 15.00%
  - Cash & Cash-like weight 30.00% outside 0.00%-20.00% corridor
  - Cyclical has 0 equity tickers; required 2-5
  - Active has 0 equity tickers; required 2-5
- Price-covered style candidate: failed
  - Active has 0 equity tickers; required 2-5
- Full style candidate: passed

## 4. Backtest

- Price file used: data/sample_prices_web_recent.csv
- Available price columns: VTI, AAPL, MSFT, NVDA, JPM, XOM, BIL, CASH
- Full style candidate missing price history: none
- Backtest candidate: Full style candidate
- Full style candidate observations: 13
- Full style candidate annualized return: -15.20%
- Full style candidate return status: hard control against the proposed equity return target
- Full style candidate beta vs VTI: 0.768 (failed; target 0.889)
- Full style candidate max drawdown: -5.14% (passed; target not deeper than -14.17%)

## 5. Optimization advice

- Optimization scope: region United States, asset class Equity, style all
- Locked weights: VTI, XOM, BIL, CASH
- Suggested portfolio beta vs VTI: 0.875 (passed; target 0.889)
- Suggested portfolio annualized return: -6.70% (failed; target 8.50% with 5% relative tolerance)
- Suggested portfolio max drawdown: -4.37% (passed; target not deeper than -14.17%)
- Suggested portfolio constraints: passed
- Approval control result after optimization: needs review

| Ticker | Current weight | Suggested weight | Change | Reason |
| --- | ---: | ---: | ---: | --- |
| NVDA | 8.00% | 13.97% | +5.97% | Increase equity exposure that improves beta fit |
| AAPL | 8.00% | 2.25% | -5.75% | Reduce lower-priority equity exposure to fund beta improvement |
| MSFT | 7.00% | 2.01% | -4.99% | Reduce lower-priority equity exposure to fund beta improvement |
| JPM | 6.00% | 10.77% | +4.77% | Increase equity exposure that improves beta fit |

## 6. Actual holdings import and rebalance alerts

| Ticker | Target weight | Actual weight | Drift | Alert |
| --- | ---: | ---: | ---: | --- |
| VTI | 35.00% | 36.00% | 1.00% | no |
| NVDA | 10.00% | 12.00% | 2.00% | no |
| BIL | 25.00% | 25.00% | 0.00% | no |
| CASH | 30.00% | 27.00% | -3.00% | yes |

- Alerts triggered: CASH -3.00%

## 7. Trade reconciliation

- Buy 10 VTI @ 300: matched BRKA-1001

## 8. Cash-flow-adjusted reporting

- Modified Dietz return example for 2026-06-01 to 2026-06-30: -2.94%

## 9. Simulation findings

- The role model works: unauthorized actions are blocked and can be audit logged.
- The target-return to US-equity target-beta chain runs, but sleeve contribution should be reviewed when the gap to the total target is material.
- The market-data layer must keep aligned history across every proposed ticker; otherwise a valid proposal cannot be backtested.
- This run used data/sample_prices_web_recent.csv, so the full style candidate could be backtested.
- When a proposal misses target beta, the system now generates concrete weight adjustments instead of only marking the backtest as failed.
- Backtested return, sleeve beta, max drawdown, allocation constraints, and data quality are approval controls for the proposed equity portfolio.
- The actual holdings import triggers rebalance alerts when drift is outside the default +/-2% corridor.
- The trade import can reconcile approved execution orders against actual broker transactions.
