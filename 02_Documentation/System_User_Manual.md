# Puyan Capital Control Center User Manual

Version: 0.1
Date: 2026-06-21

## 1. What This System Does

This system supports a full investment management workflow:

1. Maintain users and system parameters.
2. Run and accept the Annual Public Data package.
3. Set and approve annual target return.
4. Allocate the approved target return across sleeves.
5. Derive target beta using CAPM.
6. Set target max drawdown.
7. Build a proposed portfolio.
8. Run beta engine and backtest.
9. Generate optimization suggestions.
10. Submit the portfolio for committee approval.
11. Create trade authorization records.
12. Load actual execution data after trades are executed.
13. Monitor monthly rebalance alerts.
14. Generate performance and risk reports.
15. Export audit records.

The system separates investment policy decisions from execution decisions.

## 2. User Roles

### System Administrator

Uses the system to:

- Maintain users.
- Assign users to Decision Committee or Execution Team.
- Export audit logs.
- Reset the system when needed.

### Decision Committee

Uses the system to:

- Run and accept the annual public-data package.
- Approve annual target return.
- Approve target beta and max drawdown assumptions.
- Approve portfolio implementation.
- Approve exceptions.

### Execution Team

Uses the system to:

- Build proposed portfolios.
- Load price, ticker universe, portfolio, and actual execution data.
- Run beta and backtest.
- Run optimizer.
- Prepare trade orders.
- Monitor holdings and rebalance alerts.

### Compliance / Reporting

Uses the system to:

- Review reports.
- Review audit records.
- Review rebalance alerts and escalation.

## 3. Main Screen Overview

The current prototype is a single-page operating screen. It contains these major sections:

- Target Factors
- CPI Forecast Sources
- Market Outlook
- Annual Public Data
- Target Return Summary
- Sleeve Allocation
- CAPM and Target Beta
- Target Max Drawdown
- User and Governance Controls
- Investment Style Constraints
- Beta Engine and Data Loading
- Proposed Portfolio
- Backtest and Optimization
- Committee Approval
- Actual Holdings and Rebalance
- Trade Authorization / Execution Log
- Reporting
- Audit Log

The top-right `View` control has two display modes:

- `Clean`: the default business view. It keeps the current step, main inputs, main results, approval state, and next action visible, while hiding engineering details, sample-data helpers, audit tables, backend connection tools, and long explanatory notes.
- `Detail`: the review view for IT checks, business logic review, data-source review, and troubleshooting. It restores supporting notes, source details, registry tables, permission visibility, and technical status panels.

## 4. Step-by-Step Use

## Step 1: Select Current Acting User

Before taking an action, confirm the current acting user.

Use this when testing permissions:

- System Administrator for user maintenance.
- Decision Committee member for target approval and portfolio approval.
- Execution Team member for portfolio editing, data loading, optimizer, and trade authorization.

If the wrong user tries an action, the system should block it and record the denial in the audit log.

The `Role Permission Visibility` panel shows whether the current acting user can perform admin, decision, execution, data-loading, and reporting actions. A user may open other workflow pages for review, but the page becomes read-only when that user is not the responsible role. Work buttons are hidden and input fields are locked. For example, the Decision Committee can view Execution Team preparation pages without changing them, and the Execution Team can view committee approval pages without approving them.

## Step 2: Maintain Users

Owner: System Administrator

1. Go to the user administration area.
2. Confirm Decision Committee members are active.
3. Confirm Execution Team users are active.
4. Confirm user roles are correct.
5. Open `Business System Configuration` and review the `Parameter Maintenance Register`.
6. Review the pre-filled system default values. Change only the parameters that need firm-specific maintenance.
7. Click `Submit / Activate Parameters` below the register to send the active version to the backend.

Expected result:

- User validation passes.
- Approval dropdowns and permission checks can use active users.
- Restricted buttons update after the acting user changes.
- The parameter register shows scenario bands, allocation defaults, risk-free rates, tolerances, portfolio construction limits, rebalance rules, execution tolerances, and where each parameter is used.
- If the administrator does not change a field, the pre-filled system default is submitted as the active backend value.
- Submitted parameter changes record a version, maintenance time, maintainer, and active backend configuration.

System-admin maintained parameter groups:

