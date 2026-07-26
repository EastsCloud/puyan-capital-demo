# Puyan Capital Control Center SOP

Version: 0.1
Date: 2026-06-21
Project folder: `/Users/wangxiaoxiang/Documents/us stock`

## 1. Purpose

This SOP explains how users should operate the investment management tool from annual public-data preparation through annual target approval, sleeve allocation, portfolio proposal, backtest, optimization, approval, implementation, rebalance monitoring, and reporting.

The system is designed around a clear separation of duties:

- The Decision Committee prepares and accepts the annual public-data package, approves the annual target return, final implementation package, and exception approvals.
- The Execution Team uses the approved annual data package to prepare sleeve allocation, CAPM assumptions, target beta, max drawdown controls, proposed securities, backtests, optimizer output, trade orders, approved actions, and rebalance monitoring.
- The System Administrator maintains users and access.
- Compliance or reporting users review audit records, rebalance alerts, and performance reports.

## 2. Roles

### System Administrator

Responsibilities:

- Maintain active users.
- Assign users to Decision Committee or Execution Team.
- Export audit logs.
- Reset the system only when authorized.

The System Administrator should not approve annual target return or portfolio implementation unless also formally assigned as a Decision Committee member.

### Decision Committee

Responsibilities:

- Approve annual target return.
- Approve market scenario and market outlook value.
- Approve final optimized portfolio before implementation.
- Approve exceptions that breach rules.

Default business roles:

- Decision Committee Approver
- Execution Team Approver

### Execution Team

Responsibilities:

- Build the proposed portfolio.
- Prepare sleeve allocation, CAPM assumptions, target beta, and target drawdown inputs after target approval.
- Select tickers from the ticker universe.
- Load market price, ticker universe, holdings, trade, and cash-flow data.
- Run beta engine, backtest, and optimizer.
- Submit optimized portfolio for committee approval.
- Prepare and approve trade orders within authority.
- Escalate trades above authority to the Decision Committee.
- Monitor actual holdings and rebalance alerts.

### Compliance / Reporting

Responsibilities:

- Review audit trail.
- Review rebalance alerts.
- Review report outputs.
- Confirm that exceptions and escalations are properly recorded.

## 3. Operating Workflow

### Step 1: Maintain Users

Owner: System Administrator

1. Open the user administration section.
2. Confirm all Decision Committee members are active.
3. Confirm all Execution Team users are active.
4. Confirm each user has the correct role.
5. Remove or mark inactive any user who should not act in the system.
6. Review `Business System Configuration` and the `Parameter Maintenance Register`.
7. Maintain required parameters by category:
   - trusted CPI source priority list,
   - market scenario bands,
   - asset-class and equity-region allocation defaults,
   - market-specific risk-free rates and equity return allocation method,
   - beta, return, and drawdown tolerances,
   - ticker diversification and single-security limits,
   - monthly rebalance corridor and completion days,
   - execution reconciliation tolerances.
8. Review the pre-filled system default values. If no firm-specific change is required, keep the default values.
9. Click `Submit / Activate Parameters` below the register. The system sends the configuration to the backend and records the parameter maintenance version, timestamp, and maintainer.

Control point:

- Approval records must use active users from the correct group.
- Business assumptions used by later workflow steps must come from the latest saved parameter maintenance version.
- If the administrator does not change a parameter, the pre-filled system default is treated as the active value after submission.
- Workflow pages may be opened by non-owner roles for review only. When the current user is not the owner of that workflow step, the system hides work buttons and locks input fields; backend permission checks still block unauthorized submissions.

## 4. Annual Public Data Engine

Owner: Decision Committee

At the start of the annual investment cycle, run the Annual Public Data Engine before the annual target return is finalized.

Procedure:

1. Confirm the local backend is running.
2. Log in as the Decision Committee role.
3. Click `Run Annual Public Data`.
4. Confirm the system loads:
   - historical prices,
   - ticker universe,
   - market statistics.
5. Review the scenario allocation recommendation. It is calculated from public data using long-term annualized return, latest 1-year trend, volatility, maximum drawdown, and diversification score, then constrained inside the selected scenario's allowed range.
6. Review the public data status in the workflow overview.
7. Review the Data Load Registry for batch ID, data set, source file, data date, row count, validation status, loaded by, and loaded at.
8. If a generated value is unavailable, enter a manual fallback value in the Public Data Engine section.

Control point:

- Generated or loaded market data should be used where available.
- The first run creates the local public-price history; later runs refresh only the most recent seven calendar days and retain the earlier cached history.
- Every market-data and actual-data load should leave a registry row for later review.
- Manual fallback is allowed for missing values such as bond return, alternative return, or cash return.
- The Decision Committee accepts the annual data package before target-return approval.
- Execution Team can read the accepted annual data package in later steps but cannot run or accept it.

