import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("..", import.meta.url));

function json(value) {
  return JSON.stringify(value ?? null);
}

function asNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readSourceDatabase(path) {
  if (extname(path).toLowerCase() !== ".sqlite") return readJson(path);
  const sourceDb = new DatabaseSync(path, { readOnly: true });
  try {
    const row = sourceDb.prepare("SELECT json FROM app_state WHERE id = 1").get();
    if (!row?.json) {
      throw new Error("SQLite source does not contain live app_state JSON");
    }
    return JSON.parse(row.json);
  } finally {
    sourceDb.close();
  }
}

function compactImport(record) {
  const { rawText, ...rest } = record || {};
  return rest;
}

function compactPublicDataRecord(record) {
  if (!record) return null;
  const dataSets = Object.fromEntries(Object.entries(record.dataSets || {}).map(([key, dataSet]) => [key, {
    fileName: dataSet.fileName || "",
    rows: asNumber(dataSet.rows, 0),
    byteLength: asNumber(dataSet.byteLength, 0),
    contentHash: dataSet.contentHash || "",
  }]));
  return { ...record, dataSets };
}

function runMany(db, sql, rows) {
  const statement = db.prepare(sql);
  rows.forEach((row) => statement.run(...row));
}

function removeSqliteFiles(path) {
  [path, `${path}-wal`, `${path}-shm`].forEach((file) => {
    if (existsSync(file)) unlinkSync(file);
  });
}

