# SQLite Live Store Check Result

Generated at: 2026-07-24T10:05:24.874Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Legacy JSON source is available for migration | 3 user(s) |
| PASS | Store uses SQLite persistence for .sqlite path | sqlite |
| PASS | All default users can log in from SQLite | 3 sessions created |
| PASS | Approved portfolio reloads from SQLite after reopening store | 1cb8fc2a-ad3f-4022-a1c4-4b50c56be553 |
| PASS | Approved non-equity NAV reloads from normalized SQLite | Approved |
| PASS | Trade orders reload from normalized child rows | 2 order(s) |
| PASS | Report distribution reloads from normalized SQLite | Sent to Committee |
| PASS | Imported source text reloads from its dedicated SQLite column | 56 character(s) |
| PASS | Public data raw series reloads from normalized data-set rows | 0c881d77-0df0-4d96-8ad9-041bf59467d5 |
| PASS | SQLite live database file exists | E:\Investment Management Tool\Puyan\01_Runnable_System\tests\output\sqlite_live_store_check_db.sqlite |
| PASS | SQLite app_state table stores current live state | 1 |
| PASS | SQLite keeps rolling state backups | 10 |
| PASS | SQLite persistence metadata records last write | application save |
| PASS | SQLite normalized schema version is recorded | 1 |
| PASS | Users are stored in a dedicated live table | 3 |
| PASS | Sessions are stored in a dedicated live table | 5 |
| PASS | Target packages are stored in a dedicated live table | 1 |
| PASS | Portfolios are stored in a dedicated live table | 1 |
| PASS | Portfolio holdings are normalized into child rows | 4 |
| PASS | Import records are stored in a dedicated live table | 1 |
| PASS | Non-equity NAV is stored in a dedicated live table | 1 |
| PASS | Trade authorization packages use a dedicated live table | 1 |
| PASS | Trade orders are normalized into child rows | 2 |
| PASS | Report distributions use a dedicated live table | 1 |
| PASS | Public-data refreshes use a dedicated live table | 1 |
| PASS | Public-data sets use normalized child rows | 2 |
| PASS | Audit events are stored in a dedicated live table | 25 |
| PASS | Relational audit snapshot can be exported from live SQLite | E:\Investment Management Tool\Puyan\01_Runnable_System\tests\output\sqlite_live_store_audit_snapshot.sqlite |
| PASS | Audit snapshot contains portfolio rows | 1 |
