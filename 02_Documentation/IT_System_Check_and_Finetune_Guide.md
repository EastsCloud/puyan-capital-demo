# IT System Check and Finetune Guide

Version: 0.1
Date: 2026-06-21
Project folder: `/Users/wangxiaoxiang/Documents/us stock`

## 1. Purpose

This guide is for IT, developers, testers, and data engineers who need to inspect, maintain, test, or finetune the investment management tool.

It focuses on:

- File structure.
- Data contracts.
- Calculation checks.
- Role and permission checks.
- Backtest and optimizer checks.
- Simulation scripts.
- Known limitations.
- Recommended finetune roadmap.

## 2. Current Application Type

The current system is a browser-based prototype with static files:

- `index.html`
- `app.js`
- `styles.css`

It stores state in browser memory during the current session. It does not yet have:

- backend server
- database
- authentication service
- production market data API
- persistent user login
- formal deployment pipeline

## 3. Canonical Project Folder

The current canonical project folder is:

```text
/Users/wangxiaoxiang/Documents/us stock
```

Do not treat old duplicate folders as source of truth.

Reference files:

- `docs/PROJECT_LOCATION.txt`
- `docs/PROJECT_ORGANIZATION_AUDIT.md`

## 4. File Structure

Core app:

```text
index.html
app.js
styles.css
```

Business and design documentation:

```text
README.md
docs/current_logic_overview.md
docs/solution_design.md
docs/Investment_Management_Tool_SOP.md
docs/IT_System_Check_and_Finetune_Guide.md
docs/conversation_record.txt
```

Sample and standard data:

```text
data/sample_prices.csv
data/sample_prices_web_recent.csv
data/sample_ticker_universe.csv
data/sample_actual_holdings.csv
data/standard_actual_holdings.csv
data/standard_actual_trades.csv
data/standard_cash_flows.csv
docs/stock_data_sources.md
```

Simulation:

```text
simulation/run_system_simulation.mjs
simulation/run_full_workflow_simulation.mjs
simulation/output/simulation_result.md
simulation/output/full_workflow_result.md
simulation/output/full_workflow_*.csv
```

## 5. Runtime Check

The app can be opened as a static HTML page:

```text
index.html
```

In the current Codex desktop environment, local HTTP serving may be blocked. If so, use static checks and the simulation scripts.

Syntax checks:

```bash
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check app.js
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check simulation/run_system_simulation.mjs
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check simulation/run_full_workflow_simulation.mjs
```

ID-reference check:

```bash
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node - <<'NODE'
const fs = require('fs');
const html = fs.readFileSync('index.html','utf8');
const js = fs.readFileSync('app.js','utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const refs = [...js.matchAll(/el\("([^"]+)"\)/g)].map(m=>m[1]);
const missing = [...new Set(refs.filter(id=>!ids.has(id)))];
const duplicates = [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]).filter((id,i,a)=>a.indexOf(id)!==i);
console.log(JSON.stringify({refs: refs.length, missing, duplicates:[...new Set(duplicates)]}, null, 2));
NODE
```

Expected result:

```text
missing: []
duplicates: []
```

## 6. Data Contracts

### Price CSV

Purpose:

- Calculate ticker returns.
- Calculate beta.
- Calculate max drawdown.
- Run backtest and optimizer.

Expected format:

```text
Date,VTI,AAPL,MSFT,NVDA,JPM,XOM,BIL,CASH
2026-06-01,373.40,306.31,460.52,224.36,296.58,149.38,91.40,1.00
```

Rules:

- `Date` is required.
- Benchmark ticker column is required.
- Each proposed ticker should have a price column.
- Prices must be numeric.
- Dates should be sorted ascending.
- Missing or zero prices should be rejected or skipped.

### Ticker Universe CSV

Expected columns:

```text
Ticker,Name,Market,Region,GeographicRegion,AssetClass,StyleFactor,Theme
```

Rules:

- `Ticker` must be unique.
- `Region` should map to app regions.
- `AssetClass` should map to app asset classes.
- Equity tickers should have style factor and theme.

### Actual Holdings CSV

Expected columns:

```text
AsOfDate,Account,Broker,Ticker,Name,AssetClass,Region,Currency,Quantity,Price,MarketValue,Weight
```

Rules:

- Weight should total near 100%.
- Tickers should match approved portfolio or be flagged as unexpected.
- Market value should be numeric.

### Actual Trades CSV

Expected columns:

```text
TradeDate,SettlementDate,Account,Broker,Action,Ticker,Currency,Quantity,Price,Fees,NetValue,ExternalTradeId
```

Rules:

- Action should be `Buy` or `Sell`.
- Quantity, price, fees, and net value should be numeric.
- Actual trades should reconcile against approved trade orders.

### Cash-Flow CSV

Expected columns:

```text
CashFlowDate,Account,Type,Currency,Amount,Note
```

Rules:

- Contributions should be positive.
- Withdrawals should be negative, or consistently transformed before calculation.
- Dates should fall inside the report period.

