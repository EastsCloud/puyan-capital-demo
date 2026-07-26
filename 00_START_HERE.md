# Puyan Capital Control Center - Colleague Review Package

Package date: 2026-07-23

Package purpose: colleague review, source inspection, local operation, and follow-up development. This is not a production release or a completed acceptance package.

## What Is Included

- Current runnable local system source: `01_Runnable_System`
- Business workflow, user, logic, public-data, and IT documents: `02_Documentation`
- Test scripts and selected test evidence: `03_Testing`
- Current release status and known limitation: `04_Release_Status`

## What Is Deliberately Excluded

- No demo video or video claim.
- No local test database, browser cache, audit database, or machine-specific log.
- No paid-data credentials, broker credentials, or production secrets.

## Run Locally

1. Open a terminal in `01_Runnable_System`.
2. Run `npm start`.
3. Open `http://localhost:8787`.

The backend creates a fresh local database on first start. It contains only the review accounts and default parameter values.

## Review Accounts

These are local review credentials only. Change them before any non-test use.

| Role | User name | Password |
| --- | --- | --- |
| System Administrator | `system_admin` | `admin000` |
| Decision Committee | `will` | `141242` |
| Execution Team | `will1976` | `517518` |

## Current Review Status

The core workflow through report generation is included. The report-distribution handoff is stored in the backend: after the Execution Team sends the formal report, the Decision Committee can refresh, log in again, and still see `Sent to Committee` and the Annual Review state. The Committee view is read-only for this handoff.

This remains a colleague review build, not a fully tested formal release. Read `04_Release_Status/Current_Review_Status_20260723.md` and `03_Testing/Report_Distribution_Persistence_Retest_20260723.md` before testing.
