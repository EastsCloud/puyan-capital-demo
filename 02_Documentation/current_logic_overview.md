# Current Logic Overview

This document summarizes the current investment management workflow built so far. It is a working blueprint, not the final formal proposal document.

## 1. Governance Philosophy

The system follows a CFA-style separation between investment policy decisions and implementation decisions.

Investment committee controls:

- Market timing
- Market selection
- Style allocation
- Annual public-data acceptance
- Annual target return approval
- Final portfolio implementation approval
- Exceptions that breach approved rules

Execution team controls:

- Specific security selection
- Proposed holding weights
- Trade order execution within authority
- Implementation after committee approval

The system should prevent execution from bypassing Decision Committee boundaries.

## 2. Annual Public Data

At the start of the annual investment cycle, the Decision Committee runs or uploads the annual public-data package. The system uses that package to produce scenario-based asset-class weights, equity-sleeve shares, reference returns, risk-free-rate assumptions, and historical price inputs before the annual target return is finalized.

The recommendation uses historical reference statistics for:

- Asset-class returns, volatility, max drawdown, and diversification behavior
- Equity-region returns, volatility, and correlation notes
- The selected 12-month macro scenario: bull, balanced, or bear

Historical statistics come first from the Annual Public Data Engine and can also come from the standard external market data interface:

```text
data/standard_market_data_interface.xlsx
data/standard_market_statistics.csv
```

The current prototype loads the CSV version in the `Historical Allocation Recommendation` module. The Excel workbook is the standard business-facing interface and can be populated by a separate market-data tool or data team.

The recommendation is not automatic approval. It is a data-supported starting point accepted by the Decision Committee for the annual cycle. The Execution Team can read it later but cannot run or accept it.

## 3. Annual Target Return

After annual public data is accepted, the system calculates the acceptable annual target return band.

```text
Acceptable target return band =
required operating cost rate
+ expected 12-month CPI
+ selected market outlook band
```

Market outlook choices:

- Bull Market: 5% to 12%
- Balanced Market: -2% to 2%
- Bear Market: -12% to -3%

After the market scenario is selected, the system provides the corresponding reference range. The Decision Committee then chooses one specific market outlook value inside that range.

```text
Final target return =
required operating cost rate
+ expected 12-month CPI
+ committee-selected market outlook value
```

That final target return must be approved by the Decision Committee before it becomes the active annual target.

## 4. Target Beta and Max Drawdown

After target-return approval, the Execution Team prepares sleeve allocation using the accepted annual public-data package.

The Public Data Engine calculates the recommendation through a scenario scoring model rather than fixed weights. It scores each asset class and equity market using long-term annualized return, latest 1-year annualized trend, annualized volatility, maximum drawdown, and a diversification score. Bull markets emphasize return and trend, bear markets emphasize low volatility and low drawdown, and balanced markets give return and risk similar weight. The engine then allocates weights inside the selected scenario's allowed ranges.

When the recommendation is applied, the system uses the equity return allocation method maintained by the system administrator. The default method calculates the historical baseline return of the suggested allocation, then allocates any target-return gap across equity markets according to their suggested equity weights. The administrator can alternatively use a pure pro-rata equity residual method or require the Execution Team to enter equity contributions manually.

After the Execution Team prepares the target allocation, the system allocates the return target across investment sleeves.

Equity-market sleeves use return contribution and target weight to derive each market's sleeve target return. Each equity market then uses its own long-term capital market assumption to derive a market-specific target beta.

Non-equity sleeves use prepared target weights and 12-month reference returns from the main market for that asset class.

```text
Whole-portfolio final target return =
sum(sleeve target weight * sleeve target return)
```

The weighted sum of all sleeves must match the approved whole-portfolio target return before the portfolio package should move to Step 08 approval.

The system then derives target beta for each equity-market sleeve using CAPM.

These CAPM-derived target betas control their corresponding equity-market sleeves, not the whole portfolio.

From this point onward, each equity market should be evaluated as its own sleeve. The approved equity markets are U.S. equity, Japan equity, Hong Kong equity, and China A equity.

```text
Equity sleeve target return =
equity sleeve contribution to total target return
/
equity sleeve target portfolio weight

Equity sleeve target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(long-term capital market assumption - sleeve market/currency risk-free rate)
```

