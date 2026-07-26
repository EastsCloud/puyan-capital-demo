# Full Workflow Simulation

Generated at: 2026-07-24T10:05:22.489Z

## 1. Users and roles

| Name | Group | Role |
| --- | --- | --- |
| System Administrator | System Administrator | User Admin |
| Decision Committee Approver | Decision Committee | Decision Approver |
| Execution Team Approver | Execution Team | Execution Approver |
| Execution Manager Wang | Execution Team | Execution Manager |
| Portfolio Analyst Liu | Execution Team | Portfolio Analyst |
| Trader Zhao | Execution Team | Trader |
| Compliance Sun | Compliance | Compliance Reviewer |
| Observer Guest | Viewer | Read Only |

## 2. Target approval

- Final annual target return: 9.85%
- Allocated sleeve return: 9.85%
- US equity target return: 10.51%
- US equity target beta: 1.010 against VTI
- Developed ex-U.S. target beta: 1.230 using ticker-level Japan benchmarks
- Emerging target beta: 1.080 using ticker-level Hong Kong and China A benchmarks
- Portfolio beta reference monitor: reference only, not a pass/fail control
- Target max drawdown band: -16.42% to -12.31%
- Decision committee approval: approved by Decision Committee Approver

## 3. Public Data Engine

- Trigger: after annual target return approval and before sleeve allocation, beta calculation, backtest, and optimization
- Historical prices loaded: 2747 row(s)
- Ticker universe loaded: 54 row(s)
- Market statistics loaded: 21 row(s)
- Missing value fallback: not required in this simulation because generated bond, alternative, and cash reference returns are available

## 4. Proposed portfolio v1

- Constraint validation: passed
- Backtested return control: 21.71%
- Sleeve beta controls: U.S. 1.238 / target 1.010 failed; Developed ex-U.S. 1.226 / target 1.230 passed; Emerging 1.068 / target 1.080 passed
- Backtested max drawdown: -10.58% (passed)
- Decision: optimization required because one or more sleeve beta controls were not close enough to target

## 5. Optimization

- Scope: all equity sleeves, Equity, style all
- Locked weights: VTI and XOM
- Eligible holdings optimized: 25
- Optimized sleeve beta controls: U.S. 1.002 / target 1.010 passed; Developed ex-U.S. 1.226 / target 1.230 passed; Emerging 1.068 / target 1.080 passed
- Optimized max drawdown: -9.00% (passed)
- Optimized return control: 19.27% (passed within the 5% relative tolerance)
- Final control result: pass

| Ticker | Proposed v1 | Optimized v2 | Change | Locked |
| --- | ---: | ---: | ---: | --- |
| VTI | 5.00% | 6.00% | +1.00% | Yes |
| SPY | 5.00% | 6.00% | +1.00% | No |
| AAPL | 7.00% | 5.00% | -2.00% | No |
| MSFT | 7.00% | 5.00% | -2.00% | No |
| NVDA | 10.00% | 4.00% | -6.00% | No |
| QQQ | 6.00% | 4.00% | -2.00% | No |
| JPM | 2.00% | 5.00% | +3.00% | No |
| XOM | 1.00% | 5.00% | +4.00% | Yes |
| DIA | 2.00% | 5.00% | +3.00% | No |
| EWJ | 1.25% | 1.25% | +0.00% | No |
| DXJ | 1.25% | 1.25% | +0.00% | No |
| 7203.T | 1.25% | 1.25% | +0.00% | No |
| 8306.T | 1.25% | 1.25% | +0.00% | No |
| 6758.T | 1.25% | 1.25% | +0.00% | No |
| 9984.T | 1.25% | 1.25% | +0.00% | No |
| EWH | 1.25% | 1.25% | +0.00% | No |
| 2800.HK | 1.25% | 1.25% | +0.00% | No |
| 0005.HK | 1.25% | 1.25% | +0.00% | No |
| 0388.HK | 1.25% | 1.25% | +0.00% | No |
| 0700.HK | 1.25% | 1.25% | +0.00% | No |
| 3690.HK | 1.25% | 1.25% | +0.00% | No |
| ASHR | 0.84% | 0.84% | +0.00% | No |
| KBA | 0.84% | 0.84% | +0.00% | No |
| 601318.SS | 0.83% | 0.83% | +0.00% | No |
| 000001.SZ | 0.83% | 0.83% | +0.00% | No |
| 600519.SS | 0.83% | 0.83% | +0.00% | No |
| 300750.SZ | 0.83% | 0.83% | +0.00% | No |

## 6. Committee implementation approval

| Member | Role | Decision | Note |
| --- | --- | --- | --- |
| Decision Committee Approver | Decision Approver | Approve | Target beta, drawdown, and sleeve allocation controls reviewed |

## 7. Trade approval

