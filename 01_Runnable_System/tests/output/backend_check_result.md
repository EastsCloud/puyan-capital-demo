# Backend Check Result

Generated at: 2026-07-30T10:34:09.025Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Admin login creates session | e192ac1b-c406-4fed-80d0-5b79aacd54a3 |
| PASS | Committee login creates session | 31f555c8-d247-44cb-b33b-ea1b5d5cae8d |
| PASS | Execution login creates session | 08cd9a75-325c-48de-b28a-0bc4360892bb |
| PASS | Backend session can be restored | system_admin |
| PASS | User can update own profile name | will_updated |
| PASS | Profile update response does not expose password hash | passwordHash hidden |
| PASS | Admin can create user | 84b564a5-ab9c-436e-9e80-49a6a7f274cd |
| PASS | Viewer cannot create target package | blocked with 403 |
| PASS | Decision committee can submit target package | 1713444e-11c2-4bab-ab07-03d57806f389 |
| PASS | Target package requires one decision committee approval | status Approved |
| PASS | Latest approved target preserves annual decision snapshot | 12 |
| PASS | Approved target snapshot preserves sleeve-specific risk-free rate | 0.5 |
| PASS | Approved target snapshot preserves regional allocation recommendation | 25 |
| PASS | Execution team can submit portfolio | 73e0c174-7307-4574-a6d4-d6a9579dcfb6 |
| PASS | Execution team cannot approve portfolio as committee | blocked with 403 |
| PASS | Portfolio requires one decision committee approval | status Approved |
| PASS | Latest approved portfolio can be reloaded | 73e0c174-7307-4574-a6d4-d6a9579dcfb6 |
| PASS | Latest approved portfolio preserves holdings | 4 holding row(s) |
| PASS | Latest approved portfolio ignores legacy non-equity implementation records | 73e0c174-7307-4574-a6d4-d6a9579dcfb6 |
| PASS | Execution team can import actual holdings | 20 row(s) |
| PASS | Latest imported holdings retain recoverable source text | 20 row(s) |
| PASS | Execution team can submit non-equity NAV | fb771cde-62a5-4cc3-9e42-49acb639cc3c |
| PASS | Execution team cannot approve non-equity NAV | blocked with 403 |
| PASS | Decision committee approves non-equity NAV | fb771cde-62a5-4cc3-9e42-49acb639cc3c |
| PASS | Latest approved non-equity NAV can be reloaded | fb771cde-62a5-4cc3-9e42-49acb639cc3c |
| PASS | Execution team can persist trade authorizations | 2 order(s) |
| PASS | Latest trade authorizations can be reloaded | 93ecb633-53c4-4852-9e9b-6f87298bcd25 |
| PASS | Trade authorization reload preserves committee decision | Approve |
| PASS | Viewer cannot save trade authorizations | blocked with 403 |
| PASS | Execution team can record formal report distribution | 6681a284-0ece-40a8-b115-a34ee742ee8d |
| PASS | Decision committee can reload the latest formal report distribution | 6681a284-0ece-40a8-b115-a34ee742ee8d |
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
| PASS | Decision committee cannot reset demo database | blocked with 403 |
| PASS | Administrator can reset demo database | Demo database restored to packaged defaults |
| PASS | Demo reset restores packaged role accounts | 3 users |
| PASS | Demo reset clears operational workflow records | targets, portfolios, and imports cleared |
| PASS | Demo reset invalidates existing sessions | no active sessions |
| PASS | Demo reset records a new audit event | allowed reset audit found |
