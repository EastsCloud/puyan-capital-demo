import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "data", "public_data_engine_output");

async function loadLocalEnvironment() {
  try {
    const text = await readFile(join(root, ".env"), "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator < 1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadLocalEnvironment();

const yahooTokyoSourceName = "Yahoo Finance public chart adjusted close (Tokyo-only exception)";
const yahooSourceUrl = "https://query1.finance.yahoo.com/v8/finance/chart/";
const eodhdSourceName = "EODHD end-of-day adjusted close";
const eodhdSourceUrl = "https://eodhd.com/api/eod/";
const preferredProvider = String(process.env.PUBLIC_DATA_PROVIDER || "eodhd").trim().toLowerCase();
const eodhdApiToken = String(process.env.EODHD_API_TOKEN || "").trim();
const eodhdEnabled = preferredProvider === "eodhd" && Boolean(eodhdApiToken);
const configuredEodhdCallLimit = Number.parseInt(process.env.EODHD_MAX_CALLS_PER_RUN || "0", 10);
const eodhdMaxCallsPerRun = Number.isFinite(configuredEodhdCallLimit) && configuredEodhdCallLimit > 0
  ? configuredEodhdCallLimit
  : null;
const yahooTokyoExceptionEnabled = String(process.env.PUBLIC_DATA_TOKYO_YAHOO_EXCEPTION || "true").trim().toLowerCase() !== "false";
const forceFullRefresh = String(process.env.PUBLIC_DATA_FORCE_FULL_REFRESH || "false").trim().toLowerCase() === "true";
const sourceName = eodhdEnabled
  ? `${eodhdSourceName}; ${yahooTokyoSourceName} retained only where EODHD has no Tokyo exchange coverage`
  : eodhdSourceName;
const sourceUrl = eodhdEnabled ? eodhdSourceUrl : yahooSourceUrl;
const cacheRefreshDays = 7;
const unsupportedEodhdMarketReasons = new Map([
  ["Tokyo", "The paid EODHD account exchange list does not include the Tokyo Stock Exchange; the exact local security cannot be replaced by an ADR or overseas proxy."],
]);

const engineConfig = {
  startDate: "2016-01-01",
  endDate: new Date().toISOString().slice(0, 10),
  priceTickers: [
    { ticker: "VTI", yahoo: "vti", name: "Vanguard Total Stock Market ETF", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Core", theme: "Core" },
    { ticker: "SPY", yahoo: "spy", name: "SPDR S&P 500 ETF Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Core", theme: "Core" },
    { ticker: "QQQ", yahoo: "qqq", name: "Invesco QQQ Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Growth" },
    { ticker: "DIA", yahoo: "dia", name: "SPDR Dow Jones Industrial Average ETF Trust", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Blue Chip" },
    { ticker: "IWM", yahoo: "iwm", name: "iShares Russell 2000 ETF", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Small Cap" },
    { ticker: "AAPL", yahoo: "aapl", name: "Apple Inc.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "MSFT", yahoo: "msft", name: "Microsoft Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "NVDA", yahoo: "nvda", name: "NVIDIA Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors" },
    { ticker: "JPM", yahoo: "jpm", name: "JPMorgan Chase & Co.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "XOM", yahoo: "xom", name: "Exxon Mobil Corporation", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "BRK.B", yahoo: "BRK-B", name: "Berkshire Hathaway Inc. Class B", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
    { ticker: "AMZN", yahoo: "amzn", name: "Amazon.com Inc.", market: "US", region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
    { ticker: "EWJ", yahoo: "ewj", name: "iShares MSCI Japan ETF", market: "US ETF", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "DXJ", yahoo: "dxj", name: "WisdomTree Japan Hedged Equity Fund", market: "US ETF", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "7203.T", yahoo: "7203.T", name: "Toyota Motor Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Japan Industrials" },
    { ticker: "6758.T", yahoo: "6758.T", name: "Sony Group Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "9984.T", yahoo: "9984.T", name: "SoftBank Group Corp.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "8306.T", yahoo: "8306.T", name: "Mitsubishi UFJ Financial Group", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "1321.T", yahoo: "1321.T", name: "iShares Core Nikkei 225 ETF", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "1306.T", yahoo: "1306.T", name: "NEXT FUNDS TOPIX ETF", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "8035.T", yahoo: "8035.T", name: "Tokyo Electron Limited", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6857.T", yahoo: "6857.T", name: "Advantest Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6920.T", yahoo: "6920.T", name: "Lasertec Corporation", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6526.T", yahoo: "6526.T", name: "Socionext Inc.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "9983.T", yahoo: "9983.T", name: "Fast Retailing Co., Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
    { ticker: "6367.T", yahoo: "6367.T", name: "Daikin Industries, Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
    { ticker: "7011.T", yahoo: "7011.T", name: "Mitsubishi Heavy Industries, Ltd.", market: "Tokyo", region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
    { ticker: "EWH", yahoo: "ewh", name: "iShares MSCI Hong Kong ETF", market: "US ETF", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "2800.HK", yahoo: "2800.HK", name: "Tracker Fund of Hong Kong", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "0700.HK", yahoo: "0700.HK", name: "Tencent Holdings Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "0005.HK", yahoo: "0005.HK", name: "HSBC Holdings plc", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "0388.HK", yahoo: "0388.HK", name: "Hong Kong Exchanges and Clearing Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "3690.HK", yahoo: "3690.HK", name: "Meituan", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
    { ticker: "2828.HK", yahoo: "2828.HK", name: "Hang Seng H-Share Index ETF", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "9988.HK", yahoo: "9988.HK", name: "Alibaba Group Holding Limited", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
    { ticker: "1810.HK", yahoo: "1810.HK", name: "Xiaomi Corporation", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "2318.HK", yahoo: "2318.HK", name: "Ping An Insurance Group", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "1398.HK", yahoo: "1398.HK", name: "Industrial and Commercial Bank of China", market: "Hong Kong", region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "ASHR", yahoo: "ashr", name: "Xtrackers Harvest CSI 300 China A-Shares ETF", market: "US ETF", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "KBA", yahoo: "kba", name: "KraneShares Bosera MSCI China A 50 Connect ETF", market: "US ETF", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "510300.SS", yahoo: "510300.SS", name: "Huatai-PB CSI 300 ETF", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "600519.SS", yahoo: "600519.SS", name: "Kweichow Moutai Co., Ltd.", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Leaders" },
    { ticker: "300750.SZ", yahoo: "300750.SZ", name: "Contemporary Amperex Technology Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
    { ticker: "601318.SS", yahoo: "601318.SS", name: "Ping An Insurance Group", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "000001.SZ", yahoo: "000001.SZ", name: "Ping An Bank Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "159915.SZ", yahoo: "159915.SZ", name: "China AMC ChiNext ETF", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "002594.SZ", yahoo: "002594.SZ", name: "BYD Company Limited", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
    { ticker: "688981.SS", yahoo: "688981.SS", name: "Semiconductor Manufacturing International Corporation", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "600036.SS", yahoo: "600036.SS", name: "China Merchants Bank Co., Ltd.", market: "Shanghai", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "000858.SZ", yahoo: "000858.SZ", name: "Wuliangye Yibin Co., Ltd.", market: "Shenzhen", region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
    { ticker: "AGG", yahoo: "agg", name: "iShares Core U.S. Aggregate Bond ETF", market: "US", region: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "TLT", yahoo: "tlt", name: "iShares 20+ Year Treasury Bond ETF", market: "US", region: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "GLD", yahoo: "gld", name: "SPDR Gold Shares", market: "US", region: "Global", assetClass: "Alternative", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "BIL", yahoo: "bil", name: "SPDR Bloomberg 1-3 Month T-Bill ETF", market: "US", region: "United States", assetClass: "Cash & Cash-like", styleFactor: "Defensive", theme: "Not Applicable" },
  ],
  statisticsProxies: [
    { key: "equity", label: "Equity", yahoo: "vti", ticker: "VTI", type: "Asset" },
    { key: "bond", label: "Bond", yahoo: "agg", ticker: "AGG", type: "Asset" },
    { key: "alternative", label: "Alternative", yahoo: "gld", ticker: "GLD", type: "Asset" },
    { key: "cash", label: "Cash & cash-like", yahoo: "bil", ticker: "BIL", type: "Asset" },
    { key: "us", label: "U.S. equity", yahoo: "vti", ticker: "VTI", type: "Region" },
    { key: "japan", label: "Japan equity", yahoo: "ewj", ticker: "EWJ", type: "Market" },
    { key: "hongkong", label: "Hong Kong equity", yahoo: "ewh", ticker: "EWH", type: "Market" },
    { key: "chinaa", label: "China A equity", yahoo: "ashr", ticker: "ASHR", type: "Market" },
  ],
  tickerUniverse: [
    { ticker: "VTI", name: "Vanguard Total Stock Market ETF", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Core", theme: "Core" },
    { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Core", theme: "Core" },
    { ticker: "QQQ", name: "Invesco QQQ Trust", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors" },
    { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF Trust", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "IWM", name: "iShares Russell 2000 ETF", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "AAPL", name: "Apple Inc.", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "MSFT", name: "Microsoft Corporation", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "NVDA", name: "NVIDIA Corporation", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors" },
    { ticker: "JPM", name: "JPMorgan Chase & Co.", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "XOM", name: "Exxon Mobil Corporation", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical" },
    { ticker: "BRK.B", name: "Berkshire Hathaway Inc. Class B", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
    { ticker: "AMZN", name: "Amazon.com Inc.", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Quality Compounders" },
    { ticker: "EWJ", name: "iShares MSCI Japan ETF", market: "US ETF", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "DXJ", name: "WisdomTree Japan Hedged Equity Fund", market: "US ETF", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "7203.T", name: "Toyota Motor Corporation", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Japan Industrials" },
    { ticker: "6758.T", name: "Sony Group Corporation", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders" },
    { ticker: "9984.T", name: "SoftBank Group Corp.", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "8306.T", name: "Mitsubishi UFJ Financial Group", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "1321.T", name: "iShares Core Nikkei 225 ETF", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "1306.T", name: "NEXT FUNDS TOPIX ETF", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF" },
    { ticker: "8035.T", name: "Tokyo Electron Limited", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6857.T", name: "Advantest Corporation", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6920.T", name: "Lasertec Corporation", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "6526.T", name: "Socionext Inc.", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "9983.T", name: "Fast Retailing Co., Ltd.", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
    { ticker: "6367.T", name: "Daikin Industries, Ltd.", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
    { ticker: "7011.T", name: "Mitsubishi Heavy Industries, Ltd.", market: "Tokyo", region: "Japan", geographicRegion: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Industrials" },
    { ticker: "EWH", name: "iShares MSCI Hong Kong ETF", market: "US ETF", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "2800.HK", name: "Tracker Fund of Hong Kong", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "0700.HK", name: "Tencent Holdings Limited", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "0005.HK", name: "HSBC Holdings plc", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "0388.HK", name: "Hong Kong Exchanges and Clearing Limited", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "3690.HK", name: "Meituan", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
    { ticker: "2828.HK", name: "Hang Seng H-Share Index ETF", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF" },
    { ticker: "9988.HK", name: "Alibaba Group Holding Limited", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform" },
    { ticker: "1810.HK", name: "Xiaomi Corporation", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform" },
    { ticker: "2318.HK", name: "Ping An Insurance Group", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "1398.HK", name: "Industrial and Commercial Bank of China", market: "Hong Kong", region: "Hong Kong", geographicRegion: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "ASHR", name: "Xtrackers Harvest CSI 300 China A-Shares ETF", market: "US ETF", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "KBA", name: "KraneShares Bosera MSCI China A 50 Connect ETF", market: "US ETF", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "510300.SS", name: "Huatai-PB CSI 300 ETF", market: "Shanghai", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "600519.SS", name: "Kweichow Moutai Co., Ltd.", market: "Shanghai", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Leaders" },
    { ticker: "300750.SZ", name: "Contemporary Amperex Technology Co., Ltd.", market: "Shenzhen", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
    { ticker: "601318.SS", name: "Ping An Insurance Group", market: "Shanghai", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "000001.SZ", name: "Ping An Bank Co., Ltd.", market: "Shenzhen", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "159915.SZ", name: "China AMC ChiNext ETF", market: "Shenzhen", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF" },
    { ticker: "002594.SZ", name: "BYD Company Limited", market: "Shenzhen", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery" },
    { ticker: "688981.SS", name: "Semiconductor Manufacturing International Corporation", market: "Shanghai", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Semiconductors" },
    { ticker: "600036.SS", name: "China Merchants Bank Co., Ltd.", market: "Shanghai", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials" },
    { ticker: "000858.SZ", name: "Wuliangye Yibin Co., Ltd.", market: "Shenzhen", region: "China A", geographicRegion: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Consumer" },
    { ticker: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "BIL", name: "SPDR Bloomberg 1-3 Month T-Bill ETF", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Cash & Cash-like", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "TLT", name: "iShares 20+ Year Treasury Bond ETF", market: "US", region: "United States", geographicRegion: "United States", assetClass: "Bond", styleFactor: "Defensive", theme: "Not Applicable" },
    { ticker: "GLD", name: "SPDR Gold Shares", market: "US", region: "Global", geographicRegion: "Global", assetClass: "Alternative", styleFactor: "Defensive", theme: "Not Applicable" },
  ],
};

const scenarioSettings = {
  Bull: {
    note: "Bull market guidance tilts toward equities and alternatives while keeping bonds and cash as risk buffers.",
    assets: {
      equity: { range: [60, 75] },
      bond: { range: [10, 25] },
      alternative: { range: [8, 18] },
      cash: { range: [0, 8] },
    },
    regions: {
      us: { range: [45, 70], note: "Core market beta anchor" },
      developed: { range: [5, 25], note: "Japan is the allowed developed ex-U.S. market" },
      emerging: { range: [10, 35], note: "Hong Kong and China A are the allowed emerging markets" },
    },
  },
  Balanced: {
    note: "Balanced market guidance keeps equity as the return engine while using bonds alternatives and cash to control drawdown.",
    assets: {
      equity: { range: [45, 65] },
      bond: { range: [20, 35] },
      alternative: { range: [8, 18] },
      cash: { range: [5, 15] },
    },
    regions: {
      us: { range: [45, 70], note: "Primary equity beta market" },
      developed: { range: [5, 25], note: "Japan is the allowed developed ex-U.S. market" },
      emerging: { range: [10, 35], note: "Hong Kong and China A are the allowed emerging markets" },
    },
  },
  Bear: {
    note: "Bear market guidance reduces equity weight and increases bonds plus cash to protect drawdown capacity.",
    assets: {
      equity: { range: [25, 45] },
      bond: { range: [35, 55] },
      alternative: { range: [5, 15] },
      cash: { range: [8, 22] },
    },
    regions: {
      us: { range: [50, 75], note: "Most liquid defensive equity anchor" },
      developed: { range: [5, 25], note: "Japan is the allowed developed ex-U.S. defensive market" },
      emerging: { range: [5, 30], note: "Reduced Hong Kong and China A exposure" },
    },
  },
};

const scenarioScoreProfiles = {
  Bull: {
    annualReturn: 0.35,
    trailingReturn: 0.25,
    volatility: 0.15,
    drawdown: 0.15,
    diversifier: 0.10,
  },
  Balanced: {
    annualReturn: 0.25,
    trailingReturn: 0.15,
    volatility: 0.25,
    drawdown: 0.25,
    diversifier: 0.10,
  },
  Bear: {
    annualReturn: 0.10,
    trailingReturn: 0.10,
    volatility: 0.30,
    drawdown: 0.40,
    diversifier: 0.10,
  },
};

const diversifierScores = {
  equity: 0.35,
  bond: 0.80,
  alternative: 0.70,
  cash: 0.90,
  us: 0.70,
  developed: 0.75,
  emerging: 0.50,
};

function epochSeconds(dateText) {
  return Math.floor(new Date(`${dateText}T00:00:00Z`).getTime() / 1000);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function fetchYahooSeries(symbol, startDate, endDate, minimumRows = 30) {
  const normalizedSymbol = symbol.toUpperCase();
  const period1 = epochSeconds(startDate);
  const period2 = epochSeconds(endDate) + 86_400;
  const url = `${yahooSourceUrl}${encodeURIComponent(normalizedSymbol)}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
  const response = await fetch(url, { headers: { "User-Agent": "InvestmentManagementTool/0.2" } });
  if (!response.ok) throw new Error(`Fetch failed for ${normalizedSymbol}: HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (!result?.timestamp?.length) {
    if (minimumRows === 0) return [];
    throw new Error(`No usable data for ${normalizedSymbol}`);
  }
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
  const rows = result.timestamp.map((timestamp, index) => {
    const close = Number(adjusted[index] ?? quote.close?.[index]);
    return {
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close,
    };
  }).filter((row) => row.date && Number.isFinite(row.close) && row.close > 0);
  if (rows.length < minimumRows) throw new Error(`Not enough usable data for ${normalizedSymbol}`);
  return rows;
}

function eodhdSymbolForItem(item) {
  const symbol = String(item.yahoo || item.ticker || "").toUpperCase();
  if (unsupportedEodhdMarketReasons.has(item.market)) return "";
  if (symbol.endsWith(".SS")) return `${symbol.slice(0, -3)}.SHG`;
  if (symbol.endsWith(".SZ")) return `${symbol.slice(0, -3)}.SHE`;
  if (symbol.endsWith(".HK")) return symbol;
  return `${symbol}.US`;
}

async function fetchEodhdSeries(symbol, startDate, endDate, minimumRows = 0) {
  if (!eodhdApiToken) throw new Error("EODHD API token is not configured");
  const params = new URLSearchParams({
    api_token: eodhdApiToken,
    fmt: "json",
    period: "d",
    order: "a",
    from: startDate,
    to: endDate,
  });
  const response = await fetch(`${eodhdSourceUrl}${encodeURIComponent(symbol)}?${params}`, {
    headers: { "User-Agent": "PuyanCapitalControlCenter/0.3" },
  });
  if (!response.ok) throw new Error(`EODHD fetch failed for ${symbol}: HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    const message = payload?.message || payload?.error || "unexpected response";
    throw new Error(`EODHD returned no price series for ${symbol}: ${message}`);
  }
  const rows = payload.map((row) => ({
    date: String(row.date || "").slice(0, 10),
    close: Number(row.adjusted_close ?? row.close),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0);
  if (rows.length < minimumRows) throw new Error(`EODHD returned fewer than ${minimumRows} usable rows for ${symbol}`);
  return rows;
}

function selectedEodhdTickers() {
  if (!eodhdEnabled) return new Set();
  const configured = String(process.env.EODHD_TICKERS || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const applyCallLimit = (tickers) => eodhdMaxCallsPerRun === null
    ? tickers
    : tickers.slice(0, eodhdMaxCallsPerRun);
  const supportedItems = engineConfig.priceTickers.filter((item) => !unsupportedEodhdMarketReasons.has(item.market));
  const supportedTickers = new Set(supportedItems.map((item) => item.ticker));
  if (configured.length) return new Set(applyCallLimit(configured.filter((ticker) => supportedTickers.has(ticker))));
  const proxyYahooSymbols = new Set(engineConfig.statisticsProxies.map((item) => item.yahoo.toUpperCase()));
  return new Set(applyCallLimit([...supportedItems]
    .sort((left, right) => Number(proxyYahooSymbols.has(right.yahoo.toUpperCase()))
      - Number(proxyYahooSymbols.has(left.yahoo.toUpperCase())))
    .map((item) => item.ticker)));
}

function previousCalendarDate(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function mergeSeries(cached = [], fresh = []) {
  const byDate = new Map();
  cached.forEach((row) => byDate.set(row.date, row));
  fresh.forEach((row) => byDate.set(row.date, row));
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function readCachedPriceSeries(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const rows = text.trim().split(/\r?\n/).filter(Boolean);
    if (rows.length < 2) return { seriesByTicker: {}, lastDate: "", rowCount: 0 };

    const headers = rows[0].split(",").map((value) => value.trim());
    const dateIndex = headers.indexOf("Date");
    if (dateIndex < 0) return { seriesByTicker: {}, lastDate: "", rowCount: 0 };

    const configuredTickers = new Set(engineConfig.priceTickers.map((item) => item.ticker));
    const tickerIndexes = headers
      .map((ticker, index) => ({ ticker, index }))
      .filter(({ ticker }) => configuredTickers.has(ticker));
    const seriesByTicker = Object.fromEntries(tickerIndexes.map(({ ticker }) => [ticker, []]));
    let lastDate = "";

    rows.slice(1).forEach((line) => {
      const values = line.split(",");
      const date = values[dateIndex];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      lastDate = date > lastDate ? date : lastDate;
      tickerIndexes.forEach(({ ticker, index }) => {
        const close = Number(values[index]);
        if (Number.isFinite(close) && close > 0) seriesByTicker[ticker].push({ date, close });
      });
    });
    return { seriesByTicker, lastDate, rowCount: Math.max(rows.length - 1, 0) };
  } catch (error) {
    if (error.code === "ENOENT") return { seriesByTicker: {}, lastDate: "", rowCount: 0 };
    throw error;
  }
}

function returnsFromSeries(series) {
  const returns = [];
  for (let index = 1; index < series.length; index += 1) {
    returns.push(series[index].close / series[index - 1].close - 1);
  }
  return returns;
}

function annualizedReturn(returns) {
  if (!returns.length) return 0;
  const cumulative = returns.reduce((value, item) => value * (1 + item), 1);
  return (cumulative ** (252 / returns.length) - 1) * 100;
}

function annualizedVolatility(returns) {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function maxDrawdown(series) {
  let peak = 0;
  let drawdown = 0;
  for (const row of series) {
    peak = Math.max(peak, row.close);
    if (peak > 0) drawdown = Math.min(drawdown, row.close / peak - 1);
  }
  return drawdown * 100;
}

function trailingAnnualizedReturn(series, days) {
  const slice = series.slice(Math.max(0, series.length - days - 1));
  return annualizedReturn(returnsFromSeries(slice));
}

function normalizedMetric(keys, metrics, selector, higherIsBetter = true) {
  const values = keys.map((key) => selector(metrics[key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Object.fromEntries(keys.map((key) => {
    if (Math.abs(max - min) < 1e-9) return [key, 0.5];
    const raw = (selector(metrics[key]) - min) / (max - min);
    return [key, higherIsBetter ? raw : 1 - raw];
  }));
}

function scoreSleeves(keys, metrics, profile) {
  const annual = normalizedMetric(keys, metrics, (item) => item.return, true);
  const trailing = normalizedMetric(keys, metrics, (item) => item.trailingReturn, true);
  const volatility = normalizedMetric(keys, metrics, (item) => item.volatility, false);
  const drawdown = normalizedMetric(keys, metrics, (item) => Math.abs(item.drawdown), false);
  return Object.fromEntries(keys.map((key) => {
    const score = profile.annualReturn * annual[key]
      + profile.trailingReturn * trailing[key]
      + profile.volatility * volatility[key]
      + profile.drawdown * drawdown[key]
      + profile.diversifier * (diversifierScores[key] ?? 0.5);
    return [key, score];
  }));
}

function allocateWithinRanges(ranges, scores) {
  const keys = Object.keys(ranges);
  const result = Object.fromEntries(keys.map((key) => [key, ranges[key].range[0]]));
  let remaining = 100 - keys.reduce((sum, key) => sum + result[key], 0);
  let active = keys.filter((key) => ranges[key].range[1] > result[key]);

  while (remaining > 0.0001 && active.length) {
    const totalScore = active.reduce((sum, key) => sum + Math.max(scores[key] ?? 0, 0.01), 0);
    let used = 0;
    const nextActive = [];
    active.forEach((key) => {
      const capacity = ranges[key].range[1] - result[key];
      const proposed = remaining * (Math.max(scores[key] ?? 0, 0.01) / totalScore);
      const add = Math.min(capacity, proposed);
      result[key] += add;
      used += add;
      if (capacity - add > 0.0001) nextActive.push(key);
    });
    if (used <= 0.0001) break;
    remaining -= used;
    active = nextActive;
  }

  const rounded = Object.fromEntries(keys.map((key) => [key, Number(result[key].toFixed(2))]));
  const roundingGap = Number((100 - keys.reduce((sum, key) => sum + rounded[key], 0)).toFixed(2));
  if (Math.abs(roundingGap) >= 0.01) {
    const adjustable = keys
      .filter((key) => rounded[key] + roundingGap >= ranges[key].range[0] && rounded[key] + roundingGap <= ranges[key].range[1])
      .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
    if (adjustable) rounded[adjustable] = Number((rounded[adjustable] + roundingGap).toFixed(2));
  }
  return rounded;
}

function weightedMetric(label, ticker, weights, metrics) {
  const entries = Object.entries(weights).filter(([key, weight]) => metrics[key] && weight > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  const weighted = (selector) => entries.reduce((sum, [key, weight]) => sum + selector(metrics[key]) * weight / totalWeight, 0);
  return {
    return: weighted((item) => item.return),
    trailingReturn: weighted((item) => item.trailingReturn),
    volatility: weighted((item) => item.volatility),
    drawdown: weighted((item) => item.drawdown),
    label,
    type: "Region",
    ticker,
  };
}

function financeQuoteUrl(ticker) {
  if (eodhdEnabled) {
    return `${eodhdSourceUrl}${encodeURIComponent(eodhdSymbolForItem({ ticker, yahoo: ticker }))}`;
  }
  return ticker.includes("+")
    ? "https://finance.yahoo.com/"
    : `https://finance.yahoo.com/quote/${ticker}`;
}

function buildPriceCsv(seriesByTicker) {
  const tickers = engineConfig.priceTickers.map((item) => item.ticker);
  const maps = Object.fromEntries(tickers.map((ticker) => [ticker, new Map(seriesByTicker[ticker].map((row) => [row.date, row.close]))]));
  const allDates = Array.from(new Set(tickers.flatMap((ticker) => Array.from(maps[ticker].keys())))).sort();
  const rows = [["Date", ...tickers, "CASH"]];
  allDates.forEach((date) => {
    rows.push([
      date,
      ...tickers.map((ticker) => (maps[ticker].has(date) ? maps[ticker].get(date).toFixed(2) : "")),
      "1.00",
    ]);
  });
  return { csv: toCsv(rows), rowCount: allDates.length };
}

function buildTickerUniverseCsv() {
  const rows = [["Ticker", "Name", "Market", "Region", "GeographicRegion", "AssetClass", "StyleFactor", "Theme"]];
  engineConfig.tickerUniverse.forEach((row) => {
    rows.push([row.ticker, row.name, row.market, row.region, row.geographicRegion, row.assetClass, row.styleFactor, row.theme]);
  });
  return { csv: toCsv(rows), rowCount: engineConfig.tickerUniverse.length };
}

function buildMarketStatisticsCsv(seriesByProxy) {
  const metrics = {};
  for (const proxy of engineConfig.statisticsProxies) {
    const series = seriesByProxy[proxy.key];
    const returns = returnsFromSeries(series);
    metrics[proxy.key] = {
      return: annualizedReturn(returns),
      trailingReturn: trailingAnnualizedReturn(series, 252),
      volatility: annualizedVolatility(returns),
      drawdown: maxDrawdown(series),
      label: proxy.label,
      type: proxy.type,
      ticker: proxy.ticker,
    };
  }
  metrics.developed = weightedMetric("Developed ex-U.S. equity", "EWJ", { japan: 1 }, metrics);
  metrics.emerging = weightedMetric("Emerging markets equity", "EWH+ASHR", { hongkong: 0.6, chinaa: 0.4 }, metrics);

  const rows = [[
    "Scenario", "Scenario Note", "Row Type", "Sleeve Key", "Sleeve Label", "Historical Return", "Volatility",
    "Max Drawdown", "Suggested Low", "Suggested High", "Suggested Weight", "Equity Share",
    "Correlation Note", "Source Name", "Source Date", "Source URL",
  ]];

  Object.entries(scenarioSettings).forEach(([scenario, setting]) => {
    const profile = scenarioScoreProfiles[scenario];
    const assetKeys = Object.keys(setting.assets);
    const regionKeys = Object.keys(setting.regions);
    const assetScores = scoreSleeves(assetKeys, metrics, profile);
    const regionScores = scoreSleeves(regionKeys, metrics, profile);
    const assetWeights = allocateWithinRanges(setting.assets, assetScores);
    const regionShares = allocateWithinRanges(setting.regions, regionScores);

    Object.entries(setting.assets).forEach(([key, config]) => {
      const item = metrics[key];
      rows.push([
        scenario, setting.note, "Asset", key, item.label, item.return.toFixed(2), item.volatility.toFixed(2), item.drawdown.toFixed(2),
        config.range[0].toFixed(2), config.range[1].toFixed(2), assetWeights[key].toFixed(2), "",
        `Score ${assetScores[key].toFixed(3)} from return, 1Y trend, volatility, drawdown and diversification using ${item.ticker} proxy`,
        sourceName, engineConfig.endDate, financeQuoteUrl(item.ticker),
      ]);
    });
    Object.entries(setting.regions).forEach(([key, config]) => {
      const item = metrics[key];
      rows.push([
        scenario, setting.note, "Region", key, item.label, item.return.toFixed(2), item.volatility.toFixed(2), "",
        config.range[0].toFixed(2), config.range[1].toFixed(2), "0.00", regionShares[key].toFixed(2),
        `${config.note}; score ${regionScores[key].toFixed(3)} from return, 1Y trend, volatility, drawdown and diversification`,
        sourceName, engineConfig.endDate, financeQuoteUrl(item.ticker),
      ]);
    });
  });

  return { csv: toCsv(rows), rowCount: rows.length - 1 };
}

async function main() {
  if (!eodhdEnabled) {
    throw new Error("EODHD paid mode requires PUBLIC_DATA_PROVIDER=eodhd and a configured EODHD_API_TOKEN");
  }
  await mkdir(outputDir, { recursive: true });
  const files = {
    historicalPrices: join(outputDir, "auto_historical_prices.csv"),
    tickerUniverse: join(outputDir, "auto_ticker_universe.csv"),
    marketStatistics: join(outputDir, "auto_market_statistics.csv"),
    manifest: join(outputDir, "public_data_engine_manifest.json"),
  };
  const cached = await readCachedPriceSeries(files.historicalPrices);
  const priceSeries = {};
  const refreshes = [];
  const warnings = [];
  const retainedExternalExceptions = [];
  const eodhdTickers = selectedEodhdTickers();
  let eodhdCallsUsed = 0;

  for (const item of engineConfig.priceTickers) {
    const prior = cached.seriesByTicker[item.ticker] || [];
    const firstCachedDate = prior[0]?.date || "";
    const hasCachedHistory = prior.length >= 30;
    const useIncrementalRefresh = !forceFullRefresh && hasCachedHistory;
    const fetchStartDate = useIncrementalRefresh
      ? [engineConfig.startDate, previousCalendarDate(prior[prior.length - 1].date, cacheRefreshDays)].sort().at(-1)
      : engineConfig.startDate;
    let fresh = [];
    let retainedCacheAfterError = false;
    const eodhdUnavailableReason = unsupportedEodhdMarketReasons.get(item.market) || "";
    let provider = "EODHD";
    let providerSymbol = eodhdSymbolForItem(item);
    let mode = useIncrementalRefresh ? "incremental" : "full-history";
    try {
      if (eodhdTickers.has(item.ticker)) {
        eodhdCallsUsed += 1;
        fresh = await fetchEodhdSeries(providerSymbol, fetchStartDate, engineConfig.endDate, useIncrementalRefresh ? 0 : 30);
        mode = useIncrementalRefresh ? "eodhd-incremental" : "eodhd-full-history";
      } else if (eodhdUnavailableReason && yahooTokyoExceptionEnabled) {
        provider = yahooTokyoSourceName;
        providerSymbol = item.yahoo.toUpperCase();
        fresh = await fetchYahooSeries(item.yahoo, fetchStartDate, engineConfig.endDate, useIncrementalRefresh ? 0 : 30);
        mode = useIncrementalRefresh ? "yahoo-tokyo-exception-incremental" : "yahoo-tokyo-exception-full-history";
        retainedExternalExceptions.push({
          ticker: item.ticker,
          provider,
          reason: eodhdUnavailableReason,
          assessment: "Usable for demonstration and continuity, but an unofficial public endpoint is not recommended as the sole production source.",
        });
      } else if (eodhdUnavailableReason) {
        throw new Error(`${item.ticker} is not covered by EODHD and the explicit Tokyo exception is disabled`);
      } else {
        throw new Error(`${item.ticker} was not selected within the configured EODHD call limit`);
      }
    } catch (error) {
      warnings.push(`${item.ticker}: ${error.message}.`);
      if (!hasCachedHistory) throw error;
      retainedCacheAfterError = true;
      if (retainedCacheAfterError) warnings.push(`${item.ticker}: cached history retained.`);
    }
    priceSeries[item.ticker] = retainedCacheAfterError
      ? prior
      : (useIncrementalRefresh ? mergeSeries(prior, fresh) : fresh);
    refreshes.push({
      ticker: item.ticker,
      yahoo: item.yahoo.toUpperCase(),
      eodhd: eodhdSymbolForItem(item) || null,
      provider: retainedCacheAfterError ? "Cache" : provider,
      providerSymbol,
      mode: retainedCacheAfterError ? "cached-retained" : mode,
      fetchStartDate,
      cachedRows: prior.length,
      cachedFirstDate: firstCachedDate,
      requiredStartDate: engineConfig.startDate,
      refreshedRows: fresh.length,
      finalRows: priceSeries[item.ticker].length,
    });
  }

  const priceSeriesByYahoo = new Map(engineConfig.priceTickers.map((item) => [item.yahoo.toUpperCase(), priceSeries[item.ticker]]));
  const proxySeries = Object.fromEntries(engineConfig.statisticsProxies.map((item) => [item.key, priceSeriesByYahoo.get(item.yahoo.toUpperCase()) || []]));

  const prices = buildPriceCsv(priceSeries);
  const tickers = buildTickerUniverseCsv();
  const stats = buildMarketStatisticsCsv(proxySeries);
  await writeFile(files.historicalPrices, prices.csv);
  await writeFile(files.tickerUniverse, tickers.csv);
  await writeFile(files.marketStatistics, stats.csv);
  await writeFile(files.manifest, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceName,
    sourceUrl,
    provider: {
      preferred: preferredProvider,
      active: "eodhd",
      eodhdConfigured: Boolean(eodhdApiToken),
      planMode: "paid-eod-historical-all-world",
      eodhdCallBudget: eodhdMaxCallsPerRun,
      eodhdCallsUsed,
      genericYahooFallbackEnabled: false,
      yahooTokyoExceptionEnabled,
      forceFullRefresh,
      tokenStoredInManifest: false,
    },
    startDate: engineConfig.startDate,
    endDate: engineConfig.endDate,
    cache: {
      strategy: forceFullRefresh
        ? "Replace all configured price histories from their approved providers."
        : `Use existing price history and refresh the last ${cacheRefreshDays} calendar days. New tickers receive a one-time full history download.`,
      previousLastDate: cached.lastDate || null,
      cachedRowsBefore: cached.rowCount,
      incrementalTickers: refreshes.filter((item) => item.mode.includes("incremental")).length,
      fullHistoryTickers: refreshes.filter((item) => item.mode.includes("full-history") || item.mode.includes("history")).length,
      refreshes,
      warnings,
      retainedExternalExceptions,
    },
    methodology: {
      priceProxies: {
        equity: "VTI",
        bond: "AGG",
        alternative: "GLD",
        cash: "BIL",
        usEquity: "VTI",
        developedExUsEquity: "EWJ",
        emergingMarketsEquity: "60% EWH + 40% ASHR",
      },
      metrics: [
        "10-year annualized return",
        "1-year trailing annualized return",
        "annualized volatility",
        "maximum drawdown",
        "diversification score",
      ],
      scoringProfiles: scenarioScoreProfiles,
      allocationRule: "Score each asset or equity market, then allocate weights inside the built-in Bull/Balanced/Bear lower and upper ranges. Higher score receives more of the range capacity, with all final weights summing to 100%.",
    },
    outputs: {
      historicalPrices: { path: files.historicalPrices, rows: prices.rowCount },
      tickerUniverse: { path: files.tickerUniverse, rows: tickers.rowCount },
      marketStatistics: { path: files.marketStatistics, rows: stats.rowCount },
    },
  }, null, 2)}\n`);
  console.log(`Public data engine completed.`);
  console.log(`Historical prices: ${files.historicalPrices} (${prices.rowCount} rows)`);
  console.log(`Ticker universe: ${files.tickerUniverse} (${tickers.rowCount} rows)`);
  console.log(`Market statistics: ${files.marketStatistics} (${stats.rowCount} rows)`);
  console.log(`Manifest: ${files.manifest}`);
  console.log(`Provider: ${sourceName}`);
  console.log(`EODHD calls used: ${eodhdCallsUsed}/${eodhdMaxCallsPerRun ?? "all configured tickers"}`);
  console.log(`Cache refresh: ${refreshes.filter((item) => item.mode.includes("incremental")).length} incremental, ${refreshes.filter((item) => item.mode.includes("full-history") || item.mode.includes("history")).length} full history.`);
}

main().catch((error) => {
  console.error(`Public data engine failed: ${error.message}`);
  process.exitCode = 1;
});
