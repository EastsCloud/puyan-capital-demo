# Acceptance Test Result

Generated at: 2026-07-26T09:04:25.003Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Required file exists: index.html | file found |
| PASS | Required file is not empty: index.html | file has content |
| PASS | Required file exists: app.js | file found |
| PASS | Required file is not empty: app.js | file has content |
| PASS | Required file exists: styles.css | file found |
| PASS | Required file is not empty: styles.css | file has content |
| PASS | Required file exists: data/sample_prices_web_recent.csv | file found |
| PASS | Required file is not empty: data/sample_prices_web_recent.csv | file has content |
| PASS | Required file exists: data/sample_ticker_universe.csv | file found |
| PASS | Required file is not empty: data/sample_ticker_universe.csv | file has content |
| PASS | Required file exists: data/standard_actual_holdings.csv | file found |
| PASS | Required file is not empty: data/standard_actual_holdings.csv | file has content |
| PASS | Required file exists: data/standard_actual_trades.csv | file found |
| PASS | Required file is not empty: data/standard_actual_trades.csv | file has content |
| PASS | Required file exists: data/standard_cash_flows.csv | file found |
| PASS | Required file is not empty: data/standard_cash_flows.csv | file has content |
| PASS | Required file exists: simulation/run_full_workflow_simulation.mjs | file found |
| PASS | Required file is not empty: simulation/run_full_workflow_simulation.mjs | file has content |
| PASS | Required file exists: ../02_Documentation/System_User_Manual.md | file found |
| PASS | Required file is not empty: ../02_Documentation/System_User_Manual.md | file has content |
| PASS | Required file exists: ../02_Documentation/Puyan_Capital_Control_Center_SOP.md | file found |
| PASS | Required file is not empty: ../02_Documentation/Puyan_Capital_Control_Center_SOP.md | file has content |
| PASS | Required file exists: ../02_Documentation/System_Preparation_Guide.md | file found |
| PASS | Required file is not empty: ../02_Documentation/System_Preparation_Guide.md | file has content |
| PASS | Required file exists: ../02_Documentation/IT_System_Check_and_Finetune_Guide.md | file found |
| PASS | Required file is not empty: ../02_Documentation/IT_System_Check_and_Finetune_Guide.md | file has content |
| PASS | Required file exists: ../03_Testing/Selected_Evidence/e2e_workflow_result.md | file found |
| PASS | Required file is not empty: ../03_Testing/Selected_Evidence/e2e_workflow_result.md | file has content |
| PASS | JavaScript syntax check: app.js | node --check completed |
| PASS | JavaScript syntax check: simulation/run_full_workflow_simulation.mjs | node --check completed |
| PASS | JavaScript syntax check: simulation/run_system_simulation.mjs | node --check completed |
| PASS | Simulation starts and prints report | report heading found |
| PASS | Simulation optimization control result | optimized portfolio passed controls |
| PASS | Simulation includes rebalance alerts | rebalance section found |
| PASS | Generated output exists: simulation/output/full_workflow_users.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_users.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_target_assumptions.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_target_assumptions.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_optimized_holdings.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_optimized_holdings.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_trade_orders.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_trade_orders.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_actual_holdings.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_actual_holdings.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_audit_log.csv | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_audit_log.csv | output has content |
| PASS | Generated output exists: simulation/output/full_workflow_result.md | output generated |
| PASS | Generated output is not empty: simulation/output/full_workflow_result.md | output has content |
| PASS | Role coverage: system administrator | role present |
| PASS | Role coverage: decision committee | role present |
| PASS | Role coverage: execution team | role present |
| PASS | Role coverage: compliance | role present |
| PASS | Target return generated | 9.85% bull scenario target found |
| PASS | US equity target beta generated | 1.010 found |
| PASS | Developed ex-US target beta generated | 1.230 found |
| PASS | Emerging equity target beta generated | 1.080 found |
| PASS | Portfolio beta is reference only | reference-only monitor found |
| PASS | Target max drawdown generated | drawdown limit found |
| PASS | Optimized equity holding weights sum to approved equity sleeves | sum=65.00% |
| PASS | Locked holdings preserved | VTI and XOM remain locked |
| PASS | Optimized holdings include sample equity | NVDA found |
| PASS | Trade orders generated | 2 trade orders |
| PASS | Trade orders have valid action | Buy/Sell only |
| PASS | Rebalance alerts generated | 2 alerts |
| PASS | Rebalance alerts have material drift | drift exceeds corridor |
| PASS | Audit trail includes blocked unauthorized action | blocked action found |
| PASS | Audit trail includes target approval | target approval found |
| PASS | Audit trail includes holdings import | holdings import found |
| PASS | Report includes sleeve beta control evidence | sleeve beta evidence found |
| PASS | Report includes drawdown control evidence | drawdown pass found |
