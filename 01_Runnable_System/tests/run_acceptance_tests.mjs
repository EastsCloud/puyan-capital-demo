import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
const nodeBin = process.execPath;
const results = [];
mkdirSync(outDir, { recursive: true });

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
}

function fail(name, detail) {
  results.push({ name, status: "FAIL", detail });
  throw new Error(`${name}: ${detail}`);
}

function assert(condition, name, detail) {
  if (!condition) fail(name, detail);
  pass(name, detail);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function parseCsv(path) {
  const text = read(path).trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function pctNumber(value) {
  return Number(String(value).replace("%", ""));
}

function checkRequiredFiles() {
  const requiredFiles = [
    "index.html",
    "app.js",
    "styles.css",
    "data/sample_prices_web_recent.csv",
    "data/sample_ticker_universe.csv",
    "data/standard_actual_holdings.csv",
    "data/standard_actual_trades.csv",
    "data/standard_cash_flows.csv",
    "simulation/run_full_workflow_simulation.mjs",
    "../02_Documentation/System_User_Manual.md",
    "../02_Documentation/Puyan_Capital_Control_Center_SOP.md",
    "../02_Documentation/System_Preparation_Guide.md",
    "../02_Documentation/IT_System_Check_and_Finetune_Guide.md",
    "../03_Testing/Selected_Evidence/e2e_workflow_result.md",
  ];

  for (const file of requiredFiles) {
    const absolutePath = join(root, file);
    assert(existsSync(absolutePath), `Required file exists: ${file}`, "file found");
    assert(statSync(absolutePath).size > 0, `Required file is not empty: ${file}`, "file has content");
  }
}

function checkSyntax() {
  const scripts = [
    "app.js",
    "simulation/run_full_workflow_simulation.mjs",
    "simulation/run_system_simulation.mjs",
  ];

  for (const script of scripts) {
    execFileSync(nodeBin, ["--check", join(root, script)], { stdio: "pipe" });
    pass(`JavaScript syntax check: ${script}`, "node --check completed");
  }
}

function runFullWorkflowSimulation() {
  const output = execFileSync(nodeBin, [join(root, "simulation", "run_full_workflow_simulation.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert(output.includes("# Full Workflow Simulation"), "Simulation starts and prints report", "report heading found");
  assert(output.includes("Final control result: pass"), "Simulation optimization control result", "optimized portfolio passed controls");
  assert(output.includes("Rebalance alerts:"), "Simulation includes rebalance alerts", "rebalance section found");
}

function checkGeneratedOutputs() {
  const generatedFiles = [
    "simulation/output/full_workflow_users.csv",
    "simulation/output/full_workflow_target_assumptions.csv",
    "simulation/output/full_workflow_optimized_holdings.csv",
    "simulation/output/full_workflow_trade_orders.csv",
    "simulation/output/full_workflow_actual_holdings.csv",
    "simulation/output/full_workflow_audit_log.csv",
    "simulation/output/full_workflow_result.md",
  ];

  for (const file of generatedFiles) {
    const absolutePath = join(root, file);
    assert(existsSync(absolutePath), `Generated output exists: ${file}`, "output generated");
    assert(statSync(absolutePath).size > 0, `Generated output is not empty: ${file}`, "output has content");
  }
}

function checkWorkflowEvidence() {
  const users = parseCsv("simulation/output/full_workflow_users.csv");
  const target = parseCsv("simulation/output/full_workflow_target_assumptions.csv");
  const holdings = parseCsv("simulation/output/full_workflow_optimized_holdings.csv");
  const trades = parseCsv("simulation/output/full_workflow_trade_orders.csv");
  const actual = parseCsv("simulation/output/full_workflow_actual_holdings.csv");
  const audit = parseCsv("simulation/output/full_workflow_audit_log.csv");
  const report = read("simulation/output/full_workflow_result.md");

  const groups = new Set(users.map((user) => user.Group));
  assert(groups.has("System Administrator"), "Role coverage: system administrator", "role present");
  assert(groups.has("Decision Committee"), "Role coverage: decision committee", "role present");
  assert(groups.has("Execution Team"), "Role coverage: execution team", "role present");
  assert(groups.has("Compliance"), "Role coverage: compliance", "role present");

  const targetMap = new Map(target.map((row) => [row.Item, row.Value]));
  assert(targetMap.get("Final target return") === "9.85%", "Target return generated", "9.85% bull scenario target found");
  assert(targetMap.get("US equity target beta") === "1.010", "US equity target beta generated", "1.010 found");
  assert(targetMap.get("Developed ex-US target beta") === "1.230", "Developed ex-US target beta generated", "1.230 found");
  assert(targetMap.get("Emerging equity target beta") === "1.080", "Emerging equity target beta generated", "1.080 found");
  assert(targetMap.get("Portfolio beta reference monitor") === "Reference only", "Portfolio beta is reference only", "reference-only monitor found");
  assert(targetMap.has("Target max drawdown deeper limit"), "Target max drawdown generated", "drawdown limit found");

  const totalWeight = holdings.reduce((sum, holding) => sum + Number(holding.Weight), 0);
  assert(Math.abs(totalWeight - 65) < 0.05, "Optimized equity holding weights sum to approved equity sleeves", `sum=${totalWeight.toFixed(2)}%`);

  const locked = new Map(holdings.map((holding) => [holding.Ticker, holding.Locked]));
  assert(locked.get("VTI") === "Yes" && locked.get("XOM") === "Yes", "Locked holdings preserved", "VTI and XOM remain locked");
  assert(holdings.some((holding) => holding.Ticker === "NVDA"), "Optimized holdings include sample equity", "NVDA found");

  assert(trades.length >= 1, "Trade orders generated", `${trades.length} trade orders`);
  assert(trades.every((trade) => ["Buy", "Sell"].includes(trade.Action)), "Trade orders have valid action", "Buy/Sell only");

  const alertRows = actual.filter((row) => row.Alert === "Yes");
  assert(alertRows.length >= 1, "Rebalance alerts generated", `${alertRows.length} alerts`);
  assert(alertRows.some((row) => Math.abs(pctNumber(row.Drift)) > 2), "Rebalance alerts have material drift", "drift exceeds corridor");

  assert(audit.some((row) => row.Result === "Blocked"), "Audit trail includes blocked unauthorized action", "blocked action found");
  assert(audit.some((row) => row.Action.includes("Approve annual target return")), "Audit trail includes target approval", "target approval found");
  assert(audit.some((row) => row.Action.includes("Import actual holdings")), "Audit trail includes holdings import", "holdings import found");

  assert(report.includes("Optimized sleeve beta controls:") && report.includes("passed"), "Report includes sleeve beta control evidence", "sleeve beta evidence found");
  assert(report.includes("Max drawdown control: pass"), "Report includes drawdown control evidence", "drawdown pass found");
}

function writeSummary() {
  const lines = [];
  lines.push("# Acceptance Test Result");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| Status | Check | Detail |");
  lines.push("| --- | --- | --- |");
  for (const result of results) {
    lines.push(`| ${result.status} | ${result.name} | ${result.detail} |`);
  }

  const summaryPath = join(outDir, "acceptance_test_result.md");
  writeFileSync(summaryPath, `${lines.join("\n")}\n`);
  return summaryPath;
}

try {
  checkRequiredFiles();
  checkSyntax();
  runFullWorkflowSimulation();
  checkGeneratedOutputs();
  checkWorkflowEvidence();
  const summaryPath = writeSummary();
  console.log(`Acceptance tests passed: ${results.length} checks`);
  console.log(`Result file: ${summaryPath}`);
} catch (error) {
  try {
    writeSummary();
  } catch {
    // Keep the original failure visible.
  }
  console.error("Acceptance tests failed");
  console.error(error.message);
  process.exitCode = 1;
}
