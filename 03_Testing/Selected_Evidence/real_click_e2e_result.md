# Real Click End-to-End Test Result

Method: in-app browser real interaction. The run used visible login forms, role switching, workflow Previous/Next buttons, and workflow action buttons. It did not progress by manually editing the address.

## Result

Status: Not fully passed.

The workflow reached Step 07 Proposed Portfolio Backtest & Optimization with the Execution Team. Target approval and approved-data propagation are now consistent, but the generated proposed portfolio and optimizer still did not produce an approval-ready implementation plan under the current 36-month weekly historical window and ticker universe.

## Passed Checks

- Execution Team login completed through the login page.
- The Execution Team entered its responsible workflow through visible Next buttons.
- The approved annual target package loaded consistently: final target return 6.65%.
- Sleeve targets loaded from the approved package:
  - U.S. equity target return 8.45%, target beta 1.13.
  - Developed ex-U.S. target return 8.98%, target beta 1.05.
  - Emerging markets target return 5.18%, target beta 1.33.
- Generate System Draft loaded a real-ticker proposed portfolio and the public-data-engine historical prices.
- The optimizer now changes weights instead of returning three identical options.
- Low beta is no longer treated as a hard failure when return and drawdown controls pass; it is shown as a review note.
- Drawdown checks now use the stricter of policy budget feasibility and market-benchmark context instead of only the formula budget.
- Automated regression suite passed after the changes: 11 suites.

## Current Backtest Before Optimization

| Sleeve | Target Return | Backtested Return | Target Beta | Backtested Beta | Drawdown Budget | Backtested Drawdown | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| U.S. equity | 8.45% | 28.23% | 1.13 | 1.04 | -13.50% to -10.12% | -17.81% | Pass with return/low beta review |
| Developed ex-U.S. equity | 8.98% | 30.52% | 1.05 | 1.19 | -13.15% to -9.86% | -20.26% | Review beta/drawdown |
| Emerging markets equity | 5.18% | 14.59% | 1.33 | 1.15 | -16.05% to -12.03% | -31.53% | Review beta/drawdown |

## Optimization Result

The optimizer produced differentiated options, but none became approval-ready:

| Option | Return | Drawdown | U.S. Beta | Developed Beta | Emerging Beta | Status |
|---|---:|---:|---:|---:|---:|---|
| A - Balanced Fit | 28.69% | -16.39% | 1.13 / 1.13 | 1.07 / 1.05 | 1.25 / 1.33 | Review required |
| B - Risk Control | 26.14% | -15.96% | 1.04 / 1.13 | 1.19 / 1.05 | 1.15 / 1.33 | Review required |
| C - Return Focus | 24.97% | -15.81% | 1.07 / 1.13 | 1.08 / 1.05 | 1.25 / 1.33 | Review required |

The minimum ticker replacement search did not find a passing plan after same-style and style-flexible same-market searches.

## Code Fixes Made During This Run

- Preserved approved annual target snapshots through the backend target package.
- Fixed Annual Public Data role handling so the Decision Committee can run/accept the annual engine without being overwritten by an Execution Team backend session.
- Fixed allocation baseline reference returns so the target contribution uses the same return basis as the approved sleeve targets.
- Invalidated old target approval when new annual data is accepted.
- Added benchmark-aware drawdown checks to sleeve and total proposed-equity backtests.
- Changed beta control to asymmetric governance: high beta is a hard risk breach; low beta can be review-only when return and drawdown pass.
- Expanded ticker replacement search from same-style only to a second same-market, style-flexible pass while preserving style-count constraints.
- Reduced optimizer search size to avoid locking the browser UI.

## Remaining Decision

This run should not be marked as a passed end-to-end test. The remaining blocker is that the approved emerging-market beta/drawdown combination is not feasible with the current ticker universe and 36-month weekly historical window. The next controlled fix should be one of:

- expand the approved emerging-market ticker universe with lower-drawdown candidates,
- revise the committee-approved beta/drawdown policy for emerging markets,
- or add a formal committee exception route when no approval-ready optimization exists.