The same formula applies to each official Return/Beta sleeve using its own target return, long-term capital market assumption, and market/currency risk-free rate. Current mappings are U.S. equity = U.S. / USD, developed ex-U.S. equity = Japan / JPY, and emerging markets equity = Hong Kong / HKD plus China A / CNY blend.

The U.S. beta is tied to the selected U.S. broad-market benchmark. Non-U.S. sleeve betas use their locked local sleeve benchmarks. The CAPM market return input is a committee-approved long-term capital market assumption, not a 12-month market forecast.

The system also shows the selected benchmark's annual returns for the latest 10 available calendar years from the uploaded historical price CSV, plus the arithmetic mean of those annual returns. This is a reference for the committee; it does not automatically replace the approved long-term assumption.

The system also derives a base equity max drawdown:

```text
Base equity max drawdown band =
-(weighted equity target return / return-drawdown range)
```

Default return-drawdown range:

```text
0.60 to 0.80
```

The equity-level risk controls are:

- Base equity max drawdown summary control
- Risk-adjusted sleeve drawdown budgets

Each equity sleeve risk control set is:

- Sleeve target return
- CAPM-derived sleeve target beta
- Sleeve drawdown budget adjusted by approved weight, historical volatility, and available historical drawdown

Sleeve drawdown budget calculation:

```text
sleeve risk score =
60% * sleeve volatility relative to weighted equity average
+ 40% * sleeve historical drawdown relative to weighted equity average

sleeve risk factor =
clamp(sleeve risk score, 0.75, 1.35)

sleeve drawdown budget =
base equity max drawdown band * sleeve risk factor
```

The base equity max drawdown band remains the proposed equity summary control. The sleeve drawdown budgets are the hard controls used in the sleeve backtest table.

The CAPM return input is the relevant equity sleeve target return, not the whole-portfolio target return.

Whole-portfolio beta is still monitored, but it is not the official CAPM allocation target.

## 4. Proposed Portfolio

The execution manager proposes a portfolio inside committee-approved boundaries.

Portfolio hierarchy:

1. Region
2. Asset class
3. Style factor
4. Equity theme
5. Security / ticker

Current constraint layers:

- Regional allocation ranges
- Asset-class allocation ranges
- Style-factor allocation ranges
- Administrator-defined ticker count range for each equity market sleeve and style bucket, default 2-5 tickers per U.S. / Japan / Hong Kong / China A and Cyclical / Growth / Active bucket
- Maximum single equity holding, default 35% of its equity sleeve

The ticker universe can be loaded from CSV before portfolio construction. The Execution Team builds the proposed portfolio inside the system: select a sleeve, search the approved ticker universe, add selected tickers, and enter weights. Proposed portfolio creation does not rely on an external CSV import at Step 06.

## 5. Beta Engine

The system calculates beta from historical price CSV.

```text
Beta =
covariance(asset returns, benchmark returns)
/
variance(benchmark returns)
```

Equity beta is automatically calculated against the selected primary benchmark when historical prices are available.

Bond and alternative beta are included through historical beta, policy beta, or manual estimates.

Cash normally uses zero beta.

## 6. Backtest and Optimization

Each equity sleeve is backtested against:

- Annualized return
- Equity sleeve beta versus its locked benchmark
- Sleeve max drawdown versus its own drawdown budget

Whole-portfolio beta can still be calculated as a monitoring metric, but it is outside the main CAPM-to-backtest chain.

Approval hard controls:

```text
proposed equity return no lower than the approved shortfall tolerance
each equity sleeve return no lower than its approved shortfall tolerance
each equity sleeve beta close to its own target beta
each equity sleeve max drawdown within its risk-adjusted sleeve drawdown budget
proposed equity max drawdown and return summary within base approved controls
```

Return above the administrator-maintained excess-review band is not a hard failure. It is flagged for optimizer review because it may reflect alpha, stock-specific risk, or style concentration rather than the intended beta exposure.

The proposed portfolio backtest uses only the proposed equity portfolio built inside the system. It does not use actual broker holdings and does not mix bond, alternative, or cash proxies into the Step 07 proposed-equity return and drawdown test.

Default backtest setting: 36 months, weekly returns. The user can choose 12, 24, 36, or 60 months and daily, weekly, or monthly frequency.

