# Puyan Capital Control Center - Runnable Review Build

This is the runnable source for the 2026-07-23 colleague review package.

## Start

```bash
npm start
```

Open `http://localhost:8787`.

On first start, the local backend creates `server/data/db.sqlite`. Operational records are stored in normalized SQLite tables for users, sessions, targets, portfolios, holdings, approvals, imports, public data, report distributions, and audit history. The database is intentionally not included in this package, so reviewers begin from the packaged default system configuration and review accounts.

The reporting screen provides an investment-committee presentation layer with report period, valuation date, base currency, benchmark and active return, drawdown, data-quality status, and explicit methodology disclosures. The current attribution bridge remains a management-level explanation rather than formal Brinson or factor attribution.

## EODHD Personal Paid Connection

Copy `.env.example` to `.env`, set `EODHD_API_TOKEN`, and keep `PUBLIC_DATA_PROVIDER=eodhd`. The token is read only by the local data engine and is excluded by `.gitignore`. The packaged configuration targets the EOD Historical Data paid personal plan: it requests the full configured history and does not impose an additional per-run call limit. EODHD-supported securities never silently switch to another provider; the last successful cache is retained if a request fails. Yahoo is retained only for the exact Tokyo-listed securities because the subscribed EODHD account does not expose the Tokyo exchange. Do not commit or distribute `.env`.

## Test

```bash
npm test
npm run self-check
```

To independently query EODHD and prove that the current annual price and
statistics outputs are reproducible from external numbers, run:

```bash
npm run test:data-live
```

This live verification requires `EODHD_API_TOKEN`, consumes a small number of
API calls, does not write the token to its report, and is intentionally kept
separate from the normal offline test suite.

Read `../04_Release_Status/Current_Review_Status_20260723.md` for the scope and date of prior review evidence. Run the current tests before relying on an older status note.

## Security Note

The included accounts are local review accounts. Replace their passwords before any non-test use. This code does not provide production authentication, secrets management, hosting security, or broker connectivity.
