# Backend Check Result

Generated at: 2026-07-23T05:51:00.357Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Admin login creates session | b2d2fabb-cecb-46b4-a0ed-187090b39816 |
| PASS | Committee login creates session | 1e3e5906-cec7-49a2-bdc4-20d40bdf2d82 |
| PASS | Execution login creates session | 94a8e23b-5147-47b7-975b-4553e1530b2a |
| PASS | Backend session can be restored | system_admin |
| PASS | User can update own profile name | will_updated |
| PASS | Profile update response does not expose password hash | passwordHash hidden |
| PASS | Admin can create user | de4a2a3c-adfd-4ecc-b208-4be1251d727b |
| PASS | Viewer cannot create target package | blocked with 403 |
| PASS | Decision committee can submit target package | 614d5c76-7a62-4d8d-a55c-b2200d5c670b |
| PASS | Target package requires one decision committee approval | status Approved |
| PASS | Latest approved target preserves annual decision snapshot | 12 |
| PASS | Approved target snapshot preserves sleeve-specific risk-free rate | 0.5 |
| PASS | Approved target snapshot preserves regional allocation recommendation | 25 |
| PASS | Execution team can submit portfolio | e33887b6-1a1d-4ebe-86e2-0b1373ba7496 |
| PASS | Execution team cannot approve portfolio as committee | blocked with 403 |
| PASS | Portfolio requires one decision committee approval | status Approved |
| PASS | Latest approved portfolio can be reloaded | e33887b6-1a1d-4ebe-86e2-0b1373ba7496 |
| PASS | Latest approved portfolio preserves holdings | 4 holding row(s) |
| PASS | Latest approved portfolio ignores legacy non-equity implementation records | e33887b6-1a1d-4ebe-86e2-0b1373ba7496 |
| PASS | Execution team can import actual holdings | 20 row(s) |
| PASS | Latest imported holdings retain recoverable source text | 20 row(s) |
| PASS | Execution team can submit non-equity NAV | 4b0c273f-23ae-44b4-9464-7547993577de |
| PASS | Execution team cannot approve non-equity NAV | blocked with 403 |
| PASS | Decision committee approves non-equity NAV | 4b0c273f-23ae-44b4-9464-7547993577de |
| PASS | Latest approved non-equity NAV can be reloaded | 4b0c273f-23ae-44b4-9464-7547993577de |
| PASS | Execution team can persist trade authorizations | 2 order(s) |
| PASS | Latest trade authorizations can be reloaded | b872b28a-6d47-4550-a6a4-da91df6fc72f |
| PASS | Trade authorization reload preserves committee decision | Approve |
| PASS | Viewer cannot save trade authorizations | blocked with 403 |
| PASS | Execution team can record formal report distribution | 7eed79f6-4d9f-46c5-a5f4-b3a082bdacce |
| PASS | Decision committee can reload the latest formal report distribution | 7eed79f6-4d9f-46c5-a5f4-b3a082bdacce |
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
