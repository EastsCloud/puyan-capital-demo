import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const appSource = readFileSync(join(root, "app.js"), "utf8");
const holdingsCsv = readFileSync(join(root, "data", "standard_actual_holdings.csv"), "utf8");

const checks = [];

function pass(name, detail) {
  checks.push({ status: "PASS", name, detail });
}

function fail(name, detail) {
  checks.push({ status: "FAIL", name, detail });
}

function expectIncludes(name, text, snippet) {
  if (text.includes(snippet)) pass(name, `Found ${snippet}`);
  else fail(name, `Missing ${snippet}`);
}

function subtractTradingDays(date, days) {
  const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let removed = 0;
  while (removed < days) {
    previous.setDate(previous.getDate() - 1);
    const day = previous.getDay();
    if (day !== 0 && day !== 6) removed += 1;
  }
  return previous;
}

function dateOnlyLabel(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function uniqueCsvDates(csv, columnName) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  const index = headers.findIndex((header) => header.trim() === columnName);
  return Array.from(new Set(lines.slice(1).map((line) => line.split(",")[index]).filter(Boolean))).sort();
}

expectIncludes("sample holdings are replay-date rebased", appSource, "rebaseSampleCsvForReplay");
expectIncludes("backtest uses replay-date cut-off", appSource, "configuredTestDateOverride() || todayIso()");
expectIncludes("rebalance check uses local date parsing", appSource, "localDateFromIsoValue(state.rebalanceFormalCheckDate");
expectIncludes("accepted rebalance date uses local date parsing", appSource, "localDateFromIsoValue(state.rebalanceAcceptedPlan?.acceptedAt");

const sourceDates = uniqueCsvDates(holdingsCsv, "AsOfDate");
const replayDate = new Date(2025, 6, 15);
const dateMap = new Map();
sourceDates.forEach((date, index) => {
  const daysBack = sourceDates.length - index - 1;
  dateMap.set(date, dateOnlyLabel(subtractTradingDays(replayDate, daysBack)));
});
const rebasedDates = Array.from(dateMap.values());

if (rebasedDates.at(-1) === "2025-07-15") {
  pass("latest sample holding date maps to replay date", rebasedDates.join(", "));
} else {
  fail("latest sample holding date maps to replay date", rebasedDates.join(", "));
}

if (rebasedDates[0] === "2025-07-09" && rebasedDates.every((date) => date <= "2025-07-15")) {
  pass("sample holding history maps to prior trading days", rebasedDates.join(", "));
} else {
  fail("sample holding history maps to prior trading days", rebasedDates.join(", "));
}

const priceDateKeys = ["2022-07-14", "2022-07-15", "2025-07-15", "2025-07-16"];
const replayFiltered = priceDateKeys.filter((date) => date <= "2025-07-15");
if (replayFiltered.at(-1) === "2025-07-15" && !replayFiltered.includes("2025-07-16")) {
  pass("backtest filter excludes post-replay price rows", replayFiltered.join(", "));
} else {
  fail("backtest filter excludes post-replay price rows", replayFiltered.join(", "));
}

const lines = [
  "# Replay Date Regression Checks",
  "",
  `Generated at: ${new Date().toISOString()}`,
  "",
  "| Status | Check | Detail |",
  "| --- | --- | --- |",
  ...checks.map((check) => `| ${check.status} | ${check.name} | ${check.detail.replaceAll("|", "\\|")} |`),
  "",
];

writeFileSync(join(outDir, "replay_date_regression_checks.md"), lines.join("\n"));

const failures = checks.filter((check) => check.status === "FAIL");
if (failures.length) {
  console.error(`Replay date regression failed: ${failures.length} check(s)`);
  process.exitCode = 1;
} else {
  console.log(`Replay date regression passed: ${checks.length} checks`);
}
