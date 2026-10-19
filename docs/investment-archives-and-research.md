# Investment Archives and Standalone Research

## Two independent workspace types

- **Formal annual archive:** the existing data, target, sleeve, proposal, backtest, optimization, approval, implementation, monitoring and reporting workflow. Creating an archive does not approve a portfolio. Its suggested principal must first be activated by the Decision Committee in Overview.
- **Research archive:** direct historical backtesting without approved annual data, return targets, sleeve targets or security-library registration. Results are research-only, with no pass/fail approval decision. There is no direct route from research results to trade approval or implementation.

Multiple archives may use the same business year. New archives receive separate portfolio IDs and, for formal archives, separate workflow IDs. Positions, cash flows, proposals, approvals, fills and reports retain their original scope. Creating or selecting an archive neither duplicates actual money nor merges different archives' performance.

Existing annual workflows are backfilled as archives by additive migration 0027. Their workflow IDs, steps, approved plans and original portfolio associations are preserved. Historical workflows that already shared a portfolio before this release keep that legacy association; the migration does not invent separate historical position records. Newly created archives use independent portfolios.

## Administrator workflow

1. Open **Archives**. All team members can inspect the archive list; only administrators can add or select archives.
2. Supply a name, type, year and suggested principal. A copy source is optional.
3. Add the archive. Creation does **not** select it automatically.
4. Choose **Select archive**. Selection applies to the organization, not just one browser. The current archive's name, type, year and identifier remain visible above the working page.
5. For formal archives, the committee activates principal, then follows the full workflow. For research archives, enter securities and weights, choose the date interval, benchmark and simulation method, then run.

Selection is audited. Other open browsers periodically discover administrator changes. Scoped writes carry the archive identifier and reject stale selection; principal activation is also pinned in the SQL statement to avoid writing a newly selected portfolio during a concurrent switch. Already-running computations still persist to their original workflow/archive, never to the new selection. Unsaved local drafts are not transferred, and navigation warns about discarding them.

Automatic selection/task polling does not renew an idle login session. Expired sessions still return to sign-in rather than remaining alive because a browser tab was left open.

## Copying does not copy approval

Copying retains a parameter snapshot and, where available, the latest proposed stock list/relative weights. It does not clone votes, approval states, executed fills, imported actual positions, historical research runs, published reports or real cash balances.

A research archive can be copied into a new formal archive. The new formal workflow starts at annual data and requires fresh confirmations and approvals. At the proposal step, **Load copied holdings** explicitly loads an unsaved draft. Relative weights are normalized within each market; the new archive's approved market allocations still govern. Unknown catalogue entries must be registered before formal submission. No copied data automatically replaces a saved proposal.

## Parameter boundary

Formal calculations use the business-parameter snapshot captured when the archive is created or copied. Changes to organization-wide parameters apply to new blank archives, not silently to existing archives. Copying preserves the source snapshot. Data-provider credentials, source administration, user accounts and the maintained security catalogue remain organization-level services; each run records its applied inputs/evidence.

Already-effective principal cannot be overwritten through the current-principal endpoint. Use another archive for a different independent scenario. Once an organization has archives, the destructive global demo-reset action is disabled; create a new archive instead of erasing the team history.

## Safe current-archive reset

Administrators have a **Reset current archive** control on Overview and Archives, including when the selected archive is a research workspace. It remains visible with an explanation when the deployment flag `ENABLE_DEMO_RESET` is disabled or no archive is selected. This does not restore the destructive organization-wide erase action.

Expand the control, type `RESET ARCHIVE`, then confirm the dialog naming the selected archive. Reset creates a blank replacement of the same type and year, captures the currently effective business parameters, links it to the original archive, and atomically selects it for the team. The original archive and every original business record remain available in the archive list. No stock list, approval, fill, position, report or historical research run is copied into the replacement. Formal principal must be activated again by the committee.

The API requires an administrator, the deployment flag, the current archive header/identifier, the displayed archive revision and workflow version. Running research/optimization jobs block reset. A stale selection, changed revision or repeated submission cannot reset another workspace. The `archive.reset` audit record links original/replacement identifiers. Users, credentials and audit records are untouched. No schema migration is needed for this restoration.

## Standalone research assumptions

- Up to 50 securities; weights must be positive and total 100% of the research equity portfolio. Securities can be typed directly or chosen using catalogue hints. Supported exchanges match the existing US, Japan, Hong Kong and China A-share connectors.
- The selectable period lies within the available last 36 months. Only completed weekly prices shared by every stock, required FX series and selected benchmark are used. Missing real data blocks calculation; securities are not silently dropped.
- EODHD is preferred where configured and supported. The existing Yahoo adapter is the fallback, including the Tokyo path. Non-USD stocks use real JPY/USD, HKD/USD or CNY/USD weekly closes to express performance in USD. Missing FX is an error, not an assumed fixed conversion rate.
- Benchmarks are USD-listed SPY, EWJ, EWH or ASHR. Beta compares the whole research portfolio to the explicitly chosen benchmark, not to an automatically approved market mix.
- **Buy and hold** fixes initial stock allocations and allows weights to drift. **Weekly constant weights** restores initial weights weekly and assumes costless rebalancing. The choice is saved per run.
- Fewer than 100 common weekly prices requires an explicit short-history acknowledgement. The research technical floor is 13 common weekly prices. This is a computational floor, not a claim of adequate statistical reliability or a change to formal approval policy.
- Outputs include historical annualized return, annualized weekly volatility, maximum drawdown and beta. No goals are required, no pass/fail decision is produced, and the existing formal optimizer is not invoked by a research run.
- Fees, tax, slippage, liquidity, trading-lot constraints and survivorship/selection bias are not resolved. FX and stock weekly closes across markets are not simultaneous. Historical returns are not forecasts.

## Persistence and resource limits

Starting research returns HTTP 202 and saves the archive revision, input, requester and short-history choice. A background task saves completed metrics, exact price/FX evidence and provider coverage in PostgreSQL. Terminal runs and their inputs/evidence are protected against modification or deletion by a database trigger. The interface lists the latest 30 runs and labels results separately from the current draft.

One research task may be active deployment-wide. Provider work has a 120-second timeout and saved tasks have a 150-second deadline. A later status read recovers expired tasks as failed/interrupted, retaining inputs; it does not silently resume them. Start, completion and handled failure are audited. Refreshing or changing archives does not reassign a task. Background tasks are not a guaranteed external job queue; service restarts can require a fresh run.

## Verification and deployment

Migration 0027 is additive; no reset or extra hosting service is required. Deploy through the existing private-repository migration/build/start sequence, then refresh clients so they send archive headers.

The update passes 145 automated tests (105 API/database, 19 web, 21 domain), type checks and production builds. New tests cover populated-database backfill, multiple same-year archives, role/organization boundaries, selected workflow/portfolio resolution, stale and linked-action protection, a simulated switch between guard and principal write, committee principal activation, parameter snapshots, background-result ownership, copy boundaries, immutable evidence, missing-price failure, FX conversion, simulation methods, short-history consent and interrupted-task recovery. Desktop/mobile mocked-browser tests cover creation, explicit switching, direct research, saved results, copying to formal, and existing import/revision/security-edit regressions.

A separate read-only live Yahoo check fetched AAPL, 6861.T, JPYUSD=X and SPY and calculated an aligned 104-price research interval with finite metrics. It wrote no business records and does not validate hosted EODHD credentials or subscription coverage. Mocked fixtures and live retrieval checks are not production deployment acceptance, brokerage reconciliation or independent financial-model validation.
