import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
const engineDir = join(root, "data", "public_data_engine_output");
mkdirSync(outDir, { recursive: true });

const checks = [];

function record(status, check, detail) {
  checks.push({ status, check, detail });
  if (status === "FAIL") throw new Error(`${check}: ${detail}`);
}

function readCsv(file) {
  if (!existsSync(file)) record("FAIL", `File exists: ${file}`, "missing file");
  return readFileSync(file, "utf8").trim().split(/\r?\n/).map((line) => line.split(","));
}

function writeReport() {
  const lines = [
    "# Public Data Engine Check Result",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
  ];
  const reportPath = join(outDir, "public_data_engine_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const priceRows = readCsv(join(engineDir, "auto_historical_prices.csv"));
  const tickerRows = readCsv(join(engineDir, "auto_ticker_universe.csv"));
  const statsRows = readCsv(join(engineDir, "auto_market_statistics.csv"));
  const manifest = JSON.parse(readFileSync(join(engineDir, "public_data_engine_manifest.json"), "utf8"));

  const priceHeader = priceRows[0];
  ["Date", "VTI", "AAPL", "MSFT", "NVDA", "JPM", "XOM", "EWJ", "EWH", "ASHR", "AGG", "GLD", "BIL", "CASH"].forEach((column) => {
    record(priceHeader.includes(column) ? "PASS" : "FAIL", `Historical prices include ${column}`, priceHeader.join(","));
  });
  record(priceRows.length > 1800 ? "PASS" : "FAIL", "Historical prices retain long benchmark history", `${priceRows.length - 1} data rows`);
  record(/^\d{4}-\d{2}-\d{2}$/.test(priceRows[1][0]) ? "PASS" : "FAIL", "Historical price dates are ISO format", priceRows[1][0]);
  record(priceRows[1][0] <= "2016-03-01" ? "PASS" : "FAIL", "Historical prices start near configured 10-year baseline", priceRows[1][0]);

  const tickerHeader = tickerRows[0];
  ["Ticker", "Name", "Market", "Region", "GeographicRegion", "AssetClass", "StyleFactor", "Theme"].forEach((column) => {
    record(tickerHeader.includes(column) ? "PASS" : "FAIL", `Ticker universe includes ${column}`, tickerHeader.join(","));
  });
  record(tickerRows.length >= 10 ? "PASS" : "FAIL", "Ticker universe has enough records", `${tickerRows.length - 1} data rows`);

  const statsHeader = statsRows[0];
  ["Scenario", "Row Type", "Sleeve Key", "Historical Return", "Volatility", "Suggested Weight", "Equity Share"].forEach((column) => {
    record(statsHeader.includes(column) ? "PASS" : "FAIL", `Market statistics include ${column}`, statsHeader.join(","));
  });
  const statsText = statsRows.slice(1).map((row) => row.join(",")).join("\n").toLowerCase();
  ["bull", "balanced", "bear", "equity", "bond", "alternative", "cash", "us", "developed", "emerging"].forEach((token) => {
    record(statsText.includes(token) ? "PASS" : "FAIL", `Market statistics include ${token}`, "token found");
  });

  record(manifest.sourceName ? "PASS" : "FAIL", "Manifest identifies public source", manifest.sourceName || "missing");
  record(["eodhd", "yahoo"].includes(manifest.provider?.active) ? "PASS" : "FAIL", "Manifest identifies active provider", manifest.provider?.active || "missing");
  record(manifest.provider?.tokenStoredInManifest === false ? "PASS" : "FAIL", "Manifest confirms API token is not stored", String(manifest.provider?.tokenStoredInManifest));
  record(!JSON.stringify(manifest).includes("api_token=") ? "PASS" : "FAIL", "Manifest does not expose API token query parameters", "token query absent");
  record(manifest.cache?.strategy ? "PASS" : "FAIL", "Manifest records cache strategy", manifest.cache?.strategy || "missing");
  record(Number.isFinite(Number(manifest.cache?.incrementalTickers)) ? "PASS" : "FAIL", "Manifest records incremental ticker count", String(manifest.cache?.incrementalTickers));
  record(Array.isArray(manifest.cache?.refreshes) ? "PASS" : "FAIL", "Manifest records ticker refresh detail", `${manifest.cache?.refreshes?.length || 0} refresh row(s)`);
  record(manifest.cache.refreshes.every((item) => item.provider) ? "PASS" : "FAIL", "Each ticker refresh records its provider", `${manifest.cache.refreshes.length} refresh row(s)`);

  const reportPath = writeReport();
  console.log(`Public data engine checks passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("Public data engine checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
