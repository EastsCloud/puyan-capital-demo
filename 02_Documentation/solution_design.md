# Puyan Capital Control Center: Solution Design

## Core Principle

The system starts from the required investment outcome, converts that outcome into explicit risk budgets, and then tests whether a proposed portfolio can realistically support those budgets.

```text
Annual public-data package
-> required annual target return
-> scenario-based allocation recommendation
-> committee-confirmed asset and regional allocation
-> sleeve-level target return decomposition
-> market-specific target beta
-> target max drawdown
-> proposed portfolio
-> historical backtest
-> pass / optimize / reject
```

If the proposed portfolio passes the backtest, it can become the investable portfolio for the next 12 months. If it does not pass hard controls, the system should first recommend revised weights within the allowed constraints without changing the proposed ticker list. The first optimization action should directly move weight from high-beta holdings to low-beta holdings when sleeve beta is too high, or the reverse when sleeve beta is too low. If weight-only optimization cannot produce a hard-control pass, the system should test minimum same-market, same-style ticker replacement across sleeves that failed return, beta, or drawdown controls. Excess return should remain a review note, not a blocker.

## 1. Annual Public Data Package

The annual cycle starts with the Decision Committee running or uploading the Annual Public Data package. The package gives the system the historical prices, ticker universe, market statistics, scenario allocation ranges, and reference returns used later by sleeve allocation, beta, backtest, optimization, and reporting.

The annual data package is not an Execution Team working step. Execution users can read the accepted package, but cannot accept it on behalf of the committee.

## 2. Required Annual Target Return

After the annual public-data package is accepted, the Decision Committee calculates the annual return the portfolio needs to achieve over the next 12 months.

```text
Acceptable target return band =
operating cost rate
+ expected 12-month CPI
+ selected economic / market outlook band
```

The user then manually enters one final annual target return inside the calculated band.

Market outlook bands:

- Bull Market: 5% or higher
- Balanced Market: -2% to 2%
- Bear Market: -3% or deeper

The final target return is not an automatically selected number. It is a user-confirmed investment target constrained by the calculated acceptable range.

## 3. Historical Allocation Recommendation

The system recommends asset-class and equity-region allocations based on the accepted annual public-data package and the selected macro scenario.

The recommendation uses historical reference statistics for:

- Asset-class annual return
- Volatility
- Max drawdown
- Regional equity return
- Regional equity volatility
- Correlation and diversification notes

Example scenario behavior:

- Bull Market: higher equity and alternative allocation, lower bond and cash allocation.
- Balanced Market: equity remains the return engine, with bonds, alternatives, and cash used for drawdown control.
- Bear Market: lower equity allocation, higher bond and cash allocation.

The recommendation is an annual Decision Committee input. The committee accepts the historical public-data package and scenario recommendation, while the Execution Team uses the accepted weights and reference returns in later portfolio construction.

## 4. Target Return Decomposition and Target Beta

After the Decision Committee accepts the annual data package and approves the annual target return, the system decomposes the whole-portfolio target return into sleeve-level target returns.

```text
Whole-portfolio final target return =
sum(sleeve target weight * sleeve target return)
```

Equity is split into regional sleeves, such as:

```text
U.S. equity
Japan equity
Hong Kong equity
China A equity
```

Each official equity Return/Beta sleeve then derives its own target beta using CAPM and its relevant benchmark or capital-market assumption. The current market mapping is U.S. equity = U.S. / USD, developed ex-U.S. equity = Japan / JPY, and emerging markets equity = Hong Kong / HKD plus China A / CNY blend.

```text
Equity sleeve target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(equity sleeve long-term market assumption - sleeve market/currency risk-free rate)
```

The same logic applies to all official equity Return/Beta sleeves using the relevant market/currency risk-free rate.

Non-equity sleeves, such as bonds, alternatives, and cash, use committee-approved target weights and 12-month reference returns instead of CAPM-derived beta targets.

If the historical baseline return of the recommended allocation does not equal the final annual target return, the system allocates the return gap across equity regions according to their confirmed equity weights. This keeps the target-return decomposition aligned with the original whole-portfolio target.

The current prototype implements the approved equity markets as U.S. equity, Japan equity, Hong Kong equity, and China A equity.

## 5. Target Max Drawdown

The system converts the approved equity target return into a base equity maximum drawdown budget, then assigns risk-adjusted drawdown budgets to each equity sleeve.

```text
Base equity max drawdown band =
-(weighted equity target return / return-drawdown range)
```

The default return-drawdown range is:

```text
0.60 to 0.80
```

Example:

```text
Weighted equity target return: 8.00%
Return-drawdown range: 0.60 to 0.80
Base equity max drawdown band: -13.33% to -10.00%
```

The proposed equity portfolio therefore has sleeve-level and summary-level risk budgets:

- Equity sleeve target beta
- Risk-adjusted equity sleeve max drawdown
- Proposed equity summary max drawdown

