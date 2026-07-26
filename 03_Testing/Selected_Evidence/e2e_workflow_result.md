# End-to-End Workflow Test Result

Generated at: 2026-07-23T04:46:03.040Z
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
| PASS | Login administrator | system_admin | session created | 9c09f118-3171-4341-8c3d-64c1c7ce3bba |
| PASS | Login decision committee approver | will | session created | 3874b44b-7e83-4b14-8cee-d1ca6a671ca4 |
| PASS | Login execution team approver | will1976 | session created | 8f285baf-2ad4-4ad9-b1ae-bab820a6524f |
| PASS | Restore saved backend session | will | session restored | Decision Committee |
| PASS | Create read-only reviewer | system_admin | viewer user created | d29291ed-4857-47b6-9aba-dfb2d6694654 |
| PASS | Block viewer from target submission | Business Reviewer | blocked as expected | Permission denied: Create target package requires decision |
| PASS | Submit target package | will | target package submitted | 6d5883a1-584f-4264-866c-9992940609c5 |
| PASS | Approve target package | will | one approval complete | Approved |
| PASS | Block execution team from committee approval | will1976 | blocked as expected | Permission denied: Approve target package requires decision |
| PASS | Submit optimized portfolio | will1976 | portfolio submitted | a707300f-061c-4bd7-a425-40be7721e3b1 |
| PASS | Approve portfolio | will | one approval complete | Approved |
| PASS | Load actual holdings | will1976 | holdings load recorded | 20 rows |
| PASS | Load actual trades | will1976 | trades load recorded | 1 rows |
| PASS | Load cash flows | will1976 | cash-flow load recorded | 2 rows |
| PASS | Pull audit log | will | audit log returned | 23 records |
| PASS | Audit includes blocked action | will | blocked action preserved | Blocked result found |
| PASS | Audit includes portfolio approval | will | portfolio approval preserved | Portfolio approval recorded |
| PASS | Persist approved target package | System | target package persisted | 6d5883a1-584f-4264-866c-9992940609c5 |
| PASS | Persist approved portfolio | System | portfolio persisted | a707300f-061c-4bd7-a425-40be7721e3b1 |
| PASS | Persist data load history | System | three data loads persisted | 3 data loads |
| PASS | Persist data load registry hashes | System | hashes persisted | all data loads hashed |

## Generated Records

- Target package ID: 6d5883a1-584f-4264-866c-9992940609c5
- Portfolio ID: a707300f-061c-4bd7-a425-40be7721e3b1
- Data load records: 3
- Audit records: 23

## Important Limitation

This E2E test verifies the backend workflow and persistence layer. Browser UI E2E testing should still be run in an environment where localhost browser automation is permitted.
