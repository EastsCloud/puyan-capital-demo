# Product Guide

## Product purpose

Isater is an investment-governance system for a single proprietary portfolio. It brings annual targets, asset allocation, equity construction, backtesting, optimization, approvals, implementation, daily monitoring, rebalancing, and reporting into one auditable process.

## Roles

| Role | Primary responsibilities | Access boundary |
|---|---|---|
| System Administrator | Users, password resets, parameters, source priority, and external-data connections | May inspect workflow and audit history; does not cast investment votes |
| Decision Committee | Principal, annual scenario, target return, portfolio approval, and non-equity NAV approval | Read-only access to execution pages |
| Execution Team | Portfolio proposal, backtest, optimization, submission, maker-checker review, position imports, rebalancing, and reporting | May use approved committee results; cannot vote on behalf of the committee |

## Annual workflow

1. The committee activates portfolio principal and starts the annual cycle.
2. The committee runs the public-data engine, selects a bull, balanced, or bear scenario, and accepts the allocation recommendation.
3. The committee approves a target return within the administrator-maintained policy range.
4. The system decomposes the target into U.S., developed ex-U.S. (Japan), and emerging-market (Hong Kong and China A-share) return and beta targets.
5. The Execution Team builds a proposed portfolio from the approved security universe.
6. The system backtests return, beta, and maximum drawdown by sleeve.
7. If a sleeve fails, the optimizer first changes existing weights and only then searches the minimum number of security replacements.
8. The Execution Team selects a compliant plan and submits it for committee approval.
9. The system generates a trade plan; one execution user submits it and another reviews it.
10. Daily position imports, monthly corridor checks, and rebalancing become active.
11. The Execution Team submits non-equity NAV; after committee approval, the system generates and publishes the report.

## Routine operation

- **Daily:** import a broker-position CSV. The system reconciles approved symbols, exchanges, quantities, prices, and market values and updates the equity-value curve.
- **After execution:** import an executed-fill CSV. Preview rows, confirm normalized securities, select rows, and reconcile actual fills against the approved plan.
- **Monthly:** run style-level corridor checks. Out-of-range styles receive both a minimum-trade plan and a return-to-target plan.
- **Rebalancing:** accepted plans have a three-trading-day completion window. Due-date imports automatically determine whether the plan is complete or overdue.
- **Reporting:** review NAV and target attainment, sleeve risk metrics, and market/allocation/selection/interaction attribution; download a PDF and record publication or delivery.

## Main screens

- **Dashboard:** principal, current annual step, public-data date, and role-specific tasks.
- **Annual Workflow:** steps 01–11. Completed steps reopen in read-only mode, the current step exposes role-controlled actions, and future steps remain locked.
- **Approved Portfolio:** effective version, principal, sleeve targets, market/style classifications, and approved security weights.
- **Monitoring:** positions, equity curve, corridor checks, rebalance plans, due-date follow-up, fill reconciliation, and external cash flows.
- **Reports:** versioned reports, attribution, PDF generation, publication, and delivery history.
- **Administration:** users, parameters, source order, encrypted external credentials, reset controls for demo environments, and immutable audit events.

## External-data connection

- Administrators enter an EODHD API token, never an EODHD account password.
- The API encrypts the token at rest; the browser sees only its last four characters.
- A connection test requests real adjusted-price observations before the provider is enabled.
- Backtests, optimization series, and report benchmarks prefer EODHD and record any fallback source and reason.
- Official macroeconomic inputs remain separate from EODHD and retain their own provenance.

## Operating boundary

- Demo users and local data must not be reused in production.
- A production rollout requires managed infrastructure, licensed data, security and disaster-recovery controls, real broker-export acceptance, and financial-model validation.
- If same-period benchmark data is incomplete, the report must not label unexplained market movement as security-selection skill.
