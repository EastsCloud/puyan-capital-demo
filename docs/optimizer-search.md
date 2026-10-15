# Bounded background optimization

## Purpose and model boundary

The application uses a custom, deterministic heuristic search, not a provider-supplied optimization service. Model `isater-optimizer-1.3.0` replaces eager enumeration of every weight vector and replacement combination. That enumeration could exhaust the small hosting instance's JavaScript heap and surface as HTTP 502.

The replacement algorithm searches within explicit budgets and retains only a small set of feasible candidates. It does **not** prove global optimality, prove the minimum possible number of replacements, or prove that a portfolio is mathematically infeasible. A budget-limited result says that no compliant plan was found within the search budget. At most three distinct plans are returned; fewer are valid.

## Search and validation

1. Solve only failed sleeves. Passing sleeves and approved market-sleeve allocations stay unchanged.
2. Try existing-security weights first using capped-simplex projection, deterministic starting points, and bounded pairwise coordinate transfers.
3. Only when that pass finds no valid plan, load a bounded replacement pool and lazily try one- and two-security replacements. Locked securities cannot be removed or reweighted. Sleeve/style counts remain unchanged.
4. Recompute retained plans independently in the API using the backtest return, beta, and drawdown functions and the existing domain risk controls. A plan must satisfy every hard control before persistence. High-return/low-beta review notices and committee approval are not bypassed.
5. Acceptance revalidates the proposal, targets, benchmarks, and effective parameters, creates a new proposal version, and preserves unchanged sleeves and locked flags. It does not execute trades.

The legacy internal phase identifier `minimum_ticker_replacement` is retained for compatibility; it is not a mathematical minimum guarantee. Display labels and audit metadata describe only the retained plans.

## Resource ceilings

- One active optimization job across the deployment, enforced by a PostgreSQL partial unique index. Repeated submissions for the same running workflow return the existing job.
- Each failed sleeve gets up to 12,000 weight-only evaluations, followed, if necessary, by up to 28,000 additional evaluations including the bounded replacement pass.
- At most 24 replacement securities are loaded per failed sleeve, serially. At most 64 candidate security sets are evaluated per replacement pass, with no more than two replacements per set.
- At most nine best candidate references are retained inside a solver; at most three distinct solutions leave it. Weight vectors are never accumulated into an exhaustive array.
- CPU work runs in a worker thread with a 64 MB old-generation limit. Each solver has a six-second computation budget and a ten-second parent timeout. The whole background job has a 120-second deadline including data preparation.
- The worker accepts at most 100 current holdings, 240 price series, and 520 weekly price observations. These are safety ceilings, not recommended portfolio sizes or guaranteed solver capacity.

These ceilings reduce resource risk; they do not guarantee that every valid portfolio will receive a solution, or that every hosting plan is sufficient for all concurrent application traffic. Review and tune the model with a financial specialist before real investment use.

## Background task and persistence

`POST /api/workflows/:workflowId/optimization/runs` returns HTTP 202 with a job ID. The UI polls an organization-scoped status endpoint without keeping a blocking full-screen loader open. Users can leave and return; page refresh reloads the saved job.

Migration `0024_optimization_jobs.sql` is additive. Jobs save their requester, source proposal/backtest, timestamps, progress, diagnostics, outcome, and resulting optimization-run link. Existing data do not need to be reset. Start, successful calculation, and selection also retain audit records.

The worker lease is renewed every eight seconds and expires after 30 seconds without renewal. A later status/context/start request marks an expired active lease as interrupted. Service restarts do not silently restart or approve the calculation; the user can retry. No current portfolio is changed by a failed or interrupted job.

Original prices and benchmark data reuse the exact consent snapshot for an available-history backtest. Replacement prices must cover that same accepted window. The optimizer does not silently drop stocks, shorten the window further, fabricate prices, or change provider selection. Missing replacement prices and a truncated search universe are recorded in diagnostics.

## Session and backtest usability

The browser session cookie now renews alongside the server's existing sliding idle expiry. Expired/revoked sessions are not revived. An API authentication failure returns users to sign-in with a saved-data notice; it is not presented as a price-provider failure. Login-password failures retain their normal login error.

Backtest coverage-check, normal-run, and available-history confirmation controls are placed above the long coverage table. This avoids hiding the next action below many securities on mobile.

## Verification: 2026-10-14

- `pnpm check`: 108 automated tests (73 API/database/security, 21 domain, 14 web), type checks, and production builds passed.
- Database-compatible integration tests apply all 24 migrations and exercise actual worker execution, short HTTP submission, duplicate protection, responsive health checks, persisted independently verified plans, organization scoping, no-candidate outcomes, stale-context rejection, plan acceptance, locked holdings, short-history linkage, and expired-lease recovery.
- `pnpm --filter @isater/api test:optimizer-memory` runs the **compiled** worker under a 256 MB parent Node heap. Synthetic 6-, 12-, and 20-security cases passed. A 12-security/24-alternative case stopped at 40,000 evaluations without a feasible plan or crash. The parent event loop continued responding throughout.
- Local desktop/mobile browser checks with mocked HTTP responses cover background progress, disabled repeated submission, refresh recovery, result rendering, budget-failure retry, session expiry, and the existing portfolio-import/short-history flows.

These are software regressions with explicitly synthetic/mocked fixtures, not live financial-model validation or proof of production deployment acceptance. After deployment, refresh the browser and retry the existing workflow without resetting the database. Confirm the job finishes or reports a specific bounded outcome, `/api/health` stays responsive, and the server logs contain no heap-exhaustion restart. Keep production EODHD credentials in protected environment storage.
