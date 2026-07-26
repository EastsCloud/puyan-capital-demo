# Business Review Checklist

## Purpose

This checklist helps business reviewers confirm whether the current system logic matches the intended investment management workflow.

Suggested review method:

1. Open `OPEN_ME_FIRST.md`.
2. Open the runnable system and review the packaged test evidence.
3. Review the main workflow in `index.html` or `http://localhost:8787`.
4. Mark each checklist item as Pass, Needs Change, or Not Applicable.
5. Send comments with the step number and proposed correction.

## Review Areas

### 1. Annual Target Return

Confirm:

- Operating cost is manually entered.
- CPI estimate can use multiple trusted sources.
- Market scenario can be Bull, Balanced, or Bear.
- Scenario range controls the allowable selected market outlook.
- Committee selects one exact value inside the selected range.
- Final annual target return is approved by the Decision Committee.

### 2. Target Beta And Max Drawdown

Confirm:

- Target beta is derived from CAPM.
- CAPM uses each sleeve's market/currency risk-free rate and long-term market return assumption.
- U.S., developed ex-U.S., and emerging markets sleeve target betas are the hard controls.
- Base equity max drawdown is derived from weighted equity target return and the 0.6-0.8 return/drawdown range.
- Each equity sleeve has a risk-adjusted drawdown budget.

### 3. Asset Allocation And Portfolio Construction

Confirm:

- Proposed investments are classified by region.
- Proposed investments are classified by asset class.
- Equity holdings can be further classified by style/theme/ticker.
- Ticker rules and maximum single-security rules are acceptable.
- Locked weights and optimization scope make business sense.

### 4. Backtest And Optimization

Confirm:

- Backtest uses historical data as a feasibility check.
- Each sleeve's backtested return, beta, and max drawdown are control indicators.
- Proposed equity summary return and drawdown are also checked.
- Backtest uses the proposed equity portfolio, not actual broker holdings.
- If proposed portfolio fails controls, optimizer suggests revised weights.
- Optimization constraints are acceptable.

### 5. Governance

Confirm:

- Investment committee approves target return and final implementation.
- Execution team proposes securities and trades.
- Exceptions require reason and committee approval.
- Approval records and audit trail are sufficient for internal governance.

### 6. Actual Implementation And Monitoring

Confirm:

- Actual holdings loading model is acceptable.
- Broker/custodian data should be normalized outside or inside this system.
- Rebalance corridor is acceptable.
- Escalation logic is acceptable.
- Reporting periods are acceptable: daily, weekly, quarterly, yearly, custom.

## Business Questions To Answer

1. Are the committee roles correct?
2. Are the execution team roles correct?
3. Are approval thresholds correct?
4. Are target beta and drawdown controls framed correctly?
5. Are asset classes and regions complete?
6. Are the required reports complete?
7. What must be added before pilot use?
8. What must be added before production use?

## Acceptance Worksheet

| Step | What to review | Pass criteria | Reviewer status |
|---|---|---|---|
| 1. Target setup | Operating cost, CPI, market scenario, selected market outlook value | Target return logic is understandable and committee-controlled | Pending |
| 2. Target approval | Target package approval path | One decision committee approver can approve the annual target | Pending |
| 3. Public data | Public data engine and standard external data files | Required market data can be generated or loaded before beta/backtest work | Pending |
| 4. Allocation split | Asset class and regional allocation inputs | Target return floor can be split across U.S. equity, developed ex-U.S. equity, emerging markets equity, bonds, alternatives, and cash, with any expected buffer shown separately | Pending |
| 5. Beta and drawdown | CAPM beta, sleeve market/currency risk-free rate, market return, max drawdown budget | Sleeve beta and drawdown controls are clear and not confused with realized return | Pending |
| 6. Portfolio proposal | Region, asset class, style, ticker, weight, locked weight | Execution team can propose securities under committee policy constraints | Pending |
| 7. Backtest | Historical return, beta, drawdown | Backtest is understood as a historical feasibility test, not a forward guarantee | Pending |
| 8. Optimization | Weight recommendation, locks, region/asset/style scope | Recommendation respects locked weights and selected optimization scope | Pending |
| 9. Implementation approval | Portfolio approval before execution | Decision committee approval gate is clear | Pending |
| 10. Actual holdings and trades | Holdings, trades, cash-flow data load | Actual implementation data can be loaded through standard CSV files | Pending |
| 11. Rebalance | Corridor alert, action plan, deadline, escalation | Breach alerts produce clear action suggestions and escalation path | Pending |
| 12. Trade authorization | Execution authorization and exception route | Trade authorization authority and committee escalation are acceptable | Pending |
| 13. Reporting | Report CSV, committee PDF, audit CSV | Reports answer target return, beta, drawdown, rebalance, and attribution questions | Pending |
| 14. Annual review | Committee versus manager attribution | Annual review logic is useful for governance discussion | Pending |

## Reviewer Comment Template

Use this format when sending feedback:

```text
Reviewer:
Review date:
Step number:
Status: Pass / Needs Change / Not Applicable
Comment:
Suggested change:
Business priority: High / Medium / Low
```

## Minimum Pass Standard Before Pilot Discussion

The system should not move from concept review to pilot discussion unless business reviewers agree that:

- Annual target return logic is directionally correct.
- Sleeve-level beta and drawdown controls are understood.
- Data load flow is acceptable.
- Portfolio approval responsibilities are clear.
- Rebalance alert and escalation logic are acceptable.
- Report outputs are sufficient for committee discussion.
- Known production gaps are understood by both business and IT reviewers.