## 5. Annual Target Return Setup

Owner: Decision Committee

The annual target return is built after the annual public-data package is accepted.

```text
Final target return =
operating cost rate
+ expected CPI
+ committee-selected market outlook value
```

Procedure:

1. Enter the required operating cost rate.
2. Enter trusted CPI forecast sources.
3. Choose the CPI method:
   - average of included CPI sources, or
   - one selected CPI source.
4. Choose the market scenario:
   - Bull Market: 5% to 12%
   - Balanced Market: -2% to 2%
   - Bear Market: -12% to -3%
5. Select one exact market outlook value inside the scenario range.
6. Review the final target return.
7. Record Decision Committee approval.

Control point:

- The selected market outlook value must be inside the selected scenario range.
- If any target-return input changes after approval, approval should return to pending.
- The final annual target return must be greater than 0%.

## 6. Sleeve Allocation and Target Beta

Owner: Execution Team, after annual public-data acceptance and Decision Committee target approval

After annual public data is accepted and the whole-portfolio target return is approved, allocate the return target across sleeves.

Use the approved bull / bear / balanced scenario from target setting. The same scenario should drive both the target-return range and the allocation recommendation.

The system administrator maintains the default asset-class allocation proportions, equity-market allocation proportions, market/currency risk-free rates, and equity return allocation method for each scenario. The default method is `Baseline + positive shortfall gap`: the approved target return is treated as a floor. If the weighted baseline return already exceeds the approved target, the system records an expected buffer and does not push equity target returns downward. The method can be changed to `Pure pro-rata equity target` or `Manual equity contribution` if the firm's policy changes.

The system separates two labels:

- Return / Beta Sleeve: used for return decomposition and equity beta targets.
- Geographic Region: used for geographic exposure, constraints, and drift monitoring.

Example: a Japanese stock should be classified as `Japan equity` for Return / Beta Sleeve and `Japan` for Geographic Region.

For equity sleeves:

```text
Equity sleeve target return =
equity sleeve contribution to total target return
/
equity sleeve target weight
```

For each equity sleeve target beta:

```text
Target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(long-term market return assumption - sleeve market/currency risk-free rate)
```

Procedure:

1. Review the system's asset-class allocation suggestion.
2. Review the system's equity Return / Beta Sleeve suggestion.
3. Confirm or manually adjust target weight and return contribution for U.S. equity.
4. Confirm or manually adjust target weight and return contribution for developed ex-U.S. equity.
5. Confirm or manually adjust target weight and return contribution for emerging markets equity.
7. Enter target weights and reference returns for bonds, alternatives, and cash. Use generated values when available; otherwise use manual fallback inputs.
8. Confirm the weighted sleeve return meets or exceeds the approved annual target floor. If it exceeds the floor, review the expected buffer.
9. Review the market/currency risk-free rate for each equity sleeve.
10. Select or enter the long-term market return assumption.
11. Review implied equity sleeve target beta.

Control point:

- The market return assumption must be higher than the relevant sleeve market/currency risk-free rate.
- The market risk premium should not be too small.
- Each equity-market sleeve beta must remain within its approved policy range.
- Portfolio beta is a reference monitor versus a blended policy benchmark. It is not the primary hard constraint and should not replace sleeve-level beta controls.
- The Equity Sleeve Beta Readiness table should be reviewed before implementation. It should show U.S. equity, Japan equity, Hong Kong equity, and China A equity using the same target-return-to-target-beta logic.

## 7. Target Max Drawdown

Owner: Execution Team, using administrator-maintained rule ranges

The system first derives a base equity max drawdown band from the approved equity target return and the return/drawdown range. The equity target return is the weighted target return of the approved equity sleeves, not a single market's target return.

```text
Base equity max drawdown band =
-(weighted equity target return / return-drawdown range)
```

Default return/drawdown range:

```text
0.60 to 0.80
```

Control point:

- Base target max drawdown is a hard risk control for the proposed equity summary.
- Each equity sleeve receives a risk-adjusted drawdown budget based on its approved weight, historical volatility, and available historical drawdown statistics.
- The sleeve risk score uses 60% historical volatility and 40% historical maximum drawdown, both measured relative to the weighted equity average.
- The sleeve risk factor is capped between 0.75 and 1.35 to avoid extreme budgets from abnormal historical data.
- The sleeve drawdown budget equals the base equity max drawdown band multiplied by the sleeve risk factor.
- If the drawdown budget is changed, the Decision Committee should review the final implementation package at Step 08 before approval.

