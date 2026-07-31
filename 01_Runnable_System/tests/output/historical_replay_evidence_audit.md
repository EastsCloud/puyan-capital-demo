# Historical Replay Evidence Audit

Generated at: 2026-07-30T10:34:11.377Z

This audit separates verified local evidence from items that still require a formal browser-driven historical replay.

## Automated Checks

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Public historical prices exist with long coverage | 2747 data row(s) |
| PASS | Market statistics output exists | 21 data row(s) |
| PASS | Ticker universe output exists | 54 ticker row(s) |
| PASS | Public data manifest exists | EODHD end-of-day adjusted close; Yahoo Finance public chart adjusted close (Tokyo-only exception) retained only where EODHD has no Tokyo exchange coverage |
| PASS | Public data cache strategy is recorded | Use existing price history and refresh the last 7 calendar days. New tickers receive a one-time full history download. |
| PASS | Current automated test suite evidence does not depend on video | video evidence excluded |
| true | Current workflow E2E evidence exists | passing workflow report present |
| true | Replay-date regression evidence exists | passing regression report present |

## Verified Evidence

- Public data engine output is present from 2016-01-01 to 2026-07-26 with 2747 historical price rows.
- Current allocation statistics and ticker universe files exist and are machine-checkable.
- Backend, UI-static, public-data, replay-date, and optimizer-related checks can be run through the local test suite.
- Current backend workflow E2E and replay-date regression evidence is present and machine-checkable.

## Remaining Limits

- A full formal historical replay still requires a browser-driven script that logs in as each role, clicks the workflow controls, and stores screenshots or structured DOM evidence at each step.
- The current audit does not certify paid market-data licensing, broker integration, or live order execution.
- Video evidence has been deliberately excluded because the prior video artifact was not reliable enough for acceptance.
