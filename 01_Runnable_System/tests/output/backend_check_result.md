# Backend Check Result

Generated at: 2026-07-26T09:04:25.912Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Admin login creates session | 1f788099-9246-466b-bae6-c3061371788d |
| PASS | Committee login creates session | 250e5188-04cf-4558-80a5-c7e236368f9d |
| PASS | Execution login creates session | 984288d1-abe1-499e-bf6e-16c5d6d369d2 |
| PASS | Backend session can be restored | system_admin |
| PASS | User can update own profile name | will_updated |
| PASS | Profile update response does not expose password hash | passwordHash hidden |
| PASS | Admin can create user | 4a30b979-7042-4d8e-94dd-348959176b2f |
| PASS | Viewer cannot create target package | blocked with 403 |
| PASS | Decision committee can submit target package | 21506ad5-305c-4e61-858d-62f1407e7cd7 |
| PASS | Target package requires one decision committee approval | status Approved |
| PASS | Latest approved target preserves annual decision snapshot | 12 |
| PASS | Approved target snapshot preserves sleeve-specific risk-free rate | 0.5 |
| PASS | Approved target snapshot preserves regional allocation recommendation | 25 |
| PASS | Execution team can submit portfolio | 5c4789fc-1fbf-40db-83b2-57a301265ce0 |
| PASS | Execution team cannot approve portfolio as committee | blocked with 403 |
| PASS | Portfolio requires one decision committee approval | status Approved |
| PASS | Latest approved portfolio can be reloaded | 5c4789fc-1fbf-40db-83b2-57a301265ce0 |
| PASS | Latest approved portfolio preserves holdings | 4 holding row(s) |
| PASS | Latest approved portfolio ignores legacy non-equity implementation records | 5c4789fc-1fbf-40db-83b2-57a301265ce0 |
| PASS | Execution team can import actual holdings | 20 row(s) |
| PASS | Latest imported holdings retain recoverable source text | 20 row(s) |
| PASS | Execution team can submit non-equity NAV | 325079ef-b0e5-4559-b428-4c7734afacf3 |
| PASS | Execution team cannot approve non-equity NAV | blocked with 403 |
| PASS | Decision committee approves non-equity NAV | 325079ef-b0e5-4559-b428-4c7734afacf3 |
| PASS | Latest approved non-equity NAV can be reloaded | 325079ef-b0e5-4559-b428-4c7734afacf3 |
| PASS | Execution team can persist trade authorizations | 2 order(s) |
| PASS | Latest trade authorizations can be reloaded | 3e7a77c3-16f2-4bbd-a503-ffdd970483a6 |
| PASS | Trade authorization reload preserves committee decision | Approve |
| PASS | Viewer cannot save trade authorizations | blocked with 403 |
| PASS | Execution team can record formal report distribution | fbdc7c9b-e116-49c3-9d2c-1f1c837d4919 |
| PASS | Decision committee can reload the latest formal report distribution | fbdc7c9b-e116-49c3-9d2c-1f1c837d4919 |
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
