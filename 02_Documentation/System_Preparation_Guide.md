# System Preparation Guide

## Purpose

This document explains what an IT team needs to prepare in order to run, test, review, and later deploy the Puyan Capital Control Center.

The current version is a working prototype. It includes:

- A browser-based user interface.
- CSV data templates and sample data.
- Simulation scripts for the investment workflow.
- Documentation for business logic, operating procedures, workflow, and IT review.
- A local backend SQLite live database foundation plus relational audit snapshot export tooling.
- A market data source registry for public data, CPI references, manual fallback, and future paid-data vendor integration.

The current version does not require a production server or database to open the user interface. A fuller production environment will be needed before real investment operations are handled in the system.

## 1. Current Prototype: Minimum Requirements

### 1.1 Computer

The prototype can be reviewed on either:

- macOS
- Windows
- Linux

### 1.2 Browser

Use a modern browser, such as:

- Google Chrome
- Microsoft Edge
- Safari

The main application page is:

```text
index.html
```

The IT reviewer can open this file directly in a browser.

### 1.3 No Server Required for Basic UI Review

For basic screen review and logic walkthrough, no web server is required.

The user interface currently runs as a static local page. This means the IT reviewer can open the file directly from the project folder.

## 2. Optional Local Runtime for Simulation

To run the workflow simulations, IT should install Node.js.

### 2.1 Node.js

Recommended version:

```text
Node.js 24 or above
```

### 2.2 Simulation Scripts

The simulation scripts are stored in:

```text
simulation/
```

Important scripts:

```text
simulation/run_system_simulation.mjs
simulation/run_full_workflow_simulation.mjs
```

These scripts use sample CSV data from:

```text
data/
```

They generate workflow output in:

```text
simulation/output/
```

### 2.3 What the Simulation Tests

The simulation can test:

- Annual target return logic.
- Target beta calculation.
- Target max drawdown calculation.
- Proposed portfolio validation.
- Backtest result calculation.
- Optimization suggestion logic.
- Committee approval flow.
- Execution team approval flow.
- Actual holdings load.
- Rebalance alerts.
- Reporting output.

## 3. Project Folder Structure

The project folder should keep the following structure:

```text
index.html
app.js
styles.css
README.md
docs/
data/
config/
simulation/
demo/
server/
scripts/
tests/
```

### 3.1 Root Files

```text
index.html
```

Main browser entry page.

```text
app.js
```

Main business logic and interface behavior.

```text
styles.css
```

Main interface styling.

```text
README.md
```

Project overview and key document index.

### 3.2 Documentation Folder

```text
docs/
```

Contains user manuals, SOP, workflow diagrams, system logic, and IT review documents.

### 3.3 Data Folder

```text
data/
```

Contains CSV templates and sample data.

Current important data files include:

```text
data/sample_prices.csv
data/sample_prices_web_recent.csv
data/sample_ticker_universe.csv
data/sample_actual_holdings.csv
data/standard_actual_holdings.csv
data/standard_actual_trades.csv
data/standard_cash_flows.csv
```

### 3.4 Simulation Folder

```text
simulation/
```

Contains workflow simulation scripts.

Generated simulation reports are stored in:

```text
simulation/output/
```

### 3.5 Config Folder

```text
config/
```

Contains the external market-data source registry:

```text
config/market_data_sources.json
```

This file records source priority, usage, refresh cadence, fallback path, and production notes.

### 3.6 Demo Folder

```text
demo/output/
```

May contain legacy package assets. The current delivery package uses the runnable system and automated test evidence for acceptance review.

### 3.7 SQLite Live Database

The prototype now uses SQLite as the default live local backend database:

```text
server/data/db.sqlite
```

If a legacy JSON database exists, it can be used as the first migration source:

```text
server/data/db.json
```

For IT handoff and audit review, a separate relational SQLite snapshot can be exported:

```bash
npm run data:sqlite
```

Default output:

```text
server/data/db_audit.sqlite
```

The live SQLite database stores operational records in separate normalized tables for users, sessions, targets, portfolios, holdings, orders, approvals, imports, public-data records, report distributions, and audit history. `app_state` and `app_state_backups` remain as compatibility and recovery snapshots. Existing JSON or earlier snapshot-only data is migrated automatically when the backend starts.

## 4. Data Preparation

The system currently uses CSV files as the data exchange format.

### 4.1 Market Price Data

Market price data should include historical prices for:

- Benchmark indices or ETF proxies.
- Proposed equity tickers.
- Other investable instruments if used in testing.

This data is used for:

- Historical returns.
- Beta calculation.
- Drawdown calculation.
- Backtest reference.

### 4.2 Ticker Universe

The ticker universe should contain selectable investment instruments.

It should support fields such as:

- Ticker
- Name
- Region
- Asset class
- Style category
- Theme
- Benchmark proxy
- Data availability status

### 4.3 Actual Holdings

Actual holdings should be loaded through a standardized CSV or Excel-derived CSV file.

Suggested fields:

- Account
- Broker
- Ticker
- Security name
- Asset class
- Region
- Quantity
- Market price
- Market value
- Weight
- Data date

### 4.4 Actual Trades

Actual trades should be loaded through a standardized CSV file.

Suggested fields:

- Trade date
- Account
- Broker
- Ticker
- Buy or sell
- Quantity
- Price
- Gross amount
- Fees
- Net amount
- Approved by
- Approval ID

### 4.5 Cash Flows

