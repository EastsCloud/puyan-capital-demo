# Puyan Capital Investment Control Center

A portfolio-governance and investment-operations platform designed for a small investment team. The application connects annual market-data review, return targets, asset sleeves, proposed portfolios, historical backtesting, optimization, committee approval, trade implementation, monitoring, non-equity NAV, reporting, and attribution in one auditable workflow.

Live demo: [demo.puyancapital.com](https://demo.puyancapital.com)

> This repository is published as a software-engineering portfolio project. It is not investment advice and is not presented as a production trading, custody, or order-execution system. Demo credentials and provider secrets are never stored in this repository.

## Highlights

- Three server-enforced roles: System Administrator, Decision Committee, and Execution Team
- State-controlled 11-step annual investment workflow
- External-data adapters with source provenance and fallback records
- Multi-market portfolio construction, beta and drawdown controls, historical backtesting, and optimization
- Committee voting, execution-team maker-checker review, and immutable audit events
- CSV imports for proposed holdings, executed fills, current positions, and external cash flows
- Import preview, row selection, security lookup, exchange normalization, and plan-versus-fill reconciliation
- Saved-versus-draft proposed portfolios, replace/merge imports, explicit confirmation, and organization-scoped security registration
- Explicit CSV weight basis, live security/venue checks, and all-security historical-price preflight diagnostics
- Per-run execution confirmation using checked-price snapshots, immutable database evidence, and short-history disclosures
- Memory-bounded background optimization with durable progress, duplicate protection, and independent risk revalidation
- Pre-approval portfolio revision without reset, explicit modified/unchanged states, version comparison, and persisted failure diagnostics
- Effective-dated parameters, versioned reports, performance attribution, delivery records, and import registry
- Responsive Chinese/English interface for desktop and mobile browsers

## Technology

- **Web:** React 19, TypeScript, Vite
- **API:** Node.js, Fastify, Zod
- **Database:** PostgreSQL with versioned SQL migrations
- **Security:** Argon2id passwords, HttpOnly sessions, API-side authorization, AES-256-GCM credential encryption
- **Engineering:** pnpm workspaces, Vitest, production builds, Render deployment blueprint

```text
system/
  apps/web/          React client
  apps/api/          Fastify API, authentication, workflows, and data adapters
  packages/domain/   Framework-independent business rules and role policies
  db/migrations/     Versioned PostgreSQL migrations
docs/                Product, architecture, workflow, and verification documents
```

See [Architecture](docs/architecture.md) and [Business Flow and Calculation Logic](docs/business-flow-and-logic.md) for more detail.

See [Proposed Portfolio Import](docs/proposed-portfolio-import.md) for the saved-data, preview, draft, submission, and missing-security workflow.
See [Historical Data Coverage](docs/historical-data-coverage.md) for provider selection, completed-week alignment, the standard history gate, and explicit short-history exceptions.
See [Bounded Background Optimization](docs/optimizer-search.md) for search budgets, worker isolation, job recovery, validation, and model limitations.
See [Portfolio Iterations](docs/proposal-iterations.md) for repeatable proposal editing, backtesting, historical comparisons, and task-error diagnosis.

## Local setup

Prerequisites: Node.js 22+, pnpm 10, and PostgreSQL.

1. Copy `system/.env.example` to `system/.env` and provide local-only values.
2. Run `pnpm install` inside `system/`.
3. Run `pnpm --filter @isater/api migrate`.
4. Follow [Quick Start](docs/quick-start.md) to launch the API and web client.

API tokens, administrator bootstrap passwords, production database URLs, and encryption keys must be supplied through local or hosting-provider secret storage and must never be committed.

## Verification

Run from `system/`:

```bash
pnpm check
```

This runs type checking, automated tests, and the production build. Manual acceptance coverage and known limitations are documented in [Release Status](RELEASE_STATUS.md).

## Repository policy

- This public repository is the portfolio/showcase mirror.
- Production deployment continues from a separate private repository.
- The public mirror excludes production environment values, real accounts, databases, holdings, trades, uploaded files, and customer data.
- See [Repository Workflow](docs/repository-workflow.md) for the dual-repository process.

## License and use

Source is available for portfolio review and technical evaluation. Unless the repository owner grants separate permission, no right is granted to copy, redistribute, or use the project commercially.