If the proposed portfolio does not pass hard controls, the optimizer first suggests revised holding weights while keeping the proposed ticker list and approved sleeve weights fixed. It first shifts weight directly from higher-beta holdings to lower-beta holdings when sleeve beta is too high, or the reverse when sleeve beta is too low. Only if the three weight-only options cannot produce a hard-control pass does the system check for a minimum same-market, same-style ticker replacement plan, currently searching one to four replacements across sleeves that failed return, beta, or drawdown controls. If no replacement plan can pass, the workflow stops before committee approval when hard controls fail; if hard controls pass but return review remains, the Execution Team may submit the weight-only option with the return-review flag noted.

The optimizer scores candidates against:

- U.S. equity sleeve target beta
- Target max drawdown
- Regional constraints
- Asset-class constraints
- Style-factor constraints
- Maximum single equity holding

The optimizer can also be constrained before it runs:

- Lock individual holding weights so they remain unchanged.
- Preserve approved sleeve weights while adjusting ticker weights inside each sleeve.

The current optimizer adjusts eligible equity holdings inside each approved equity sleeve. Non-equity holdings can be locked or monitored, but they are not used to solve the CAPM target beta.

The optimizer also produces an explainability layer:

- Constraint status: whether optimized beta and drawdown pass hard controls.
- Locks and scope: eligible holdings, locked holdings, and fixed sleeve-weight boundaries.
- Before / after controls: return, beta, and drawdown before and after optimization.
- Feasibility conclusion: feasible, partially improved, already acceptable, or blocked by current constraints.
- Failure reason: the feasibility conclusion identifies likely blockers such as beta gap, drawdown breach, locked holdings, insufficient tickers, or missing price pairs.

## 7. Decision Committee Approval

After the proposed portfolio passes system backtest, the Decision Committee must approve it before implementation.

The system administrator maintains active users in two groups:

- Decision Committee
- Execution Team

Default approval roles:

- Decision Committee Approver
- Execution Team Approver

Final implementation approval requires:

```text
annual target return approved
+ proposed equity portfolio and each sleeve pass return, beta, and max drawdown controls
+ one decision committee approval
```

Once approved, the system marks the portfolio as ready for implementation.

Permission rule:

- Annual target approval, implementation approval, and rebalance exception approval require active Decision Committee users.
- Proposed portfolio ownership and trade authorization require active Execution Team users.
- Approval records keep role, member name, status, note, and decision timestamp.
- The UI includes role permission visibility cards and disables restricted action buttons for the current acting user.

## 8. Load Actual Execution Data

The main system does not directly connect to every broker.

The intended interface is:

```text
Broker / Custodian
-> Broker Data Normalizer
-> Standard Holdings / Trades Workbook
-> Puyan Capital Control Center
```

The main system reads standardized holdings and trades files. The external normalizer handles broker-specific formats.

Current standard holdings fields:

```text
AsOfDate,Account,Broker,Ticker,Name,AssetClass,Region,Currency,Quantity,Price,MarketValue,Weight
```

The system compares actual weights against approved portfolio weights.

```text
Drift =
actual weight - approved weight
```

## 9. Rebalancing

Rebalance corridor defaults to:

```text
relative -20% / +20%
```

Actual holdings are imported daily for data freshness. Formal sleeve/style corridor checks run monthly. Daily imports can show observed drift, but they do not start a trade process by themselves.

Each successful actual holdings import also updates the equity-only market value history. The system shows this as a compact Control Center curve and a Monitoring & Rebalance curve. In Reports, the formal NAV curve combines daily equity market value with Decision Committee-approved non-equity NAV inputs for bond, alternative, and cash assets. Non-equity NAV values are not effective until submitted by the Execution Team and approved by the Decision Committee.

If the monthly corridor check finds a sleeve/style segment outside the corridor, the system triggers a rebalance alert. Individual holdings are monitored for risk flags, but holding drift is not the formal rebalance trigger.

The rebalance dashboard summarizes open drift alerts, completion deadline, escalation status, and exception status.

The rebalance action plan generates three standard options:

- Minimum Trade Plan
- Target Weight Plan
- Exception Plan

The Execution Team must click `Accept Selected Rebalance Plan` before the completion deadline starts. The accepted plan must be completed within 3 trading days from the acceptance timestamp.

The rebalance follow-up log records whether an alert was handled, deferred, submitted as an exception, or escalated, with owner, note, actor, and timestamp.

Rebalance monitoring covers:

- Sleeve weights
- Style bucket weights inside sleeves
- Individual ticker risk flags