- Trusted data sources: CPI source priority list.
- Target return: Bull / Balanced / Bear scenario bands.
- Allocation defaults: asset-class weights and equity regional shares by scenario.
- CAPM / beta: market-specific risk-free rates and equity return allocation method.
- Backtest controls: beta, return, and drawdown tolerances.
- Portfolio construction: style ticker minimum/maximum and single-security concentration limit.
- Rebalancing: corridor and completion deadline.
- Execution control: trade quantity, value, and holding-completion tolerances.

## Step 3: Run and Accept Annual Public Data

Owner: Decision Committee

Run this step at the start of the annual investment cycle, before the annual target return is finalized.

Procedure:

1. Confirm the local backend is running.
2. Click `Run Annual Public Data`.
3. Confirm historical prices, ticker universe, and market statistics are loaded.
4. Review the scenario allocation recommendation. The scoring model uses long-term annualized return, latest 1-year trend, volatility, maximum drawdown, and diversification score, then keeps weights inside the selected scenario range.
5. Review whether any manual fallback field is active.
6. If a value is missing, enter the manual fallback return for bond, alternative, or cash.
7. Accept the annual public-data package for the current annual cycle.

Expected result:

- Annual public-data status becomes ready.
- Generated CSV files are loaded into the workflow.
- Data Load Registry shows each loaded data batch with source file, data date, row count, validation status, user, and timestamp.
- Repeat runs refresh the latest period of the locally retained public-price history instead of downloading the entire history again.
- Missing generated values are covered by manual fallback inputs.
- Execution Team can read the accepted annual data but cannot run or accept it.

## Step 4: Enter Target Return Factors

Owner: Decision Committee

Inputs:

- Required operating cost rate.
- CPI forecast sources.
- Market scenario.
- Selected market outlook value.

Market scenario options:

- Bull Market: 5% to 12%.
- Balanced Market: -2% to 2%.
- Bear Market: -12% to -3%.

Procedure:

1. Enter operating cost.
2. Add CPI sources.
3. Choose CPI method:
   - average, or
   - selected source.
4. Select Bull, Balanced, or Bear scenario.
5. Enter one exact outlook value inside the selected scenario range.

Expected result:

- Final target return is calculated.

Formula:

```text
Final target return =
operating cost
+ CPI estimate
+ selected market outlook value
```

## Step 5: Approve Annual Target Return

Owner: Decision Committee

1. Review final target return.
2. Review CPI source records.
3. Review selected market scenario.
4. One active Decision Committee approver records approval.

Expected result:

- Annual target return status becomes approved.

Important:

- If target assumptions change after approval, approval should return to pending.

## Step 6: Allocate Return Across Sleeves

Owner: Execution Team, after annual public-data acceptance and Decision Committee target approval

The Execution Team prepares the allocation of the approved annual target return across investment sleeves. The Decision Committee reviews the final prepared package at Step 08.

This step uses the same bull / bear / balanced market judgment from the annual target-return stage. The scenario is not judged again. It is reused to produce asset-class and equity-sleeve allocation guidance.

The system administrator maintains the default allocation proportions, market/currency risk-free rates, and equity return allocation method for each scenario. The default method is `Baseline + positive shortfall gap`: the approved annual target return is treated as a floor. The system starts from historical baseline returns, allocates only a positive target shortfall across equity sleeves, and records an expected buffer when the baseline already exceeds the approved target. Other administrator options are `Pure pro-rata equity target` and `Manual equity contribution`.

Current sleeves:

- U.S. Equity
- Developed ex-U.S. Equity, currently mapped to Japan
- Emerging Markets Equity, currently mapped to Hong Kong and China A
- Bond
- Alternative
- Cash and cash-like

Procedure:

1. Review the suggested asset-class allocation from the Public Data Engine.
2. Review the suggested equity Return/Beta Sleeve allocation.
3. Confirm or manually adjust target weight for each sleeve.
4. Review the equity return contributions prepared by the configured allocation method, or enter them manually if the administrator selected manual contribution mode.
5. Enter reference return for non-equity sleeves, using generated values where available and manual fallback values where needed.
6. Confirm allocated return meets or exceeds the approved annual target floor.

Expected result:

- Allocation validation passes.
- Whole-portfolio target return is decomposed into sleeve-level targets, with any expected buffer shown separately.
- Return/Beta Sleeve and Geographic Region are treated as separate tags. For example, a Japanese stock can be `Japan Equity` as its Return/Beta Sleeve and `Japan` as its Geographic Region.

## Step 7: Derive Target Beta

