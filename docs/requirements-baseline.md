# isater Requirements Baseline

Status: Approved for implementation on 2026-08-01

## Deployment and access

- Cloud deployment with a Hong Kong region as the preferred production location.
- Users may sign in from mainland China, Hong Kong and the United States over the public internet.
- A company domain is available; exact DNS details will be supplied before production deployment.
- The application must support all operations and approvals on mobile devices.
- Interface and email content must switch between Chinese and English.
- The current Teresa prototype remains unchanged in its existing directory.

## Users and governance

- Expected concurrent organization size: 4-10 users.
- Roles are limited to System Administrator, Decision Committee and Execution Team.
- Every person has an individual account; public registration and shared accounts are prohibited.
- The System Administrator creates, disables and resets accounts but cannot perform investment work, vote or review trades.
- A committee decision requires at least two-thirds approval. A one-person committee can operate initially.
- Execution requires maker-checker separation: one user submits and a different Execution Team user reviews.
- Decision Committee members can inspect execution work in read-only mode where they do not own the action.

## Authentication

- Username and password only for the first release.
- Passwords require at least 12 characters and must contain letters and numbers.
- Initial passwords must be changed at first sign-in.
- Five failed attempts lock the account for 30 minutes.
- Sessions expire after 30 minutes without activity.
- Forgotten passwords are reset by the System Administrator.

## Portfolio and data

- The first release manages one proprietary portfolio with USD as its base currency.
- The model permits a separate base currency for each future portfolio.
- Approved equity and ETF markets are the United States, Japan, Hong Kong and China A-shares.
- Futu is the first daily broker-position import adapter; additional broker adapters must be pluggable.
- Bond market prices should be sourced automatically where available.
- Alternative-asset NAV is entered manually and becomes effective only after Decision Committee approval.
- Market prices update daily, macro data updates on source publication dates, and the annual allocation model is run manually once per year.
- The paid data provider will be named later. Public sources remain the initial adapter and paid adapters must not require business-logic changes.
- Only approved rules and default parameters migrate from Teresa. Test data and historical browser state do not migrate.

## Notifications, records and reports

- Notifications use in-app messages and email.
- Formal reports are viewed in the application and downloaded as PDF.
- Approvals, parameter versions, holdings, imports and audit events are retained for five years.
- Original broker import files are retained for five years.
- Database backups run daily. Daily backups are retained for 30 days and month-end backups for five years.
- Business dates, deadlines and scheduled jobs use Asia/Hong_Kong time.

## Delivery and acceptance

- Deliver source code, database schema, deployment guide, backup and restore guide, and test report.
- Run a one-month parallel trial before the new system becomes the sole formal record.
- The final four deployment inputs can be supplied later: domain details, cloud account, email service and paid data provider credentials.
# External market-data credential

- Initial provider: EODHD.
- Authentication uses the EODHD API Token, not the provider website password.
- Only system administrators can save, enable, test or remove the token.
- The token must be encrypted at rest and masked in every browser response, log and audit event.
- EODHD supplies primary adjusted-price history for securities, ETFs and indices; official macroeconomic sources remain separate.
