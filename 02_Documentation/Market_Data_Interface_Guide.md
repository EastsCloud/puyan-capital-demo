# Market Data Interface Guide

## Purpose

The system uses a standard market data interface for historical allocation recommendations.

The current prototype supports three paths:

1. An EODHD personal API connection for prioritized end-of-day price refreshes.
2. A local historical cache, plus a Yahoo exception only for exact Tokyo-listed securities that the subscribed EODHD account does not cover.
3. A manual Excel workflow where the data team prepares a standard workbook and exports the `Allocation_Stats` sheet as CSV.

The source governance file is:

```text
config/market_data_sources.json
```

It records the active public sources, CPI references, manual fallback path, and future paid-data vendor interface.

## Files

```text
data/standard_market_data_interface.xlsx
data/standard_market_statistics.csv
data/public_data_engine_output/auto_market_statistics.csv
data/public_data_engine_output/auto_historical_prices.csv
data/public_data_engine_output/auto_ticker_universe.csv
```

## Recommended Workflow

### Automated Public Data Workflow

1. Start the local backend.
2. Log in as Decision Committee and click `Run Annual Public Data` in the `Annual Public Data Engine` section.
3. The system uses the paid EODHD feed for every supported configured security. If an EODHD request fails, it retains the last successful cache instead of silently switching providers. Yahoo is used only for the documented Tokyo-listed exceptions.
4. The engine generates historical prices, ticker universe, and market statistics CSV files.
5. The application loads those generated CSV files into the current workflow.

### Manual Excel Workflow

1. External data tool downloads approved market index prices.
2. Execution Team or an approved data support process calculates historical return, volatility, max drawdown, allocation ranges, and suggested weights.
3. Execution Team or the approved data support process updates `Allocation_Stats` in the Excel workbook.
4. Execution Team saves or exports `Allocation_Stats` as CSV using the same column headers.
5. Execution Team or System Administrator loads the CSV in the `Public Data Engine` section.
6. Decision Committee reviews the final prepared allocation package at Step 08.

## Required Scenarios

The CSV should include all three scenarios:

- Bull
- Balanced
- Bear

## Required Asset Rows

Each scenario must include these asset rows:

- equity
- bond
- alternative
- cash

## Required Equity Region Rows

Each scenario must include these region rows:

- us
- developed
- emerging

## Required Columns

```text
Scenario
Scenario Note
Row Type
Sleeve Key
Sleeve Label
Historical Return
Volatility
Max Drawdown
Suggested Low
Suggested High
Suggested Weight
Equity Share
Correlation Note
Source Name
Source Date
Source URL
```

## Current Prototype Limitation

The browser prototype loads CSV, not native multi-sheet Excel files. This keeps the prototype stable and easy to test.

EODHD is configured by environment variable and its token is never written to generated CSV or manifest files. The current personal/free connection is for controlled testing, not organizational or commercial redistribution.

## Validation

Run:

```bash
npm run test:data-sources
```

The check confirms that each source has a priority, usage, refresh cadence, fallback path, and owning configuration file. It also confirms that the Public Data Engine manifest matches the registered active public price source.
