# Isater Real-Click End-to-End Test Report

Date: 2026-08-04  
Environment: local Isater web application, API and clean PGlite integration database (`data/dev-pg`)  
Method: visible browser controls and role changes; no workflow step was advanced by editing the URL

## Result

The tested annual workflow completed from system setup through report publication. The test used named users, forced first-login password changes, real public-data retrieval, real historical backtesting, optimizer selection, committee voting, two-person execution review, daily position imports, monthly rebalancing, non-equity NAV approval and report publication.

## Tested path

| Stage | Evidence | Result |
|---|---|---|
| Administration | Created one committee user and two execution users; activated default parameter version | Pass |
| Password control | All three business users changed temporary passwords through the first-login screen | Pass |
| Principal | Committee activated USD 10,000,000 | Pass |
| Public data | Balanced scenario; data through 2026-06-01; 46 historical scenario months; 8 source records | Pass |
| Allocation | Equity 35%, bonds 20%, alternatives 25%, cash 20%; equity sleeves 70%/15%/15% | Pass |
| Target return | System suggestion 5.071258%, inside the approved 4%-8% range; committee approved | Pass |
| Sleeve targets | US, Japan and emerging-market targets persisted with market-specific CAPM inputs | Pass |
| Proposed portfolio | 12 approved-universe tickers; style counts, 100% sleeve totals and single-name limit checked | Pass |
| Backtest | 36 months of weekly history; US and Japan passed; emerging Beta 1.06 failed | Pass |
| Optimization | Three passing emerging-market candidates; minimum-turnover option changed 0005 from 25% to 27% and 1299 from 25% to 23% | Pass |
| Portfolio approval | Execution submission followed by committee approval | Pass |
| Implementation | One execution user submitted; a different execution user approved | Pass |
| Position monitoring | Three effective business dates; ticker, exchange, quantity-price-value and approved-portfolio reconciliation | Pass |
| Monthly rebalance | US growth 11.4% versus 28%-42%; US value 58.6% versus 28%-42%; Japan and emerging groups remained within range | Pass |
| Rebalance plan | Minimum-trade plan accepted; four orders totaling USD 1,805,556; due 2026-08-07 | Pass |
| Rebalance deadline | Due-date import first produced an overdue result with two breached style groups; a corrected same-day import moved the plan to completed | Pass |
| Rebalance notifications | Both execution and committee users received the overdue and completion records in the in-app notification panel | Pass |
| Non-equity NAV | Bonds USD 2.0m, alternatives USD 2.5m and cash USD 2.0m; committee approved | Pass |
| Reporting | Three report screens, PDF control and publication; workflow returned to monitoring | Pass |
| Performance attribution | Matching-period USD adjusted prices for SPY, EWJ, ASHR and EWH; Brinson-Fachler market/allocation/selection/interaction reconciliation | Pass |
| Standalone navigation | Monitoring and Reports were opened through their left navigation buttons and showed live data | Pass |
| Approved portfolio page | Committee opened the left-navigation page and verified all 12 approved holdings, three sleeve targets and the selected 27%/23% emerging-market value weights | Pass |
| Audit page | Administrator opened 67 immutable records; actor, business action, object, outcome, timestamp and collapsed detail were visible | Pass |

## Defects found and corrected during the run

1. Formal exchange codes were required but the first fixture used market abbreviations. Fixtures now use NASDAQ, NYSE, TSE, HKEX and SZSE.
2. The original date control did not reliably emit a changed value in the test browser. A validated `YYYY-MM-DD` field is now used.
3. A corrected same-day position file could not replace the effective daily observation. The latest snapshot now updates the effective observation while earlier source files remain auditable.
4. Identical file content on different dates collided on a global object key. Source identity now combines business date and SHA-256.
5. Database Date objects broke the three-trading-day calculation. Date normalization now accepts both Date and ISO text.
6. Corridor targets used total-portfolio equity weights against an equity-only denominator. Targets are now normalized within equity before comparison.
7. A monthly check could not be rerun after corrected positions. Same-date checks and proposed plans are now safely refreshed.
8. Monitoring showed plans from older checks. Only the latest check's plans are returned.
9. Report sleeve series counted both original and corrected same-day snapshots. It now follows the single effective daily observation.
10. Report dates displayed runtime-specific English date fragments. All operational dates now use `YYYY-MM-DD`.
11. Three observations produced mathematically extreme but misleading Sharpe values. Sharpe and Sortino now require 20 effective dates.
12. Attribution signs were reversed and the equity residual was labeled as pure selection. It now reports allocation `-0.60%`, equity implementation including market `+0.60%`, total `0.00%`, and explicitly withholds pure selection attribution until benchmark series are available.
13. Accepted rebalance plans stopped at a stored due date. Due-date position imports now automatically recalculate every style corridor, persist a verification record, mark the plan completed or overdue, and notify both business roles.
14. The overview page still displayed placeholder workflow and market-data status. It now reads the active workflow step and accepted annual public-data package.
15. Portfolio and Audit navigation entries still opened placeholder content. Portfolio now shows the effective approved holdings and Audit now shows administrator-only immutable business records.
16. Local Asian index data were unavailable on the report end date and could not support same-period attribution. The report engine now uses USD-listed investable benchmarks (SPY, EWJ, ASHR and EWH), requires exact start/end coverage, versions every source series and never carries stale values forward.

## Automated verification after corrections

- Domain tests: 21 passed.
- API tests: 9 passed, including corridor normalization, Date deadline, sparse-risk-metric and Brinson-Fachler reconciliation tests.
- API and web TypeScript checks: passed.
- API, domain and web production builds: passed.
- Web bundle: 301.95 kB JavaScript and 30.67 kB CSS before gzip.

## Honest remaining limits

- The browser automation surface could click the native file chooser but could not attach a host file. The tested fallback pasted the CSV into the visible Futu CSV field and then clicked the same Upload and Activate control. Human native file selection remains available but was not automated in this run.
- Pure security-selection attribution is calculated only when every USD benchmark has exact report-period coverage. The verified report showed market `+0.91%`, allocation `-0.60%`, selection `-0.31%`, interaction approximately `0.00%`, non-equity `0.00%` and total `0.00%`.
- The due-date reconciliation and in-app escalation are implemented. Notification rows also enter the email queue, but actual email delivery still requires deployment email credentials and a production worker.
- Cloud PostgreSQL, backup/restore, production email delivery and the paid-data account are deployment work, not part of this local run.
- The older `data/runtime-pg` directory was preserved after an unclean-stop corruption prevented reopening it. This run used a newly migrated clean integration database and did not delete the older directory.
