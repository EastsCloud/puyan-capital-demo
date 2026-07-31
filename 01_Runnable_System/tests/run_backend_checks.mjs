import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const dbPath = join(outDir, "backend_check_db.json");
if (existsSync(dbPath)) rmSync(dbPath);

const store = createStore(dbPath);
const results = [];

function record(status, name, detail) {
  results.push({ status, name, detail });
}

function pass(name, detail = "") {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
  throw new Error(`${name}: ${detail}`);
}

function assert(condition, name, detail) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function expectBlocked(name, action) {
  try {
    action();
  } catch (error) {
    assert(error.statusCode === 403, name, "blocked with 403");
    return;
  }
  fail(name, "action was not blocked");
}

function writeReport() {
  const lines = [];
  lines.push("# Backend Check Result");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| Status | Check | Detail |");
  lines.push("| --- | --- | --- |");
  for (const result of results) {
    lines.push(`| ${result.status} | ${result.name} | ${String(result.detail).replaceAll("|", "\\|")} |`);
  }
  const reportPath = join(outDir, "backend_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const admin = store.login("admin-1");
  const committee1 = store.login("committee-1");
  const execution = store.login("execution-1");

  assert(admin.session.id, "Admin login creates session", admin.session.id);
  assert(committee1.session.id, "Committee login creates session", committee1.session.id);
  assert(execution.session.id, "Execution login creates session", execution.session.id);

  const restoredAdmin = store.sessionInfo(admin.session.id);
  assert(restoredAdmin.user.name === "system_admin", "Backend session can be restored", restoredAdmin.user.name);

  const profileUpdate = store.updateUserProfile(committee1.session.id, {
    name: "will_updated",
    password: "999999",
  });
  assert(profileUpdate.name === "will_updated", "User can update own profile name", profileUpdate.name);
  assert(!("passwordHash" in profileUpdate), "Profile update response does not expose password hash", "passwordHash hidden");

  const newUser = store.createUser(admin.session.id, {
    name: "Read Only Reviewer",
    group: "Viewer",
    role: "Read Only",
    active: true,
  });
  assert(newUser.id, "Admin can create user", newUser.id);

  const viewer = store.login(newUser.id);
  expectBlocked("Viewer cannot create target package", () => {
    store.createTargetPackage(viewer.session.id, { finalTargetReturn: 6.8 });
  });

  const target = store.createTargetPackage(committee1.session.id, {
    operatingCost: 4,
    cpiEstimate: 3,
    scenario: "Bull",
    finalTargetReturn: 12,
    usEquityTargetReturn: 14,
    usEquityTargetBeta: 0.78,
    annualDecisionSnapshot: {
      schemaVersion: 1,
      scenarioKey: "bull",
      finalTargetReturn: 12,
      allocationRecommendation: {
        assets: {
          equity: { weight: 68, return: 8.6 },
          bond: { weight: 16, return: 3.8 },
          alternative: { weight: 11, return: 5.2 },
          cash: { weight: 5, return: 2.5 },
        },
        regions: {
          us: { share: 60, return: 9.5 },
          developed: { share: 15, return: 6.8 },
          emerging: { share: 25, return: 7.48 },
        },
      },
      equitySleeveTargets: {
        us: { weight: 40.8, contribution: 5.71, targetReturn: 14, cma: 9, riskFreeRate: 4.5, beta: 0.78, drawdownBand: { low: -20, high: -15 } },
        developed: { weight: 10.2, contribution: 0.69, targetReturn: 6.8, cma: 6.8, riskFreeRate: 0.5, beta: 1, drawdownBand: { low: -18, high: -13.5 } },
        emerging: { weight: 17, contribution: 1.27, targetReturn: 7.48, cma: 7.48, riskFreeRate: 3.24, beta: 1, drawdownBand: { low: -24, high: -18 } },
      },
    },
    targetMaxDrawdownLow: -20,
    targetMaxDrawdownHigh: -15,
  });
  assert(target.status === "Submitted", "Decision committee can submit target package", target.id);

  const finalTargetApproval = store.approveTargetPackage(committee1.session.id, target.id, "Approve", "Decision approver approved");
  assert(finalTargetApproval.target.status === "Approved", "Target package requires one decision committee approval", "status Approved");
  const latestTarget = store.latestApprovedTargetPackage(execution.session.id);
  assert(latestTarget?.annualDecisionSnapshot?.finalTargetReturn === 12, "Latest approved target preserves annual decision snapshot", String(latestTarget?.annualDecisionSnapshot?.finalTargetReturn));
  assert(latestTarget?.annualDecisionSnapshot?.equitySleeveTargets?.developed?.riskFreeRate === 0.5, "Approved target snapshot preserves sleeve-specific risk-free rate", String(latestTarget?.annualDecisionSnapshot?.equitySleeveTargets?.developed?.riskFreeRate));
  assert(latestTarget?.annualDecisionSnapshot?.allocationRecommendation?.regions?.emerging?.share === 25, "Approved target snapshot preserves regional allocation recommendation", String(latestTarget?.annualDecisionSnapshot?.allocationRecommendation?.regions?.emerging?.share));

  const portfolio = store.submitPortfolio(execution.session.id, {
    targetPackageId: target.id,
    benchmark: "VTI",
    holdings: [
      { ticker: "VTI", assetClass: "Equity", region: "United States", weight: 15, lockedWeight: true },
      { ticker: "NVDA", assetClass: "Equity", region: "United States", weight: 2.03, lockedWeight: false },
      { ticker: "SPY", assetClass: "Equity", region: "United States", weight: 30, lockedWeight: true },
      { ticker: "AAPL", assetClass: "Equity", region: "United States", weight: 20, lockedWeight: true },
    ],
    backtest: {
      beta: 0.78,
      maxDrawdown: -19.75,
      betaPass: true,
      drawdownPass: true,
    },
  });
  assert(portfolio.status === "Submitted", "Execution team can submit portfolio", portfolio.id);

  expectBlocked("Execution team cannot approve portfolio as committee", () => {
    store.approvePortfolio(execution.session.id, portfolio.id, "Approve", "Should be blocked");
  });

  const finalPortfolioApproval = store.approvePortfolio(committee1.session.id, portfolio.id, "Approve", "Decision approver approved");
  assert(finalPortfolioApproval.portfolio.status === "Approved", "Portfolio requires one decision committee approval", "status Approved");
  const latestPortfolio = store.latestApprovedPortfolio(execution.session.id);
  assert(latestPortfolio?.id === portfolio.id, "Latest approved portfolio can be reloaded", latestPortfolio?.id);
  assert(latestPortfolio?.holdings?.length === portfolio.holdings.length, "Latest approved portfolio preserves holdings", `${latestPortfolio?.holdings?.length} holding row(s)`);

  const mixedPortfolio = store.submitPortfolio(execution.session.id, {
    targetPackageId: target.id,
    benchmark: "VTI",
    holdings: [
      { ticker: "VTI", assetClass: "Equity", region: "United States", weight: 70 },
      { ticker: "CASH", assetClass: "Cash & Cash-like", region: "Global", weight: 30 },
    ],
    backtest: { pass: true },
  });
  store.approvePortfolio(committee1.session.id, mixedPortfolio.id, "Approve", "Legacy mixed portfolio approved");
  const latestEquityPortfolio = store.latestApprovedPortfolio(execution.session.id);
  assert(latestEquityPortfolio?.id === portfolio.id, "Latest approved portfolio ignores legacy non-equity implementation records", latestEquityPortfolio?.id);

  const holdingsCsv = readFileSync(join(root, "data", "standard_actual_holdings.csv"), "utf8");
  const importRecord = store.importData(execution.session.id, "actual_holdings", "standard_actual_holdings.csv", holdingsCsv);
  assert(importRecord.rows > 0, "Execution team can import actual holdings", `${importRecord.rows} row(s)`);
  const latestImports = store.latestImportRecords(committee1.session.id, ["actual_holdings"]);
  assert(latestImports[0]?.rawText === holdingsCsv, "Latest imported holdings retain recoverable source text", `${latestImports[0]?.rows} row(s)`);

  const navPackage = store.submitNonEquityNav(execution.session.id, {
    asOfDate: "2026-07-14",
    bond: 25000,
    alternative: 15000,
    cash: 10000,
  });
  assert(navPackage.status === "Submitted", "Execution team can submit non-equity NAV", navPackage.id);
  expectBlocked("Execution team cannot approve non-equity NAV", () => {
    store.approveNonEquityNav(execution.session.id, navPackage.id, "Approve");
  });
  const approvedNavPackage = store.approveNonEquityNav(committee1.session.id, navPackage.id, "Approve");
  assert(approvedNavPackage.status === "Approved", "Decision committee approves non-equity NAV", approvedNavPackage.id);
  const latestApprovedNav = store.latestApprovedNonEquityNav(execution.session.id);
  assert(latestApprovedNav?.id === navPackage.id, "Latest approved non-equity NAV can be reloaded", latestApprovedNav?.id);

  const tradeAuthorization = store.saveTradeAuthorizations(execution.session.id, {
    portfolioId: portfolio.id,
    orders: [
      { action: "Buy", ticker: "VTI", quantity: 10, price: 300, reasonType: "Compliant", executionApprover: "will1976", executionStatus: "Approve", committeeStatus: "Pending", authorizedAt: "2026-07-14" },
      { action: "Sell", ticker: "SPY", quantity: 5, price: 500, reasonType: "Exception", remark: "Risk reduction", executionApprover: "will1976", executionStatus: "Approve", committeeStatus: "Approve", authorizedAt: "2026-07-14" },
    ],
  });
  assert(tradeAuthorization.orders.length === 2, "Execution team can persist trade authorizations", `${tradeAuthorization.orders.length} order(s)`);
  const latestTradeAuthorization = store.latestTradeAuthorizations(committee1.session.id);
  assert(latestTradeAuthorization?.id === tradeAuthorization.id, "Latest trade authorizations can be reloaded", latestTradeAuthorization?.id);
  assert(latestTradeAuthorization?.orders?.[1]?.committeeStatus === "Approve", "Trade authorization reload preserves committee decision", latestTradeAuthorization?.orders?.[1]?.committeeStatus);
  expectBlocked("Viewer cannot save trade authorizations", () => {
    store.saveTradeAuthorizations(viewer.session.id, { orders: [] });
  });

  const reportDistribution = store.submitReportDistribution(execution.session.id, {
    portfolioId: portfolio.id,
    targetPackageId: target.id,
    status: "Sent to Committee",
    reportPeriod: "quarterly",
    recipientGroup: "Decision Committee",
    distributionDate: "2026-07-14",
  });
  assert(reportDistribution.status === "Sent to Committee", "Execution team can record formal report distribution", reportDistribution.id);
  const latestReportDistribution = store.latestReportDistribution(committee1.session.id, { portfolioId: portfolio.id });
  assert(latestReportDistribution?.id === reportDistribution.id, "Decision committee can reload the latest formal report distribution", latestReportDistribution?.id);
  assert(latestReportDistribution?.recipientGroup === "Decision Committee", "Report distribution preserves recipient group", latestReportDistribution?.recipientGroup);
  expectBlocked("Decision committee cannot submit formal report distribution", () => {
    store.submitReportDistribution(committee1.session.id, {
      portfolioId: portfolio.id,
      status: "Sent to Committee",
    });
  });

  const publicDataCache = store.recordPublicDataCache(committee1.session.id, {
    generatedAt: "2026-07-14T00:00:00.000Z",
    sourceName: "Public price source",
    sourceUrl: "https://example.com/public-prices",
    startDate: "2016-01-01",
    endDate: "2026-07-14",
    cache: { incrementalTickers: 53, fullHistoryTickers: 1 },
    outputs: { historicalPrices: { rows: 474 } },
    dataSets: {
      historicalPrices: { fileName: "auto_historical_prices.csv", rows: 2, rawText: "Date,VTI\n2026-07-14,100\n" },
    },
  });
  assert(publicDataCache.cache.incrementalTickers === 53, "Decision committee can record annual public data cache metadata", "53 incremental tickers");
  assert(publicDataCache.dataSets.historicalPrices.contentHash, "Public data cache response summarizes stored source snapshot", "content hash returned");
  const latestPublicDataCache = store.latestPublicDataCache(execution.session.id);
  assert(latestPublicDataCache?.endDate === "2026-07-14", "Latest public data cache can be read", latestPublicDataCache?.endDate);
  assert(!("rawText" in latestPublicDataCache.dataSets.historicalPrices), "Public data cache API response does not expose raw snapshot", "raw text hidden");
  const latestPublicDataCacheWithData = store.latestPublicDataCache(execution.session.id, { includeData: true });
  assert(latestPublicDataCacheWithData.dataSets.historicalPrices.rawText.includes("Date,VTI"), "Execution team can read approved annual public data cache when explicitly requested", "raw cached CSV available");

  const auditLog = store.auditLog(committee1.session.id);
  assert(auditLog.some((row) => row.result === "Blocked"), "Audit log records blocked action", "blocked action found");
  assert(auditLog.some((row) => row.action === "Target package approval recorded"), "Audit log records target approval", "target approval found");
  assert(auditLog.some((row) => row.action === "Data loaded"), "Audit log records data load", "data load found");

  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  assert(db.targetPackages.length === 1, "Database persists target packages", "1 target package");
  assert(db.portfolios.length === 2, "Database persists portfolios", "2 portfolio records including the legacy filter regression case");
  assert(db.imports.length === 1, "Database persists imports", "1 import");
  assert(Boolean(db.imports[0].contentHash), "Database stores import content hash", db.imports[0].contentHash.slice(0, 10));
  assert(db.nonEquityNavPackages?.length === 1, "Database persists non-equity NAV packages", "1 NAV package");
  assert(db.tradeAuthorizationPackages?.length === 1, "Database persists trade authorization packages", "1 trade authorization package");
  assert(db.reportDistributions?.length === 1, "Database persists formal report distributions", "1 report distribution");
  assert(db.publicDataCache?.refreshHistory?.length === 1, "Database persists public data cache history", "1 refresh record");
  assert(Boolean(db.publicDataCache?.latest?.dataSets?.historicalPrices?.rawText), "Database stores latest public data source snapshot", "historical price snapshot retained");
  const updatedCommitteeUser = db.users.find((user) => user.id === "committee-1");
  assert(updatedCommitteeUser?.name === "will_updated", "Database persists profile name update", updatedCommitteeUser?.name);
  assert(Boolean(updatedCommitteeUser?.passwordHash), "Database persists profile password hash", updatedCommitteeUser?.passwordHash.slice(0, 10));

  expectBlocked("Decision committee cannot reset demo database", () => {
    store.resetDemoDatabase(committee1.session.id, "RESET DEMO DATABASE");
  });
  const resetResult = store.resetDemoDatabase(admin.session.id, "RESET DEMO DATABASE");
  assert(resetResult.reset === true, "Administrator can reset demo database", resetResult.message);
  const resetDb = JSON.parse(readFileSync(dbPath, "utf8"));
  assert(resetDb.users.length === 3, "Demo reset restores packaged role accounts", `${resetDb.users.length} users`);
  assert(resetDb.targetPackages.length === 0 && resetDb.portfolios.length === 0 && resetDb.imports.length === 0,
    "Demo reset clears operational workflow records", "targets, portfolios, and imports cleared");
  assert(resetDb.sessions.length === 0, "Demo reset invalidates existing sessions", "no active sessions");
  assert(resetDb.auditLog.some((row) => row.action === "Reset demo database" && row.result === "Allowed"),
    "Demo reset records a new audit event", "allowed reset audit found");

  const reportPath = writeReport();
  console.log(`Backend checks passed: ${results.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("Backend checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
