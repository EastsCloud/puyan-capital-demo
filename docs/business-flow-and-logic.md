# Business Flow and Calculation Logic

## 1. Reference scenario

The documented balanced-market validation used USD 10,000,000 principal, public data through 2026-06-01, eight data sources, and 46 historical scenario months.

The engine recommended 35% equity, 20% bonds, 25% alternatives, and 20% cash. Within equity, it recommended 70% U.S., 15% Japan, and 15% emerging markets. The resulting total-portfolio sleeve weights were 24.50%, 5.25%, and 5.25%. The committee-approved annual target return was 5.071258%.

These values are test evidence, not current investment advice.

## 2. Public-data engine

The system requests inflation, rates, equity indices, bond inputs, and risk indicators according to administrator-maintained source priority. It identifies historical months comparable to the selected committee scenario and converts return, risk, and correlation evidence into an allocation recommendation.

Every request records source, observation date, retrieval time, and failure reason. A failed source moves to the next approved adapter; the production path does not silently replace missing data with invented samples.

The latest U.S. 10-year Treasury yield is used as a 12-month bond carry proxy and the latest 3-month Treasury rate as the cash proxy. Historical rate changes estimate risk but do not automatically create a duration-price forecast. A future total-return or duration view would require a separately approved, versioned policy.

## 3. Target return

The committee approves a target within the scenario policy range. The screen presents operating cost, inflation, and public-market expectation as references and enforces the economic floor. The target is a minimum requirement: performance above target is not a failure condition.

## 4. Sleeve return and target beta

The allocation identity is:

`portfolio target = equity weight × equity target + bond weight × bond return + alternative weight × alternative return + cash weight × cash return`

The equity target is allocated across the three approved sleeves. Each sleeve uses its own risk-free rate and benchmark expectation to derive target beta through CAPM:

`target beta = (sleeve target return - local risk-free rate) / (local benchmark return - local risk-free rate)`

U.S. equity uses U.S. inputs, Japan uses Japanese inputs, and emerging markets use a committee-approved Hong Kong/China A-share blend. One U.S. risk-free rate is not applied indiscriminately to every market.

Target beta is a portfolio constraint. Each security's historical beta is calculated against the matching market benchmark:

`security beta = Cov(security return, benchmark return) / Var(benchmark return)`

## 5. Proposed portfolio and backtest

Equities must come from the approved U.S., Japan, Hong Kong, and China A-share universe and must belong to one of the three sleeves. Style buckets normally require two to five securities, while administrator policy controls single-name limits.

The 36-month weekly backtest evaluates each sleeve independently:

- **Beta:** relative deviation from target must remain within tolerance.
- **Return:** must not fall below the target floor; excess return is not a hard failure.
- **Maximum drawdown:** must remain within the sleeve risk budget and relative tolerance.
- **Benchmark consistency:** target, security beta, and backtest must use the same market basis.

In the balanced validation, the U.S. and Japan sleeves passed while emerging-market beta of 1.06 failed its target control.

## 6. Optimization order

The optimizer isolates failed sleeves so passing sleeves are not changed unnecessarily:

1. Keep all proposed securities and adjust weights.
2. Increase securities that reduce the control gap and decrease securities that move in the wrong direction.
3. Enforce return, beta, drawdown, single-name, and style-count constraints simultaneously.
4. Search for security replacements only when weight-only optimization has no feasible result.
5. Test one replacement before two and stop at the first feasible replacement count.
6. Merge independently solved sleeves into three complete options differentiated by turnover, beta fit, and drawdown buffer.

The balanced validation's minimum-turnover plan changed emerging-market value weights only: `0005` moved from 25% to 27% and `1299` from 25% to 23%; no security replacement was required.

## 7. Approval and implementation

The Execution Team submits the selected portfolio. The Decision Committee votes under a two-thirds rule; a one-person initial committee therefore requires that member's approval.

After approval, the system converts principal and weights into standardized trade amounts. One Execution Team user submits the plan and a different Execution Team user reviews it. The same account cannot perform both steps.

Executed fills are imported separately, previewed, normalized, selected, and reconciled against the approved plan. Exceptions remain visible and require independent review rather than silently changing the approved portfolio.

## 8. Monitoring and rebalancing

Daily position imports update equity holdings and the equity market-value curve. Monthly monitoring applies style-level relative corridors:

`lower bound = target weight × (1 + lower relative drift)`

`upper bound = target weight × (1 + upper relative drift)`

With a default ±20% relative corridor, the validated case identified U.S. Growth below its range and U.S. Value above its range. The system generated both a minimum-trade plan and a return-to-target plan.

Accepted plans must be completed within three trading days. A due-date import persists overdue alerts when styles remain outside the corridor; a corrected same-day import can complete the plan while preserving the earlier overdue record.

## 9. Reporting and attribution

Period-end total NAV combines equity market value with approved bond, alternative, and cash NAV. Reports show target attainment, sleeve returns, Sharpe, Sortino, maximum drawdown, asset-class NAV, and return contribution.

Equity attribution uses an arithmetic Brinson-Fachler structure and separates market, allocation, security selection, and interaction. Non-equity contribution is shown separately:

`equity actual return = market return + allocation effect + selection effect + interaction effect`

The validated benchmark set used same-period USD adjusted prices: SPY for U.S. equity, EWJ for Japan, and an approved ASHR/EWH blend for emerging markets. USD ETF adjusted prices incorporate distributions and currency effects more consistently than combining unmatched local indices.

The documented report reconciled market `+0.91%`, allocation `-0.60%`, selection `-0.31%`, interaction approximately `0.00%`, and non-equity `0.00%` to total return `0.00%`.

If a benchmark lacks valid start- or end-date data, the system does not move dates or insert sample values. It suspends the pure-selection label and records the data-quality limitation.

All material actions, approvals, input versions, source records, and results produce immutable audit events. Annual calibration periods, thresholds, grids, bounds, and risk-aversion settings are effective-dated and versioned; every annual run stores the applied version and parameter snapshot.
