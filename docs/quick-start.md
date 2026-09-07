# Quick Start

## Repository contents

- `system/`: application source, database migrations, and automated tests.
- `docs/`: product, workflow, architecture, and verification documents.
- `RELEASE_STATUS.md`: verified scope, known limitations, and production boundary.
- `start_app.bat`: Windows launcher for a local review environment.

The public repository does not include a database snapshot, account credentials, API tokens, uploaded files, or generated build output.

## Windows launcher

Double-click `start_app.bat`. On the first run, the launcher prepares the local database, installs locked dependencies, applies migrations, and opens `http://localhost:5173/`.

Keep the terminal window open while using the application. Press `Ctrl+C` or close the window to stop the local services.

## Manual setup

1. Install Node.js 22 or later and pnpm 10.
2. Copy `system/.env.example` to `system/.env` and provide local values.
3. Start PostgreSQL, for example with `docker compose up -d postgres` inside `system/`.
4. Run `pnpm install` inside `system/`.
5. Run `pnpm --filter @isater/api migrate`.
6. Create the initial administrator using the documented bootstrap environment variables and `pnpm --filter @isater/api bootstrap-admin`.
7. Run `pnpm dev` and open `http://localhost:5173/`.

## EODHD setup

1. Configure an `EXTERNAL_CREDENTIAL_ENCRYPTION_KEY` of at least 32 random characters.
2. Sign in as System Administrator and enter the EODHD API token on the External Data Connection screen.
3. Save the credential and run the connection test.
4. Enable the provider only after the test returns real adjusted-price observations.
5. Never place the EODHD website password, API token, or encryption key in source code or documentation.

## Production reminder

Local review data is not production data. A real deployment requires managed PostgreSQL, HTTPS, backup and restore procedures, monitoring, production email delivery, licensed data credentials, and independent acceptance testing.