export function exportSqliteSnapshot({
  inputPath = join(root, "server", "data", "db.sqlite"),
  outputPath = join(root, "server", "data", "db_audit.sqlite"),
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!existsSync(inputPath)) {
    throw new Error(`Source database not found: ${inputPath}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  if (inputPath === outputPath) {
    throw new Error("Input and output SQLite paths must be different");
  }
  removeSqliteFiles(outputPath);

  const source = readSourceDatabase(inputPath);
  const db = new DatabaseSync(outputPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL,
      password_updated_at TEXT
    );
    CREATE TABLE target_packages (
      id TEXT PRIMARY KEY,
      status TEXT,
      version INTEGER,
      created_at TEXT,
      created_by TEXT,
      approved_at TEXT,
      scenario TEXT,
      final_target_return REAL,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE portfolios (
      id TEXT PRIMARY KEY,
      status TEXT,
      version INTEGER,
      created_at TEXT,
      created_by TEXT,
      approved_at TEXT,
      target_package_id TEXT,
      benchmark TEXT,
      holding_count INTEGER,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE approvals (
      id TEXT PRIMARY KEY,
      type TEXT,
      target_id TEXT,
      actor_id TEXT,
      actor_name TEXT,
      decision TEXT,
      note TEXT,
      created_at TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE import_records (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      type TEXT,
      file_name TEXT,
      rows INTEGER,
      status TEXT,
      byte_length INTEGER,
      content_hash TEXT,
      loaded_at TEXT,
      loaded_by TEXT,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE public_data_refreshes (
      id TEXT PRIMARY KEY,
      recorded_at TEXT,
      recorded_by TEXT,
      generated_at TEXT,
      source_name TEXT,
      source_url TEXT,
      start_date TEXT,
      end_date TEXT,
      incremental_tickers INTEGER,
      full_history_tickers INTEGER,
      raw_json TEXT NOT NULL
    );
    CREATE TABLE public_data_sets (
      refresh_id TEXT NOT NULL,
      data_set_key TEXT NOT NULL,
      file_name TEXT,
      rows INTEGER,
      byte_length INTEGER,
      content_hash TEXT,
      PRIMARY KEY (refresh_id, data_set_key)
    );
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      time TEXT,
      actor_id TEXT,
      actor_name TEXT,
      actor_group TEXT,
      action TEXT,
      result TEXT,
      detail TEXT
    );
    CREATE TABLE system_config_versions (
      id TEXT PRIMARY KEY,
      exported_at TEXT NOT NULL,
      schema_version INTEGER,
      config_json TEXT NOT NULL
    );
  `);

  db.exec("BEGIN");
  try {
    runMany(db, "INSERT INTO meta (key, value) VALUES (?, ?)", [
      ["exportedAt", generatedAt],
      ["sourcePath", inputPath],
      ["sourceSchemaVersion", String(source.meta?.schemaVersion || "")],
      ["sourceUpdatedAt", String(source.meta?.updatedAt || "")],
    ]);

    runMany(db, "INSERT INTO users (id, name, group_name, role, active, password_updated_at) VALUES (?, ?, ?, ?, ?, ?)", (source.users || []).map((user) => [
      user.id || "",
      user.name || "",
      user.group || "",
      user.role || "",
      user.active === false ? 0 : 1,
      user.passwordUpdatedAt || "",
    ]));

    runMany(db, "INSERT INTO target_packages (id, status, version, created_at, created_by, approved_at, scenario, final_target_return, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (source.targetPackages || []).map((item) => [
      item.id || "",
      item.status || "",
      asNumber(item.version, 0),
      item.createdAt || "",
      item.createdBy || "",
      item.approvedAt || "",
      item.scenario || "",
      asNumber(item.finalTargetReturn),
      json(item),
    ]));

    runMany(db, "INSERT INTO portfolios (id, status, version, created_at, created_by, approved_at, target_package_id, benchmark, holding_count, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (source.portfolios || []).map((item) => [
      item.id || "",
      item.status || "",
      asNumber(item.version, 0),
      item.createdAt || "",
      item.createdBy || "",
      item.approvedAt || "",
      item.targetPackageId || "",
      item.benchmark || "",
      Array.isArray(item.holdings) ? item.holdings.length : 0,
      json(item),
    ]));

    runMany(db, "INSERT INTO approvals (id, type, target_id, actor_id, actor_name, decision, note, created_at, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (source.approvals || []).map((item) => [
      item.id || "",
      item.type || "",
      item.targetId || "",
      item.actorId || "",
      item.actorName || "",
      item.decision || "",
      item.note || "",
      item.createdAt || "",
      json(item),
    ]));

    runMany(db, "INSERT INTO import_records (id, batch_id, type, file_name, rows, status, byte_length, content_hash, loaded_at, loaded_by, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (source.imports || []).map((item) => [
      item.id || "",
      item.batchId || "",
      item.type || "",
      item.fileName || "",
      asNumber(item.rows, 0),
      item.status || "",
      asNumber(item.byteLength, 0),
      item.contentHash || "",
      item.loadedAt || item.importedAt || "",
      item.loadedBy || item.importedBy || "",
      json(compactImport(item)),
    ]));

    const refreshes = [
      ...(source.publicDataCache?.refreshHistory || []),
    ];
    if (source.publicDataCache?.latest && !refreshes.some((item) => item.id === source.publicDataCache.latest.id)) {
      refreshes.unshift(compactPublicDataRecord(source.publicDataCache.latest));
    }
    runMany(db, "INSERT OR REPLACE INTO public_data_refreshes (id, recorded_at, recorded_by, generated_at, source_name, source_url, start_date, end_date, incremental_tickers, full_history_tickers, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", refreshes.map((item) => {
      const compact = compactPublicDataRecord(item);
      return [
        compact.id || "",
        compact.recordedAt || "",
        compact.recordedBy || "",
        compact.generatedAt || "",
        compact.sourceName || "",
        compact.sourceUrl || "",
        compact.startDate || "",
        compact.endDate || "",
        asNumber(compact.cache?.incrementalTickers, 0),
        asNumber(compact.cache?.fullHistoryTickers, 0),
        json(compact),
      ];
    }));
    const dataSetRows = [];
    refreshes.forEach((item) => {
      const compact = compactPublicDataRecord(item);
      Object.entries(compact?.dataSets || {}).forEach(([key, dataSet]) => {
        dataSetRows.push([
          compact.id || "",
          key,
          dataSet.fileName || "",
          asNumber(dataSet.rows, 0),
          asNumber(dataSet.byteLength, 0),
          dataSet.contentHash || "",
        ]);
      });
    });
    runMany(db, "INSERT OR REPLACE INTO public_data_sets (refresh_id, data_set_key, file_name, rows, byte_length, content_hash) VALUES (?, ?, ?, ?, ?, ?)", dataSetRows);

    runMany(db, "INSERT INTO audit_log (id, time, actor_id, actor_name, actor_group, action, result, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (source.auditLog || []).map((item) => [
      item.id || "",
      item.time || "",
      item.actorId || "",
      item.actorName || "",
      item.actorGroup || "",
      item.action || "",
      item.result || "",
      item.detail || "",
    ]));

    runMany(db, "INSERT INTO system_config_versions (id, exported_at, schema_version, config_json) VALUES (?, ?, ?, ?)", [
      ["current", generatedAt, asNumber(source.meta?.schemaVersion, 0), json(source.systemConfig || {})],
    ]);

    db.exec(`
      CREATE INDEX idx_audit_time ON audit_log(time);
      CREATE INDEX idx_approvals_target ON approvals(type, target_id);
      CREATE INDEX idx_import_type_time ON import_records(type, loaded_at);
      CREATE INDEX idx_public_data_end_date ON public_data_refreshes(end_date);
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  return {
    inputPath,
    outputPath,
    generatedAt,
    counts: {
      users: (source.users || []).length,
      targetPackages: (source.targetPackages || []).length,
      portfolios: (source.portfolios || []).length,
      approvals: (source.approvals || []).length,
      imports: (source.imports || []).length,
      publicDataRefreshes: (source.publicDataCache?.refreshHistory || []).length + (source.publicDataCache?.latest ? 1 : 0),
      auditLog: (source.auditLog || []).length,
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--input") args.inputPath = argv[index += 1];
    else if (item === "--output") args.outputPath = argv[index += 1];
  }
  return args;
}

const cliPath = fileURLToPath(import.meta.url);
if (process.argv[1] === cliPath) {
  const result = exportSqliteSnapshot(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
