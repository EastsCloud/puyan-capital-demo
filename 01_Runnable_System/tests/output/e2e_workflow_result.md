# End-to-End Workflow Test Result

Generated at: 2026-07-30T10:34:09.398Z
Overall status: PASS

Summary: 21 passed, 0 failed.

## Scope

This E2E test exercises the current local backend foundation and workflow sequence:

1. Backend user login and session restore.
2. System administrator user management.
3. Unauthorized user blocking.
4. Target package submission and one decision committee approval.
5. Portfolio submission by execution team.
6. Portfolio approval by one decision committee approver.
7. External holdings, trades, and cash-flow import records.
8. Compliance audit log pull.
9. Persistence through the backend storage layer.

## Step Results

| Status | Step | Actor | Detail | Evidence |
| --- | --- | --- | --- | --- |
| PASS | Login administrator | system_admin | session created | b273beb1-38b2-472f-8ac1-ef4dd413a37f |
| PASS | Login decision committee approver | will | session created | fe7ed21b-6b26-4648-a911-78553b10f3b0 |
| PASS | Login execution team approver | will1976 | session created | 0f31bcc4-0e72-4138-9120-ea7f3659e0ae |
| PASS | Restore saved backend session | will | session restored | Decision Committee |
| PASS | Create read-only reviewer | system_admin | viewer user created | e12160aa-e037-4a18-bfeb-2ed38c04987a |
| PASS | Block viewer from target submission | Business Reviewer | blocked as expected | Permission denied: Create target package requires decision |
| PASS | Submit target package | will | target package submitted | 7d9f1582-4ba7-4e68-9aa6-04e1d80aee4a |
| PASS | Approve target package | will | one approval complete | Approved |
| PASS | Block execution team from committee approval | will1976 | blocked as expected | Permission denied: Approve target package requires decision |
| PASS | Submit optimized portfolio | will1976 | portfolio submitted | 3a4784d0-b1f1-4ede-bef8-f0cf68d2fd93 |
| PASS | Approve portfolio | will | one approval complete | Approved |
| PASS | Load actual holdings | will1976 | holdings load recorded | 20 rows |
| PASS | Load actual trades | will1976 | trades load recorded | 1 rows |
| PASS | Load cash flows | will1976 | cash-flow load recorded | 2 rows |
| PASS | Pull audit log | will | audit log returned | 23 records |
| PASS | Audit includes blocked action | will | blocked action preserved | Blocked result found |
| PASS | Audit includes portfolio approval | will | portfolio approval preserved | Portfolio approval recorded |
| PASS | Persist approved target package | System | target package persisted | 7d9f1582-4ba7-4e68-9aa6-04e1d80aee4a |
| PASS | Persist approved portfolio | System | portfolio persisted | 3a4784d0-b1f1-4ede-bef8-f0cf68d2fd93 |
| PASS | Persist data load history | System | three data loads persisted | 3 data loads |
| PASS | Persist data load registry hashes | System | hashes persisted | all data loads hashed |

## Generated Records

- Target package ID: 7d9f1582-4ba7-4e68-9aa6-04e1d80aee4a
- Portfolio ID: 3a4784d0-b1f1-4ede-bef8-f0cf68d2fd93
- Data load records: 3
- Audit records: 23

## Important Limitation

This E2E test verifies the backend workflow and persistence layer. Browser UI E2E testing should still be run in an environment where localhost browser automation is permitted.
