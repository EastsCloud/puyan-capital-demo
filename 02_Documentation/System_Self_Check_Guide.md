# System Self Check Guide

## Purpose

This guide explains how to run a local self-check for the Puyan Capital Control Center.

The self-check is designed to answer:

- Are the main system files present?
- Does the JavaScript syntax pass?
- Do the workflow simulation tests pass?
- Do the static UI wiring checks pass?
- Do the backend foundation checks pass?
- Does the market-data source registry pass?
- Can the local backend run with SQLite as the live store?
- Can the live SQLite backend be exported to a relational audit snapshot?
- Is historical replay evidence clearly separated from remaining formal browser testing?
- Is the local backend likely available for browser testing?

## Easiest Method On Mac

Open the project folder:

```text
/Users/wangxiaoxiang/Documents/us stock
```

Double-click:

```text
SELF_CHECK.command
```

The command window will run the checks and then show the report location.

## Terminal Method

From the project folder, run:

```bash
node tests/self_check.mjs
```

If global Node.js is not installed, use the bundled Codex runtime:

```bash
"/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" tests/self_check.mjs
```

## Output Files

The self-check writes:

```text
tests/output/SELF_CHECK_REPORT.md
tests/output/SELF_CHECK_REPORT.json
tests/output/test_suite_result.md
```

The Markdown report is easier for people to read.

The JSON report is easier for IT or future automation to parse.

## How To Read The Result

### PASS

The check succeeded.

### WARN

The system may still be usable, but something should be reviewed.

Example:

- The backend is not currently running.
- The current sandbox cannot call `localhost`, even though the browser may still open it.

### FAIL

The system should not be treated as runnable until the failed item is fixed.

Examples:

- Required file missing.
- JavaScript syntax error.
- Workflow test failed.
- Backend foundation test failed.
- SQLite live store check failed.
- SQLite audit snapshot export failed.
- Market data source registry is incomplete.

## Important Note About Localhost

In some restricted environments, automated scripts may not be allowed to call:

```text
http://localhost:8787
```

even when the in-app browser or normal browser can open it.

If the self-check shows a warning for the backend HTTP check but the browser opens `http://localhost:8787`, treat that as an environment warning, not proof that the system is broken.

## What The Self-Check Does Not Certify

The self-check does not certify:

- production cybersecurity
- encrypted password login
- production database backup and recovery
- real broker integration
- real live market data integration
- regulatory compliance
- deployment readiness

It verifies the current local prototype and backend foundation.

## New Readiness Checks

The full test suite now also writes:

```text
tests/output/market_data_source_registry_check_result.md
tests/output/sqlite_live_store_check_result.md
tests/output/sqlite_snapshot_check_result.md
tests/output/historical_replay_evidence_audit.md
```

These reports improve handoff evidence, but they do not replace a future formal browser-driven historical replay.
