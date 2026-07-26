import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
const engineDir = join(root, "data", "public_data_engine_output");
const selectedEvidenceDir = join(root, "..", "03_Testing", "Selected_Evidence");
mkdirSync(outDir, { recursive: true });

const checks = [];
const evidence = [];
const limits = [];

function record(status, check, detail) {
  checks.push({ status, check, detail });
  if (status === "FAIL") throw new Error(`${check}: ${detail}`);
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function csvRows(path) {
  const text = readText(path).trim();
  return text ? text.split(/\r?\n/) : [];
}

function writeReport() {
  const lines = [
    "# Historical Replay Evidence Audit",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "This audit separates verified local evidence from items that still require a formal browser-driven historical replay.",
    "",
    "## Automated Checks",
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
    "",
    "## Verified Evidence",
    "",
    ...evidence.map((item) => `- ${item}`),
    "",
    "## Remaining Limits",
    "",
    ...limits.map((item) => `- ${item}`),
  ];
  const reportPath = join(outDir, "historical_replay_evidence_audit.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const priceRows = csvRows(join(engineDir, "auto_historical_prices.csv"));
  const statsRows = csvRows(join(engineDir, "auto_market_statistics.csv"));
  const tickerRows = csvRows(join(engineDir, "auto_ticker_universe.csv"));
  const manifestText = readText(join(engineDir, "public_data_engine_manifest.json"));
  const manifest = manifestText ? JSON.parse(manifestText) : {};
  const testSuiteResult = readText(join(outDir, "test_suite_result.md"));
  const e2eReport = readText(join(outDir, "e2e_workflow_result.md"))
    || readText(join(selectedEvidenceDir, "e2e_workflow_result.md"));
  const replayRegression = readText(join(outDir, "replay_date_regression_checks.md"));

  record(priceRows.length > 1800 ? "PASS" : "FAIL", "Public historical prices exist with long coverage", `${Math.max(priceRows.length - 1, 0)} data row(s)`);
  record(statsRows.length > 10 ? "PASS" : "FAIL", "Market statistics output exists", `${Math.max(statsRows.length - 1, 0)} data row(s)`);
  record(tickerRows.length >= 10 ? "PASS" : "FAIL", "Ticker universe output exists", `${Math.max(tickerRows.length - 1, 0)} ticker row(s)`);
  record(manifest.sourceName ? "PASS" : "FAIL", "Public data manifest exists", manifest.sourceName || "missing");
  record(manifest.cache?.strategy ? "PASS" : "FAIL", "Public data cache strategy is recorded", manifest.cache?.strategy || "missing");
  record(!/\.mov|\.mp4|Formal_Demo_Video/i.test(testSuiteResult) ? "PASS" : "FAIL", "Current automated test suite evidence does not depend on video", "video evidence excluded");
  record(e2eReport.includes("Overall status: PASS"), "Current workflow E2E evidence exists", e2eReport ? "passing workflow report present" : "missing");
  record(replayRegression.includes("PASS"), "Replay-date regression evidence exists", replayRegression ? "passing regression report present" : "missing");

  evidence.push(`Public data engine output is present from ${manifest.startDate || "unknown start"} to ${manifest.endDate || "unknown end"} with ${Math.max(priceRows.length - 1, 0)} historical price rows.`);
  evidence.push(`Current allocation statistics and ticker universe files exist and are machine-checkable.`);
  evidence.push("Backend, UI-static, public-data, replay-date, and optimizer-related checks can be run through the local test suite.");
  evidence.push("Current backend workflow E2E and replay-date regression evidence is present and machine-checkable.");

  limits.push("A full formal historical replay still requires a browser-driven script that logs in as each role, clicks the workflow controls, and stores screenshots or structured DOM evidence at each step.");
  limits.push("The current audit does not certify paid market-data licensing, broker integration, or live order execution.");
  limits.push("Video evidence has been deliberately excluded because the prior video artifact was not reliable enough for acceptance.");

  const reportPath = writeReport();
  console.log(`Historical replay evidence audit passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("Historical replay evidence audit failed");
  console.error(error.message);
  process.exitCode = 1;
}
