import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "data", "public_data_engine_output");
const reportDir = join(root, "tests", "output");
const reportPath = join(reportDir, "live_public_data_verification_result.md");
const pricePath = join(outputDir, "auto_historical_prices.csv");
const statisticsPath = join(outputDir, "auto_market_statistics.csv");
const manifestPath = join(outputDir, "public_data_engine_manifest.json");
const statisticAnchors = [
  { key: "equity", ticker: "VTI" },
  { key: "bond", ticker: "AGG" },
  { key: "alternative", ticker: "GLD" },
  { key: "cash", ticker: "BIL" },
];
const checks = [];

function loadLocalEnvironment() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell !== ""));
}

function csvObjects(path) {
  if (!existsSync(path)) throw new Error(`Required annual public-data output is missing: ${path}`);
  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length < 2) throw new Error(`Required annual public-data output has no data rows: ${path}`);
  const headers = rows[0];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function record(status, check, detail) {
  checks.push({ status, check, detail });
}

function subtractCalendarDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function seriesFromPriceRows(rows, ticker) {
  return rows
    .map((row) => ({ date: row.Date, close: Number(row[ticker]) }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
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

function maximumDrawdown(series) {
  let peak = 0;
  let drawdown = 0;
  series.forEach((row) => {
    peak = Math.max(peak, row.close);
    if (peak > 0) drawdown = Math.min(drawdown, row.close / peak - 1);
  });
  return drawdown * 100;
}

function betaFromSeries(assetSeries, benchmarkSeries) {
  const benchmarkByDate = new Map(benchmarkSeries.map((row) => [row.date, row.close]));
  const pairedPrices = assetSeries
    .filter((row) => benchmarkByDate.has(row.date))
    .map((row) => ({ date: row.date, asset: row.close, benchmark: benchmarkByDate.get(row.date) }));
  const pairs = [];
  for (let index = 1; index < pairedPrices.length; index += 1) {
    pairs.push({
      asset: pairedPrices[index].asset / pairedPrices[index - 1].asset - 1,
      benchmark: pairedPrices[index].benchmark / pairedPrices[index - 1].benchmark - 1,
    });
  }
  if (pairs.length < 2) return null;
  const meanAsset = pairs.reduce((sum, pair) => sum + pair.asset, 0) / pairs.length;
  const meanBenchmark = pairs.reduce((sum, pair) => sum + pair.benchmark, 0) / pairs.length;
  const covariance = pairs.reduce(
    (sum, pair) => sum + (pair.asset - meanAsset) * (pair.benchmark - meanBenchmark),
    0,
  );
  const variance = pairs.reduce(
    (sum, pair) => sum + (pair.benchmark - meanBenchmark) ** 2,
    0,
  );
  return variance === 0 ? null : covariance / variance;
}

async function fetchEodhdRows(providerSymbol, from, to, apiToken) {
  const parameters = new URLSearchParams({
    api_token: apiToken,
    fmt: "json",
    period: "d",
    order: "a",
    from,
    to,
  });
  const response = await fetch(`https://eodhd.com/api/eod/${encodeURIComponent(providerSymbol)}?${parameters}`, {
    headers: { "User-Agent": "PuyanCapitalControlCenterDataVerification/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error(payload?.message || payload?.error || "non-array response");
  return payload.map((row) => ({
    date: String(row.date || "").slice(0, 10),
    close: Number(row.adjusted_close ?? row.close),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0);
}

async function fetchYahooRows(providerSymbol, from, to) {
  const start = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const end = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) + 86_400;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?period1=${start}&period2=${end}&interval=1d&events=history`,
    { headers: { "User-Agent": "PuyanCapitalControlCenterDataVerification/1.0" } },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0] || {};
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose || [];
  if (!result?.timestamp?.length) throw new Error("no usable chart response");
  return result.timestamp.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    close: Number(adjusted[index] ?? quote.close?.[index]),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.close) && row.close > 0);
}

function writeReport(manifest, betaEvidence) {
  mkdirSync(reportDir, { recursive: true });
  const lines = [
    "# Live Annual Public Data Verification",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Annual data package generated at: ${manifest.generatedAt || "unknown"}`,
    "",
    "This test independently queried each provider recorded in the annual manifest and compared returned adjusted-close values with the current annual public-data output. It also recalculated the generated statistics from the saved price series. The API token is never written to this report.",
    "",
    "| Status | Check | Evidence |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
    "",
    "## Derived Beta Evidence",
    "",
    "These beta values are calculated from the externally sourced price series; they are not fields returned by EODHD.",
    "",
    "| Ticker | Benchmark | Observations | Calculated beta |",
    "| --- | --- | ---: | ---: |",
    ...betaEvidence.map((item) => `| ${item.ticker} | ${item.benchmark} | ${item.observations} | ${item.beta === null ? "No data" : item.beta.toFixed(4)} |`),
    "",
  ];
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

loadLocalEnvironment();

let manifest = {};
let betaEvidence = [];
try {
  const apiToken = String(process.env.EODHD_API_TOKEN || "").trim();
  if (!apiToken) throw new Error("EODHD_API_TOKEN is not configured in .env or the process environment");

  if (!existsSync(manifestPath)) throw new Error(`Annual public-data manifest is missing: ${manifestPath}`);
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const priceRows = csvObjects(pricePath);
  const statisticRows = csvObjects(statisticsPath);
  const refreshes = Array.isArray(manifest.cache?.refreshes) ? manifest.cache.refreshes : [];
  if (!refreshes.length) throw new Error("Annual public-data manifest contains no ticker refresh records");

  for (const refresh of refreshes) {
    const ticker = refresh.ticker;
    const localSeries = seriesFromPriceRows(priceRows, ticker);
    const providerSymbol = refresh?.providerSymbol || `${ticker}.US`;
    const latestLocal = localSeries.at(-1);
    if (!latestLocal) {
      record("FAIL", `${ticker} has current annual price data`, "No usable local price rows");
      continue;
    }
    try {
      const from = subtractCalendarDays(latestLocal.date, 14);
      const isEodhd = refresh.provider === "EODHD";
      const isTokyoException = String(refresh.provider || "").includes("Tokyo-only exception");
      if (!isEodhd && !isTokyoException) {
        record("FAIL", `${ticker} has a verifiable external provider`, `Manifest provider is ${refresh.provider || "unknown"}`);
        continue;
      }
      const remoteRows = isEodhd
        ? await fetchEodhdRows(providerSymbol, from, latestLocal.date, apiToken)
        : await fetchYahooRows(providerSymbol, from, latestLocal.date);
      const localByDate = new Map(localSeries.map((row) => [row.date, row.close]));
      const matched = remoteRows.filter((row) => localByDate.has(row.date)).at(-1);
      if (!matched) {
        record("FAIL", `${ticker} external value matches annual output`, `No overlapping date returned for ${providerSymbol}`);
        continue;
      }
      const localValue = localByDate.get(matched.date);
      const remoteRounded = Number(matched.close.toFixed(2));
      const matches = Math.abs(localValue - remoteRounded) < 0.011;
      record(
        matches ? "PASS" : "FAIL",
        `${ticker} external value matches annual output`,
        `${matched.date}: ${isEodhd ? "EODHD" : "Yahoo Tokyo exception"} ${remoteRounded.toFixed(2)} vs annual output ${localValue.toFixed(2)}; manifest provider ${refresh?.provider || "unknown"}`,
      );
    } catch (error) {
      record("FAIL", `${ticker} live provider request succeeds`, `${providerSymbol}: ${error.message}`);
    }
  }

  for (const anchor of statisticAnchors) {
    const series = seriesFromPriceRows(priceRows, anchor.ticker);
    const returns = returnsFromSeries(series);
    const generated = statisticRows.find(
      (row) => row.Scenario === "Balanced" && row["Row Type"] === "Asset" && row["Sleeve Key"] === anchor.key,
    );
    if (!generated) {
      record("FAIL", `${anchor.key} generated statistics can be located`, "Balanced asset row missing");
      continue;
    }
    const comparisons = [
      { label: "return", calculated: annualizedReturn(returns), generated: Number(generated["Historical Return"]) },
      { label: "volatility", calculated: annualizedVolatility(returns), generated: Number(generated.Volatility) },
      { label: "drawdown", calculated: maximumDrawdown(series), generated: Number(generated["Max Drawdown"]) },
    ];
    comparisons.forEach((comparison) => {
      const difference = Math.abs(comparison.calculated - comparison.generated);
      record(
        Number.isFinite(comparison.generated) && difference <= 0.10 ? "PASS" : "FAIL",
        `${anchor.key} ${comparison.label} is reproducible from prices`,
        `recalculated ${comparison.calculated.toFixed(4)} vs annual output ${Number.isFinite(comparison.generated) ? comparison.generated.toFixed(2) : "invalid"}; difference ${difference.toFixed(4)}`,
      );
    });
  }

  const benchmarkSeries = seriesFromPriceRows(priceRows, "VTI");
  betaEvidence = ["AAPL", "MSFT", "NVDA"].map((ticker) => {
    const assetSeries = seriesFromPriceRows(priceRows, ticker);
    const beta = betaFromSeries(assetSeries, benchmarkSeries);
    return {
      ticker,
      benchmark: "VTI",
      observations: Math.max(0, Math.min(assetSeries.length, benchmarkSeries.length) - 1),
      beta,
    };
  });
} catch (error) {
  record("FAIL", "Live annual public-data verification can start", error.message);
} finally {
  writeReport(manifest, betaEvidence);
}

const failed = checks.filter((item) => item.status === "FAIL");
if (failed.length) {
  console.error(`Live annual public-data verification failed: ${failed.length} check(s) failed`);
  console.error(`Result file: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(`Live annual public-data verification passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
}
