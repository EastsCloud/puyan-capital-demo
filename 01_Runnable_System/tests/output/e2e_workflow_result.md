# End-to-End Workflow Test Result

Generated at: 2026-07-24T10:05:23.670Z
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
| PASS | Login administrator | system_admin | session created | 8e60c2ae-2091-4c49-9798-770bfa499d5e |
| PASS | Login decision committee approver | will | session created | da28c3b0-5e59-4f0c-ae81-be708ebfb107 |
| PASS | Login execution team approver | will1976 | session created | 5f2bff31-0c17-4312-aed1-3960a9d7d9ca |
| PASS | Restore saved backend session | will | session restored | Decision Committee |
| PASS | Create read-only reviewer | system_admin | viewer user created | d687cf99-937f-46ab-8849-8750e0bfcf5e |
| PASS | Block viewer from target submission | Business Reviewer | blocked as expected | Permission denied: Create target package requires decision |
| PASS | Submit target package | will | target package submitted | ceae2007-fff3-4e7e-adc4-e6797c5c5ea7 |
| PASS | Approve target package | will | one approval complete | Approved |
| PASS | Block execution team from committee approval | will1976 | blocked as expected | Permission denied: Approve target package requires decision |
| PASS | Submit optimized portfolio | will1976 | portfolio submitted | f859b7de-4982-4d45-8587-7abdec5618e4 |
| PASS | Approve portfolio | will | one approval complete | Approved |
| PASS | Load actual holdings | will1976 | holdings load recorded | 20 rows |
| PASS | Load actual trades | will1976 | trades load recorded | 1 rows |
| PASS | Load cash flows | will1976 | cash-flow load recorded | 2 rows |
| PASS | Pull audit log | will | audit log returned | 23 records |
| PASS | Audit includes blocked action | will | blocked action preserved | Blocked result found |
| PASS | Audit includes portfolio approval | will | portfolio approval preserved | Portfolio approval recorded |
| PASS | Persist approved target package | System | target package persisted | ceae2007-fff3-4e7e-adc4-e6797c5c5ea7 |
| PASS | Persist approved portfolio | System | portfolio persisted | f859b7de-4982-4d45-8587-7abdec5618e4 |
| PASS | Persist data load history | System | three data loads persisted | 3 data loads |
| PASS | Persist data load registry hashes | System | hashes persisted | all data loads hashed |

## Generated Records

- Target package ID: ceae2007-fff3-4e7e-adc4-e6797c5c5ea7
- Portfolio ID: f859b7de-4982-4d45-8587-7abdec5618e4
- Data load records: 3
- Audit records: 23

## Important Limitation

This E2E test verifies the backend workflow and persistence layer. Browser UI E2E testing should still be run in an environment where localhost browser automation is permitted.
