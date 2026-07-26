# Readiness Upgrade Notes - 2026-07-22

## Purpose

This note records the first upgrade batch after the no-video delivery-package decision.

The goal is to improve three weak areas without pretending that the system has already passed full production-level testing.

## Upgrade 1: External Data Governance

Added:

```text
config/market_data_sources.json
tests/run_market_data_source_registry_checks.mjs
```

What this does:

- Records the public market data source currently used by the Public Data Engine.
- Records CPI reference sources.
- Records the administrator-approved manual fallback path.
- Records a planned institutional paid-data vendor interface without naming a vendor or assuming pricing.
- Adds an automated check for source id, priority, usage, refresh cadence, fallback rule, and alignment with the public-data manifest.

What this does not prove yet:

- It does not prove paid vendor licensing.
- It does not prove broker/custodian integration.
- It does not certify that public free data can be used in production.

## Upgrade 2: SQLite Live Database

Added:

```text
scripts/export_sqlite_snapshot.mjs
tests/run_sqlite_snapshot_checks.mjs
tests/run_sqlite_live_store_checks.mjs
```

What this does:

- Makes `server/data/db.sqlite` the default live backend database for the local system.
- Migrates from `server/data/db.json` on first SQLite startup when a legacy JSON file is present.
- Stores operational records in normalized SQLite tables, including users, sessions, targets, portfolios, holdings, orders, approvals, imports, public-data records, report distributions, and audit history.
- Keeps `app_state` and `app_state_backups` as compatibility and recovery snapshots rather than the primary operational data model.
- Records database version and migration markers in `database_meta`.
- Exports a separate relational audit snapshot to `server/data/db_audit.sqlite`.
- Preserves users, target packages, portfolios, approvals, import summaries, public-data refresh summaries, audit log, and system parameter versions in the audit export.
- Keeps password hashes out of the exported relational audit `users` table.
- Keeps large raw import text out of relational summary tables while preserving hashes and row counts.

Current position:

- SQLite is now the default live local database, and normalized tables are the authoritative source after migration.
- JSON remains useful as a legacy migration source and emergency readable backup.
- Existing JSON or earlier `app_state` data is migrated automatically on startup.
- This is still a local prototype database, not a hosted production database with enterprise authentication, offsite backup, or multi-user deployment controls.

## Upgrade 4: Professional Reporting Presentation

Improved:

- Investment-committee report masthead and reporting period context.
- Benchmark return, active return, and visible drawdown.
- Valuation, return-calculation, benchmark, and data-quality disclosures.
- Committee-pack and CSV export context.
- Clear labeling of the current management attribution bridge.

Boundary:

- The current attribution bridge is not formal Brinson, factor, fee, currency, or transaction-level attribution.
- A finance professional must approve the attribution methodology, benchmark hierarchy, fee treatment, currency treatment, and report wording before official external use.

## Upgrade 3: Historical Test Evidence Boundary

Added:

```text
tests/run_historical_replay_evidence_audit.mjs
```

What this does:

- Checks that public historical price data, market statistics, ticker universe, and public-data manifest exist.
- Checks that formal historical replay planning/report files are present.
- Writes a report that separates verified local evidence from remaining formal browser-replay work.

What this does not prove yet:

- It does not certify a browser-driven one-year historical replay.
- It does not replace role-by-role clicked UI testing.
- It does not depend on video evidence.

## Test Commands

Run all checks:

```bash
npm test
```

Run only the new checks:

```bash
npm run test:data-sources
npm run test:sqlite-live
npm run test:sqlite
node tests/run_historical_replay_evidence_audit.mjs
```

Export a relational audit snapshot from the current live SQLite backend database:

```bash
npm run data:sqlite
```

## Acceptance Position

This batch improves the system foundation and evidence quality.

It should be treated as an intermediate readiness upgrade, not a final production certification.
