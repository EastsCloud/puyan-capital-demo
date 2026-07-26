# Report Output Index

## Purpose

This index tells reviewers where each report or review output is located and what it is used for.

## Business Review Outputs

| Output | Location | Use |
|---|---|---|
| System user manual | `docs/System_User_Manual.md` | How to operate the prototype step by step |
| SOP | `docs/Investment_Management_Tool_SOP.md` | Operating procedure and control ownership |
| Current rules reconciliation | `docs/Current_Rules_Reconciliation_20260712.md` | Current agreed rules and older logic that has been superseded |
| Workflow diagram | `docs/System_Workflow_Diagram.md` | End-to-end flow and control gates |
| Workflow diagram image | `docs/system_workflow_diagram.png` | Quick visual reference |
| Workflow review page | `docs/simple_workflow_review.html` | Browser-friendly workflow explanation |
| Workflow review PDF | `docs/simple_workflow_review.pdf` | Printable workflow explanation |
| Business checklist | `docs/Business_Review_Checklist.md` | Business reviewer acceptance worksheet |
| Final workflow review | `docs/Final_Business_Workflow_Review_20260709.md` | Final readiness summary before sending |

## System-Generated Outputs

| Output | Location | Use |
|---|---|---|
| Committee review PDF | Generated from the app with `Download Committee Pack PDF` | Decision committee review package |
| Report CSV | Generated from the app with `Download Report CSV` | Data review and period reporting record |
| Audit CSV | Generated from the app with `Download Audit CSV` | Approval and operating trace |
| Self-check report | `tests/output/SELF_CHECK_REPORT.md` | IT sanity check result |
| Test suite result | `tests/output/test_suite_result.md` | Automated test status |
| E2E workflow result | `tests/output/e2e_workflow_result.md` | Automated workflow verification |
| Full workflow simulation | `simulation/output/full_workflow_result.md` | Sample end-to-end business flow evidence |
| Simulation report preview | `simulation/output/report_preview.html` | Sample report view |
| Simulation report image | `simulation/output/report_preview.png` | Static preview of the sample report |

## Demo Outputs

This delivery is a no-video package. Formal review should rely on the runnable system, product/workflow documents, and test evidence in this package.

## Data Templates And Sample Data

| Output | Location | Use |
|---|---|---|
| Standard market data workbook | `data/standard_market_data_interface.xlsx` | External data interface template |
| Historical price sample | `data/sample_prices.csv` | Backtest and beta sample data |
| Ticker universe sample | `data/sample_ticker_universe.csv` | Investable universe sample |
| Actual holdings template | `data/standard_actual_holdings.csv` | Actual holding import |
| Actual trades template | `data/standard_actual_trades.csv` | Actual trade import |
| Cash flow template | `data/standard_cash_flows.csv` | Cash flow import |
| Market statistics template | `data/standard_market_statistics.csv` | Allocation and reference return input |

## Review Rule

When reviewers compare outputs, use this hierarchy:

1. `docs/Current_Rules_Reconciliation_20260712.md` explains the current agreed rules and superseded older assumptions.
2. `docs/System_Workflow_Diagram.md` explains the intended process.
3. `docs/Investment_Management_Tool_SOP.md` explains who owns each control.
4. `docs/System_User_Manual.md` explains how to operate the screen.
5. `docs/Report_Output_Index.md` explains which file proves or records each part.
6. `tests/output/test_suite_result.md` confirms the package passed automated checks.
