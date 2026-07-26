import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "tests", "output");
const pricePath = join(root, "data", "public_data_engine_output", "auto_historical_prices.csv");
const universePath = join(root, "data", "public_data_engine_output", "auto_ticker_universe.csv");
mkdirSync(outputDir, { recursive: true });

const results = [];
function assert(condition, name, detail) {
  results.push({ status: condition ? "PASS" : "FAIL", name, detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const row = { date: new Date(values[0]) };
    columns.slice(1).forEach((column, index) => { row[column] = Number(values[index + 1]); });
    return row;
  });
}

function weeklyRows(rows) {
  const byWeek = new Map();
  rows.forEach((row) => {
    const date = new Date(row.date);
    date.setDate(date.getDate() - date.getDay());
    byWeek.set(date.toISOString().slice(0, 10), row);
  });
  return Array.from(byWeek.values()).sort((left, right) => left.date - right.date);
}

function benchmarkForTicker(ticker) {
  if (["EWJ", "DXJ"].includes(ticker)) return "EWJ";
  if (["EWH"].includes(ticker)) return "EWH";
  if (["ASHR", "KBA"].includes(ticker)) return "ASHR";
  if (ticker.endsWith(".T")) return "1306.T";
  if (ticker.endsWith(".HK")) return "2800.HK";
  if (ticker.endsWith(".SS") || ticker.endsWith(".SZ")) return "510300.SS";
  return "VTI";
}

function betaForTicker(rows, ticker, benchmark = benchmarkForTicker(ticker)) {
  if (ticker === benchmark) return 1;
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous[ticker] > 0 && current[ticker] > 0 && previous[benchmark] > 0 && current[benchmark] > 0) {
      const asset = current[ticker] / previous[ticker] - 1;
      const market = current[benchmark] / previous[benchmark] - 1;
      if (Number.isFinite(asset) && Number.isFinite(market)) pairs.push([asset, market]);
    }
  }
  const assetMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const marketMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  const covariance = pairs.reduce((sum, pair) => sum + (pair[0] - assetMean) * (pair[1] - marketMean), 0);
  const variance = pairs.reduce((sum, pair) => sum + (pair[1] - marketMean) ** 2, 0);
  return covariance / variance;
}

function weightedBeta(weights, betas) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.reduce((sum, weight, index) => sum + weight * betas[index], 0) / total;
}

try {
  assert(existsSync(pricePath), "Generated price data is available", pricePath);
  assert(existsSync(universePath), "Generated ticker universe is available", universePath);
  const priceText = readFileSync(pricePath, "utf8");
  const universeText = readFileSync(universePath, "utf8");
  const header = priceText.slice(0, priceText.indexOf("\n"));
  ["1306.T", "8306.T", "7011.T", "6920.T", "9988.HK", "002594.SZ"].forEach((ticker) => {
    assert(header.split(",").includes(ticker), `Public data includes ${ticker}`, "price column available");
  });
  ["7011.T", "6920.T", "9988.HK", "002594.SZ"].forEach((ticker) => {
    assert(universeText.includes(`${ticker},`), `Ticker universe includes ${ticker}`, "replacement candidate available");
  });

  const rows = weeklyRows(parseCsv(priceText)).slice(-156);
  const baselineTickers = ["EWJ", "DXJ", "7203.T", "8306.T", "6758.T", "9984.T"];
  const replacementTickers = ["EWJ", "DXJ", "7203.T", "7011.T", "6758.T", "9984.T"];
  const betas = replacementTickers.map((ticker) => betaForTicker(rows, ticker));
  const targetBeta = 1.35;
  const tolerance = targetBeta * 0.05;
  const baselineBeta = weightedBeta(new Array(baselineTickers.length).fill(1.25), baselineTickers.map((ticker) => betaForTicker(rows, ticker)));
  const weights = new Array(replacementTickers.length).fill(1.25);
  const highIndex = replacementTickers.indexOf("7011.T");
  const lowIndex = replacementTickers.indexOf("EWJ");
  for (let pass = 0; pass < 12; pass += 1) {
    const current = weightedBeta(weights, betas);
    if (Math.abs(current - targetBeta) <= tolerance) break;
    const shift = Math.min(
      Math.abs(targetBeta - current) * weights.reduce((sum, value) => sum + value, 0) / Math.abs(betas[highIndex] - betas[lowIndex]),
      weights[lowIndex] - 0.01,
    );
    weights[highIndex] += shift;
    weights[lowIndex] -= shift;
  }
  const replacementBeta = weightedBeta(weights, betas);
  assert(baselineBeta < targetBeta - tolerance, "Baseline Japan sleeve needs adjustment", `baseline beta ${baselineBeta.toFixed(3)}`);
  assert(Math.abs(replacementBeta - targetBeta) <= tolerance, "One-ticker Japan replacement can meet sleeve beta tolerance", `replacement beta ${replacementBeta.toFixed(3)} versus target ${targetBeta.toFixed(2)}`);
} catch (error) {
  if (!results.some((result) => result.status === "FAIL")) results.push({ status: "FAIL", name: "Replacement plan data check", detail: error.message });
}

const report = [
  "# Ticker Replacement Plan Check Result",
  "",
  "| Status | Check | Detail |",
  "| --- | --- | --- |",
  ...results.map((result) => `| ${result.status} | ${result.name} | ${result.detail} |`),
  "",
].join("\n");
writeFileSync(join(outputDir, "replacement_plan_check_result.md"), report);

const failures = results.filter((result) => result.status === "FAIL");
if (failures.length) {
  console.error(`Ticker replacement plan checks failed: ${failures.length}`);
  process.exitCode = 1;
} else {
  console.log(`Ticker replacement plan checks passed: ${results.length} checks`);
}
