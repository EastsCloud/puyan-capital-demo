# isater Architecture

## Design goals

isater is a small-organization production system, not a distributed enterprise platform. It uses a modular monolith so that business transactions, approvals and audit events remain consistent while deployment stays understandable for a small IT team.

## Components

- `apps/web`: responsive React application for desktop and mobile browsers.
- `apps/api`: Fastify service for authentication, authorization, workflows, files, notifications and reports.
- `packages/domain`: framework-independent business rules and role policies.
- `db/migrations`: PostgreSQL schema and versioned default parameters.
- `deploy`: cloud deployment, backup and operational configuration.

## Production principles

- PostgreSQL is the system of record.
- Authorization is enforced by the API, never only by hiding a button.
- Session tokens are random, stored only as hashes, and sent in secure HTTP-only cookies.
- Passwords use Argon2id rather than the SHA-256 prototype implementation.
- Every state-changing request writes an immutable audit event in the same database transaction.
- All approvals are version-bound. Approving an old version cannot activate a newer changed record.
- Business configuration is effective-dated and versioned.
- External data enters through adapters and retains source, observation date, retrieval date and checksum.
- Uploaded source files are immutable records and are never treated as executable content.
- The web app contains no database credentials or data-provider secrets.
- External provider tokens are encrypted at rest with AES-256-GCM. Production requires a separate `EXTERNAL_CREDENTIAL_ENCRYPTION_KEY`; tokens are decrypted only inside the API process and are never returned to the browser or written to audit detail.
- EODHD is the primary adapter for security, ETF and index adjusted-price history. The existing public adapter remains a recorded fallback. Official macroeconomic adapters remain independent.

## Portability

Runtime configuration is supplied through environment variables. The same build can move from local testing to a Hong Kong cloud deployment without changing business code. PostgreSQL backups and object-file manifests support migration to a different cloud provider.