Risk-adjusted sleeve budget design:

```text
Sleeve risk score =
60% * sleeve volatility relative to weighted equity average
+ 40% * sleeve historical drawdown relative to weighted equity average

Sleeve risk factor =
clamp(sleeve risk score, 0.75, 1.35)

Sleeve drawdown budget =
base equity max drawdown band * sleeve risk factor
```

The factor is capped to keep the system usable when historical data is unusual or incomplete. If no reliable historical drawdown is available, the system may use a conservative volatility-based fallback and should flag the data source.

## 5. Portfolio Construction Constraints

The user builds a proposed portfolio under several constraints.

### Regional Constraints

The default regional allocation ranges are:

- United States: 50% to 80%
- Japan: 5% to 25%
- Hong Kong: 0% to 25%
- China A: 0% to 20%
- Global: 0% to 30%

These values are editable. If the user manually changes them, the system treats the style preset as Custom.

### Asset-Class Constraints

The system controls allocation ranges for:

- Equity
- Bond
- Alternative
- Cash & Cash-like

### Style-Factor Constraints

The system controls allocation ranges for:

- Cyclical
- Growth
- Active

Each Cyclical, Growth, and Active category should contain:

```text
Minimum tickers: 2
Maximum tickers: 5
```

## 6. Security Selection

The proposed portfolio is organized by:

1. Region
2. Asset class
3. Style factor
4. Equity theme
5. Security / ticker

Ticker choices come from the approved ticker universe. The workflow is to build the proposed portfolio inside the system: select an equity sleeve, search the ticker universe, add the selected ticker, and then enter proposed weight and lock settings. Selecting a ticker should fill in its region, asset class, style factor, and theme when those fields are available. Step 06 should not require or display a proposed-portfolio CSV import.

## 7. Beta Methodology

The first version uses market-specific equity beta controls rather than one whole-portfolio CAPM beta.

Beta policy:

- U.S. equity: automatically calculated against the selected U.S. broad-market benchmark when historical prices are available.
- Japan equity: target beta is derived from its sleeve target return and relevant market assumption.
- Hong Kong equity: target beta is derived from its sleeve target return and relevant market assumption.
- China A equity: target beta is derived from its sleeve target return and relevant market assumption.
- Bond: governed mainly by target weight, reference return, duration or credit risk, liquidity, correlation, and drawdown controls.
- Alternative: included through historical beta, policy beta, or manual estimate depending on strategy type.
- Cash & Cash-like: normally zero beta unless the instrument has material market sensitivity.

Whole-portfolio beta can still be monitored, but it should not replace the sleeve-level CAPM target logic.

## 8. Historical Backtest

Once the proposed portfolio is built, the system tests it using historical price data.

The backtest calculates:

- Backtested annualized return for each equity sleeve and for the proposed equity summary
- Backtested beta for each equity sleeve versus its locked sleeve benchmark
- Backtested max drawdown for each equity sleeve and for the proposed equity summary

Formulas:

```text
Sleeve period return =
sum(sleeve holding weight * sleeve holding period return)

Backtested sleeve beta =
covariance(sleeve returns, locked sleeve benchmark returns)
/
variance(locked sleeve benchmark returns)

Backtested sleeve max drawdown =
largest peak-to-trough decline in sleeve value
```

## 8. Pass / Review Decision

The proposed portfolio passes only if it satisfies the main requirements:

- Each equity sleeve annualized return is within the approved tolerance versus its sleeve target return.
- Each equity sleeve beta is within the approved tolerance versus its sleeve target beta.
- Each equity sleeve max drawdown is within the approved tolerance versus its risk-adjusted sleeve drawdown budget.
- Proposed equity summary return and drawdown also pass the approved summary controls.
- Regional, asset-class, style-factor, and ticker-count constraints are respected.

If the proposed portfolio passes, it can be used as the investment portfolio for the coming year.

If it does not pass, it should move to optimization.

## 9. Optimization Logic

The optimizer should search for revised holding weights that improve the portfolio while staying inside the selected constraints.

The optimization objective is to satisfy:

- Equity sleeve target returns
- Equity sleeve target betas versus locked sleeve benchmarks
- Equity sleeve max drawdown budgets
- Proposed equity summary return and drawdown controls
- Regional allocation constraints
- Asset-class allocation constraints
- Style-factor constraints
- Ticker-count constraints

The first version can use a heuristic optimizer. Later versions can use a more formal constrained optimization engine.

## 10. Design Decision on Regional Beta

The official beta control is sleeve-based. U.S. equity, developed ex-U.S. equity, and emerging markets equity each have their own CAPM-derived target beta and locked benchmark source.

Recommended structure:

```text
Core control:
equity sleeve beta vs locked sleeve benchmark

Monitoring layer:
whole-portfolio beta vs blended policy benchmark
```

This keeps the main pass/fail decision aligned with the approved sleeve logic while preserving whole-portfolio beta as a monitoring reference.
