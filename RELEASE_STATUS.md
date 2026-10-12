# Isater Review Release Status

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