## 7. Calculation Checks

### Annual Target Return

Check:

```text
Final target return =
operating cost
+ CPI estimate
+ selected market outlook value
```

Validation:

- Market outlook value must be inside selected scenario range.
- CPI method must be either average active sources or selected source.
- Approved target should reset if inputs change.

### Sleeve Allocation

Check:

```text
sum(sleeve weight * sleeve target return) = final target return
```

Validation:

- Use tolerance for rounding.
- If allocated return is materially below the approved target floor, block approval. If allocated return exceeds the floor, record the expected buffer and do not force sleeve returns downward.

### CAPM Target Beta

Check:

```text
target beta =
(equity sleeve target return - sleeve market/currency risk-free rate)
/
(market return assumption - sleeve market/currency risk-free rate)
```

Validation:

- Market return assumption must be greater than the relevant sleeve market/currency risk-free rate.
- Market risk premium should be at least 0.50%.
- Target beta should be within policy range, currently 0.00 to 2.50.

### Beta Calculation

Check:

```text
beta =
covariance(asset returns, benchmark returns)
/
variance(benchmark returns)
```

Validation:

- Use aligned return periods.
- Benchmark variance must not be zero.
- A minimum number of observations should be required in production.

### Max Drawdown

Check:

```text
wealth index starts at 1
peak = max historical wealth
drawdown = wealth / peak - 1
max drawdown = minimum drawdown
```

Validation:

- Drawdown is normally zero or negative.
- Passing condition: backtested drawdown should not be deeper than the target drawdown limit.

### Modified Dietz Return

Check:

```text
Modified Dietz return =
(ending value - beginning value - net flows)
/
(beginning value + weighted flows)
```

Validation:

- Cash flow dates must be inside period.
- Flow signs must be consistent.

## 8. Approval Logic Checks

Annual target approval requires:

```text
valid final target return
+ valid sleeve allocation
+ valid target beta
+ valid drawdown budget
+ one decision committee approval
```

Portfolio implementation approval requires:

```text
annual target approved
+ data quality passed
+ allocation constraints passed
+ all equity sleeve return controls passed
+ all equity sleeve beta controls passed
+ all equity sleeve drawdown controls passed
+ max drawdown control passed
+ one decision committee approval
```

Important:

- Step 07 backtests the proposed equity portfolio only.
- Actual holdings are not used until post-approval implementation and monitoring.
- Sleeve return, sleeve beta, sleeve risk-adjusted max drawdown, and proposed equity summary return/drawdown are hard controls for proposed portfolio approval.

Risk-adjusted sleeve drawdown budget formula:

```text
base equity max drawdown band =
-(weighted equity target return / administrator-maintained return-drawdown range)

sleeve volatility relative value =
sleeve historical volatility / weighted average equity sleeve volatility

sleeve drawdown relative value =
absolute sleeve historical max drawdown / weighted average absolute equity sleeve max drawdown

sleeve risk factor =
clamp((0.60 * sleeve volatility relative value) + (0.40 * sleeve drawdown relative value), 0.75, 1.35)

sleeve drawdown budget =
base equity max drawdown band * sleeve risk factor
```

Implementation check:

- The drawdown budget shown in Step 07 must come from the sleeve target object, not from a single global portfolio limit.
- A sleeve passes drawdown only if backtested sleeve max drawdown is within the configured drawdown tolerance versus that sleeve's own budget.
- Proposed equity summary drawdown is checked separately against the base equity max drawdown band.

## 9. Permission Checks

Current role groups:

- System Administrator
- Decision Committee
- Execution Team
- Compliance
- Viewer

Permission expectations:

| Action | Expected group |
| --- | --- |
| Maintain users | System Administrator |
| Approve target return | Decision Committee |
| Approve implementation | Decision Committee |
| Edit holdings | Execution Team |
| Run optimizer | Execution Team |
| Approve normal trades | Execution Team |
| Approve over-limit trades | Decision Committee |
| Load holdings/trades | Execution Team or System Administrator |
| Review reports | Decision Committee, Execution Team, or Compliance |

Test negative cases:

- Viewer attempts to edit proposed portfolio: blocked.
- System Administrator attempts committee approval without committee role: blocked.
- Decision Committee attempts to edit holdings: blocked.
- Execution Team attempts final implementation approval: blocked.

## 10. Optimizer Logic

Current optimizer type:

- heuristic random search
- in-memory
- no external optimization library

Primary objectives:

- bring each equity sleeve beta close to its target beta
- keep each sleeve max drawdown within its sleeve drawdown budget
- keep proposed equity summary drawdown within the base equity drawdown budget
- preserve allocation constraints
- respect max single equity constraint

Important rule:

- Optimizer scoring should use the proposed equity return target, not the whole annual target return.
- Sleeve return, sleeve beta, sleeve max drawdown, and proposed equity summary return/drawdown should all affect optimizer scoring and pass/fail status.

