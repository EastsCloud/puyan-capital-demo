# Isater Review Release Status

## 2026-10-13: Checked-price snapshot confirmation fix

- Short-history confirmation now uses the exact prices checked earlier, stored in PostgreSQL for a 30-minute confirmation window. It does not make a second provider request or reject harmless provider-price fluctuations.
- Snapshots are scoped to the checking user, organization, workflow, and proposal. Current holdings, targets, benchmark weights, and effective policy are revalidated separately; genuine business changes still require a new check. Expired snapshots display a specific recovery instruction.
- Immutable consent evidence copies all exact price series and retains the snapshot ID; expiry, cleanup, and demo reset do not erase the evidence. Optimization reuses frozen original security/benchmark data where available.
- Additive migration 0023 preserves existing business records. No reset is needed. Refresh after deployment and perform a fresh coverage check before confirming.
- Verification: 90 automated tests, type checks, and production build passed. PostgreSQL-compatible integration tests cover saved snapshots, no provider refetch, complete immutable evidence, expiry, and cache deletion. Mocked desktop/mobile browser checks cover confirmation, cancellation, expiry recovery, and import regression. Production deployment acceptance is not implied by local tests.

Details: [Historical Data Coverage](docs/historical-data-coverage.md).

## 2026-10-13: Explicit available-history backtesting

- Execution users can explicitly confirm a single run using the common available real-price window. Standard runs still require 100 completed weeks. Missing prices and uncalculable beta remain blocked; no sample prices or excluded holdings are introduced.
- Immutable PostgreSQL confirmation records preserve actor, time, proposal, data fingerprint, actual coverage, policy, and warning before calculations begin. Failed runs retain the evidence; successful runs link to it. Demo workflow reset preserves confirmation records.
- Backtest results, portfolio approval, and newly generated reports disclose the shorter sample. Optimization inherits the accepted window without shortening it. Financial risk controls and committee voting are unchanged.
- Migration 0022 is additive and does not require a reset. Existing runs default to standard history mode.
- Verification: 85 automated tests, workspace type checks, and production build passed. Local desktop/mobile acceptance used mocked API responses to check cancellation, explicit consent, refresh persistence, and import regression. No production database was reset or modified during verification; live deployment acceptance remains a separate step.

Usage and limitations: [Historical Data Coverage](docs/historical-data-coverage.md).

## 2026-10-13: Historical coverage, listing validation, and weight-basis fixes

- Detailed HTTP messages replace generic labels such as Conflict. Read-only preflight lists all security/benchmark failures and aligned sleeve coverage; backtest data failures use structured HTTP 422 responses.
- Tokyo listings explicitly use Yahoo fallback. Both providers' daily adjusted prices are grouped by exchange-local completed week; current partial weeks are excluded. Corrected caches are separate from older weekly-label data.
- CSV preview accepts an explicit whole-equity or within-sleeve weight basis and shows conversion results without overriding approved market allocations.
- Security reference fields are optional, name links are restored, and registration checks live prices and listing venue evidence. Short histories can be registered with a warning but cannot bypass the unchanged 100-week backtest minimum.
- Migration 0021 preserves existing data and adds nullable registration coverage evidence. No reset is required.
- Verification: 76 automated tests, workspace type checks, production build, local desktop/mobile browser acceptance, and read-only live checks of the supplied 23-security review list plus four benchmarks passed within their stated scope. The live list remains blocked by CRCL/SNDK short histories; no financial approval is implied.

Details: [Historical Data Coverage](docs/historical-data-coverage.md).

## 2026-10-12: Proposed portfolio import and draft editing

- The normal page displays saved database holdings, not automatically loaded recommendations.
- CSV preview supports replace-all, merge, per-row keep/remove, explicit draft application, and cancellation without saving.
- Drafts support add/remove/weight changes, display whole-list and per-sleeve counts, and validate before submission.
- Unknown securities remain visible; administrators can register verified, organization-scoped entries with audit records.
- Effective policy governs style counts and weights; the old fixed 30-name request cap is removed. Submission creates a new version and preserves historical plans.
- Migration `0020_organization_securities.sql` was tested on a populated database. No reset is needed.
- Verification: 57 automated tests, workspace type checks, production build, and local desktop/mobile browser acceptance passed. Browser acceptance used mocked API responses, not production or brokerage data.

Usage and retest checklist: [Proposed Portfolio Import](docs/proposed-portfolio-import.md).

## Earlier review checkpoint

Version: 2026-08-05 v4

Classification: independent review/demo build. It does not include the Teresa prototype or demo video.

## Delivered changes

1. Bear-market fixed-income expectations no longer apply an unapproved duration-price adjustment. The U.S. 10-year Treasury yield is used as a 12-month carry proxy and the 3-month Treasury rate as the cash proxy.
2. The optimizer solves failed sleeves independently. It changes existing security weights first, then searches one- and two-security replacements only when necessary.
3. The administrator parameter screen contains only calibration periods, sample thresholds, scenario thresholds, grids, bounds, and risk-aversion inputs used by the live annual engine.
4. Non-equity NAV dates must match the latest effective equity-position date.
5. Bull- and balanced-market real-click retest reports were added.
6. A 28-page three-scenario workflow and calculation review was added as a Chinese-language PDF artifact.

## Verification evidence

- Domain-rule tests: 21/21 passed.
- API, database, and security tests: 19/19 passed at the documented release checkpoint.
- Domain, API, and Web type checks passed.
- The Web production build completed successfully with 1,579 modules.
- Bull scenario: clean database to monitoring handoff; no optimization required.
- Balanced scenario: initial emerging-market beta failure; all three optimizer plans passed; the minimum-turnover plan completed committee approval and execution maker-checker review.
- Bear scenario: public data, target, sleeves, portfolio, backtest, optimization, approval, implementation, monitoring, rebalancing, non-equity NAV, and report publication all completed.

## Demo-data boundary

- Versioned database migrations are included; runtime databases are not tracked.
- Fixed public credentials are not provided.
- External provider credentials and login sessions are not included.
- Any local review database is for testing only and must not be used in production.

## Known limitations

1. Dashboard tasks may occasionally be less complete than the actionable items shown inside the annual workflow. This does not change the saved business state but can reduce reminder reliability.
2. Bull and balanced manual retests stopped at the monitoring handoff; the bear scenario provided the full downstream position, NAV, and report coverage.
3. Sharpe and Sortino require at least 20 effective position dates; shorter samples intentionally show unavailable values.
4. A real paid-data license and production coverage acceptance remain operational prerequisites.

## Required before real team use

- Production PostgreSQL operations, backups, restoration drills, monitoring, and incident procedures
- Production email delivery with retry and failure handling
- Data-provider licensing and market-coverage acceptance
- Real broker-export samples and reconciliation sign-off
- Independent security, disaster-recovery, financial-model, and end-to-end acceptance testing

This repository demonstrates a complete controlled workflow, but it is not a claim of production readiness or financial-model approval.
