# isater

isater is the independent production-system successor to the Teresa prototype.
The Teresa files remain outside this directory and are not modified by isater.

## Product boundary

- One proprietary investment portfolio in the first release
- Portfolio base currency is USD; the data model supports a currency per portfolio
- 4-10 named users with three roles: System Administrator, Decision Committee, Execution Team
- Responsive browser experience with full mobile operation and approval
- Chinese and English interface
- PostgreSQL persistence, server-side authorization, audit history, versioned parameters, notifications and scheduled jobs
- Public data sources first, with replaceable adapters for a paid data provider
- Five-year business-record retention

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Install packages with `pnpm install`.
4. Apply the SQL migrations in `db/migrations`.
5. Start the API and web app with `pnpm dev`.

No data, user account or browser state is imported from Teresa. Only approved business rules and default parameters will be migrated through versioned migrations.
