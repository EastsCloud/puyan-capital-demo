import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const dbPath = join(outDir, "e2e_workflow_db.json");
if (existsSync(dbPath)) rmSync(dbPath);

const store = createStore(dbPath);
const steps = [];

function step(status, name, actor, detail, evidence = "") {
  steps.push({ status, name, actor, detail, evidence });
}

function pass(name, actor, detail, evidence = "") {
  step("PASS", name, actor, detail, evidence);
}

function fail(name, actor, detail, evidence = "") {
  step("FAIL", name, actor, detail, evidence);
  throw new Error(`${name}: ${detail}`);
}

function assert(condition, name, actor, detail, evidence = "") {
  if (condition) pass(name, actor, detail, evidence);
  else fail(name, actor, detail, evidence);
}

function expectBlocked(name, actor, fn) {
  try {
    fn();
  } catch (error) {
    assert(error.statusCode === 403, name, actor, "blocked as expected", error.message);
    return;
  }
  fail(name, actor, "action was not blocked");
}

function writeReports(context = {}) {
  const passCount = steps.filter((item) => item.status === "PASS").length;
  const failCount = steps.filter((item) => item.status === "FAIL").length;
  const overall = failCount ? "FAIL" : "PASS";

  const lines = [];
  lines.push("# End-to-End Workflow Test Result");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Overall status: ${overall}`);
  lines.push("");
  lines.push(`Summary: ${passCount} passed, ${failCount} failed.`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("This E2E test exercises the current local backend foundation and workflow sequence:");
  lines.push("");
  lines.push("1. Backend user login and session restore.");
  lines.push("2. System administrator user management.");
  lines.push("3. Unauthorized user blocking.");
  lines.push("4. Target package submission and one decision committee approval.");
  lines.push("5. Portfolio submission by execution team.");
  lines.push("6. Portfolio approval by one decision committee approver.");
  lines.push("7. External holdings, trades, and cash-flow import records.");
  lines.push("8. Compliance audit log pull.");
  lines.push("9. Persistence through the backend storage layer.");
  lines.push("");
  lines.push("## Step Results");
  lines.push("");
  lines.push("| Status | Step | Actor | Detail | Evidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of steps) {
    lines.push(`| ${item.status} | ${item.name} | ${item.actor} | ${String(item.detail).replaceAll("|", "\\|")} | ${String(item.evidence).replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  lines.push("## Generated Records");
  lines.push("");
  lines.push(`- Target package ID: ${context.targetId || "not generated"}`);
  lines.push(`- Portfolio ID: ${context.portfolioId || "not generated"}`);
  lines.push(`- Data load records: ${context.importCount ?? 0}`);
  lines.push(`- Audit records: ${context.auditCount ?? 0}`);
  lines.push("");
  lines.push("## Important Limitation");
  lines.push("");
  lines.push("This E2E test verifies the backend workflow and persistence layer. Browser UI E2E testing should still be run in an environment where localhost browser automation is permitted.");

  const mdPath = join(outDir, "e2e_workflow_result.md");
  const jsonPath = join(outDir, "e2e_workflow_result.json");
  writeFileSync(mdPath, `${lines.join("\n")}\n`);
  writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), overall, summary: { pass: passCount, fail: failCount }, context, steps }, null, 2)}\n`);
  return { mdPath, jsonPath, overall, passCount, failCount };
}

try {
  const admin = store.login("admin-1");
  const chair = store.login("committee-1");
  const executionManager = store.login("execution-1");

  assert(Boolean(admin.session.id), "Login administrator", "system_admin", "session created", admin.session.id);
  assert(Boolean(chair.session.id), "Login decision committee approver", "will", "session created", chair.session.id);
  assert(Boolean(executionManager.session.id), "Login execution team approver", "will1976", "session created", executionManager.session.id);

  const restored = store.sessionInfo(chair.session.id);
  assert(restored.user.name === "will", "Restore saved backend session", "will", "session restored", restored.user.group);

  const viewer = store.createUser(admin.session.id, {
    name: "Business Reviewer",
    group: "Viewer",
    role: "Read Only",
    active: true,
  });
  pass("Create read-only reviewer", "system_admin", "viewer user created", viewer.id);
  const viewerSession = store.login(viewer.id);

  expectBlocked("Block viewer from target submission", "Business Reviewer", () => {
    store.createTargetPackage(viewerSession.session.id, { finalTargetReturn: 12 });
  });

  const target = store.createTargetPackage(chair.session.id, {
    operatingCost: 4,
    cpiEstimate: 3,
    scenario: "Bull Market",
    finalTargetReturn: 12,
    usEquityTargetReturn: 14,
    usEquityTargetBeta: 0.78,
    targetMaxDrawdownLow: -20,
    targetMaxDrawdownHigh: -15,
    benchmark: "VTI",
  });
  assert(target.status === "Submitted", "Submit target package", "will", "target package submitted", target.id);

  const targetFinal = store.approveTargetPackage(chair.session.id, target.id, "Approve", "Decision approver approved annual target");
  assert(targetFinal.target.status === "Approved", "Approve target package", "will", "one approval complete", targetFinal.target.status);

  expectBlocked("Block execution team from committee approval", "will1976", () => {
    store.approveTargetPackage(executionManager.session.id, target.id, "Approve", "Should be blocked");
  });

  const portfolio = store.submitPortfolio(executionManager.session.id, {
    targetPackageId: target.id,
    benchmark: "VTI",
    version: 1,
    holdings: [
      { ticker: "VTI", region: "United States", assetClass: "Equity", styleFactor: "Core", weight: 15, lockedWeight: true },
      { ticker: "AAPL", region: "United States", assetClass: "Equity", styleFactor: "Growth", weight: 2.01, lockedWeight: false },
      { ticker: "NVDA", region: "United States", assetClass: "Equity", styleFactor: "Growth", weight: 2.03, lockedWeight: false },
      { ticker: "JPM", region: "United States", assetClass: "Equity", styleFactor: "Cyclical", weight: 14.86, lockedWeight: false },
      { ticker: "XOM", region: "United States", assetClass: "Equity", styleFactor: "Active", weight: 6, lockedWeight: true },
      { ticker: "BIL", region: "United States", assetClass: "Bond", styleFactor: "Defensive", weight: 30, lockedWeight: true },
      { ticker: "CASH", region: "Global", assetClass: "Cash & Cash-like", styleFactor: "Defensive", weight: 20, lockedWeight: true },
    ],
    backtest: {
      beta: 0.78,
      maxDrawdown: -19.75,
      betaPass: true,
      drawdownPass: true,
      returnReference: 11.46,
    },
  });
  assert(portfolio.status === "Submitted", "Submit optimized portfolio", "will1976", "portfolio submitted", portfolio.id);

  const portfolioFinal = store.approvePortfolio(chair.session.id, portfolio.id, "Approve", "Decision approver approved implementation");
  assert(portfolioFinal.portfolio.status === "Approved", "Approve portfolio", "will", "one approval complete", portfolioFinal.portfolio.status);

  const holdingsCsv = readFileSync(join(root, "data", "standard_actual_holdings.csv"), "utf8");
  const tradesCsv = readFileSync(join(root, "data", "standard_actual_trades.csv"), "utf8");
  const cashFlowsCsv = readFileSync(join(root, "data", "standard_cash_flows.csv"), "utf8");
  const holdingsImport = store.importData(executionManager.session.id, "actual_holdings", "standard_actual_holdings.csv", holdingsCsv);
  assert(holdingsImport.rows > 0, "Load actual holdings", "will1976", "holdings load recorded", `${holdingsImport.rows} rows`);
  const tradesImport = store.importData(executionManager.session.id, "actual_trades", "standard_actual_trades.csv", tradesCsv);
  assert(tradesImport.rows > 0, "Load actual trades", "will1976", "trades load recorded", `${tradesImport.rows} rows`);
  const cashFlowsImport = store.importData(executionManager.session.id, "cash_flows", "standard_cash_flows.csv", cashFlowsCsv);
  assert(cashFlowsImport.rows > 0, "Load cash flows", "will1976", "cash-flow load recorded", `${cashFlowsImport.rows} rows`);

  const auditLog = store.auditLog(chair.session.id);
  assert(auditLog.length >= 12, "Pull audit log", "will", "audit log returned", `${auditLog.length} records`);
  assert(auditLog.some((item) => item.result === "Blocked"), "Audit includes blocked action", "will", "blocked action preserved", "Blocked result found");
  assert(auditLog.some((item) => item.action === "Portfolio approval recorded"), "Audit includes portfolio approval", "will", "portfolio approval preserved", "Portfolio approval recorded");

  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  assert(db.targetPackages[0]?.status === "Approved", "Persist approved target package", "System", "target package persisted", db.targetPackages[0]?.id);
  assert(db.portfolios[0]?.status === "Approved", "Persist approved portfolio", "System", "portfolio persisted", db.portfolios[0]?.id);
  assert(db.imports.length === 3, "Persist data load history", "System", "three data loads persisted", `${db.imports.length} data loads`);
  assert(db.imports.every((item) => item.contentHash), "Persist data load registry hashes", "System", "hashes persisted", "all data loads hashed");

  const report = writeReports({
    targetId: target.id,
    portfolioId: portfolio.id,
    importCount: db.imports.length,
    auditCount: auditLog.length,
  });
  console.log(`E2E workflow checks passed: ${steps.length} steps`);
  console.log(`Report file: ${report.mdPath}`);
  console.log(`JSON file: ${report.jsonPath}`);
} catch (error) {
  try {
    writeReports();
  } catch {
    // Keep original failure visible.
  }
  console.error("E2E workflow checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
