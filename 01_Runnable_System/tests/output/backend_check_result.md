# Backend Check Result

Generated at: 2026-07-24T10:05:23.273Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Admin login creates session | a0a9d837-51aa-48c4-8b64-e967789f2504 |
| PASS | Committee login creates session | 089bd51d-cd06-4d4d-930e-ae6c7bbfdde5 |
| PASS | Execution login creates session | 732798d8-b8d2-4411-917f-7aea9cd33879 |
| PASS | Backend session can be restored | system_admin |
| PASS | User can update own profile name | will_updated |
| PASS | Profile update response does not expose password hash | passwordHash hidden |
| PASS | Admin can create user | 7197f5bc-ffc3-4f4d-b33a-9df0f82b197f |
| PASS | Viewer cannot create target package | blocked with 403 |
| PASS | Decision committee can submit target package | 9ba34c88-a0b9-4419-a711-8c9a1fdb8d71 |
| PASS | Target package requires one decision committee approval | status Approved |
| PASS | Latest approved target preserves annual decision snapshot | 12 |
| PASS | Approved target snapshot preserves sleeve-specific risk-free rate | 0.5 |
| PASS | Approved target snapshot preserves regional allocation recommendation | 25 |
| PASS | Execution team can submit portfolio | 2ad731aa-0a80-4abc-8bc4-ae23f9eaf466 |
| PASS | Execution team cannot approve portfolio as committee | blocked with 403 |
| PASS | Portfolio requires one decision committee approval | status Approved |
| PASS | Latest approved portfolio can be reloaded | 2ad731aa-0a80-4abc-8bc4-ae23f9eaf466 |
| PASS | Latest approved portfolio preserves holdings | 4 holding row(s) |
| PASS | Latest approved portfolio ignores legacy non-equity implementation records | 2ad731aa-0a80-4abc-8bc4-ae23f9eaf466 |
| PASS | Execution team can import actual holdings | 20 row(s) |
| PASS | Latest imported holdings retain recoverable source text | 20 row(s) |
| PASS | Execution team can submit non-equity NAV | d0434385-fa9e-409d-9415-e8c4955c5056 |
| PASS | Execution team cannot approve non-equity NAV | blocked with 403 |
| PASS | Decision committee approves non-equity NAV | d0434385-fa9e-409d-9415-e8c4955c5056 |
| PASS | Latest approved non-equity NAV can be reloaded | d0434385-fa9e-409d-9415-e8c4955c5056 |
| PASS | Execution team can persist trade authorizations | 2 order(s) |
| PASS | Latest trade authorizations can be reloaded | 99369cb8-c117-4dd8-ac9b-8015f296ed20 |
| PASS | Trade authorization reload preserves committee decision | Approve |
| PASS | Viewer cannot save trade authorizations | blocked with 403 |
| PASS | Execution team can record formal report distribution | 17e0e708-3642-4155-82f7-e17860954991 |
| PASS | Decision committee can reload the latest formal report distribution | 17e0e708-3642-4155-82f7-e17860954991 |
| PASS | Report distribution preserves recipient group | Decision Committee |
| PASS | Decision committee cannot submit formal report distribution | blocked with 403 |
| PASS | Decision committee can record annual public data cache metadata | 53 incremental tickers |
| PASS | Public data cache response summarizes stored source snapshot | content hash returned |
| PASS | Latest public data cache can be read | 2026-07-14 |
| PASS | Public data cache API response does not expose raw snapshot | raw text hidden |
| PASS | Execution team can read approved annual public data cache when explicitly requested | raw cached CSV available |
| PASS | Audit log records blocked action | blocked action found |
| PASS | Audit log records target approval | target approval found |
| PASS | Audit log records data load | data load found |
| PASS | Database persists target packages | 1 target package |
| PASS | Database persists portfolios | 2 portfolio records including the legacy filter regression case |
| PASS | Database persists imports | 1 import |
| PASS | Database stores import content hash | 41dde28908 |
| PASS | Database persists non-equity NAV packages | 1 NAV package |
| PASS | Database persists trade authorization packages | 1 trade authorization package |
| PASS | Database persists formal report distributions | 1 report distribution |
| PASS | Database persists public data cache history | 1 refresh record |
| PASS | Database stores latest public data source snapshot | historical price snapshot retained |
| PASS | Database persists profile name update | will_updated |
| PASS | Database persists profile password hash | 937377f056 |
