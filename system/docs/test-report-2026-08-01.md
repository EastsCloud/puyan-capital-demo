# isater Incremental Test Report

Test date: 2026-08-01  
Environment: local development system with a persistent embedded PostgreSQL-compatible database  
Scope: foundation, authentication, user administration, role visibility, parameter activation and responsive navigation

## Test method

- The browser test used visible form fields and buttons in the same order as a user.
- Accounts were not inserted directly after the initial bootstrap administrator. The committee and execution accounts were created through the administrator page.
- Password changes, sign-outs and parameter activation were submitted through the web application and confirmed in API logs and persisted data.
- Production remains configured for PostgreSQL. The embedded database mode exists only to make local, repeatable integration testing possible without a separate database installation.

## Executed cases

| ID | Case | Result |
| --- | --- | --- |
| E2E-001 | Bootstrap administrator signs in with a temporary password | Pass |
| E2E-002 | First sign-in is blocked at mandatory password change | Pass |
| E2E-003 | Administrator changes password and enters the workspace | Pass |
| E2E-004 | Administrator creates one committee user and two execution users | Pass |
| E2E-005 | Committee user signs in, changes password and cannot see administrator functions | Pass |
| E2E-006 | Execution user signs in, changes password and cannot see administrator functions | Pass |
| E2E-007 | Mobile menu opens and navigates to the annual cycle page | Pass |
| E2E-008 | Mobile layout has no horizontal document overflow | Pass |
| E2E-009 | Administrator loads approved defaults and activates parameter version 1 | Pass |
| E2E-010 | Sign-out revokes the server session and returns to sign-in | Pass after correction |
| E2E-011 | Committee activates USD 10,000,000 initial principal from the first page | Pass |
| E2E-012 | Committee starts the 2026 annual cycle only after principal and parameters are effective | Pass |

## Defects found and corrected

### D-001: audit request identifier rejected valid sign-in

- Symptom: password verification succeeded, but the login transaction rolled back.
- Cause: the audit table required a UUID while Fastify generated request IDs such as `req-3`.
- Correction: migration `0006_audit_request_identifier.sql` changes the audit request identifier to text.
- Retest: administrator, committee and execution login transactions completed and audit records were written.

### D-002: apparent sign-out did not revoke the server session

- Symptom: the interface returned to sign-in, but the API rejected an empty JSON body before the logout handler ran.
- Cause: the shared web request helper added `Content-Type: application/json` even when no body existed.
- Correction: the header is now added only for requests containing a body.
- Retest: `POST /api/auth/logout` returned HTTP 200 and revoked the session.

### D-003: local database socket adapter was not reliable

- Symptom: standard PostgreSQL client connections to the PGlite socket terminated during migration.
- Cause: incompatibility in the optional local TCP adapter under the current Node runtime.
- Correction: local integration mode connects directly to the embedded PostgreSQL-compatible engine; production continues to use the normal PostgreSQL driver.
- Retest: all six migrations were applied to persistent storage, bootstrap data was created and web transactions persisted.

### D-004: local migration query result counted existing rows as zero

- Symptom: the migration runner attempted to reapply completed migrations.
- Cause: the adapter prioritized `affectedRows = 0` over returned SELECT rows.
- Correction: SELECT row count now takes precedence.
- Retest: the runner skipped versions 1-5 and applied only version 6.

## Test accounts

The names used in this report belong to a local development dataset only. Temporary and changed passwords are not delivery credentials. Production bootstrap must generate new temporary passwords and require every user to change them.

## Current acceptance boundary

The tested foundation is suitable for continued implementation. It is not yet a production acceptance test of the complete investment lifecycle. The annual cycle is now persisted at its first `annual_data` step. Public-data ingestion, target approval, sleeve construction, proposed portfolio, backtest, separated-sleeve optimization, committee portfolio approval, maker-checker execution, monitoring, non-equity NAV approval, attribution, PDF reporting, notifications, backup and cloud deployment remain to be completed and tested.