If the selected plan remains pending after the 3-trading-day deadline, the system escalates the alert to:

- Investment committee members
- Execution manager / execution team leader

The first version displays escalation inside the system.

## 10. Rebalance Exceptions

The execution team can submit an exception when neither standard system plan should be executed.

Exception requirements:

```text
exception scope/ticker
+ exception reason
+ all committee members approve
```

Once approved, the exception follows the same standard action-plan format.

If not approved, normal rebalance alert and escalation rules apply.

## 11. Trade Authorization and Execution Log

After a portfolio is approved for implementation, each concrete buy or sell action must be recorded.

Each trade order records:

- Buy / Sell
- Ticker
- Quantity
- Price
- Trade value
- Reason type: Compliant or Exception
- Remark, required for Exception
- Execution authorizer
- Authorization status
- Committee status when required

Default execution team authorization limit:

```text
100,000
```

Authorization rule:

```text
trade value <= execution team limit
-> execution team authorization is sufficient

trade value > execution team limit
-> Decision Committee approval is required
```

Execution tolerance defaults:

```text
Quantity tolerance: +/-1%
Trade value tolerance: +/-2%
Next-holdings completion tolerance: +/-0.50 percentage point
```

After execution, actual trades are loaded from the standardized broker-normalizer export and reconciled against authorized orders. The next actual holdings import then verifies whether authorized trade tickers reached their approved target weights within the holding completion tolerance.

Standard actual trade fields:

```text
TradeDate,SettlementDate,Account,Broker,Action,Ticker,Currency,Quantity,Price,Fees,NetValue,ExternalTradeId
```

The system reconciles approved orders with actual trades by action and ticker:

- approved quantity versus actual quantity
- approved value versus actual value
- missing executions
- unapproved actual trades

## 12. Reporting

The reporting module supports:

- Daily
- Weekly
- Quarterly
- Yearly
- Custom date range

The report front end is a management report, not a calculation worksheet. It shows:

- NAV change chart
- Return target achievement
- Sharpe and Sortino by equity sleeve market
- Asset-class contribution pie chart
- Performance attribution by owner group

If actual holdings are loaded, reports filter and use actual equity holdings by sleeve. Otherwise reports use proposed / approved equity holdings by sleeve.

Before report issuance, the Execution Team enters non-equity NAV:

```text
Bond NAV
Alternative NAV
Cash NAV
As-of date
```

The Decision Committee must approve the submitted non-equity NAV before those values enter total NAV and the asset-class contribution chart.

Annual performance attribution separates committee-level and execution-level contribution:

```text
Committee timing / market beta contribution =
policy benchmark return * approved target beta

Beta implementation gap =
policy benchmark return * (actual beta - approved target beta)

Manager stock selection =
actual return - policy benchmark return * actual beta
```

The system also shows a management-review verdict:

- Decision Committee led: committee contribution is larger than execution contribution.
- Execution Team led: stock selection plus beta implementation gap is larger.
- Mixed contribution: the two sides are close.

Committee share and Execution Team share are based on absolute explained attribution, so negative and positive contributors are both visible in the annual review.

The annual review control cards add an operating conclusion: review readiness, committee conclusion, execution conclusion, and next review action.

## 13. Max Drawdown Early Warning

The system includes an early-warning rule before the max drawdown budget is fully breached.

Current warning rule:

```text
Warning level = target max drawdown limit * 80%
```

Drawdown states:

- Within control
- Approaching
- Breach

The warning appears in both backtest and performance reporting.

## 14. Report Export and Distribution

Reports can be exported as CSV for data review. A separate `Download Committee Pack PDF` control generates a committee-ready PDF with target status, proposed holdings, data load traceability, data load errors with suggested fixes, rebalance follow-up, and annual attribution.

The system records:

- Distribution status: Draft or Sent to Committee
- Distribution date
- Recipient group

This is the first audit trail for reporting. Later versions can connect this to email or workflow tools.

## 15. Current Architecture Choice

The main system focuses on investment governance, portfolio construction, risk controls, implementation tracking, and reporting.

Broker-specific data cleanup should live in a separate tool:

```text
Broker Holdings Normalizer
```

That keeps the main system stable even when broker formats change.

## 16. Open Items / Possible Missing Decisions

The current workflow covers the main investment process. The following items are not blockers for the first prototype, but they should be decided before the system becomes a formal production workflow.