Current optimizer restrictions:

- lock individual holding weights
- restrict by region
- restrict by asset class
- restrict by style factor

Current optimizer adjusts eligible equity holdings inside the approved equity sleeves.

Finetune parameters to review:

- number of random candidates
- beta tolerance
- drawdown penalty weight
- constraint penalty weight
- minimum selected holding weight
- max single equity weight
- return-control penalty weight

## 11. Simulation Scripts

Run basic simulation:

```bash
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node simulation/run_system_simulation.mjs
```

Output:

```text
simulation/output/simulation_result.md
```

Run full workflow simulation:

```bash
/Users/wangxiaoxiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node simulation/run_full_workflow_simulation.mjs
```

Output:

```text
simulation/output/full_workflow_result.md
simulation/output/full_workflow_users.csv
simulation/output/full_workflow_target_assumptions.csv
simulation/output/full_workflow_optimized_holdings.csv
simulation/output/full_workflow_trade_orders.csv
simulation/output/full_workflow_actual_holdings.csv
simulation/output/full_workflow_audit_log.csv
```

Expected full workflow behavior:

1. Users and roles are created.
2. Unauthorized viewer action is blocked.
3. Annual target return is approved.
4. Initial portfolio beta fails.
5. Optimizer runs with locked holdings.
6. Optimized portfolio passes beta and drawdown.
7. Committee approves implementation.
8. Trade orders are generated and approved.
9. Actual holdings load triggers rebalance alerts.
10. Report and audit trail are generated.

## 12. Manual QA Checklist

### UI Structure

- Page loads without visible layout break.
- All input controls fit inside their containers.
- Tables scroll or wrap cleanly.
- Optimization advice appears after optimizer run.
- Locked holdings remain unchanged after optimization.

### Data Loading

- Load price CSV.
- Load ticker universe CSV.
- Load actual holdings CSV.
- Load actual trades CSV.
- Load cash-flow CSV.
- Confirm data quality messages.

### Target Setup

- Change market scenario and confirm range changes.
- Try selecting an outlook value outside range and confirm validation.
- Approve target return with committee users.
- Change target input after approval and confirm approval resets.

### Backtest

- Confirm beta and drawdown calculate.
- Confirm return is tested as a hard control at sleeve level and proposed-equity summary level.
- Confirm return failure blocks approval even when beta and drawdown pass.

### Optimizer

- Lock one holding and run optimizer.
- Confirm locked holding weight does not change.
- Restrict optimizer by style and run.
- Confirm only eligible holdings change.
- Restrict optimizer so no holdings are eligible.
- Confirm warning message appears.

### Approval

- Approve optimized portfolio with all committee members.
- Reject with one committee member and confirm implementation is blocked.

### Trading

- Create trade under authorization limit.
- Create trade over authorization limit.
- Confirm committee approval is required for over-limit trade.
- Load actual trades and reconcile.

### Reporting

- Generate weekly report.
- Enter cash flows and confirm Modified Dietz changes.
- Export report CSV.
- Export audit log.

## 13. Known Limitations

Current limitations:

- No persistent database.
- No production authentication.
- No formal API server.
- Historical price sample is small.
- Market data is manually prepared.
- Optimizer is heuristic, not a formal constrained optimizer.
- Multi-market equity sleeves are implemented as U.S. equity, developed ex-U.S. equity, and emerging markets equity.
- Browser automation may be limited in the current local environment.

## 14. Production Finetune Roadmap

Recommended next technical upgrades:

1. Add persistent storage.
2. Add real authentication and user sessions.
3. Add role-based access control on the server side.
4. Connect to a licensed market data provider.
5. Store long historical price series.
6. Add formal data validation with data-load error reports.
7. Replace heuristic optimizer with constrained optimization.
8. Extend the prototype optimizer explainability into formal solver diagnostics and scenario comparison.
9. Add stress tests and historical regime tests.
10. Add deeper market coverage and formal solver support for multi-market equity sleeves.
11. Add audit-log immutability.
12. Add approval versioning and electronic sign-off.
13. Add broker data integration module.
14. Add automated scheduled reports.
15. Add backup and restore procedure.

## 15. Suggested Database Tables

Future backend tables:

- users
- roles
- permissions
- target_assumptions
- target_approvals
- sleeve_allocations
- benchmarks
- ticker_universe
- historical_prices
- proposed_portfolios
- proposed_holdings
- optimization_runs
- committee_decisions
- trade_orders
- actual_trades
- actual_holdings
- cash_flows
- rebalance_alerts
- exception_requests
- performance_reports
- audit_log

## 16. Release Gate Checklist

Before handing the system to users:

- Syntax checks pass.
- ID-reference checks pass.
- Full workflow simulation passes.
- SOP reviewed by business owner.
- IT guide reviewed by developer.
- Data templates reviewed by operations.
- Permission matrix reviewed by compliance.
- Backup of canonical project folder created.
- Known limitations accepted by sponsor.
