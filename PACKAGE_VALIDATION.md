# Isater v4 Package Validation Record

Validation date: 2026-08-07

## Code and build

- Domain-rule tests: 21/21 passed.
- API, database, and security tests: 22/22 passed at this checkpoint.
- Domain, API, and Web TypeScript checks passed.
- The Web production build passed with 1,579 modules.

## Manual workflow tests

- Bear scenario: complete end-to-end real-click workflow, including monitoring, rebalancing, non-equity NAV, and reporting.
- Bull scenario: independent clean-database run to the monitoring handoff; passed without optimization.
- Balanced scenario: independent clean-database run to the monitoring handoff; passed after emerging-market optimization.
- First login, password change, and role switching were verified for all four test-user categories.
- The trade plan was submitted and reviewed by two different Execution Team users.

## PDF review

- File: `docs/Isater_Three_Scenario_Full_Workflow_and_Business_Logic_v1.1_20260805.pdf`
- Length: 28 pages.
- The PDF was readable, unencrypted, and contained no blank pages.
- Every page was rendered to inspect fonts, diagrams, tables, pagination, clipping, and overlap.
- This PDF is a Chinese-language business-review artifact; the public repository's Markdown documentation is maintained in English.

## Data and security

- Database migrations at validation time: 18.
- Login sessions in the packaged review database: 0.
- External-data credentials in the packaged review database: 0.
- No `.env`, dependency directory, runtime database lock, or EODHD token is tracked.
- Public Git excludes databases, uploads, generated builds, and real business records.

## Integrity

The 2026-10-14 optimizer update passed 108 automated tests, workspace type checks, and production builds. All 24 SQL migrations apply in test databases. Actual-worker API integration tests verify durable jobs, duplicate protection, health responsiveness, scoped results, validated selection, unchanged locks and short-history evidence, stale-context rejection, and expired-lease recovery. A compiled-worker smoke test under a 256 MB parent Node heap exercises 6/12/20 stocks and a failed search with 24 replacement alternatives; no heap-exhaustion restart occurred. Desktop/mobile mocked-browser checks cover asynchronous progress, refresh recovery, retry, and session-expiry handling. Live production deployment and provider acceptance remain separate checks.

The checked-price snapshot fix passed 90 automated tests and production/type checks. All 23 SQL migrations were applied in test databases. A PostgreSQL-compatible API integration test verifies preflight-to-confirmation-to-backtest persistence, exact price evidence, cache deletion, and server-side expiry. Desktop/mobile mocked-browser tests verify expiry recovery and the snapshot ID sent with consent.

The 2026-10-13 available-history update passed 85 automated tests, TypeScript checks, and production builds. Database tests apply all 22 migrations and verify immutable confirmation evidence. Local headless-browser acceptance checks explicit cancellation/confirmation and refreshed short-history notices on desktop/mobile; mocked browser responses do not establish production financial-model acceptance.

- `MANIFEST.sha256` records the intended package files and hashes.
- Local databases, dependencies, and generated build artifacts are excluded from the public release manifest.
- Packaged archives are checked after creation and extraction.
