# Report Distribution Persistence Retest - 2026-07-23

## Purpose

Verify the corrected handoff from Execution Team report distribution to Decision Committee Annual Review after a browser refresh and a new login.

## Actual UI Steps Performed

1. Restarted the local backend after the code change.
2. Used the normal login screen to sign in as the Execution Team.
3. Used the visible workflow `Next` controls to move through sleeve allocation, beta and drawdown, portfolio construction, backtest, implementation approval, monitoring, execution, and reports.
4. Confirmed the report was ready for formal issue and the distribution state was `Draft`.
5. Selected `Sent to Committee` in the visible report distribution control.
6. Confirmed the page showed `Sent to Committee`, the workflow stage changed to `Annual Review`, and the field locked.
7. Used the visible `Switch Role` control and signed in as the Decision Committee.
8. Confirmed the Committee view showed `Sent to Committee`, `Annual Review`, and disabled distribution fields.
9. Refreshed the browser page, used the normal Decision Committee login again, and repeated the status check.

## Verified Result After Refresh and Re-login

- Backend user: Decision Committee.
- Distribution state: `Sent to Committee`.
- Distribution date: `2026-07-23`.
- Recipient group: `Decision Committee`.
- Workflow stage: `Annual Review`.
- Formal report status: ready for formal issue.
- Distribution field: disabled for the Committee role.
- Browser console error records: none found during this retest.

## Related Automated Results

- Backend checks: 52 passed.
- Static UI checks: 323 passed.
- Full automated suite: 11 suites passed.

## Boundary

This retest proves this specific corrected report handoff. It does not replace a full release-acceptance matrix for every state-changing workflow handoff.
