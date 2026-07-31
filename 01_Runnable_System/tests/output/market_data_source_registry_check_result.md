# Market Data Source Registry Check Result

Generated at: 2026-07-30T10:34:09.716Z

| Status | Check | Detail |
| --- | --- | --- |
| PASS | Registry has version | 2026-07-26.1 |
| PASS | Registry lists public, fallback, and planned vendor sources | 7 source(s) |
| PASS | EODHD personal test source is registered | eodhd-eod-adjusted-close |
| PASS | Tokyo-only public price exception is registered | yahoo-chart-adjusted-close |
| PASS | Yahoo use is restricted to the Tokyo exception | retained_tokyo_exception |
| PASS | Manual fallback source is registered | administrator-manual-market-data |
| PASS | Future paid vendor interface is registered | future-institutional-market-data-vendor |
| PASS | Unique source id: eodhd-eod-adjusted-close | eodhd-eod-adjusted-close |
| PASS | Priority configured: eodhd-eod-adjusted-close | 5 |
| PASS | Usage configured: eodhd-eod-adjusted-close | 4 use(s) |
| PASS | Refresh cadence configured: eodhd-eod-adjusted-close | manual or scheduled end-of-day refresh within the EODHD account quota |
| PASS | Fallback configured: eodhd-eod-adjusted-close | Retain the last successful cache when an EODHD-supported ticker fails. Do not silently substitute another provider. |
| PASS | Owning file configured: eodhd-eod-adjusted-close | scripts/public_data_engine.mjs and local EODHD_API_TOKEN environment variable |
| PASS | Unique source id: yahoo-chart-adjusted-close | yahoo-chart-adjusted-close |
| PASS | Priority configured: yahoo-chart-adjusted-close | 10 |
| PASS | Usage configured: yahoo-chart-adjusted-close | 3 use(s) |
| PASS | Refresh cadence configured: yahoo-chart-adjusted-close | seven-day incremental cache refresh only for the configured Tokyo-listed exceptions |
| PASS | Fallback configured: yahoo-chart-adjusted-close | Retain the last successful cache or upload an administrator-approved Tokyo market-data file. |
| PASS | Owning file configured: yahoo-chart-adjusted-close | scripts/public_data_engine.mjs |
| PASS | Unique source id: philadelphia-fed-spf-cpi | philadelphia-fed-spf-cpi |
| PASS | Priority configured: philadelphia-fed-spf-cpi | 20 |
| PASS | Usage configured: philadelphia-fed-spf-cpi | 2 use(s) |
| PASS | Refresh cadence configured: philadelphia-fed-spf-cpi | annual target-return cycle |
| PASS | Fallback configured: philadelphia-fed-spf-cpi | Decision Committee enters the numeric CPI value after reviewing the source. |
| PASS | Owning file configured: philadelphia-fed-spf-cpi | server/core.mjs systemConfig.publicCpiSources |
| PASS | Unique source id: cleveland-fed-inflation-nowcasting | cleveland-fed-inflation-nowcasting |
| PASS | Priority configured: cleveland-fed-inflation-nowcasting | 30 |
| PASS | Usage configured: cleveland-fed-inflation-nowcasting | 2 use(s) |
| PASS | Refresh cadence configured: cleveland-fed-inflation-nowcasting | annual target-return cycle |
| PASS | Fallback configured: cleveland-fed-inflation-nowcasting | Decision Committee enters the numeric CPI value after reviewing the source. |
| PASS | Owning file configured: cleveland-fed-inflation-nowcasting | server/core.mjs systemConfig.publicCpiSources |
| PASS | Unique source id: bls-cpi-public-api | bls-cpi-public-api |
| PASS | Priority configured: bls-cpi-public-api | 40 |
| PASS | Usage configured: bls-cpi-public-api | 2 use(s) |
| PASS | Refresh cadence configured: bls-cpi-public-api | annual target-return cycle |
| PASS | Fallback configured: bls-cpi-public-api | Decision Committee enters the forward CPI estimate if forward machine-readable data is not available. |
| PASS | Owning file configured: bls-cpi-public-api | server/server.mjs targetSourceUrls |
| PASS | Unique source id: administrator-manual-market-data | administrator-manual-market-data |
| PASS | Priority configured: administrator-manual-market-data | 90 |
| PASS | Usage configured: administrator-manual-market-data | 4 use(s) |
| PASS | Refresh cadence configured: administrator-manual-market-data | only when public data is unavailable or the administrator approves a policy update |
| PASS | Fallback configured: administrator-manual-market-data | This is the fallback source; every submitted file must keep import hash, user, timestamp, and version. |
| PASS | Owning file configured: administrator-manual-market-data | application upload forms and system parameter maintenance |
| PASS | Unique source id: future-institutional-market-data-vendor | future-institutional-market-data-vendor |
| PASS | Priority configured: future-institutional-market-data-vendor | 5 |
| PASS | Usage configured: future-institutional-market-data-vendor | 4 use(s) |
| PASS | Refresh cadence configured: future-institutional-market-data-vendor | daily for price data and annual for reference package approval |
| PASS | Fallback configured: future-institutional-market-data-vendor | Use the administrator-approved CSV interface until a paid vendor is selected. |
| PASS | Owning file configured: future-institutional-market-data-vendor | future data adapter |
| PASS | Manifest source name matches active registry provider | EODHD end-of-day adjusted close; Yahoo Finance public chart adjusted close (Tokyo-only exception) retained only where EODHD has no Tokyo exchange coverage / EODHD end-of-day adjusted close |
| PASS | Manifest source URL matches active registry endpoint | https://eodhd.com/api/eod/ |
| PASS | Annual reference package policy is explicit | Run once at the start of the investment year, then refresh only if the committee requests a new approved package. |
| PASS | Monthly rebalance check policy is explicit | Run monthly; do not trigger trade workflow between monthly checks unless the policy is changed by the administrator. |
