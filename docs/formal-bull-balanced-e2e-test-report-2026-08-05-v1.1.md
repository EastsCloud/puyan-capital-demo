# Isater v1.1 Bull and Balanced Scenario Retest

Test date: 2026-08-05

Scope: independent clean-database browser runs through the monitoring handoff

## Method

- Bull and balanced scenarios used separate fresh databases.
- All transitions were performed through visible login, form, and button controls.
- Administrator, committee, execution maker, and execution checker used four independent accounts.
- First-login password replacement was exercised for all accounts.
- Public data, historical backtest, and optimization were started from the user interface.
- The run stopped after the trade plan passed independent execution review and entered monitoring. Downstream position, NAV, and report coverage is documented in the bear-scenario report.

## Role path

1. The administrator created business users and activated default parameters.
2. The committee activated principal, started the annual cycle, and approved public data and target return.
3. Execution user 1 confirmed sleeve targets, built the proposal, ran the backtest, and submitted the portfolio.
4. The committee approved the portfolio.
5. Execution user 1 submitted the generated trade plan.
6. Execution user 2 reviewed it under a different account.

## Bull scenario

### Public-data recommendation

| Measure | Result |
|---|---:|
| Observation date | 2026-06-01 |
| Sources | 8 |
| Historical scenario months | 114 |
| Equity / Bonds / Alternatives / Cash | 45% / 40% / 10% / 5% |
| U.S. / Japan / Emerging within equity | 35% / 25% / 40% |
| Public-market expected return | 3.4% |
| Expected volatility | 7.0% |
| Inflation reference | 3.5% |

The suggested target was 7.0% within a 7.0%–12.0% policy range. The economic floor from inflation and operating cost was 4.5%.

### Portfolio and handoff

- The initial proposed sleeves satisfied the hard controls; optimization was not triggered.
- The committee approved the saved proposal through its own account.
- The system generated 12 planned equity trades totalling USD 4,500,000.
- Separate execution users completed maker-checker review.
- The application advanced to monitoring and rebalancing.

## Balanced scenario

### Public-data recommendation

| Measure | Result |
|---|---:|
| Observation date | 2026-06-01 |
| Sources | 8 |
| Historical scenario months | 46 |
| Equity / Bonds / Alternatives / Cash | 35% / 35% / 25% / 5% |
| U.S. / Japan / Emerging within equity | 70% / 15% / 15% |
| Public-market expected return | 6.8% |
| Expected volatility | 5.9% |
| Inflation reference | 3.5% |

The suggested target was 6.8% within a 4.0%–8.0% policy range. The committee entered and approved 6.76%; the economic floor was 4.5%.

### Backtest and optimization

- The initial U.S. and Japan sleeves passed.
- The emerging-market sleeve failed its beta control.
- The sleeve-specific optimizer produced three complete compliant alternatives.
- The minimum-turnover option corrected the beta gap without unnecessary changes to passing sleeves.

### Approval and handoff

- Execution submitted the selected option and the committee approved it through a separate login.
- The system generated 12 planned equity trades totalling USD 3,500,000.
- Execution user 1 submitted the plan; execution user 2 independently approved the review.
- Steps 01–08 displayed complete and step 09 became current.

## Observations

### Dashboard task consistency

At this test checkpoint, the dashboard could show no pending task while an actionable approval or sleeve confirmation still existed inside the annual workflow. The saved business state and action itself were correct, but the reminder could mislead a user. The recommended improvement is to derive dashboard tasks from the same role-and-state query used by workflow actions and link directly to the relevant step.

### Market-data cutoff labelling

The run date and the latest available market-data date differed. This may be valid for a non-trading day or provider update schedule, but the interface should display both “provider latest available trading date” and “system run time” to prevent misinterpretation.

## Excluded from this retest

- Broker-position import and security classification
- Monthly corridor checks and rebalance options
- Three-trading-day completion review
- Non-equity NAV approval
- Report generation, PDF inspection, publication, and language switching

These downstream functions were covered by the complete bear-scenario test.

## Conclusion

The bull scenario passed from a clean database to monitoring without optimization. The balanced scenario passed after the optimizer resolved an emerging-market beta exception while leaving passing sleeves unchanged. The evidence supports the current public-data, target decomposition, sleeve backtest, optimizer, committee approval, and execution maker-checker design. It does not constitute production or financial-model certification.