## 8. Proposed Portfolio Construction

Owner: Execution Team

The proposed portfolio follows this hierarchy:

1. Region
2. Asset class
3. Style factor
4. Equity theme
5. Ticker

Procedure:

1. Choose the investment style constraints.
2. Enter regional ranges.
3. Enter asset-class ranges.
4. Enter style-factor ranges.
5. Set max single equity holding.
6. Load or update the approved ticker universe.
7. Build the proposed portfolio inside the system by selecting a sleeve, searching approved tickers, and adding selected tickers to the sleeve.
8. Enter ticker weight, style factor, theme, and lock setting.
9. Confirm total weight is close to the approved equity sleeve total.

Current core constraints:

- Regional allocation ranges.
- Asset-class allocation ranges.
- Style-factor allocation ranges.
- Administrator-defined ticker count range for each equity market sleeve and style bucket, default 2 to 5 tickers per U.S. / Japan / Hong Kong / China A and Cyclical / Growth / Active bucket.
- Maximum single equity holding, default 35% of its equity sleeve.

Control point:

- The proposed portfolio should pass allocation, style, ticker count, and single-security checks before backtest and approval.
- The proposed portfolio is built inside the system from the approved ticker universe. Actual broker holdings are loaded later through the actual holdings interface.

## 9. Data Loading

Owner: Execution Team

Load these data files when available:

- Market price history CSV, before beta and backtest.
- Ticker universe CSV, before portfolio construction.
- Proposed portfolio built in system, before backtest and optimization.
- Actual holdings CSV, after implementation starts.
- Actual trades CSV, after trade execution.
- Cash-flow CSV, for performance reporting.

Current sample files are stored in the project folder:

- `data/sample_prices.csv`
- `data/sample_prices_web_recent.csv`
- `data/public_data_engine_output/auto_historical_prices.csv`
- `data/public_data_engine_output/auto_ticker_universe.csv`
- `data/public_data_engine_output/auto_market_statistics.csv`
- `data/sample_ticker_universe.csv`
- `data/standard_actual_holdings.csv`
- `data/standard_actual_trades.csv`
- `data/standard_cash_flows.csv`

Control point:

- Historical price data must include all proposed portfolio tickers needed for beta and backtest.
- Dates must align across benchmark and proposed portfolio tickers.
- Ticker symbols should match the ticker universe.

## 10. Beta Engine

Owner: Execution Team

The beta engine calculates equity beta using historical returns.

```text
Beta =
covariance(asset returns, benchmark returns)
/
variance(benchmark returns)
```

Procedure:

1. Load historical price CSV.
2. Select benchmark proxy.
3. Select lookback window.
4. Select frequency.
5. Run beta calculation.
6. Confirm each equity ticker has an automatically calculated beta against its locked sleeve benchmark.

Control point:

- Equity beta should normally come from the selected benchmark.
- Manual equity override is allowed only as an exception.

## 11. Proposed Portfolio Backtest

Owner: Execution Team

The backtest uses the proposed portfolio built inside the system. It does not use actual broker holdings. Actual holdings are loaded only after implementation starts, for rebalance monitoring and reporting.

The Step 11 backtest uses the proposed equity portfolio only. It does not mix in bond, alternative, cash, or actual broker holding data.

The default backtest setting is 36 months of weekly return data. The Execution Team can change the lookback period to 12, 24, 36, or 60 months and can choose daily, weekly, or monthly return frequency before running the test.

Approval hard controls:

```text
each equity sleeve return no lower than the approved shortfall tolerance versus that sleeve's target return
each equity sleeve beta within the approved tolerance versus that sleeve's target beta
each equity sleeve max drawdown within the approved tolerance versus its risk-adjusted sleeve drawdown budget
proposed equity portfolio return and drawdown summary also pass the base controls
```

Default tolerances:

- Return may fall no lower than 5% below the target value by default.
- Return above the default 50% excess-review band is not a hard failure, but the optimizer should produce advice because the excess may come from stock-specific risk rather than systematic beta exposure.
- Sleeve beta may deviate by 5% relative to the target value.
- Max drawdown may be up to 10% deeper than the approved sleeve or summary drawdown limit.

Portfolio beta note:

- Portfolio beta may be shown as a summary monitor.
- Its benchmark should be a blended policy benchmark aligned with the approved asset allocation.
- In the current prototype, the blended benchmark uses VTI, 1306.T, 2800.HK, 510300.SS, AGG, GLD, and BIL with the approved target allocation weights. U.S.-listed regional ETFs can still use ETF-level proxies such as EWJ, EWH, and ASHR for ticker-level beta calculation.
- It is a monitoring indicator unless the Decision Committee separately approves a whole-portfolio beta limit.

