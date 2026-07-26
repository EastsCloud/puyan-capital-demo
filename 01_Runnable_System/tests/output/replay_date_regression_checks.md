# Replay Date Regression Checks

Generated at: 2026-07-24T10:05:25.513Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | sample holdings are replay-date rebased | Found rebaseSampleCsvForReplay |
| PASS | backtest uses replay-date cut-off | Found configuredTestDateOverride() \|\| todayIso() |
| PASS | rebalance check uses local date parsing | Found localDateFromIsoValue(state.rebalanceFormalCheckDate |
| PASS | accepted rebalance date uses local date parsing | Found localDateFromIsoValue(state.rebalanceAcceptedPlan?.acceptedAt |
| PASS | latest sample holding date maps to replay date | 2025-07-09, 2025-07-10, 2025-07-11, 2025-07-14, 2025-07-15 |
| PASS | sample holding history maps to prior trading days | 2025-07-09, 2025-07-10, 2025-07-11, 2025-07-14, 2025-07-15 |
| PASS | backtest filter excludes post-replay price rows | 2022-07-14, 2022-07-15, 2025-07-15 |