### 16.1 Market Outlook Range Boundaries

Resolved rule:

```text
Bull Market: 5% to 12%
Balanced Market: -2% to 2%
Bear Market: -12% to -3%
```

After the committee chooses Bull, Balanced, or Bear, the system gives the corresponding reference range. The committee then selects one specific market outlook value inside that range. This specific value is used in the annual target return calculation.

If the committee wants to use a value outside the reference range, the system should treat it as a committee override and require a written reason plus committee approval.

### 16.2 Source Audit Trail

Resolved rule:

Every key assumption must carry an audit trail. Committee approval applies to the specific assumption version that was active at the time of approval.

The system records:

- Source name
- Source date
- Value
- Entered by
- Entered date
- Link or note
- Whether the source is active or archived

This applies to:

- CPI forecast sources
- Risk-free-rate assumptions
- Long-term capital market assumption / benchmark assumptions
- Committee-selected market outlook value

If an assumption value or source record changes after approval, the related approval should return to pending or a new assumption version should be created.

### 16.3 CAPM Edge Cases

Resolved rule:

The CAPM formula must pass policy validation before target beta can be used or approved.

```text
Equity sleeve target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(long-term capital market assumption - sleeve market/currency risk-free rate)
```

Policy checks:

- Long-term capital market assumption must be higher than the relevant sleeve market/currency risk-free rate.
- Market risk premium must be at least 0.50%.
- Equity sleeve target beta must be greater than or equal to 0.00.
- Equity sleeve target beta must be less than or equal to 2.50.

If CAPM fails one of these checks, the system should block target-return approval until assumptions are revised or a committee exception is approved.

The selected benchmark's latest 10 available calendar-year returns and arithmetic mean should be displayed next to the CAPM input as historical context for setting the long-term capital market assumption.

### 16.4 Benchmark Architecture

Resolved rule:

Each equity-market sleeve has its own CAPM-derived target beta.

Official CAPM target-beta scope examples:

```text
U.S. equity sleeve beta
vs.
U.S. broad-market benchmark, default VTI

Developed ex-U.S. equity sleeve beta
vs.
Ticker-level Japan benchmarks, default 1306.T for Japan-listed securities and EWJ for U.S.-listed Japan ETFs

Emerging markets equity sleeve beta
vs.
Ticker-level emerging-market benchmarks, default 2800.HK for Hong Kong-listed securities, 510300.SS for China A listed securities, and EWH / ASHR for U.S.-listed regional ETFs
```

Whole-portfolio beta is still calculated and reported, but only as a monitoring metric. It should not dilute or distort the CAPM signals used for each equity-market sleeve.

Non-equity sleeves such as bonds, alternatives, and cash should be governed by their own allocation ranges, 12-month reference returns, risk rules, and max-drawdown contribution analysis rather than being mixed into equity CAPM target beta.

Current UI implementation:

- The Beta Engine includes an Equity Sleeve Beta Readiness table.
- U.S., developed ex-U.S., and emerging-market equity sleeves are all hard-control beta sleeves.
- Japan-listed equity uses 1306.T as the local-market beta proxy; U.S.-listed Japan ETFs use EWJ.
- Hong Kong-listed equity uses 2800.HK as the local-market beta proxy; U.S.-listed Hong Kong ETFs use EWH.
- China A listed equity uses 510300.SS as the local-market beta proxy; U.S.-listed China A ETFs use ASHR.
- The readiness table displays target return, target beta, proposed sleeve weight, backtested beta when enough price and holding data exists, and status.
- Japan, Hong Kong, and China A readiness rows make the target-beta logic and any data gaps visible before portfolio construction.

### 16.5 Bond and Alternative Beta Methodology

Resolved rule:

Bond and alternative sleeves do not enter the CAPM target-beta chain.

They are managed through:

- Committee-approved target weight
- Past 12-month reference return from the main market for that asset class
- Max drawdown contribution
- Risk metrics suited to the asset class

Bond risk monitoring should emphasize:

- Duration
- Credit quality
- Yield
- Spread risk
- 12-month bond-market reference return

Alternative risk monitoring should emphasize:

- Strategy type
- Liquidity
- Correlation to equity markets
- Drawdown
- Valuation frequency

Bond and alternative beta can still be displayed as optional monitoring data when useful, but it does not drive target return allocation or CAPM target beta.

### 16.6 Data Quality Rules

