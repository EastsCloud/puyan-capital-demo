# IT Handoff Checklist

## Runtime

- Node.js 24 or above recommended because the local backend uses `node:sqlite`.
- Current backend starts with `npm start`.
- Current tests run with `npm test`.
- Self-check runs with `npm run self-check`.

## Local Backend

Current backend files:

```text
server/core.mjs
server/server.mjs
server/data/db.sqlite
server/data/db_audit.sqlite
```

`server/data/db.json` may still exist as a legacy migration source or emergency readable backup.

Default URL:

```text
http://localhost:8787
```

Current API areas:

- `/api/login`
- `/api/users`
- `/api/targets`
- `/api/targets/approve`
- `/api/portfolios`
- `/api/portfolios/approve`
- `/api/imports`
- `/api/audit-log`

## Test Commands

```bash
npm test
npm run self-check
npm run test:workflow
npm run test:ui-static
npm run test:backend
npm run test:e2e
npm run test:sqlite-live
npm run test:sqlite
npm run data:sqlite
```

E2E report:

```text
tests/output/e2e_workflow_result.md
tests/output/e2e_workflow_result.json
```

## Data Contracts

Important CSV templates:

```text
data/sample_prices_web_recent.csv
data/sample_ticker_universe.csv
data/standard_actual_holdings.csv
data/standard_actual_trades.csv
data/standard_cash_flows.csv
```

See:

```text
docs/IT_System_Check_and_Finetune_Guide.md
docs/System_Preparation_Guide.md
docs/System_Self_Check_Guide.md
```

## Production Gaps To Review

- Decide whether the current local SQLite live database is sufficient for the first deployment, or whether a hosted controlled database is required.
- Add real authentication and password/session security.
- Add HTTPS and deployment configuration.
- Add formal database backup, restore, and migration procedures.
- Add file upload storage and virus/malware scanning.
- Add external market data provider integration.
- Add broker/custodian data-load adapters.
- Add scheduled jobs for rebalance and drawdown alerts.
- Add notification service.
- Add full browser end-to-end tests.
- Add audit immutability and retention policy.

## Acceptance Questions

IT reviewers should confirm:

- Can the package run on a clean machine?
- Are dependencies documented clearly?
- Does `npm test` pass?
- Does `npm run self-check` generate readable output?
- Does the backend start on `localhost:8787`?
- Does the UI load from the backend server?
- Can a backend user login from the UI?
- What architecture changes are needed before production?
