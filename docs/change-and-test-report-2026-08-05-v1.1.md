# Isater v1.1 Business-Logic Change and Test Report

Date: 2026-08-05

## Approved changes

1. Fixed-income expected return no longer applies an assumed six-year duration adjustment. Bond return uses the latest 10-year U.S. Treasury yield as a 12-month carry proxy; cash uses the latest 3-month bill yield.
2. The optimizer now solves each failed sleeve independently, changes existing weights first, and then searches the approved universe by the minimum number of ticker replacements. It returns three complete plans covering every failed sleeve.
3. Administrator maintenance now exposes the policy consumed by the annual allocation engine. Annual runs preserve the parameter version, effective time and complete policy snapshot.

## Real-data regression result

The same stored public dataset used for the workflow handbook was recalculated for bull, balanced and bear scenarios with `annual-regime-allocation-v1.1.0`.

| Bear-market item | Previous model | Corrected model |
|---|---:|---:|
| Bond expected return | 1.3586% | 4.7500% |
| Cash expected return | 1.0072% | 3.7300% |
| Portfolio expected return | 2.0445% | 4.5405% |
| Economic target floor | 4.4635% | 4.4635% |
| Shortfall allocated to equity | 2.3299% | 0.0000% |

The corrected result confirms that the prior bear-market blockage was created by the duration assumption, not by insufficient bond-market yield.

## Verification

- Domain tests: 21 passed.
- API and database tests: 18 passed.
- API and web TypeScript checks: passed.
- API and web production builds: passed.
- Existing administrator parameter version was read through the running API and normalized to the active annual-allocation policy without legacy display-only fields.
- Legacy optimizer records remain readable; new runs use the combined-plan structure.
- Replacement candidates preserve sleeve and style counts, apply the single-security cap, calculate turnover over sold and purchased names, and update the selected portfolio's ticker and data-source manifest.

## Version boundary

- Annual allocation model: `annual-regime-allocation-v1.1.0`
- Optimizer: `isater-optimizer-1.1.0`
- Optimizer validation record: `isater-optimizer-validation-1.1.0`
- Default business parameters: version 3

The existing v3 delivery ZIP and its PDF were not overwritten. They remain pre-fix review artifacts. A new delivery package should be created only after the updated workflow PDF is regenerated and reviewed.

## Date-alignment hardening

- Non-equity NAV now defaults to the latest effective equity-position business date and cannot be edited to a different date in the UI.
- The API independently rejects a non-equity NAV date that differs from the latest effective equity snapshot.
- Non-equity review records and report audit details use `YYYY-MM-DD` consistently.
- A new non-equity NAV version can be entered after a prior report is published and the workflow returns to monitoring.
- Targeted real-click regression passed: equity position date, submitted NAV v2, committee review, audit record and report v2 all used `2026-08-10`.
- API and database test count increased to 19 passed.