Owner: Execution Team

Inputs:

- Equity sleeve target return.
- Market/currency risk-free rate for the relevant sleeve.
- Long-term market return assumption.

Equity sleeves use their own target return to derive a target beta. The current production logic uses three Return/Beta sleeves: U.S. equity, developed ex-U.S. equity, and emerging markets equity. The configured market mapping is U.S. / USD, Japan / JPY, and a Hong Kong plus China A blend for emerging markets.
- Benchmark proxy.

The Beta Engine also shows an Equity Sleeve Beta Readiness table. This table displays U.S. equity, Japan equity, Hong Kong equity, and China A equity side by side with benchmark proxy, target return, target beta, proposed weight, backtested beta when price data is available, and status.

Formula:

```text
Target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(market return assumption - sleeve market/currency risk-free rate)
```

Procedure:

1. Review the administrator-maintained market/currency risk-free rate for each sleeve.
2. Select market benchmark or use manual assumption.
3. Review implied target beta.

Expected result:

- Equity sleeve target beta is valid.

Important:

- Market return assumption must be higher than the relevant sleeve market/currency risk-free rate.
- Market risk premium must not be too small.
- Equity-market sleeve beta is the hard control.
- Portfolio beta is a reference monitor against a blended policy benchmark and does not replace sleeve-level beta controls.

## Step 8: Set Target Max Drawdown

Owner: Execution Team, using administrator-maintained rule ranges

Formula:

```text
Base equity max drawdown =
-(weighted equity target return / return-drawdown range)
```

Default range:

```text
0.60 to 0.80
```

Expected result:

- Base equity max drawdown band is calculated.
- Each equity sleeve receives its own drawdown budget adjusted by approved sleeve weight, historical volatility, and available historical drawdown.
- The system uses historical volatility and historical maximum drawdown to decide whether a sleeve should receive a tighter or wider drawdown budget.
- Higher-risk sleeves can receive a wider budget; lower-risk sleeves receive a tighter budget.
- The proposed equity summary still has to pass the base equity drawdown control.

## Step 9: Choose Investment Style Constraints

Owner: Execution Team

Choose investment style:

- Conservative
- Balanced
- Growth
- Income
- Custom

The style preset controls:

- Equity range.
- Bond range.
- Alternative range.
- Cash range.
- Cyclical range.
- Growth range.
- Active range.
- Regional ranges.
- Max single equity holding.

Expected result:

- Proposed portfolios must follow these constraints.

## Step 10: Load Required Data

Owner: Execution Team

Recommended files:

- `data/sample_prices.csv`
- `data/sample_prices_web_recent.csv`
- `data/sample_ticker_universe.csv`
- `data/standard_actual_holdings.csv`
- `data/standard_actual_trades.csv`
- `data/standard_cash_flows.csv`

Procedure:

1. Load historical market price CSV before beta and backtest.
2. Load ticker universe CSV if needed before portfolio construction.
3. Build the proposed portfolio in system before backtest and optimization.
4. Later, after execution, load actual holdings, actual trades, and cash flows.

Expected result:

- Data quality checks pass.

## Step 11: Build Proposed Portfolio

Owner: Execution Team

Primary method:

- Build the proposed portfolio inside the system.
- Select the equity sleeve.
- Search the approved ticker universe.
- Add selected tickers into the sleeve.
- Enter proposed weights and lock settings.

For each holding, enter or select:

- Region
- Asset class
- Style factor
- Theme
- Ticker
- Weight
- Beta method

Equity beta should normally be calculated automatically from the selected benchmark. The proposed portfolio is built inside the system from approved ticker-universe choices; bonds, alternatives, and cash do not belong in the proposed equity portfolio.

Expected result:

- Total weight is close to the approved equity sleeve total.
- Constraint validation passes.
- Per-sleeve / per-style ticker counts pass, using the administrator-defined minimum and maximum.
- Single equity limit passes.

## Step 12: Run Beta Engine

Owner: Execution Team

Procedure:

1. Confirm price CSV is loaded.
2. Confirm benchmark proxy is selected.
3. Select frequency and lookback.
4. Run calculation.

Expected result:

- Equity beta values are calculated against the selected benchmark.

## Step 13: Run Proposed Portfolio Backtest

Owner: Execution Team

The backtest uses the proposed portfolio built inside the system. It does not use actual broker holdings. Actual holdings are loaded only after implementation starts, for rebalance monitoring and reporting.