Resolved rule:

CSV-based data must pass quality checks before it can support formal approval.

Historical price CSV checks:

- Must contain valid dated rows.
- Must contain the selected benchmark column unless manual benchmark mode is used.
- Must not contain duplicate dates.
- Benchmark prices must be positive.
- Selected lookback and frequency must provide at least 24 sampled observations.
- 10-year benchmark reference should have at least 5 calendar years; otherwise it is a warning.
- 12-month reference data should have at least 12 months of observations; otherwise it is a warning.

Ticker universe checks:

- Must contain valid ticker rows.
- Must not contain duplicate tickers.
- Each row must include ticker, asset class, and region.

Actual holdings checks:

- Must include ticker.
- Quantity and market value cannot be negative.
- Weight total should be within 99% to 101%; otherwise it is a warning.

Required data quality failures block implementation approval. Warnings are allowed but remain visible for committee review.

### 16.7 Expected Return Versus Historical Return

Resolved rule:

Backtest and optimization use historical returns only.

The purpose of the backtest is not to forecast the next 12 months directly. It is to test whether the proposed allocation would have been theoretically feasible under historical market conditions.

No forward expected return is entered at ticker level for the first version.

The system uses committee-approved sleeve target returns to define sleeve-level return controls, the proposed equity return summary target, and the base equity drawdown band. Each sleeve receives a separate drawdown budget adjusted by approved weight, historical volatility, and available historical drawdown. The proposed portfolio test itself is based on historical price data and must pass sleeve-level return, beta, and drawdown controls plus the proposed equity summary checks.

### 16.8 Portfolio Versioning

Resolved rule:

The system must manage portfolio versions.

```text
Draft portfolio
-> Proposed portfolio
-> Backtested portfolio
-> Committee-approved portfolio
-> Implemented portfolio
-> Archived / superseded portfolio
```

When the Decision Committee approves a backtested proposed portfolio, that version is locked.

Locked versions preserve:

- Approved target return
- Sleeve return allocation
- Target beta values
- Backtest result
- Proposed holdings and weights
- Approval timestamp

If approved assumptions, target allocation, or holdings need to change later, the system must create a new draft version. Approved versions cannot be silently overwritten.

### 16.9 Role Permissions and User Identity

Resolved in the prototype. The system administrator maintains the user list. Active users are assigned to either the Decision Committee or the Execution Team, and approval logic checks the approver's active group before accepting non-pending decisions.

### 16.10 Rebalancing Scope

Resolved in the prototype. Rebalance monitoring covers individual holdings, asset-class drift, regional drift, style-factor drift, and cash drift.

### 16.11 Trade Execution Reconciliation

Resolved in the prototype. The system loads standardized actual trades from the broker-normalizer module and reconciles them against approved trade orders by action and ticker.

### 16.12 Cash, Contributions, and Withdrawals

Resolved in the prototype. External cash flows are loaded through a standard CSV workbook and reporting uses Modified Dietz return to separate investment return from deposits, withdrawals, and redemptions. Future versions may add IRR as a separate investor-experience view.

### 16.13 System Audit Log

Resolved in the prototype. The system keeps an audit log with timestamp, current acting user, action, and detail. It records approval changes, version locking, new version creation, user changes, data loads, proposed holding changes, optimizer application, trade authorization changes, report export, and system reset. The log can be exported as CSV.

### 16.14 Role-Based Operation Control

Resolved in the prototype. The current acting user controls what can be changed:

- System administrator maintains users, exports audit logs, and resets the system.
- Decision Committee users change target-return assumptions, market scenario ranges, and approval decisions.
- Execution Team users manage public data preparation, CAPM assumptions, sleeve allocation, beta/drawdown inputs, asset / region / style constraints, investment-style selection, proposal metadata, proposed holdings, optimizer actions, trade orders, execution authorization status, rebalance settings, and exception submissions.
- System administrator or Execution Team users can load operating data.
- System administrator, Decision Committee Approver, and Execution Team Approver can export reports and update report distribution status.

Denied actions are blocked and recorded in the audit log.

### 16.15 Additional Risk Controls

The current core controls are target beta and target max drawdown. Later rule layers may include:

- Sector concentration
- Issuer concentration
- Liquidity limits
- Currency exposure
- Credit exposure
- Duration exposure for bonds
- Leverage and derivative exposure

These are not required for the first version unless the investment policy requires them.