| Action | Ticker | Drift | Value | Approver | Status |
| --- | --- | ---: | ---: | --- | --- |
| Sell | NVDA | -2.40% | $24,000 | Execution Team | Approve |
| Buy | 0700.HK | 2.30% | $23,000 | Execution Team | Approve |

## 8. Actual holdings and rebalance

| Ticker | Target | Actual | Drift | Alert |
| --- | ---: | ---: | ---: | --- |
| VTI | 6.00% | 6.30% | 0.30% | No |
| SPY | 6.00% | 6.30% | 0.30% | No |
| AAPL | 5.00% | 5.30% | 0.30% | No |
| MSFT | 5.00% | 5.30% | 0.30% | No |
| NVDA | 4.00% | 6.40% | 2.40% | Yes |
| QQQ | 4.00% | 4.30% | 0.30% | No |
| JPM | 5.00% | 5.30% | 0.30% | No |
| XOM | 5.00% | 5.30% | 0.30% | No |
| DIA | 5.00% | 5.30% | 0.30% | No |
| EWJ | 1.25% | 1.55% | 0.30% | No |
| DXJ | 1.25% | 1.55% | 0.30% | No |
| 7203.T | 1.25% | 1.55% | 0.30% | No |
| 8306.T | 1.25% | 1.55% | 0.30% | No |
| 6758.T | 1.25% | 1.55% | 0.30% | No |
| 9984.T | 1.25% | 1.55% | 0.30% | No |
| EWH | 1.25% | 1.55% | 0.30% | No |
| 2800.HK | 1.25% | 1.55% | 0.30% | No |
| 0005.HK | 1.25% | 1.55% | 0.30% | No |
| 0388.HK | 1.25% | 1.55% | 0.30% | No |
| 0700.HK | 1.25% | -1.05% | -2.30% | Yes |
| 3690.HK | 1.25% | 1.55% | 0.30% | No |
| ASHR | 0.84% | 1.14% | 0.30% | No |
| KBA | 0.84% | 1.14% | 0.30% | No |
| 601318.SS | 0.83% | 1.13% | 0.30% | No |
| 000001.SZ | 0.83% | 1.13% | 0.30% | No |
| 600519.SS | 0.83% | 1.13% | 0.30% | No |
| 300750.SZ | 0.83% | 1.13% | 0.30% | No |

- Rebalance alerts: NVDA 2.40%, 0700.HK -2.30%

## 9. Report

- Modified Dietz return for the period: -0.49%
- Return target comparison: control result tracked against the approved target for the selected period
- Sleeve beta controls: pass
- Max drawdown control: pass
- Annual performance attribution: included

| Attribution item | Contribution | Owner | Interpretation |
| --- | ---: | --- | --- |
| Committee timing / market beta | 1.56% | Decision Committee | Return explained by committee-approved market exposure and beta budget |
| Manager stock selection | 0.49% | Execution Team | Residual return after benchmark and beta exposure; proxy for security selection |
| Beta implementation gap | 0.05% | Execution Team | Return impact from actual portfolio beta differing from approved target beta |

## 10. Audit trail

| Actor | Group | Action | Result |
| --- | --- | --- | --- |
| System Administrator | System Administrator | Create active users and assign roles | Allowed |
| Observer Guest | Viewer | Attempt to edit proposed portfolio | Blocked |
| Portfolio Analyst Liu | Execution Team | Load ticker universe and price data | Allowed |
| Decision Committee Approver | Decision Committee | Approve annual target return | Allowed |
| Portfolio Analyst Liu | Execution Team | Run Public Data Engine and load generated reference CSV files | Allowed |
| Decision Committee Approver | Decision Committee | Approve sleeve allocation, CAPM target beta, and drawdown budget | Allowed |
| Execution Manager Wang | Execution Team | Submit proposed portfolio v1 | Allowed |
| Portfolio Analyst Liu | Execution Team | Generate three sleeve-by-sleeve optimization options and select the passing option | Allowed |
| Execution Manager Wang | Execution Team | Submit optimized portfolio v2 for committee approval | Allowed |
| Decision Committee Approver | Decision Committee | Record implementation decision: Approve | Allowed |
| Execution Team Approver | Execution Team | Approve Sell NVDA | Allowed |
| Execution Team Approver | Execution Team | Approve Buy 0700.HK | Allowed |
| Execution Manager Wang | Execution Team | Import actual holdings from broker consolidation sheet | Allowed |
| Compliance Sun | Compliance | Review rebalance alerts and escalation | Allowed |
| Compliance Sun | Compliance | Generate weekly performance and risk report | Allowed |

## Generated data files

- `simulation/output/full_workflow_users.csv`
- `simulation/output/full_workflow_target_assumptions.csv`
- `simulation/output/full_workflow_optimized_holdings.csv`
- `simulation/output/full_workflow_trade_orders.csv`
- `simulation/output/full_workflow_actual_holdings.csv`
- `simulation/output/full_workflow_annual_attribution.csv`
- `simulation/output/full_workflow_audit_log.csv`
