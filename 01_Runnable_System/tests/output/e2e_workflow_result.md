# End-to-End Workflow Test Result

Generated at: 2026-07-26T09:04:26.374Z
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
| PASS | Login administrator | system_admin | session created | cc3c6f2f-b2f3-42b4-ac5d-0e2683722cb6 |
| PASS | Login decision committee approver | will | session created | 4590fe5f-082c-421e-aa7d-dd588c0b0b68 |
| PASS | Login execution team approver | will1976 | session created | f5c7d149-c83d-4694-805f-d9b356e65512 |
| PASS | Restore saved backend session | will | session restored | Decision Committee |
| PASS | Create read-only reviewer | system_admin | viewer user created | 0b6f84b2-f1c9-4eff-8416-435c25ff93f8 |
| PASS | Block viewer from target submission | Business Reviewer | blocked as expected | Permission denied: Create target package requires decision |
| PASS | Submit target package | will | target package submitted | 2012e6ca-4443-42ff-a354-5a0d683c71b9 |
| PASS | Approve target package | will | one approval complete | Approved |
| PASS | Block execution team from committee approval | will1976 | blocked as expected | Permission denied: Approve target package requires decision |
| PASS | Submit optimized portfolio | will1976 | portfolio submitted | 6ec6028c-c446-4b41-b54d-cb6c0d4065cb |
| PASS | Approve portfolio | will | one approval complete | Approved |
| PASS | Load actual holdings | will1976 | holdings load recorded | 20 rows |
| PASS | Load actual trades | will1976 | trades load recorded | 1 rows |
| PASS | Load cash flows | will1976 | cash-flow load recorded | 2 rows |
| PASS | Pull audit log | will | audit log returned | 23 records |
| PASS | Audit includes blocked action | will | blocked action preserved | Blocked result found |
| PASS | Audit includes portfolio approval | will | portfolio approval preserved | Portfolio approval recorded |
| PASS | Persist approved target package | System | target package persisted | 2012e6ca-4443-42ff-a354-5a0d683c71b9 |
| PASS | Persist approved portfolio | System | portfolio persisted | 6ec6028c-c446-4b41-b54d-cb6c0d4065cb |
| PASS | Persist data load history | System | three data loads persisted | 3 data loads |
| PASS | Persist data load registry hashes | System | hashes persisted | all data loads hashed |

## Generated Records

- Target package ID: 2012e6ca-4443-42ff-a354-5a0d683c71b9
- Portfolio ID: 6ec6028c-c446-4b41-b54d-cb6c0d4065cb
- Data load records: 3
- Audit records: 23

## Important Limitation

This E2E test verifies the backend workflow and persistence layer. Browser UI E2E testing should still be run in an environment where localhost browser automation is permitted.