Backtest object:

- System-built proposed equity portfolio only.
- Actual broker holdings are not used in this step.
- Bond, alternative, and cash policy proxies are not mixed into this proposed-equity backtest.

Backtest settings:

- Default: 36 months, weekly returns.
- Available lookback choices: 12, 24, 36, or 60 months.
- Available frequency choices: daily, weekly, or monthly.

Hard pass/fail controls:

- Each equity sleeve annualized return must not fall below the approved shortfall tolerance versus its own sleeve target return.
- Each equity sleeve beta must be within the approved tolerance versus its own sleeve target beta.
- Each equity sleeve max drawdown must be within the approved tolerance versus its own risk-adjusted sleeve drawdown budget.
- The proposed equity portfolio return and max drawdown summary must also pass.
- Return above the excess-review band is shown as Review rather than Fail, because the excess may come from stock-specific risk instead of systematic beta exposure.

Expected result:

- Beta status is Pass or Review.
- Drawdown status is Pass or Review.
- Proposed portfolio decision says whether optimization is needed.

Portfolio beta note:

- The portfolio beta monitor is for total-risk reference only.
- Its conceptual benchmark is a blended policy benchmark based on the approved asset allocation.
- The system calculates the blended benchmark from target allocation weights and market proxies: VTI, 1306.T, 2800.HK, 510300.SS, AGG, GLD, and BIL. U.S.-listed regional ETFs use ETF-level proxies such as EWJ, EWH, and ASHR for ticker-level beta calculation.
- It should not be interpreted as the main approval beta unless the Decision Committee separately sets a whole-portfolio beta limit.

## Step 14: Run Optimizer

Owner: Execution Team

Use optimizer when beta or drawdown needs review, or when return is above the excess-review band.

Before running optimizer, you may:

- Lock individual holding weights.
- Keep the approved sleeve weights fixed.
- Keep the proposed ticker list unchanged in the first optimization layer.
- Confirm historical prices are loaded for all proposed tickers and locked benchmarks.

Procedure:

1. Decide whether any holdings should stay fixed.
2. Check `Lock` for those rows.
3. Click `Generate Three Optimization Options`.
4. Review suggested weights.
5. Review optimization advice and explanation cards.
6. Select a passing option if one satisfies all controls.

Expected result:

- Optimized beta gets closer to the applicable equity-market sleeve target beta.
- Max drawdown remains within budget.
- Excess return review is reduced where possible without sacrificing beta or drawdown hard controls.
- Locked holdings do not change.
- The explanation cards show which constraints passed, which holdings were locked, what changed from before to after, and whether the result is feasible.
- If weight-only optimization cannot produce a hard-control pass, the system checks a minimum same-market, same-style ticker replacement plan, currently searching one to four replacements across sleeves that failed return, beta, or drawdown controls.
- If no replacement plan can pass hard controls, the system blocks committee submission and directs the Execution Team back to Step 06. If hard controls pass but return review remains, the plan can still be submitted with the review flag noted.

If optimizer cannot solve the issue:

- Relax locks.
- Add eligible tickers.
- Expand the approved ticker universe if needed.
- Ask Decision Committee for guidance.

## Step 15: Submit Portfolio for Committee Approval

Owner: Execution Team

Submit only after:

- Annual target return is approved.
- Data quality passes.
- Allocation constraints pass.
- Target beta control passes.
- Max drawdown control passes.

The committee then approves or rejects implementation.

Expected result:

- If all members approve, the portfolio version is locked.

## Step 16: Create and Authorize Trade Orders

Owner: Execution Team

Procedure:

1. Create buy or sell orders.
2. Enter ticker, quantity, price, and reason.
3. Choose reason type:
   - Compliant
   - Exception
4. If Exception is selected, enter remark.
5. Record the authorization decision.

Authorization rule:

- Trades within execution authority can be authorized by the Execution Team role holder.
- Trades above authority require Decision Committee approval.
- Default execution tolerances are quantity +/-1%, value +/-2%, and holding completion +/-0.50 percentage point.
- After the next holdings import, the system checks whether authorized trade tickers reached their approved target weights within the holding completion tolerance.

## Step 17: Load Actual Trades

Owner: Execution Team

Load actual broker trades from the standard trade file.

Expected result:

- Actual trades are reconciled against authorized trade orders.
- Quantity and value differences inside the configured execution tolerance are accepted.
- Missing or mismatched trades are flagged.

