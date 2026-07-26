# Public Data Engine Guide

## Purpose

The Public Data Engine is a small standalone data collection module for the investment management prototype. It collects public market price data, converts it into the system's standard CSV format, and lets the main workflow load the generated files.

This keeps the application logic separate from the external data source. If the team later switches from public data to Bloomberg, Wind, Refinitiv, FactSet, or an internal data warehouse, the replacement can be made inside this engine while keeping the CSV interface stable.

The data-source governance registry is stored at:

```text
config/market_data_sources.json
```

That registry records source priority, usage, refresh cadence, manual fallback, and future paid-vendor interface notes. It is checked by:

```bash
npm run test:data-sources
```

## Workflow Position

The engine should be used at the start of the annual investment cycle, before the annual target return is finalized. In normal operation it is run once per investment year, then later runs are limited to refreshing the latest public prices if the approved data package needs to be updated.

Recommended order:

1. System login.
2. Decision Committee runs the Annual Public Data Engine.
3. Decision Committee reviews and accepts the generated bull/balanced/bear market statistics, asset-class weights, equity sleeve shares, and reference returns.
4. Annual target return calculation and Decision Committee target approval.
5. Execution Team uses the approved annual data package for sleeve decomposition, beta, drawdown, proposed portfolio construction, backtest, and optimization.
6. Use generated values where available; use manual fallback fields only where a value is unavailable.
7. Continue to approval, monitoring, execution, reporting, and annual review.

## Current Public Sources

- Preferred personal test source: EODHD end-of-day historical API
- Fallback source: Yahoo Finance public chart endpoint
- Data used: adjusted close daily price series
- Current sample coverage: 2016-01-01 to the current run date
- Current proxies:
  - Equity: VTI
  - Bond: AGG
  - Alternative: GLD
  - Cash / cash-like: BIL
  - U.S. equity: VTI
  - Japan local equity: 1306.T
  - Japan U.S.-listed ETF exposure: EWJ
  - Hong Kong local equity: 2800.HK
  - Hong Kong U.S.-listed ETF exposure: EWH
  - China A local equity: 510300.SS
  - China A U.S.-listed ETF exposure: ASHR

The packaged configuration targets the paid EOD Historical Data personal plan. It requests the full configured history and all configured tickers, while retaining the historical cache and using Yahoo only when EODHD does not return a usable symbol. EODHD account quotas and symbol entitlements still apply. Before company or commercial use, confirm licensing and redistribution rights directly with EODHD.

Local configuration:

```text
PUBLIC_DATA_PROVIDER=eodhd
EODHD_API_TOKEN=<local secret>
EODHD_MAX_CALLS_PER_RUN=0
EODHD_FREE_MODE=false
PUBLIC_DATA_YAHOO_FALLBACK=true
```

`EODHD_MAX_CALLS_PER_RUN=0` means that the application does not add its own per-run limit; it does not bypass EODHD's account quota. Store these values in `.env` for local use or in deployment environment variables. Never place the real token in frontend code, generated files, screenshots, or source control.

## Allocation Scoring Method

The Public Data Engine does not use fixed allocation weights as the primary source. It calculates a scenario-based recommendation from historical public data each time it runs, while the administrator-maintained defaults remain only as fallback values when public data is unavailable or incomplete.

For each asset class and equity market, the engine calculates five inputs:

- Long-term annualized return: higher is better.
- Latest 1-year annualized trend: higher is better.
- Annualized volatility: lower is better.
- Maximum drawdown: smaller drawdown is better.
- Diversification score: a policy score reflecting the asset's portfolio risk-control value.

Each input is normalized to a 0-1 score across the compared sleeves. The engine then applies different weights by market scenario:

| Scenario | Long-term return | 1-year trend | Low volatility | Low drawdown | Diversification |
|---|---:|---:|---:|---:|---:|
| Bull | 35% | 25% | 15% | 15% | 10% |
| Balanced | 25% | 15% | 25% | 25% | 10% |
| Bear | 10% | 10% | 30% | 40% | 10% |

After scoring, the engine allocates weights inside the scenario's allowed range. It first assigns each sleeve its scenario minimum weight, then distributes the remaining weight according to the score. The final asset-class weights add to 100%, and the final equity-market shares also add to 100%.