Cash-flow data should be loaded through a standardized CSV file.

Suggested fields:

- Date
- Account
- Broker
- Flow type
- Amount
- Currency
- Note

## 5. Current Testing Environment

For the current prototype review, IT only needs:

- A browser for the UI.
- Node.js 24 or above for simulations and SQLite-backed backend storage.
- Access to the full project folder.

For screen-only inspection, no database or API server is required. For login, persistence, approvals, audit history, data loading, and the complete workflow, start the included Node.js backend; it creates and uses the local SQLite database automatically.

## 6. Recommended Production Environment

Before using the tool for real investment operations, IT should prepare a fuller system environment.

### 6.1 Frontend Hosting

Recommended options:

- Internal company web server.
- Nginx static hosting.
- Cloud static hosting.
- Internal application portal.

### 6.2 Backend Service

A backend service should be added for:

- User login.
- Role permissions.
- Approval workflow.
- Data validation.
- Audit logs.
- Report generation.
- Data-load processing.
- Scheduled alerts.

Possible backend technology choices:

- Node.js
- Python
- Java
- .NET

The choice should follow the company's existing IT standards.

### 6.3 Database

SQLite is now implemented for local review, controlled personal use, and a small pilot. A managed server database should still be considered when concurrent users, high availability, centralized backup, or stronger operational controls are required.

Possible later choices:

- PostgreSQL
- MySQL
- Microsoft SQL Server

The database should store:

- Users
- Roles
- Committee approvals
- Execution authorizations
- Target return assumptions
- Benchmark assumptions
- Proposed portfolios
- Optimized portfolios
- Actual holdings
- Actual trades
- Rebalance alerts
- Drawdown alerts
- Reports
- Audit logs

### 6.4 File Data Load Service

The system should include a data-load service for:

- Broker holding files.
- Trade files.
- Cash-flow files.
- Market price files.
- Ticker universe files.

The current design assumes the investment management tool connects to one standardized data workbook or CSV format. A separate small broker-normalizer module can transform files from multiple brokers into that standard format.

### 6.5 Scheduled Jobs

Production deployment should include scheduled jobs for:

- Daily holdings refresh.
- Daily price data refresh.
- Daily beta calculation.
- Daily max drawdown monitoring.
- Rebalance corridor checks.
- Alert escalation.
- Periodic report generation.

### 6.6 Permission and Audit Requirements

The system should support at least the following roles:

- System Administrator
- Decision Committee Member
- Execution Manager
- Execution Authorizer
- Compliance or Reporting Reviewer

The audit trail should record:

- Who created or changed an assumption.
- Who proposed a portfolio.
- Who approved or rejected a target.
- Who approved or rejected a portfolio.
- Who approved a trade.
- Who approved an exception.
- When each action happened.
- What data version was used.

## 7. Security Preparation

Before production use, IT should review:

- User authentication.
- Password or single-sign-on policy.
- Role-based access control.
- Data access restrictions.
- Change logs.
- Approval logs.
- Data-load file validation.
- Backup and recovery.
- Encryption for sensitive files.

## 8. Operational Preparation

Before production use, the business and IT teams should agree on:

- Official market data source.
- Official CPI forecast source process.
- Official benchmark list.
- Official risk-free-rate source.
- Official broker data format.
- Report frequency.
- Rebalance corridor policy.
- Drawdown alert threshold.
- Exception approval policy.
- User maintenance process.

## 9. Deployment Stages

### Stage 1: Prototype Review

Purpose:

- Review UI.
- Review business logic.
- Review sample workflow.

Required:

- Browser.
- Project folder.

Optional:

- Node.js for simulation.

### Stage 2: Internal Testing

Purpose:

- Test with controlled historical data.
- Test loaded holdings.
- Test approval workflow.
- Test report format.

Required:

- Browser.
- Node.js.
- Standardized CSV or Excel data-load files.
- Test users and roles.

### Stage 3: Pilot Deployment

Purpose:

- Run with a small real or mock portfolio.
- Validate daily monitoring.
- Validate alert escalation.
- Validate committee approval flow.

Required:

- Hosted frontend.
- Backend service.
- Database.
- Data-load service.
- Scheduled jobs.
- Access control.

### Stage 4: Production Deployment

Purpose:

- Use as an official investment management control system.

Required:

- Production hosting.
- Production database.
- SSO or approved authentication.
- Full audit trail.
- Backup and recovery.
- Monitoring.
- Change-management process.
- Business continuity plan.

## 10. IT Checklist

For the current prototype:

- Confirm project folder is complete.
- Start the included backend and open `http://localhost:8787` for complete functional review.
- Confirm `docs/`, `data/`, `simulation/`, `demo/`, `server/`, and `tests/` folders exist.
- Install Node.js 24 or above if simulations or the SQLite-backed backend will be run.
- Run the full workflow simulation.
- Review generated files in `simulation/output/`.

For production planning:

- Choose frontend hosting method.
- Choose backend technology.
- Choose database.
- Design user and role tables.
- Design approval workflow tables.
- Design audit-log table.
- Design data-loading process.
- Design scheduled jobs.
- Define market data source.
- Define backup and recovery process.
- Define access-control policy.

## 11. Related Documents

Useful documents in the same project:

```text
docs/System_User_Manual.md
docs/Investment_Management_Tool_SOP.md
docs/System_Workflow_Diagram.md
docs/IT_System_Check_and_Finetune_Guide.md
docs/solution_design.md
docs/current_logic_overview.md
```
