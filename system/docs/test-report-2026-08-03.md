# isater Real-Click Investment Workflow Test Report

Test date: 2026-08-03  
Environment: local Isater system with persistent PGlite integration database  
Browser method: visible controls were clicked; workflow steps were not reached by changing the URL

## Scope and acceptance boundary

This run covers the annual workflow from public-data retrieval through the start of monitoring. Monitoring imports, monthly corridor checks, non-equity NAV approval, report generation and distribution were not tested in this run because those modules are not yet complete.

## Executed workflow

| ID | User action and persisted result | Result |
| --- | --- | --- |
| WF-001 | Committee ran the balanced-scenario public-data engine | Pass |
| WF-002 | Seven primary sources succeeded; HKMA failed with HTTP 502 and the recorded FRED/Nasdaq Hong Kong fallback succeeded | Pass with recorded fallback |
| WF-003 | Committee approved annual data and a 5.1% annual return floor | Pass |
| WF-004 | Execution team confirmed U.S., Japan and emerging-market sleeve targets | Pass |
| WF-005 | Execution team created a 12-name proposed portfolio inside the system | Pass |
| WF-006 | Each sleeve contained two growth and two value names, totaled 100%, and respected the 35% single-name cap | Pass |
| WF-007 | System retrieved and persisted three years of weekly adjusted prices for all holdings and benchmarks | Pass |
| WF-008 | U.S. and Japan passed; emerging failed only Beta: 1.06 versus target 1.00 and upper tolerance 1.05 | Expected fail |
| WF-009 | Execution team recorded the failed backtest and opened sleeve-level optimization | Pass |
| WF-010 | Optimizer produced three weight-only candidates without changing tickers | Pass |
| WF-011 | Minimum-turnover candidate changed 0005 from 25% to 27% and 1299 from 25% to 23%; Beta became 1.041 | Pass |
| WF-012 | Execution team selected the minimum-turnover candidate and submitted it for committee vote | Pass |
| WF-013 | Committee signed in separately, saw a read-only approval screen and approved portfolio version 2 | Pass |
| WF-014 | Execution user Li submitted the US$3.5 million equity implementation plan | Pass |
| WF-015 | Administrator reset reviewer Wang's temporary password; Wang completed mandatory first-login password change | Pass |
| WF-016 | Reviewer Wang approved the maker-checker action; workflow moved to monitoring | Pass |

## Backtest evidence

| Sleeve | Annualized return | Target floor | Beta | Target Beta | Maximum drawdown | Limit | Hard result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| U.S. | 26.6% | 12.2% | 0.916 | 1.00 | -18.5% | -17.4% plus relative/benchmark tolerance | Pass |
| Japan | 17.5% | 10.4% | 0.776 | 1.00 | -20.6% | -24.3% | Pass |
| Emerging before optimization | 18.4% | 3.1% | 1.06 | 1.00 | -19.5% | -49.5% | Fail Beta only |
| Emerging after optimization | 19.3% | 3.1% | 1.041 | 1.00 | -19.2% | -49.5% | Pass |

Returns above the target floor were marked for review and were not treated as failures. Lower-than-target Beta was review-only when return and drawdown passed. Beta above the relative upper tolerance remained a hard failure.

## Data lineage

- Paid primary equity-price provider: Nasdaq Data Link, not configured in this environment.
- Working test fallback: Yahoo Finance chart endpoint `query2.finance.yahoo.com`.
- The fallback returned real adjusted-price history for U.S., Japan, Hong Kong and China A-share symbols.
- Retrieved observations were persisted in `market_observations`; no generated or sample price series was used.
- Yahoo's chart endpoint is a fallback, not a contracted production feed. Production use requires the paid provider account and license confirmation.
- Public-data source references include the [Nasdaq Data Link documentation](https://docs.data.nasdaq.com/), [Alpha Vantage official documentation](https://www.alphavantage.co/documentation/), [FRED API documentation](https://fred.stlouisfed.org/docs/api/fred/) and [Futu position-field documentation](https://support.futunn.com/topic122).

## Defects found and corrected

### D-005: first Yahoo endpoint rate-limited the test

The `query1` endpoint returned `Too Many Requests`. The source chain retried through `query2`, which returned valid histories for AAPL, 6758.T, 0700.HK and 002594.SZ before the engine was implemented.

### D-006: optimizer benchmark could diverge from backtest benchmark

The first optimizer draft used a fixed 50/50 emerging benchmark. It was corrected before execution to read the exact benchmark symbols and weights saved by the failed backtest.

### D-007: old migration test assumed exactly one default-parameter version

The database correctly contained versions 1 and 2 after target-return ranges were introduced. The test now checks ordered versions, the no-Teresa-data baseline and the target-return parameter addition. API tests passed after correction.

## Automated verification

- Domain: 4 files, 20 tests passed.
- API: 2 files, 5 tests passed.
- API and web TypeScript checks passed.
- Web production build passed.

## Not yet tested

- Daily Futu position import and future broker adapters.
- Monthly style-level corridor check and two rebalance proposals.
- Three-trading-day completion escalation and next-day execution-tolerance comparison.
- Non-equity NAV submission and committee approval.
- Performance report, attribution, PDF, email delivery and cycle closure.
- Cloud PostgreSQL, object storage, email provider, backup/restore and production security testing.
