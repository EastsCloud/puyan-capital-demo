# Historical Data Coverage and Backtest Diagnostics

## Data readiness is not a risk-control pass

The standard backtest minimum remains **100 completed weekly price observations per security and per aligned sleeve/benchmark set**. Execution-team users may now explicitly confirm a **single short-history run** when real prices are available for every required security and benchmark. This is an exception to sample length, not a risk-control waiver or a claim of full three-year validation. The system never fabricates prices or silently drops stocks.

At the backtest step, **Check all price coverage** performs a read-only preflight for the latest saved proposed-portfolio version. It lists every security and nonzero-weight benchmark, actual provider, date coverage, completed-week count, fallback reason, individual failures, and aligned sleeve counts. Running a backtest repeats the authoritative checks; a previous browser preflight cannot bypass them. All data issues are returned together as a detailed HTTP 422 response. Without explicit consent, insufficient history causes no backtest or observation writes.

## Explicit available-history confirmation

- Only an authenticated Execution Team user can confirm. A separate dialog discloses the common window, price-observation count, and limitations. Standard runs never opt into the exception automatically.
- Every required series must have real prices. All three sleeves use the same intersection of completed weeks; no missing prices are filled. At least three aligned weekly prices (two returns) are needed for mathematical calculability. This technical floor is **not** an endorsement of statistical reliability. A zero-variance benchmark remains blocked.
- Consent is bound to the latest proposal, exact fetched prices, and effective backtest policy by a fingerprint. Changed data or parameters require a fresh review and confirmation.
- Migration `0022_short_history_confirmations.sql` adds an immutable confirmation table and run linkage. Confirmation is committed before calculation, with actor, server timestamp, proposal identity/version, warning, coverage, policy, and actual date/count snapshots. Failed calculations retain this evidence. Workflow reset preserves confirmations and audit events.
- Backtest results, portfolio approval, and newly generated reports show the short-history notice. Normal return, beta, drawdown, workflow, and committee controls still apply. Optimization inherits the confirmed window and does not shorten it further; derived runs retain the original confirmation ID.
- Consent is per run, not a global parameter change. A fresh backtest requires fresh confirmation. Historical standard runs retain their original meaning.

The UI prefers the detailed response `message` rather than the generic Fastify `error` label such as `Conflict`. Workflow/role errors remain enforced. Operational failures and failed financial risk controls are distinct outcomes.

## Providers and dates

- EODHD is the primary source where supported by the enabled connection. Valid short history is retained and reported, not treated as a reason to request the same nonexistent earlier history from another provider.
- Tokyo listings currently use the Yahoo fallback explicitly; the EODHD exchange list and direct requests did not provide Tokyo coverage at the verification checkpoint. A Japan index being available does not mean individual Tokyo listings are covered.
- Other EODHD request failures can use Yahoo fallback, with both failure reasons preserved if neither provider succeeds. Provider credentials are excluded from diagnostics and persisted metadata.
- Both adapters fetch daily adjusted-close data. Yahoo timestamps are converted using the exchange's local time zone. Prices are grouped into Monday–Sunday calendar weeks using the final actual trading close. The current partial week is excluded for both providers.

The revised model is `isater-backtest-1.2.0`. Its cached observations use the separate field `adjusted_close_weekly_v2`, so old UTC-week-label observations are not mixed into corrected weekly calculations. Existing reports and approved historical versions remain intact. Optimization uses the same corrected adapters and refreshes missing corrected caches.

## Verification checkpoint: 2026-10-13

Live, read-only checks of the supplied 23-security review list and four benchmarks confirmed that CRCL and SNDK return real EODHD prices, but only 71 and 87 **completed** weekly observations respectively. Earlier counts of 72 and 88 included the current partial week. The six Tokyo listings returned 159 completed weeks via Yahoo with exchange-local date grouping. Other reviewed stocks and benchmark series had sufficient individual coverage. These are data-readiness results, not investment recommendations, future availability guarantees, or full production-workflow acceptance.

Automated tests use explicitly mocked data and cover multiple short-history failures, provider failure and credential redaction, Tokyo fallback, time-zone conversion, partial-week exclusion, aligned-history failure, HTTP error detail, role/workflow gates, no writes on failed preflight, successful persistence, optional reference fields, and listing mismatches. Desktop/mobile browser acceptance checks cover the complete import-preview/draft/submit flow, weight conversion, and the detailed failure panel.

## Manual retest

1. Refresh after deployment; do not reset the database.
2. In Securities, check a ticker and confirm the provider, listing venue, dates, and warning. Reference fields can remain empty.
3. In the proposed step, explicitly select the CSV weight basis and inspect conversions. Effective style limits still apply; do not change them just to hide a validation error.
4. At backtest, run the coverage check. With CRCL/SNDK retained, both short-history issues should appear together and block the standard run.
5. As Execution Team, choose **Confirm available-history backtest (record consent)** and review the dialog. Cancel must not create a run or confirmation. Confirm should calculate all sleeves over the displayed common window and show the confirmation ID, actor, and timestamp. Refresh and verify the notice remains.
6. Check that risk failures still route to optimization and that a hard-control pass still requires committee approval. Check the short-history notice in approval and a newly generated report. Do not reset production data to test this feature.

Yahoo is a public fallback with operational and licensing limitations. Real team use still requires provider coverage/licensing acceptance and financial-model validation.
