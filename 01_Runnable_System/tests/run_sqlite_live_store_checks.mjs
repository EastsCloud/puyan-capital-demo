import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const basePath = join(outDir, "sqlite_live_store_check_db");
const jsonPath = `${basePath}.json`;
const sqlitePath = `${basePath}.sqlite`;
const auditSnapshotPath = join(outDir, "sqlite_live_store_audit_snapshot.sqlite");
for (const path of [jsonPath, sqlitePath, `${sqlitePath}-wal`, `${sqlitePath}-shm`, auditSnapshotPath, `${auditSnapshotPath}-wal`, `${auditSnapshotPath}-shm`]) {
  if (existsSync(path)) rmSync(path);
}

const checks = [];

function record(status, check, detail) {
  checks.push({ status, check, detail });
  if (status === "FAIL") throw new Error(`${check}: ${detail}`);
}

function sqliteValue(path, sql) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare(sql).get();
    if (!row) return "";
    return String(Object.values(row)[0] ?? "");
  } finally {
    db.close();
  }
}

function writeReport() {
  const lines = [
    "# SQLite Live Store Check Result",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
  ];
  const reportPath = join(outDir, "sqlite_live_store_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const jsonStore = createStore(jsonPath);
  jsonStore.login("admin-1");
  const seededJson = JSON.parse(readFileSync(jsonPath, "utf8"));
  record(seededJson.users?.length === 3 ? "PASS" : "FAIL", "Legacy JSON source is available for migration", `${seededJson.users?.length || 0} user(s)`);

  const sqliteStore = createStore(sqlitePath);
  record(sqliteStore.storageInfo().kind === "sqlite" ? "PASS" : "FAIL", "Store uses SQLite persistence for .sqlite path", sqliteStore.storageInfo().kind);

  const admin = sqliteStore.login("admin-1", "admin000");
  const committee = sqliteStore.login("committee-1", "141242");
  const execution = sqliteStore.login("execution-1", "517518");
  record(Boolean(admin.session.id && committee.session.id && execution.session.id) ? "PASS" : "FAIL", "All default users can log in from SQLite", "3 sessions created");

  const target = sqliteStore.createTargetPackage(committee.session.id, {
    scenario: "Balanced",
    operatingCost: 3.2,
    cpiEstimate: 2.6,
    finalTargetReturn: 6.83,
  });
  sqliteStore.approveTargetPackage(committee.session.id, target.id, "Approve", "SQLite live store test");
  const portfolio = sqliteStore.submitPortfolio(execution.session.id, {
    targetPackageId: target.id,
    benchmark: "Blended equity sleeve benchmark",
    holdings: [
      { ticker: "VTI", assetClass: "Equity", sleeve: "us", weight: 45 },
      { ticker: "EWJ", assetClass: "Equity", sleeve: "developed", weight: 20 },
      { ticker: "2800.HK", assetClass: "Equity", sleeve: "emerging", weight: 20 },
      { ticker: "ASHR", assetClass: "Equity", sleeve: "emerging", weight: 15 },
    ],
  });
  sqliteStore.approvePortfolio(committee.session.id, portfolio.id, "Approve", "SQLite live store test");
  sqliteStore.importData(execution.session.id, "actual_holdings", "daily_holdings.csv", "Ticker,MarketValue\nVTI,450\nEWJ,200\n2800.HK,200\nASHR,150\n");
  const navPackage = sqliteStore.submitNonEquityNav(execution.session.id, {
    asOfDate: "2026-07-23",
    bond: 250,
    alternative: 100,
    cash: 50,
  });
  sqliteStore.approveNonEquityNav(committee.session.id, navPackage.id, "Approve");
  sqliteStore.saveTradeAuthorizations(execution.session.id, {
    portfolioId: portfolio.id,
    orders: [
      { action: "Buy", ticker: "VTI", quantity: 5, price: 310, executionStatus: "Approved", committeeStatus: "Approved" },
      { action: "Sell", ticker: "EWJ", quantity: 2, price: 75, executionStatus: "Pending", committeeStatus: "Pending" },
    ],
  });
  sqliteStore.submitReportDistribution(execution.session.id, {
    portfolioId: portfolio.id,
    targetPackageId: target.id,
    status: "Sent to Committee",
    reportPeriod: "quarterly",
    recipientGroup: "Decision Committee",
    distributionDate: "2026-07-23",
  });
  sqliteStore.recordPublicDataCache(admin.session.id, {
    generatedAt: "2026-07-23T00:00:00.000Z",
    sourceName: "Normalized SQLite test source",
    sourceUrl: "https://example.test/data",
    startDate: "2026-07-01",
    endDate: "2026-07-23",
    cache: { incrementalTickers: 2, fullHistoryTickers: 0 },
    dataSets: {
      historicalPrices: { fileName: "prices.csv", rows: 2, rawText: "Date,Ticker,Close\n2026-07-22,VTI,309\n2026-07-23,VTI,310\n" },
      tickerUniverse: { fileName: "tickers.csv", rows: 1, rawText: "Ticker,Market\nVTI,US\n" },
    },
  });

  const reloadedStore = createStore(sqlitePath);
  const reloadedExecution = reloadedStore.login("execution-1", "517518");
  const latestPortfolio = reloadedStore.latestApprovedPortfolio(reloadedExecution.session.id);
  const reloadedDatabase = reloadedStore.load();
  record(latestPortfolio?.id === portfolio.id ? "PASS" : "FAIL", "Approved portfolio reloads from SQLite after reopening store", latestPortfolio?.id || "missing");
  record(reloadedDatabase.nonEquityNavPackages?.[0]?.status === "Approved" ? "PASS" : "FAIL", "Approved non-equity NAV reloads from normalized SQLite", reloadedDatabase.nonEquityNavPackages?.[0]?.status || "missing");
  record(reloadedDatabase.tradeAuthorizationPackages?.[0]?.orders?.length === 2 ? "PASS" : "FAIL", "Trade orders reload from normalized child rows", `${reloadedDatabase.tradeAuthorizationPackages?.[0]?.orders?.length || 0} order(s)`);
  record(reloadedDatabase.reportDistributions?.[0]?.status === "Sent to Committee" ? "PASS" : "FAIL", "Report distribution reloads from normalized SQLite", reloadedDatabase.reportDistributions?.[0]?.status || "missing");
  record(reloadedDatabase.imports?.[0]?.rawText?.includes("2800.HK") ? "PASS" : "FAIL", "Imported source text reloads from its dedicated SQLite column", `${reloadedDatabase.imports?.[0]?.rawText?.length || 0} character(s)`);
  record(reloadedDatabase.publicDataCache?.latest?.dataSets?.historicalPrices?.rawText?.includes("2026-07-23") ? "PASS" : "FAIL", "Public data raw series reloads from normalized data-set rows", reloadedDatabase.publicDataCache?.latest?.id || "missing");
  record(existsSync(sqlitePath) ? "PASS" : "FAIL", "SQLite live database file exists", sqlitePath);
  record(sqliteValue(sqlitePath, "select count(*) from app_state;") === "1" ? "PASS" : "FAIL", "SQLite app_state table stores current live state", sqliteValue(sqlitePath, "select count(*) from app_state;"));
  record(Number(sqliteValue(sqlitePath, "select count(*) from app_state_backups;")) >= 1 ? "PASS" : "FAIL", "SQLite keeps rolling state backups", sqliteValue(sqlitePath, "select count(*) from app_state_backups;"));
  record(sqliteValue(sqlitePath, "select value from persistence_meta where key='lastWriteReason';") === "application save" ? "PASS" : "FAIL", "SQLite persistence metadata records last write", sqliteValue(sqlitePath, "select value from persistence_meta where key='lastWriteReason';"));
  record(sqliteValue(sqlitePath, "select value from persistence_meta where key='normalizedSchemaVersion';") === "1" ? "PASS" : "FAIL", "SQLite normalized schema version is recorded", sqliteValue(sqlitePath, "select value from persistence_meta where key='normalizedSchemaVersion';"));
  record(sqliteValue(sqlitePath, "select count(*) from users;") === "3" ? "PASS" : "FAIL", "Users are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from users;"));
  record(sqliteValue(sqlitePath, "select count(*) from sessions;") === "5" ? "PASS" : "FAIL", "Sessions are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from sessions;"));
  record(sqliteValue(sqlitePath, "select count(*) from target_packages;") === "1" ? "PASS" : "FAIL", "Target packages are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from target_packages;"));
  record(sqliteValue(sqlitePath, "select count(*) from portfolios;") === "1" ? "PASS" : "FAIL", "Portfolios are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from portfolios;"));
  record(sqliteValue(sqlitePath, "select count(*) from portfolio_holdings;") === "4" ? "PASS" : "FAIL", "Portfolio holdings are normalized into child rows", sqliteValue(sqlitePath, "select count(*) from portfolio_holdings;"));
  record(sqliteValue(sqlitePath, "select count(*) from import_records;") === "1" ? "PASS" : "FAIL", "Import records are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from import_records;"));
  record(sqliteValue(sqlitePath, "select count(*) from non_equity_nav_packages;") === "1" ? "PASS" : "FAIL", "Non-equity NAV is stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from non_equity_nav_packages;"));
  record(sqliteValue(sqlitePath, "select count(*) from trade_authorization_packages;") === "1" ? "PASS" : "FAIL", "Trade authorization packages use a dedicated live table", sqliteValue(sqlitePath, "select count(*) from trade_authorization_packages;"));
  record(sqliteValue(sqlitePath, "select count(*) from trade_orders;") === "2" ? "PASS" : "FAIL", "Trade orders are normalized into child rows", sqliteValue(sqlitePath, "select count(*) from trade_orders;"));
  record(sqliteValue(sqlitePath, "select count(*) from report_distributions;") === "1" ? "PASS" : "FAIL", "Report distributions use a dedicated live table", sqliteValue(sqlitePath, "select count(*) from report_distributions;"));
  record(sqliteValue(sqlitePath, "select count(*) from public_data_refreshes;") === "1" ? "PASS" : "FAIL", "Public-data refreshes use a dedicated live table", sqliteValue(sqlitePath, "select count(*) from public_data_refreshes;"));
  record(sqliteValue(sqlitePath, "select count(*) from public_data_sets;") === "2" ? "PASS" : "FAIL", "Public-data sets use normalized child rows", sqliteValue(sqlitePath, "select count(*) from public_data_sets;"));
  record(Number(sqliteValue(sqlitePath, "select count(*) from audit_log;")) >= 1 ? "PASS" : "FAIL", "Audit events are stored in a dedicated live table", sqliteValue(sqlitePath, "select count(*) from audit_log;"));

  execFileSync(process.execPath, [
    "--no-warnings",
    join(root, "scripts", "export_sqlite_snapshot.mjs"),
    "--input",
    sqlitePath,
    "--output",
    auditSnapshotPath,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  record(existsSync(auditSnapshotPath) ? "PASS" : "FAIL", "Relational audit snapshot can be exported from live SQLite", auditSnapshotPath);
  record(sqliteValue(auditSnapshotPath, "select count(*) from portfolios;") === "1" ? "PASS" : "FAIL", "Audit snapshot contains portfolio rows", sqliteValue(auditSnapshotPath, "select count(*) from portfolios;"));

  const reportPath = writeReport();
  console.log(`SQLite live store checks passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("SQLite live store checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
