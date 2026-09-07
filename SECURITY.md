# Security Policy

## Public repository boundary

This repository contains application source code and documentation only. It must not contain:

- production environment files or database URLs;
- EODHD, FRED, SMTP or other API credentials;
- administrator passwords or reusable demo passwords;
- database snapshots, uploaded files, holdings, trades or personal data;
- Render or DNS account credentials.

Use `system/.env.example` as a field reference and keep actual values in local or hosting-provider secret storage.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials or personal data. Contact the repository owner privately and include the affected component, reproduction steps and expected impact.

## Scope

The public deployment is a demonstration environment. It is not presented as a production trading or custody system.