Procedure:

1. Load historical price data.
2. Run beta/backtest.
3. Review sleeve and proposed equity summary return pass/fail status.
4. Confirm beta control status.
5. Confirm max drawdown status.
6. If beta or drawdown fails, or if return is above the excess-review band, run optimizer.

## 12. Optimization

Owner: Execution Team

The optimizer suggests revised weights when return falls below the shortfall floor, return exceeds the excess-review band, sleeve beta fails, or drawdown fails. The first optimization layer must keep the proposed ticker list unchanged and adjust weights only.

Before running optimization, the execution manager may lock individual holdings so their weights do not change. The approved sleeve weights remain fixed; the optimizer adjusts eligible ticker weights inside each sleeve.

Current beta optimizer:

- Adjusts eligible proposed equity holdings by sleeve.
- Keeps locked holdings unchanged.
- Scores against the proposed equity return target, applicable sleeve beta targets, max drawdown, and constraints.

Procedure:

1. Decide whether any holdings must be locked.
2. Run optimizer.
3. Review the three weight-only optimization options.
4. If the three weight-only options cannot produce a hard-control pass, review the minimum same-market, same-style ticker replacement plan. The current search covers one to four replacements across sleeves that failed return, beta, or drawdown controls. Excess return is disclosed as a review note only.
5. Review the optimizer explanation cards:
   - Constraint status.
   - Locks and scope.
   - Before / after controls.
   - Feasibility conclusion.

If no weight-only option or minimum replacement plan can pass hard controls, the proposed portfolio cannot be submitted to the Decision Committee. If hard controls pass but return review remains, the Execution Team may submit the plan with the return-review flag noted. Otherwise the Execution Team should return to Step 06, revise the ticker set, or expand the approved ticker universe.
6. Confirm each sleeve's return, beta, and max drawdown controls pass.
7. Submit optimized version for committee approval.

Control point:

- If the optimizer cannot meet controls under current locks, the execution team should relax constraints, add eligible tickers, or request committee guidance.
- Optimization output is a control recommendation, not an automatic investment instruction.
- If the optimizer cannot solve the issue, the feasibility explanation should identify the primary blocker: beta gap, drawdown breach, locked holdings, missing price pairs, or insufficient eligible tickers.

## 13. Portfolio Implementation Approval

Owner: Decision Committee

Final implementation approval requires:

```text
annual target return approved
+ proposed equity portfolio and each sleeve pass return, beta, and max drawdown controls
+ allocation constraints pass
+ required committee members approve
```

Procedure:

1. Review optimized holdings.
2. Review backtest metrics.
3. Confirm return passes.
4. Confirm sleeve beta controls pass.
5. Confirm max drawdown passes.
6. Confirm constraints pass.
7. Record each committee member's decision.

## 14. Trade Authorization and Execution Log

Owner: Execution Team, with committee escalation when needed

Procedure:

1. Generate trade orders from approved target weights.
2. Select buy or sell.
3. Enter ticker, quantity, price, and reason.
4. If reason is `Compliant`, no special remark is required.
5. If reason is `Exception`, enter a required remark.
6. If the trade value is within execution authority, the Execution Team role holder authorizes and records the trade.
7. If the trade value exceeds authority, escalate to Decision Committee.
8. Load actual trades after execution and compare quantity/value against the configured execution tolerance.
9. Load next-day actual holdings and confirm authorized trade tickers reached target weights within the configured holding tolerance.

Control point:

- Trade authorizations must be recorded before implementation.
- Actual broker trades should later be reconciled against authorized orders.
- Default tolerances: quantity +/-1%, value +/-2%, holding completion +/-0.50 percentage point.

## 15. Actual Holdings Loading and Rebalance

Owner: Execution Team

Procedure:

1. Load consolidated actual holdings from the broker data interface every day.
2. Review the equity-only market value trend updated by the daily holdings import.
3. Run the formal sleeve/style corridor check monthly.
4. Treat daily imports as data refreshes; they can show observed drift but do not start a trade process by themselves.
5. Compare sleeve/style weights against approved target weights.
6. Review individual ticker risk flags separately from rebalance triggers.
7. Trigger rebalance alert only when the monthly corridor check finds a sleeve/style segment outside the approved corridor.

Equity value trend rule:

- The trend uses actual imported equity holdings only.
- Bond, alternative, cash, and cash-like positions are excluded.
- The trend shows market value movement, not formal cash-flow adjusted performance return.

