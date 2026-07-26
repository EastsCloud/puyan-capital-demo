import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const dbPath = join(outDir, "sqlite_snapshot_source_db.json");
const sqlitePath = join(outDir, "sqlite_snapshot_check.sqlite");
if (existsSync(dbPath)) rmSync(dbPath);
if (existsSync(sqlitePath)) rmSync(sqlitePath);

const checks = [];

function record(status, check, detail) {
  checks.push({ status, check, detail });
  if (status === "FAIL") throw new Error(`${check}: ${detail}`);
}

function sqliteValue(sql) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
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
    "# SQLite Snapshot Check Result",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
  ];
  const reportPath = join(outDir, "sqlite_snapshot_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const store = createStore(dbPath);
  const admin = store.login("admin-1");
  const committee = store.login("committee-1");
  const execution = store.login("execution-1");

  const target = store.createTargetPackage(committee.session.id, {
    scenario: "Balanced",
    finalTargetReturn: 6.83,
    operatingCost: 3,
    cpiEstimate: 2.7,
  });
  store.approveTargetPackage(committee.session.id, target.id, "Approve", "");
  const portfolio = store.submitPortfolio(execution.session.id, {
    targetPackageId: target.id,
    benchmark: "Blended equity sleeve benchmark",
    holdings: [
      { ticker: "VTI", sleeve: "us", weight: 35 },
      { ticker: "EWJ", sleeve: "developed", weight: 25 },
      { ticker: "2800.HK", sleeve: "emerging", weight: 20 },
      { ticker: "ASHR", sleeve: "emerging", weight: 20 },
    ],
  });
  store.approvePortfolio(committee.session.id, portfolio.id, "Approve", "");
  store.importData(execution.session.id, "actual_holdings", "daily_holdings.csv", "Ticker,MarketValue\nVTI,100\nEWJ,100\n");
  store.recordPublicDataCache(committee.session.id, {
    generatedAt: "2026-07-22T00:00:00.000Z",
    sourceName: "Yahoo Finance public chart adjusted close",
    sourceUrl: "https://query1.finance.yahoo.com/v8/finance/chart/",
    startDate: "2016-01-01",
    endDate: "2026-07-22",
    cache: { incrementalTickers: 4, fullHistoryTickers: 1 },
    dataSets: {
      historicalPrices: { fileName: "auto_historical_prices.csv", rows: 2, rawText: "Date,VTI\n2026-07-22,100\n" },
      tickerUniverse: { fileName: "auto_ticker_universe.csv", rows: 1, rawText: "Ticker,Name\nVTI,Vanguard Total Stock Market ETF\n" },
    },
  });
  store.updateSystemConfig(admin.session.id, store.readSystemConfig(admin.session.id));

  execFileSync(process.execPath, [
    "--no-warnings",
    join(root, "scripts", "export_sqlite_snapshot.mjs"),
    "--input",
    dbPath,
    "--output",
    sqlitePath,
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  record(existsSync(sqlitePath) ? "PASS" : "FAIL", "SQLite file created", sqlitePath);
  record(sqliteValue("select count(*) from users;") === "3" ? "PASS" : "FAIL", "Users exported", sqliteValue("select count(*) from users;"));
  record(sqliteValue("select count(*) from target_packages;") === "1" ? "PASS" : "FAIL", "Target packages exported", sqliteValue("select count(*) from target_packages;"));
  record(sqliteValue("select count(*) from portfolios;") === "1" ? "PASS" : "FAIL", "Portfolios exported", sqliteValue("select count(*) from portfolios;"));
  record(sqliteValue("select count(*) from approvals;") === "2" ? "PASS" : "FAIL", "Approvals exported", sqliteValue("select count(*) from approvals;"));
  record(sqliteValue("select count(*) from import_records;") === "1" ? "PASS" : "FAIL", "Import summaries exported", sqliteValue("select count(*) from import_records;"));
  record(sqliteValue("select count(*) from public_data_refreshes;") === "1" ? "PASS" : "FAIL", "Public data refresh exported", sqliteValue("select count(*) from public_data_refreshes;"));
  record(Number(sqliteValue("select count(*) from audit_log;")) >= 8 ? "PASS" : "FAIL", "Audit log exported", sqliteValue("select count(*) from audit_log;"));
  record(sqliteValue("select count(*) from pragma_table_info('users') where name='passwordHash';") === "0" ? "PASS" : "FAIL", "Password hash is not exposed as a SQLite column", "passwordHash column absent");
  record(sqliteValue("select content_hash from import_records limit 1;").length >= 16 ? "PASS" : "FAIL", "Import content hash retained", sqliteValue("select content_hash from import_records limit 1;").slice(0, 16));
  record(sqliteValue("select count(*) from public_data_sets;") === "2" ? "PASS" : "FAIL", "Public data set summaries exported", sqliteValue("select count(*) from public_data_sets;"));

  const sourceDb = JSON.parse(readFileSync(dbPath, "utf8"));
  record(sourceDb.users.some((user) => user.passwordHash) ? "PASS" : "FAIL", "Source DB keeps password hash internally", "hash remains only in JSON source");

  const reportPath = writeReport();
  console.log(`SQLite snapshot checks passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("SQLite snapshot checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
