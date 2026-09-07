# isater Implementation Progress

Last updated: 2026-08-05

## Naming boundary

- Teresa: the existing prototype in the parent directory.
- isater: the independent production-system project in this directory.
- No Teresa test data, accounts, sessions or browser storage are copied into isater.

## Completed foundation

- Approved requirements baseline covering deployment, roles, mobile access, language, security, data, retention and delivery.
- Modular-monolith architecture for a 4-10 user investment organization.
- PostgreSQL foundation schema, immutable audit events, versioned parameters, workflow cases, approval voting and maker-checker records.
- Investment record schema for annual data, target return, sleeve targets, proposed portfolios, backtests, optimization, market observations and Futu position snapshots.
- Server-side role permissions for System Administrator, Decision Committee and Execution Team.
- Two-thirds committee voting, including an initial one-person committee.
- Maker-checker rule requiring different Execution Team users.
- Argon2id password hashing, forced initial password change, failed-login lockout and 30-minute idle sessions.
- Administrator-only user creation; no public registration route.
- Responsive Chinese/English login and workspace shell for desktop and mobile browsers.
- Versioned business calculations for target return, sleeve decomposition, market-specific CAPM and backtest controls.
- Persistent local integration database mode using the same migrations and SQL as production PostgreSQL.
- Real first-login password-change screen and server-side password-change gate.
- Administrator user-maintenance screen with real account creation.
- Classified parameter-maintenance screen with system defaults, activation, version and immutable audit record.
- Committee-controlled initial portfolio principal on the first page.
- Persisted annual-cycle start with prerequisite and duplicate-cycle controls.
- Priority-ordered public-data source chains with failure provenance and no sample-data fallback.
- Historical scenario calibration, annual allocation recommendation and committee approval.
- Approved target-return floor, sleeve decomposition and market-specific CAPM targets.
- Approved four-market ticker universe restricted to U.S., Japan, Hong Kong and China A shares.
- In-system proposed-portfolio construction with style counts, sleeve totals and single-name limits.
- Three-year weekly real-price backtest using sleeve-consistent benchmarks and persisted observations.
- Sleeve-separated optimizer that changes existing weights first, searches the approved universe by minimum ticker replacements only when necessary, and combines all failed sleeves into three complete passing plans.
- Annual allocation parameters used by the live engine are administrator-maintained and versioned; every annual run stores the parameter version and policy snapshot.
- Bond and cash prospective returns use current market yields as carry proxies; no unapproved duration adjustment is applied.
- Execution-team submission followed by committee-only portfolio vote.
- Standardized equity trade plan and two-person execution-team maker-checker control.
- Daily validated Futu-position import with approved-ticker reconciliation, same-day correction, five-year source retention and an equity-value curve.
- Monthly style-level corridor checks using equity-normalized targets, minimum-trade calculations and two standardized rebalance plans.
- Three-trading-day rebalance completion deadline, execution-team plan acceptance, automatic due-date position reconciliation, persisted follow-up records and in-app escalation.
- Versioned non-equity NAV submission and Decision Committee approval.
- Three-screen on-page report, PDF download, report versioning and publication.
- Report controls that suppress unstable Sharpe and Sortino values until 20 effective position dates exist.
- Versioned same-period USD benchmark series and Brinson-Fachler attribution separating market, allocation, security selection and interaction, with non-equity contribution shown separately.
- Live standalone Monitoring and Reports navigation pages.
- Dedicated approved-portfolio page showing the effective version, principal, three sleeves, market/style classification and approved security weights.
- Administrator-only audit page backed by immutable audit events, with business-language labels and collapsed technical detail.
- Clickable 01-11 annual-workflow navigation: completed steps reopen saved results in read-only mode, the current step retains role-controlled actions, and future steps remain locked.

## Verification completed

- Type checking passed for domain, API and web projects.
- Twenty-one domain-rule tests passed.
- Nine API migration, security, monitoring and reporting tests passed.
- Production builds passed for API, domain and web projects.
- Desktop and mobile browser layout checks found no horizontal overflow.
- Chinese/English switch and login-error interaction were clicked and verified in a real browser.
- Fifteen database migrations were applied to persistent integration storage.
- Administrator, committee and execution accounts were signed in and changed passwords through real page controls.
- One committee and two execution accounts were created through the administrator page.
- Role-specific navigation and mobile menu navigation were clicked and verified.
- Parameter version 1 was activated through the administrator page.
- The committee activated USD 10,000,000 initial principal through the first page.
- The committee started the 2026 annual cycle through the annual workflow page.
- Server-side logout and session revocation were verified after correcting an empty-body request defect.
- Detailed evidence and corrected defects are recorded in `docs/test-report-2026-08-01.md`.
- A second real-click run reached monitoring and is recorded in `docs/test-report-2026-08-03.md`.
- A clean-database real-click run completed from administrator setup through report publication and is recorded in `docs/test-report-2026-08-04.md`.
- The accepted rebalance plan was then tested on its due date: an out-of-range import produced overdue alerts, and a corrected import produced completion alerts for both execution and committee users.
- The committee opened the dedicated approved-portfolio page and verified all 12 approved holdings, including the selected emerging-market optimization weights.
- The system administrator opened the audit page and verified 67 immutable records with actor, action, object, result and timestamp.
- The execution team regenerated and published a monitoring report through real page controls. Versioned SPY, EWJ, ASHR and EWH adjusted-price series produced market `+0.91%`, allocation `-0.60%`, selection `-0.31%`, interaction approximately `0.00%` and a fully reconciled `0.00%` total return.
- The administrator, committee and execution-team accounts each clicked the new annual-workflow navigation. Historical public data, target return, proposed holdings, backtest and optimization results reopened without action buttons; future steps stayed disabled and the execution team's current monitoring actions remained available.

## Remaining implementation

- Run the proven migrations against the selected cloud PostgreSQL service and add production-service integration tests.
- Connect the Futu adapter to the final production export variants and add fixtures from the organization's actual account.
- Add production email delivery and a background retry worker for queued notification emails.
- Add cloud deployment, backup/restore, email delivery, security checks and production-service integration testing.

## Deferred production inputs

- Company domain details
- Hong Kong cloud account
- Company email delivery service
- Paid market-data provider and credentials
# EODHD integration update — 2026-08-05

- Added an administrator-only External Data Connection screen for saving, enabling, testing, disabling, and deleting an EODHD API token.
- Tokens are encrypted by the API with AES-256-GCM; the browser sees only the last four characters and credential operations create immutable audit events.
- Backtests, optimizer histories, and reporting benchmarks prefer EODHD adjusted prices and retain the public adapter as a recorded fallback.
- Added versioned migrations and adapter tests. A mocked adapter test must never be reported as proof of a live provider connection.