## Local Historical Data Cache

The Public Data Engine retains the retrieved public historical price data locally. Its first run downloads the configured history. Later runs refresh only the last seven calendar days of each existing price series, merge the refreshed values into the saved history, remove duplicate dates, and recalculate the market statistics from the merged data.

- EODHD refreshes the configured priority subset within the call budget.
- A ticker newly added to the approved universe uses EODHD for its entitled recent history and the fallback path for older history when allowed.
- If an existing public source is temporarily unavailable, the prior cached series is retained and the run manifest records a warning.
- The local SQLite backend database retains the latest raw snapshot of historical prices, ticker universe, and market statistics. It also keeps the last 50 refresh records, including source, date range, update mode, row counts, and warnings, without duplicating every historical file.
- The Data Load Registry retains the imported CSV snapshot, hash, user, and timestamp for audit and later retrieval.

CPI forecast pages are configured as trusted source references in the backend. Because their forward forecast figures are not consistently available in a stable public machine-readable format, the Decision Committee reviews the linked source and enters the selected numeric forecast manually. The source link and manual entry are retained with the target package.

## Output Files

The engine writes files to:

`data/public_data_engine_output/`

Generated files:

- `auto_historical_prices.csv`
  - Historical adjusted close prices for benchmark and sample securities.
  - Used by beta calculation, backtesting, optimization, and the blended policy benchmark.
  - Includes the current blended benchmark proxies: VTI, 1306.T, 2800.HK, 510300.SS, AGG, GLD, and BIL, plus ETF-level proxies such as EWJ, EWH, and ASHR for U.S.-listed regional ETFs.

- `auto_ticker_universe.csv`
  - Approved ticker universe with market, region, asset class, style factor, and theme.
  - Used by the proposed portfolio selector.

- `auto_market_statistics.csv`
  - Scenario-based historical allocation recommendation data.
  - Used by the annual target and allocation recommendation step.

- `public_data_engine_manifest.json`
  - Run timestamp, source name, date range, output row counts, cache refresh details, and source warnings.
  - Used for audit and troubleshooting.

## How To Run

From the project folder:

```bash
npm run data:public
```

Or, when the local backend is running, use the application button:

`Run Public Data Engine`

The application button runs the engine, then loads the generated historical prices, ticker universe, and market statistics CSV files into the workflow.

The completion message confirms whether the run was an initial history download or an incremental refresh and states the prior cached date.

## Missing Value Fallback

The system supports partial data. If the generated CSV does not provide a value such as bond return, alternative return, or cash return, the workflow uses the manual fallback inputs shown in the `Public Data Engine` section.

Fallback fields currently include:

- Manual bond reference return
- Manual alternative reference return
- Manual cash reference return

The interface shows whether a generated/suggested value is available or whether manual fallback is active.

## Validation

Run:

```bash
npm run test:data-public
```

The validation checks:

- Required CSV files exist.
- Required columns are present.
- Historical price rows are sufficient.
- Scenario statistics include bull, balanced, and bear cases.
- Asset and region records are available for allocation recommendations.

## Notes For Business Users

The engine does not make an investment decision. It only prepares reference data. The decision committee still confirms:

- market scenario,
- annual target return,
- asset allocation,
- regional allocation,
- target drawdown range,
- final approved portfolio.

## Notes For IT Review

The current implementation is intentionally lightweight:

- no external package dependency,
- uses native Node.js `fetch`,
- writes standard CSV and JSON files,
- keeps the public data collection module separate from the core business workflow.

The current version also keeps an incremental local price cache and saves refresh metadata in the backend SQLite live database. This improves repeat run speed and preserves the historical series used for beta and backtest calculations.

A relational SQLite audit snapshot can be exported from the live SQLite database:

```bash
npm run data:sqlite
```

This export is a handoff and audit artifact. The current prototype uses `server/data/db.sqlite` as the live local store and writes `server/data/db_audit.sqlite` as the relational audit export.

Recommended production improvements:

- replace public free data with an approved institutional data source,
- add managed retries, usage monitoring, and vendor-service alerts,
- migrate the local cache and imported snapshots to a database table with retention and backup policies if the institution moves to a multi-user deployment,
- add scheduled runs and approval before overwriting active reference data,
- add source licensing checks.
