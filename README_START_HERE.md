# Isater / Puyan Capital Review Package

Version: 2026-08-05 v4

Purpose: business and technical review, plus public portfolio presentation. This is not a production trading-system installation package.

Start with the root [README](README.md). The public repository contains no fixed login passwords, external-data credentials, database snapshots, or real business data.

## Suggested reading order

1. `README.md` — project purpose, capabilities, technology, and setup.
2. `RELEASE_STATUS.md` — verified scope, known limitations, and production-readiness boundary.
3. `docs/product-guide.md` — roles, annual workflow, routine operation, and screens.
4. `docs/business-flow-and-logic.md` — calculations and control logic.
5. `docs/formal-e2e-test-report-2026-08-05-v1.1.md` — complete bear-market end-to-end test.
6. `docs/formal-bull-balanced-e2e-test-report-2026-08-05-v1.1.md` — independent bull- and balanced-market retests.
7. `docs/quick-start.md` and `docs/review-accounts.md` — local startup and test-account policy.
8. `system/` — source code, migrations, build configuration, and tests.

The 28-page `docs/Isater_Three_Scenario_Full_Workflow_and_Business_Logic_v1.1_20260805.pdf` is an earlier Chinese-language business-review artifact. The Markdown documentation is the English reference for this public repository.

## Security boundary

- No EODHD token, FRED key, SMTP password, or production encryption key is included.
- Local databases, sessions, uploaded files, and external credentials are excluded from Git.
- Review accounts must be created for each environment and delivered through a private channel.
- Production users must be newly created and forced to change their initial passwords.

## Current assessment

- The bull scenario passed from public data through the monitoring handoff without optimization.
- The balanced scenario initially failed the emerging-market beta control; the optimizer produced three compliant alternatives and the selected plan completed approval and maker-checker review.
- The bear scenario completed the full workflow after the bond-carry correction; sleeve-specific optimization resolved the emerging-market exception.
- The remaining product boundary is documented in `RELEASE_STATUS.md` and must not be interpreted as production certification.
