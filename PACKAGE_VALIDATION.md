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

- `MANIFEST.sha256` records the intended package files and hashes.
- Local databases, dependencies, and generated build artifacts are excluded from the public release manifest.
- Packaged archives are checked after creation and extraction.
