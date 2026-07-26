# Database and Report Upgrade - 2026-07-23

## Completed Scope

This upgrade covers the two items approved for immediate implementation:

1. Replace snapshot-only persistence with a normalized SQLite operational database.
2. Improve the report presentation and professional context.

Render deployment, domain configuration, and EODHD integration are outside this change.

## SQLite Database

The backend now uses separate SQLite tables for:

- system settings and database version;
- users and sessions;
- target packages;
- portfolios and holdings;
- non-equity NAV packages;
- trade authorization packages and orders;
- approvals;
- data imports and raw import text;
- public-data refresh records and data sets;
- report distributions;
- audit history.

Existing JSON or earlier `app_state` data is migrated automatically. The `app_state` snapshot is retained only for compatibility and recovery. Database writes are transactional.

This is appropriate for local use, demonstration, and a controlled small pilot. It does not by itself provide enterprise single sign-on, offsite backup, multi-instance coordination, or high-availability operations.

## Professional Report

The reporting screen now identifies:

- report period and valuation date;
- base currency;
- report readiness;
- portfolio, benchmark, and active return;
- maximum drawdown;
- return and valuation basis;
- benchmark basis;
- data-quality status;
- attribution-method boundary.

The committee pack and CSV export include the same reporting context.

The attribution section is deliberately described as a management attribution bridge. Formal Brinson, factor, fee, currency, and transaction-level attribution still requires a finance professional to define and approve the methodology.

## Verification

Automated checks cover:

- normalized SQLite schema and round-trip persistence;
- legacy snapshot migration;
- backend behavior;
- static UI/report wiring;
- existing workflow regression tests.

The current test suite should be rerun whenever database schema, calculation logic, or report content changes.