## Step 18: Load Actual Holdings

Owner: Execution Team

Load consolidated actual holdings.

Expected result:

- Actual holdings are imported daily through the standard holdings file.
- Each successful actual holdings import updates the equity-only market value history.
- The Monitoring & Rebalance curve remains equity-only for listed equity exposure monitoring.
- Bond, alternative, and cash NAV are collected later in the report step and require Decision Committee review before becoming effective.
- Formal sleeve/style corridor checks run monthly.
- Daily imports can show observed drift, but they do not start a trade process by themselves.
- Sleeve/style drift is monitored against the approved corridor.
- Individual tickers are monitored for risk flags such as unapproved ticker or concentration limit breach.

## Step 19: Review Rebalance Alerts

Owner: Execution Team / Compliance

Default corridor:

```text
relative -20% to +20%
```

If the monthly corridor check finds a sleeve/style segment outside the corridor:

1. Select `Minimum Trade Plan`, or
2. Select `Target Weight Plan`, or
3. Submit a standard-format `Exception Plan` for Decision Committee approval.
4. Click `Accept Selected Rebalance Plan`.
5. Complete the accepted plan within 3 trading days from the acceptance timestamp.
6. If not completed by the deadline, escalate to Decision Committee and Execution Team leader.

The rebalance dashboard summarizes:

- Open drift alerts.
- Completion deadline.
- Escalation status.
- Exception status.
- Equity-only market value trend from daily imported actual holdings.

Use `Rebalance Follow-up Log` to record whether the alert was handled, deferred, submitted as an exception, or escalated.

## Step 20: Generate Report

Owner: Execution Team / Compliance

Report period options:

- Daily
- Weekly
- Quarterly
- Yearly
- Custom

Report includes:

- NAV change chart.
- Return target achievement.
- Sharpe and Sortino by equity sleeve market.
- Asset-class contribution pie chart.
- Performance attribution by Decision Committee allocation / timing and Execution Team stock selection / implementation.
- Data-load traceability and data-load error count.
- Rebalance follow-up status.

Before the report becomes formal, the Execution Team enters bond NAV, alternative NAV, cash NAV, and the as-of date. The Decision Committee must approve these non-equity NAV values before they enter the formal total NAV and asset-class contribution pie chart.

The report page is intentionally concise: it shows conclusions and charts, while calculation details remain in the product logic / IT handoff documents.

Use `Download Committee Pack PDF` to generate a committee review PDF directly. The PDF includes target status, proposed holdings, data load traceability, data load errors with suggested fixes, rebalance follow-up, and annual attribution.

Annual performance attribution shows:

- Primary contributor.
- Annual review verdict.
- Policy benchmark return.
- Committee allocation / timing contribution.
- Committee attribution share.
- Manager stock selection contribution.
- Execution team attribution share.
- Beta implementation gap.
- Review readiness.
- Committee conclusion.
- Execution conclusion.
- Next review action.

Use this section during annual review to discuss whether return mainly came from committee-level market allocation and timing decisions, or from execution-manager security selection.

## Step 21: Export Audit Log

Owner: System Administrator / Compliance

Export audit log to review:

- approvals
- data loads
- optimizer actions
- trade authorization records
- permission denials
- report exports

## 5. Common User Questions

### Why does the system use target return to derive beta?

Target return is a forward-looking expectation. CAPM uses that expectation to derive the target beta needed for each equity sleeve.

### Why does backtested return still have to pass?

Historical return does not guarantee future return, but it is part of the feasibility check. Each sleeve and the proposed equity portfolio summary must pass return, beta, and max drawdown controls before the proposal can move to approval.

### Why did optimizer change only some stocks?

The optimizer respects locks and scope restrictions. It only changes eligible holdings.

### Why did a user action get blocked?

The current acting user may not have the correct role. Change to an authorized user or ask the System Administrator to update roles.

### Why did a holding trigger rebalance?

Its actual weight drifted beyond the approved corridor.

## 6. Related Files

SOP:

```text
docs/Investment_Management_Tool_SOP.md
```

Workflow diagram:

```text
docs/System_Workflow_Diagram.md
docs/system_workflow_diagram.png
```

IT guide:

```text
docs/IT_System_Check_and_Finetune_Guide.md
```

Simulation report:

```text
simulation/output/full_workflow_result.md
```
