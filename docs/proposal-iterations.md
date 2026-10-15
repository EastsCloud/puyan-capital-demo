# Portfolio revisions and durable failure diagnostics

## Revise and retest without a reset

Execution Team users can choose **Revise portfolio and retest (no reset)** at the current backtest or optimization step. This returns the active workflow to proposal editing and audits the source proposal and actor. It does not delete holdings, annual inputs, targets, earlier backtests, approvals, or audit records.

The endpoint requires the latest proposal ID. It rejects stale clients, other organizations, users without preparation permission, approved proposals, workflows in approval/implementation/monitoring or later stages, and an active optimizer. This is a pre-approval iteration tool, not a way to alter an implemented portfolio.

Only securities and their **within-sleeve weights** can change here. Confirmed market allocations, annual return targets, and financial risk limits stay unchanged. Upstream business changes require their corresponding controlled approval process, not this shortcut.

## Modification states

- **Unchanged:** matches saved database holdings. Opening an editor or reordering rows is not a modification.
- **Import preview not applied:** neither the current draft nor the database has changed.
- **Modified, not saved:** added/removed securities and reweighted names are counted. Rows show Added / Modified / Unchanged; removed names appear separately. Restoring original values clears the modified state.
- **Saved, awaiting backtest:** a changed draft creates a new proposal with a parent ID and change summary. Old backtests are not copied as validation of the new version.
- **Historical result:** remains linked to its original version and is marked as unsuitable for validating the current revised proposal.

Submission still validates approved markets, enabled organization-scoped securities, style counts, caps, and sleeve totals. Locked holdings cannot be removed or reweighted. Unavailable saved securities block submission rather than disappearing silently. Weights reconcile to eight-decimal storage precision.

Identical holdings under the same sleeve-target version reuse the existing proposal instead of creating a duplicate. Modified submissions create a new version, never overwrite historical/approved holdings, and include a base version for concurrency checking.

Reopening records a server-managed iteration timestamp. Even an unchanged/reused proposal requires a new backtest for that iteration before workflow advancement. Its earlier result remains available for comparison and is marked as requiring retest; old optimization results cannot be selected after their source backtest has been superseded.

## Comparison

Expand **Compare proposal versions** and select a baseline and comparison version. The latest 100 saved versions show modification state, linked backtest outcome, per-sleeve return/beta/drawdown, actual date window, and short-history disclosure. Expand individual-security differences for added, removed, modified, and unchanged names.

Comparison selection is read-only. **Edit a trial from vN** copies a saved version to an unsaved draft under current approved targets and the current universe. It does not restore old approvals or backtest validity. Changed proposals need a fresh coverage check and backtest; available-history consent remains per run.

Workflow advancement and portfolio approval require the latest backtest of the latest proposal. Historical records remain valid in their original context but cannot approve a revised portfolio. Results using different date windows are not directly comparable. Repeated in-sample tests do not establish out-of-sample performance or financial-model approval.

## Optimization diagnostics

New failed jobs persist sanitized `error_detail` in PostgreSQL before writing to the application logger. The record includes category, actual error message, last phase, sleeve, evaluation count, and timestamp. The page displays job ID, code, phase, and reason. Failure audit events preserve an additional trail, independent of hosting log retention/severity filters.

No-candidate search outcomes, data problems, memory limits, timeouts/interruption, and program failures are distinct. A budget-limited failure is not proof of infeasibility. Credentials and connection strings are redacted. Old missing diagnostics cannot be reconstructed retroactively; retry an older failed job to capture new evidence.

The supplied production logs contained health checks and authentication failures, not the actual task exception. This release enables durable diagnosis on reproduction; it does not claim that an unobserved production root cause has been proved or fixed.

## Deployment and verification: 2026-10-15

Migration `0025_proposal_revisions_and_job_errors.sql` adds nullable metadata and an index. Existing data remain unchanged. The normal migrate-on-start deployment applies it; no reset or new hosting service is required.

`pnpm check` passed 120 tests (82 API/database/security, 21 domain, 17 web), type checks, and production builds. All 25 migrations apply in test databases. Coverage includes populated-data preservation, revision permissions, unchanged-version reuse, new versions without inherited backtests, stale clients, organization isolation, stale-result rejection, current-version committee submission, approval/implementation boundaries, and active-job exclusion. An actual worker exception is persisted and audited with console logging disabled. Pure tests check diagnostic redaction and draft change tracking.

Local mocked desktop/mobile browser checks passed for diagnostic display, revision without reset, modified/unchanged/undo states, comparison, pending new-version tests, unchanged no-op submission, and existing CSV/short-history/session regressions. The compiled optimizer's 256 MB parent-heap smoke test also passed. These software checks do not imply live production or financial-model acceptance.

After deployment, refresh and retry without resetting. If optimization fails, share the displayed task ID and specific reason. Alternatively, return to proposal editing, save a changed draft as a new version, and rerun coverage/backtesting before committee submission.
