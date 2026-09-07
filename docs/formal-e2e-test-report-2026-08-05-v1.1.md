# Isater v1.1 Formal End-to-End Test Report

Test date: 2026-08-05

Scenario: bear market

Result: complete workflow passed with the limitations listed below

## Test method

- A fresh isolated database was used; no previous workflow state was reused.
- Every business transition was performed through visible screens, forms, and buttons.
- System Administrator, Decision Committee, Execution maker, and Execution checker used separate accounts.
- The public-data engine, historical backtest, and optimizer were executed rather than replaced by hard-coded pass states.
- Explicitly labelled test positions and non-equity NAV values were used to exercise rebalancing, approval, and reporting.
- Automated domain, API, database, type, and build checks supplemented but did not replace browser testing.

## Environment

| Item | Value |
|---|---|
| Application | Isater v1.1 |
| Annual model | `annual-regime-allocation-v1.1.0` |
| Optimizer | `isater-optimizer-1.1.0` |
| Parameter version | v3 |
| Database | fresh isolated PostgreSQL-compatible test database |
| Base currency | USD |
| Initial principal | USD 10,000,000 |
| Annual cycle | 2026 |

## Role and authentication checks

- The administrator created the committee and two execution users.
- Every test user completed first-login password replacement.
- Committee-only approvals were unavailable to execution users.
- Trade-plan submission and review required two different execution users.
- Logout invalidated the server session before the next role signed in.

## Workflow evidence

### 01 — Annual public data

- The committee started the annual cycle, selected the bear scenario, and ran the engine.
- Eight source references were returned. Seven primary sources succeeded, while a Hong Kong long-history request used its recorded fallback.
- Observation date: 2026-06-01; calibrated history: 72 months.
- Recommended allocation: 20% equity, 60% bonds, 5% alternatives, 15% cash.
- Equity split: 45% U.S., 10% Japan, 45% approved China A-share/Hong Kong emerging-market blend.
- Expected return: 4.5%; expected volatility: 3.8%; inflation reference: 3.5%.
- The committee submitted and approved the result.

### 02–03 — Target and sleeves

- Suggested portfolio target: 4.5%; permitted range: 2.0%–6.0%.
- The committee entered and approved 4.51%.
- The system decomposed the approved target into sleeve return, beta, and drawdown controls using market-specific inputs.

### 04–06 — Portfolio, backtest, and optimization

- The Execution Team built the proposed equity portfolio from the approved universe.
- The three-year weekly backtest ran by sleeve.
- Failed controls triggered sleeve-specific optimization.
- The selected optimized version reached 3/3 passing sleeves before submission.

### 07 — Portfolio approval

- The execution user submitted portfolio version 2.
- A committee user signed in independently, reviewed the saved backtest result, and approved the portfolio.

### 08 — Implementation maker-checker

- The system generated 12 equity instructions with planned equity value of USD 2,000,000.
- Execution user 1 submitted the plan.
- Execution user 2 signed in separately and approved the review.
- The application then advanced to monitoring and rebalancing.

### 09 — Monitoring and rebalancing

- U.S. Growth exceeded its corridor and required at least USD 219,178 of sales.
- U.S. Value fell below its corridor and required at least USD 195,122 of purchases.
- The other four style buckets remained within range.
- Plan 1 contained four minimum trades totalling USD 414,300.
- Plan 2 contained four return-to-target trades totalling USD 645,161.
- The three-trading-day completion deadline was displayed and persisted.

### 10 — Non-equity NAV

- Bonds: USD 6,150,000.
- Alternatives: USD 520,000.
- Cash: USD 1,510,000.
- The Execution Team submitted the values and source note; the committee approved them.

### 11 — Report and attribution

- The committee correctly had read-only access and could not generate a report.
- An execution user generated the report and reviewed all three report sections.
- The PDF endpoint was triggered through the visible download action.
- The execution user published the report.
- The committee could view the published version but had no update or publication control.
- English and Chinese interface switching was checked through visible controls.

## Automated regression

The documented checkpoint included domain-rule tests, API/database/security tests, TypeScript checks, and production builds. Exact counts for the packaged checkpoint are recorded in `PACKAGE_VALIDATION.md`.

## Corrected defect: non-equity NAV date

The original form defaulted to the current date and allowed the user to miss a mismatch with the latest effective equity-position date. The database had stored the submitted value correctly; the issue was a weak input control rather than silent date mutation.

The fix derives the non-equity NAV date from the latest effective equity-position date, makes it read-only in the form, validates it again in the API, and normalizes page, API, and audit output to `YYYY-MM-DD`. A new period can create a new NAV version even when the previous version was already approved.

## Limitations

- The report had only one effective sleeve observation, so Sharpe and Sortino were intentionally unavailable; the application requires at least 20 effective position dates.
- The PDF download was triggered, but this run did not repeat a page-by-page visual inspection of the downloaded file.
- This report covers one complete bear-market workflow. Bull and balanced scenarios were independently retested to the monitoring handoff in the companion report.

## Conclusion

The test demonstrated a complete controlled path from clean-database setup through public data, target approval, portfolio construction, backtesting, optimization, committee approval, execution maker-checker, monitoring, rebalancing, non-equity NAV, and report publication. It is workflow evidence for a review/demo build, not production certification or financial-model approval.