Default rebalance corridor:

```text
relative -20% to +20%
```

Escalation rule:

- The system generates `Minimum Trade Plan`, `Target Weight Plan`, and `Exception Plan` in the same standard format.
- The Execution Team selects one system plan.
- The Execution Team clicks `Accept Selected Rebalance Plan` to formally accept the chosen system plan.
- The 3-trading-day completion deadline starts from plan acceptance.
- If the accepted plan is not completed within 3 trading days, notify Decision Committee members and the Execution Team leader.
- If the breach must remain, submit the standard `Exception Plan` with reason and committee approval.
- The rebalance dashboard shows open drift alerts, completion deadline, escalation status, and exception status.
- The action plan table shows suggested buy/sell action, trade amount, deadline, and escalation recipient.
- The execution team should record each follow-up action in the Rebalance Follow-up Log: handled, deferred, exception submitted, or escalated.

## 16. Reporting

Owner: Execution Team / Compliance / Reporting

Reports may be generated for:

- Daily
- Weekly
- Quarterly
- Yearly
- Custom period

Report content:

- NAV change chart.
- Return target achievement.
- Sharpe and Sortino by equity sleeve market.
- Asset-class contribution pie chart.
- Performance attribution separating Decision Committee allocation / timing contribution from Execution Team stock-selection and implementation contribution.
- Distribution status.
- Data-load traceability and data-load error report.
- Rebalance follow-up records.
- Committee Review Pack export.

Non-equity NAV review before report generation:

1. Execution Team enters bond NAV, alternative NAV, cash NAV, and as-of date.
2. Execution Team submits the NAV values for review.
3. Decision Committee approves or rejects the submitted values.
4. Only approved non-equity NAV enters total NAV, asset-class contribution, and formal report status.

Report presentation rule:

- The front-end report should show conclusions and charts, not detailed calculation steps.
- Detailed calculation logic belongs in the product logic / IT documentation.

Return calculation:

- Use Modified Dietz when cash flows exist.
- Compare realized return against time-adjusted target return.

Control point:

- Realized return comparison is for monitoring and reporting.
- It should not be confused with the proposed portfolio backtest used before implementation.
- The equity market value trend is an operating view of stock exposure. It should not replace Modified Dietz or other formal return calculations.

Annual performance attribution:

- Committee market-timing / market-beta contribution: the portion explained by the committee-approved market exposure and target beta.
- Execution manager stock-selection contribution: residual return after benchmark and beta exposure; used as a proxy for specific security-selection skill.
- Beta implementation gap: the contribution from the difference between actual portfolio beta and approved target beta.
- Committee attribution share: the committee contribution as a share of absolute explained attribution.
- Execution team attribution share: stock selection plus beta implementation gap as a share of absolute explained attribution.
- Annual review verdict: indicates whether the Decision Committee, Execution Team, or mixed contribution drove more of the explained annual result.
- Annual review control cards show readiness, committee conclusion, execution conclusion, and next review action.
- The attribution is a management-review tool. It should support annual review discussions rather than replace committee judgment.

## 17. Audit Log

The audit log should record:

- User changes.
- Data loads.
- Target approvals.
- Portfolio changes.
- Optimization runs.
- Implementation approvals.
- Trade authorization records.
- Rebalance exceptions.
- Report exports.
- Permission denials.

The audit log should be exported and reviewed periodically.

## 18. Current Simulation Example

A complete workflow simulation has been generated here:

```text
simulation/output/full_workflow_result.md
```

Supporting simulated data:

- `simulation/output/full_workflow_users.csv`
- `simulation/output/full_workflow_target_assumptions.csv`
- `simulation/output/full_workflow_optimized_holdings.csv`
- `simulation/output/full_workflow_trade_orders.csv`
- `simulation/output/full_workflow_actual_holdings.csv`
- `simulation/output/full_workflow_audit_log.csv`

## 19. End-of-Process Checklist

Before implementation:

- Annual target return approved.
- Public Data Engine run or market statistics loaded.
- Missing generated values covered by manual fallback inputs.
- Sleeve allocation matches final target return.
- Equity sleeve target betas valid.
- Target max drawdown valid.
- Price data quality passed.
- Ticker universe quality passed.
- Portfolio constraints passed.
- Backtested beta passed.
- Backtested drawdown passed.
- Sleeve and proposed equity summary returns passed.
- Optimized portfolio approved by committee.
- Trade orders approved.

After implementation:

- Actual trades loaded.
- Actual holdings loaded.
- Rebalance alerts reviewed.
- Exceptions approved when needed.
- Performance report generated.
- Audit log exported.
