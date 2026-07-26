import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const permissionMap = {
  admin: ["System Administrator"],
  decision: ["Decision Committee"],
  execution: ["Execution Team"],
  data: ["System Administrator", "Execution Team"],
  annualData: ["System Administrator", "Decision Committee"],
  publicDataRead: ["System Administrator", "Decision Committee", "Execution Team"],
  report: ["System Administrator", "Decision Committee", "Execution Team", "Compliance"],
  audit: ["System Administrator", "Decision Committee", "Compliance"],
  compliance: ["Compliance"],
};

const allocationScenarioKeys = ["bull", "balanced", "bear"];
const allocationAssetKeys = ["equity", "bond", "alternative", "cash"];
const allocationRegionKeys = ["us", "developed", "emerging"];
const marketRiskFreeRateKeys = ["us", "developed", "hongkong", "chinaa"];

function hashPassword(password) {
  return createHash("sha256").update(String(password || "")).digest("hex");
}

function sanitizeUser(user) {
  if (!user) return user;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function summarizePublicDataSets(dataSets = {}) {
  return Object.fromEntries(Object.entries(dataSets || {}).map(([key, data]) => [key, {
    fileName: data.fileName || "",
    rows: Number(data.rows || 0),
    byteLength: Number(data.byteLength || 0),
    contentHash: data.contentHash || "",
  }]));
}

function isEquityImplementationPortfolio(portfolio) {
  const holdings = Array.isArray(portfolio?.holdings) ? portfolio.holdings : [];
  return holdings.length > 0 && holdings.every((holding) => {
    const assetClass = String(holding.assetClass || "Equity").trim().toLowerCase();
    const ticker = String(holding.ticker || holding.symbol || "").trim().toLowerCase();
    return assetClass === "equity" && ticker && ticker !== "cash";
  });
}

export function defaultSystemConfig() {
  return {
    maintenance: {
      version: 0,
      lastMaintainedAt: "",
      lastMaintainedBy: "",
    },
    publicCpiSources: [
      {
        priority: 1,
        name: "Philadelphia Fed SPF CPI forecast",
        institution: "Federal Reserve Bank of Philadelphia",
        url: "https://www.philadelphiafed.org/surveys-and-data/cpi-spf",
        category: "Official survey forecast",
        kind: "forecast-page",
        active: true,
        note: "Widely used Survey of Professional Forecasters reference. Committee reviews the relevant CPI mean or median response before entering the numeric value.",
      },
      {
        priority: 2,
        name: "Cleveland Fed Inflation Nowcasting",
        institution: "Federal Reserve Bank of Cleveland",
        url: "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting",
        category: "Official nowcast",
        kind: "nowcast-page",
        active: true,
        note: "Official Federal Reserve Bank nowcast reference. Committee reviews whether the nowcast is appropriate as a CPI input.",
      },
      {
        priority: 3,
        name: "BLS CPI-U latest 12-month change reference",
        institution: "U.S. Bureau of Labor Statistics",
        url: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        documentationUrl: "https://www.bls.gov/developers/api_signature_v2.htm",
        category: "Official historical reference",
        kind: "historical-cpi-api",
        active: true,
        note: "Official CPI history. This is historical context rather than a forward forecast unless the committee explicitly includes it.",
      },
    ],
    businessParameters: {
      scenarioBands: {
        bull: { low: 5, high: 12 },
        balanced: { low: -2, high: 2 },
        bear: { low: -12, high: -3 },
      },
      equityReturnAllocationMethod: "baselineGap",
      allocationDefaults: {
        bull: {
          assets: {
            equity: { weight: 68 },
            bond: { weight: 16 },
            alternative: { weight: 11 },
            cash: { weight: 5 },
          },
          regions: {
            us: { share: 60 },
            developed: { share: 15 },
            emerging: { share: 25 },
          },
        },
        balanced: {
          assets: {
            equity: { weight: 55 },
            bond: { weight: 25 },
            alternative: { weight: 12 },
            cash: { weight: 8 },
          },
          regions: {
            us: { share: 60 },
            developed: { share: 15 },
            emerging: { share: 25 },
          },
        },
        bear: {
          assets: {
            equity: { weight: 35 },
            bond: { weight: 42 },
            alternative: { weight: 10 },
            cash: { weight: 13 },
          },
          regions: {
            us: { share: 65 },
            developed: { share: 15 },
            emerging: { share: 20 },
          },
        },
      },
      drawdownRatioLow: 0.6,
      drawdownRatioHigh: 0.8,
      betaRelativeTolerance: 0.05,
      returnShortfallTolerance: 0.05,
      returnExcessReviewTolerance: 0.5,
      drawdownExcessTolerance: 0.1,
      maxSingleSecurityWeight: 35,
      styleTickerMin: 2,
      styleTickerMax: 5,
      rebalanceLowerDrift: -20,
      rebalanceUpperDrift: 20,
      rebalanceCompletionDays: 3,
      executionQuantityTolerance: 0.01,
      executionValueTolerance: 0.02,
      executionWeightTolerancePp: 0.5,
      testDateOverride: "",
      riskFreeRates: {
        us: 4.5,
        developed: 0.5,
        hongkong: 4.2,
        chinaa: 1.8,
      },
    },
  };
}

function mergeAllocationDefaults(input = {}, base = {}) {
  const merged = {};
  allocationScenarioKeys.forEach((scenario) => {
    merged[scenario] = {
      assets: {},
      regions: {},
    };
    allocationAssetKeys.forEach((asset) => {
      const fallback = base[scenario]?.assets?.[asset] || {};
      const source = input?.[scenario]?.assets?.[asset] || {};
      const weight = Number.isFinite(Number(source.weight)) ? Number(source.weight) : fallback.weight;
      merged[scenario].assets[asset] = { ...fallback, ...source, weight };
    });
    allocationRegionKeys.forEach((region) => {
      const fallback = base[scenario]?.regions?.[region] || {};
      const source = input?.[scenario]?.regions?.[region] || {};
      const share = Number.isFinite(Number(source.share)) ? Number(source.share) : fallback.share;
      merged[scenario].regions[region] = { ...fallback, ...source, share };
    });
  });
  return merged;
}

function normalizeRiskFreeRates(input = {}, base = defaultSystemConfig().businessParameters.riskFreeRates) {
  return Object.fromEntries(marketRiskFreeRateKeys.map((key) => {
    const value = Number(input?.[key]);
    const fallback = Number(base?.[key]);
    return [key, Number.isFinite(value) ? value : (Number.isFinite(fallback) ? fallback : 0)];
  }));
}

function normalizeSystemConfig(config = {}) {
  const base = defaultSystemConfig();
  const maintenance = config.maintenance && typeof config.maintenance === "object"
    ? config.maintenance
    : {};
  const sourceByName = new Map(base.publicCpiSources.map((source) => [source.name, source]));
  const publicCpiSources = Array.isArray(config.publicCpiSources)
    ? config.publicCpiSources.map((source, index) => {
      const fallback = sourceByName.get(source.name) || base.publicCpiSources[index] || {};
      return {
        ...fallback,
        ...source,
        priority: Number.isFinite(Number(source.priority)) ? Number(source.priority) : index + 1,
        active: source.active !== false,
      };
    })
    : base.publicCpiSources;

  const businessParameters = config.businessParameters || {};
  const rawStyleTickerMin = Number(businessParameters.styleTickerMin ?? base.businessParameters.styleTickerMin);
  const rawStyleTickerMax = Number(businessParameters.styleTickerMax ?? base.businessParameters.styleTickerMax);
  const styleTickerMin = Math.max(0, Math.round(Number.isFinite(rawStyleTickerMin) ? rawStyleTickerMin : base.businessParameters.styleTickerMin));
  const styleTickerMax = Math.max(styleTickerMin, Math.round(Number.isFinite(rawStyleTickerMax) ? rawStyleTickerMax : base.businessParameters.styleTickerMax));
  const toleranceValue = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
  };
  const hasConfiguredRiskFreeRates = businessParameters.riskFreeRates
    && typeof businessParameters.riskFreeRates === "object";
  const rawMaxSingleSecurityWeight = Number(businessParameters.maxSingleSecurityWeight);
  const maxSingleSecurityWeight = Number.isFinite(rawMaxSingleSecurityWeight)
    ? (!hasConfiguredRiskFreeRates && rawMaxSingleSecurityWeight === 15
      ? base.businessParameters.maxSingleSecurityWeight
      : rawMaxSingleSecurityWeight)
    : base.businessParameters.maxSingleSecurityWeight;

  return {
    maintenance: {
      ...base.maintenance,
      ...maintenance,
      version: Math.max(0, Math.round(Number(maintenance.version ?? base.maintenance.version))),
      lastMaintainedAt: maintenance.lastMaintainedAt || base.maintenance.lastMaintainedAt,
      lastMaintainedBy: maintenance.lastMaintainedBy || base.maintenance.lastMaintainedBy,
    },
    publicCpiSources,
    businessParameters: {
      ...base.businessParameters,
      ...businessParameters,
      scenarioBands: {
        ...base.businessParameters.scenarioBands,
        ...(businessParameters.scenarioBands || {}),
      },
      styleTickerMin,
      styleTickerMax,
      betaRelativeTolerance: toleranceValue(
        businessParameters.betaRelativeTolerance,
        base.businessParameters.betaRelativeTolerance,
      ),
      returnShortfallTolerance: toleranceValue(
        businessParameters.returnShortfallTolerance,
        base.businessParameters.returnShortfallTolerance,
      ),
      returnExcessReviewTolerance: toleranceValue(
        businessParameters.returnExcessReviewTolerance,
        base.businessParameters.returnExcessReviewTolerance,
      ),
      drawdownExcessTolerance: toleranceValue(
        businessParameters.drawdownExcessTolerance,
        base.businessParameters.drawdownExcessTolerance,
      ),
      maxSingleSecurityWeight,
      equityReturnAllocationMethod: ["baselineGap", "pureProRata", "manual"].includes(businessParameters.equityReturnAllocationMethod)
        ? businessParameters.equityReturnAllocationMethod
        : base.businessParameters.equityReturnAllocationMethod,
      allocationDefaults: mergeAllocationDefaults(
        businessParameters.allocationDefaults,
        base.businessParameters.allocationDefaults,
      ),
      riskFreeRates: normalizeRiskFreeRates(
        businessParameters.riskFreeRates,
        base.businessParameters.riskFreeRates,
      ),
    },
  };
}

function migrateDatabase(db) {
  let changed = false;
  if (!db.systemConfig) {
    db.systemConfig = defaultSystemConfig();
    changed = true;
  } else {
    const normalized = normalizeSystemConfig(db.systemConfig);
    if (JSON.stringify(normalized) !== JSON.stringify(db.systemConfig)) {
      db.systemConfig = normalized;
      changed = true;
    }
  }
  if (!db.publicDataCache || typeof db.publicDataCache !== "object") {
    db.publicDataCache = { latest: null, refreshHistory: [] };
    changed = true;
  } else if (!Array.isArray(db.publicDataCache.refreshHistory)) {
    db.publicDataCache.refreshHistory = [];
    changed = true;
  }
  if (!Array.isArray(db.nonEquityNavPackages)) {
    db.nonEquityNavPackages = [];
    changed = true;
  }
  if (!Array.isArray(db.tradeAuthorizationPackages)) {
    db.tradeAuthorizationPackages = [];
    changed = true;
  }
  if (!Array.isArray(db.reportDistributions)) {
    db.reportDistributions = [];
    changed = true;
  }
  if (Number(db.meta?.schemaVersion || 1) < 4) {
    db.meta.schemaVersion = 4;
    changed = true;
  }
  return changed;
}

export function defaultDatabase() {
  const now = new Date().toISOString();
  return {
    meta: {
      schemaVersion: 4,
      createdAt: now,
      updatedAt: now,
    },
    users: [
      { id: "admin-1", name: "system_admin", group: "System Administrator", role: "User Admin", active: true, passwordHash: hashPassword("admin000"), passwordUpdatedAt: now },
      { id: "committee-1", name: "will", group: "Decision Committee", role: "Decision Approver", active: true, passwordHash: hashPassword("141242"), passwordUpdatedAt: now },
      { id: "execution-1", name: "will1976", group: "Execution Team", role: "Execution Approver", active: true, passwordHash: hashPassword("517518"), passwordUpdatedAt: now },
    ],
    sessions: [],
    targetPackages: [],
    portfolios: [],
    nonEquityNavPackages: [],
    tradeAuthorizationPackages: [],
    reportDistributions: [],
    approvals: [],
    imports: [],
    publicDataCache: { latest: null, refreshHistory: [] },
    auditLog: [],
    systemConfig: defaultSystemConfig(),
  };
}

function contentHash(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}

function parseDatabaseText(text, sourceName) {
  let db;
  try {
    db = JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse database state from ${sourceName}: ${error.message}`);
  }
  if (migrateDatabase(db)) {
    return { db, changed: true };
  }
  return { db, changed: false };
}

function createJsonPersistence(dbPath) {
  function load() {
    if (!existsSync(dbPath)) {
      const db = defaultDatabase();
      save(db);
      return db;
    }
    const parsed = parseDatabaseText(readFileSync(dbPath, "utf8"), dbPath);
    if (parsed.changed) save(parsed.db);
    return parsed.db;
  }

  function save(db) {
    mkdirSync(dirname(dbPath), { recursive: true });
    db.meta.updatedAt = new Date().toISOString();
    writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`);
  }

  return {
    kind: "json",
    dbPath,
    load,
    save,
    storageInfo() {
      return { kind: "json", dbPath };
    },
  };
}

function legacyJsonPathFor(sqlitePath) {
  return sqlitePath.replace(/\.sqlite$/i, ".json");
}

function createSqlitePersistence(dbPath) {
  const legacyJsonPath = legacyJsonPathFor(dbPath);
  const normalizedSchemaVersion = 1;

  function open() {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state_backups (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS persistence_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS database_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS application_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        role TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        password_hash TEXT,
        password_updated_at TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1)),
        raw_json TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS target_packages (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT,
        created_by TEXT,
        approved_at TEXT,
        scenario TEXT,
        final_target_return REAL,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS portfolios (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT,
        created_by TEXT,
        approved_at TEXT,
        target_package_id TEXT,
        benchmark TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS portfolio_holdings (
        portfolio_id TEXT NOT NULL,
        position_no INTEGER NOT NULL,
        ticker TEXT,
        asset_class TEXT,
        sleeve TEXT,
        weight REAL,
        raw_json TEXT NOT NULL,
        PRIMARY KEY (portfolio_id, position_no),
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS non_equity_nav_packages (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        as_of_date TEXT,
        bond REAL NOT NULL,
        alternative REAL NOT NULL,
        cash REAL NOT NULL,
        submitted_at TEXT,
        submitted_by TEXT,
        approved_at TEXT,
        approved_by TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trade_authorization_packages (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        portfolio_id TEXT,
        saved_at TEXT,
        saved_by TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trade_orders (
        package_id TEXT NOT NULL,
        order_no INTEGER NOT NULL,
        action TEXT,
        ticker TEXT,
        quantity REAL,
        price REAL,
        execution_status TEXT,
        committee_status TEXT,
        raw_json TEXT NOT NULL,
        PRIMARY KEY (package_id, order_no),
        FOREIGN KEY (package_id) REFERENCES trade_authorization_packages(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS report_distributions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        portfolio_id TEXT NOT NULL,
        target_package_id TEXT,
        status TEXT NOT NULL,
        report_period TEXT,
        recipient_group TEXT,
        distribution_date TEXT,
        distributed_at TEXT,
        distributed_by TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        decision TEXT NOT NULL,
        note TEXT,
        created_at TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS import_records (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        type TEXT NOT NULL,
        file_name TEXT,
        row_count INTEGER,
        status TEXT,
        byte_length INTEGER,
        content_hash TEXT,
        loaded_at TEXT,
        loaded_by TEXT,
        raw_text TEXT,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS public_data_refreshes (
        id TEXT PRIMARY KEY,
        recorded_at TEXT,
        recorded_by TEXT,
        generated_at TEXT,
        source_name TEXT,
        source_url TEXT,
        start_date TEXT,
        end_date TEXT,
        is_latest INTEGER NOT NULL CHECK (is_latest IN (0, 1)),
        history_ordinal INTEGER,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS public_data_sets (
        refresh_id TEXT NOT NULL,
        data_set_key TEXT NOT NULL,
        file_name TEXT,
        row_count INTEGER,
        byte_length INTEGER,
        content_hash TEXT,
        raw_text TEXT,
        raw_json TEXT NOT NULL,
        PRIMARY KEY (refresh_id, data_set_key),
        FOREIGN KEY (refresh_id) REFERENCES public_data_refreshes(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        event_time TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        actor_group TEXT,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, active);
      CREATE INDEX IF NOT EXISTS idx_targets_status_date ON target_packages(status, approved_at);
      CREATE INDEX IF NOT EXISTS idx_portfolios_status_date ON portfolios(status, approved_at);
      CREATE INDEX IF NOT EXISTS idx_nav_status_date ON non_equity_nav_packages(status, approved_at);
      CREATE INDEX IF NOT EXISTS idx_report_distribution_portfolio ON report_distributions(portfolio_id, distributed_at);
      CREATE INDEX IF NOT EXISTS idx_approvals_target ON approvals(type, target_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_import_type_date ON import_records(type, loaded_at);
      CREATE INDEX IF NOT EXISTS idx_public_data_date ON public_data_refreshes(end_date, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(event_time);
    `);
    return db;
  }

  function seedDatabase() {
    if (existsSync(legacyJsonPath)) {
      const parsed = parseDatabaseText(readFileSync(legacyJsonPath, "utf8"), legacyJsonPath);
      return parsed.db;
    }
    return defaultDatabase();
  }

  function json(value) {
    return JSON.stringify(value ?? null);
  }

  function parseJson(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function upsertMeta(sqlite, key, value) {
    sqlite.prepare("INSERT OR REPLACE INTO database_meta (key, value) VALUES (?, ?)")
      .run(key, String(value ?? ""));
  }

  function metaMap(sqlite) {
    return Object.fromEntries(sqlite.prepare("SELECT key, value FROM database_meta").all()
      .map((row) => [row.key, row.value]));
  }

  function normalizedReady(sqlite) {
    const row = sqlite.prepare("SELECT value FROM persistence_meta WHERE key = 'normalizedSchemaVersion'").get();
    return Number(row?.value || 0) >= normalizedSchemaVersion
      && Number(sqlite.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0) > 0;
  }

  function recordFromRaw(row) {
    const record = parseJson(row?.raw_json, {});
    return record && typeof record === "object" ? record : {};
  }

  function readRawCollection(sqlite, table, orderBy = "rowid") {
    return sqlite.prepare(`SELECT raw_json FROM ${table} ORDER BY ${orderBy}`).all().map(recordFromRaw);
  }

  function hydratePublicDataRecord(sqlite, row, includeRawText) {
    if (!row) return null;
    const record = recordFromRaw(row);
    const dataSets = {};
    sqlite.prepare("SELECT * FROM public_data_sets WHERE refresh_id = ? ORDER BY data_set_key").all(row.id)
      .forEach((dataSetRow) => {
        const stored = parseJson(dataSetRow.raw_json, {});
        dataSets[dataSetRow.data_set_key] = {
          ...stored,
          fileName: dataSetRow.file_name || stored.fileName || "",
          rows: Number(dataSetRow.row_count || stored.rows || 0),
          byteLength: Number(dataSetRow.byte_length || stored.byteLength || 0),
          contentHash: dataSetRow.content_hash || stored.contentHash || "",
          ...(includeRawText ? { rawText: dataSetRow.raw_text || "" } : {}),
        };
      });
    return {
      ...record,
      dataSets: includeRawText ? dataSets : summarizePublicDataSets(dataSets),
    };
  }

  function readNormalizedState(sqlite) {
    const meta = metaMap(sqlite);
    const users = sqlite.prepare("SELECT * FROM users ORDER BY rowid").all().map((row) => ({
      ...recordFromRaw(row),
      id: row.id,
      name: row.name,
      group: row.group_name,
      role: row.role,
      active: Boolean(row.active),
      ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
      ...(row.password_updated_at ? { passwordUpdatedAt: row.password_updated_at } : {}),
    }));
    if (!users.length) throw new Error("Normalized SQLite database does not contain users");

    const portfolios = sqlite.prepare("SELECT * FROM portfolios ORDER BY rowid").all().map((row) => {
      const record = recordFromRaw(row);
      const holdings = sqlite.prepare("SELECT raw_json FROM portfolio_holdings WHERE portfolio_id = ? ORDER BY position_no")
        .all(row.id).map(recordFromRaw);
      return { ...record, holdings };
    });
    const tradeAuthorizationPackages = sqlite.prepare("SELECT * FROM trade_authorization_packages ORDER BY rowid").all().map((row) => {
      const record = recordFromRaw(row);
      const orders = sqlite.prepare("SELECT raw_json FROM trade_orders WHERE package_id = ? ORDER BY order_no")
        .all(row.id).map(recordFromRaw);
      return { ...record, orders };
    });
    const latestRefreshRow = sqlite.prepare("SELECT * FROM public_data_refreshes WHERE is_latest = 1 ORDER BY recorded_at DESC LIMIT 1").get();
    const refreshHistory = sqlite.prepare(`
      SELECT * FROM public_data_refreshes
      WHERE history_ordinal IS NOT NULL
      ORDER BY history_ordinal
    `).all().map((row) => hydratePublicDataRecord(sqlite, row, false));
    const systemConfigRow = sqlite.prepare("SELECT value_json FROM application_settings WHERE key = 'systemConfig'").get();

    return {
      meta: {
        schemaVersion: Number(meta.appSchemaVersion || 4),
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: meta.updatedAt || new Date().toISOString(),
      },
      users,
      sessions: sqlite.prepare("SELECT raw_json FROM sessions ORDER BY rowid").all().map(recordFromRaw),
      targetPackages: readRawCollection(sqlite, "target_packages"),
      portfolios,
      nonEquityNavPackages: readRawCollection(sqlite, "non_equity_nav_packages"),
      tradeAuthorizationPackages,
      reportDistributions: readRawCollection(sqlite, "report_distributions"),
      approvals: readRawCollection(sqlite, "approvals"),
      imports: sqlite.prepare("SELECT raw_json, raw_text FROM import_records ORDER BY rowid").all().map((row) => ({
        ...recordFromRaw(row),
        rawText: row.raw_text || "",
      })),
      publicDataCache: {
        latest: hydratePublicDataRecord(sqlite, latestRefreshRow, true),
        refreshHistory,
      },
      auditLog: sqlite.prepare("SELECT * FROM audit_log ORDER BY rowid").all().map((row) => ({
        id: row.id,
        time: row.event_time,
        actorId: row.actor_id || "",
        actorName: row.actor_name || "",
        actorGroup: row.actor_group || "",
        action: row.action,
        result: row.result,
        detail: row.detail || "",
      })),
      systemConfig: parseJson(systemConfigRow?.value_json, defaultSystemConfig()),
    };
  }

  function clearNormalizedTables(sqlite) {
    [
      "portfolio_holdings",
      "trade_orders",
      "public_data_sets",
      "sessions",
      "target_packages",
      "portfolios",
      "non_equity_nav_packages",
      "trade_authorization_packages",
      "report_distributions",
      "approvals",
      "import_records",
      "public_data_refreshes",
      "audit_log",
      "users",
      "application_settings",
      "database_meta",
    ].forEach((table) => sqlite.exec(`DELETE FROM ${table}`));
  }

  function writeNormalizedTables(sqlite, db, now) {
    clearNormalizedTables(sqlite);
    upsertMeta(sqlite, "appSchemaVersion", Number(db.meta?.schemaVersion || 4));
    upsertMeta(sqlite, "createdAt", db.meta?.createdAt || now);
    upsertMeta(sqlite, "updatedAt", db.meta?.updatedAt || now);
    sqlite.prepare("INSERT INTO application_settings (key, value_json, updated_at) VALUES (?, ?, ?)")
      .run("systemConfig", json(db.systemConfig || defaultSystemConfig()), now);

    const userStatement = sqlite.prepare(`
      INSERT INTO users
      (id, name, group_name, role, active, password_hash, password_updated_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.users || []).forEach((user) => userStatement.run(
      user.id,
      user.name || "",
      user.group || "",
      user.role || "",
      user.active === false ? 0 : 1,
      user.passwordHash || null,
      user.passwordUpdatedAt || null,
      json(user),
    ));

    const sessionStatement = sqlite.prepare(`
      INSERT INTO sessions (id, user_id, created_at, active, raw_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    (db.sessions || []).forEach((session) => sessionStatement.run(
      session.id,
      session.userId,
      session.createdAt || "",
      session.active === false ? 0 : 1,
      json(session),
    ));

    const targetStatement = sqlite.prepare(`
      INSERT INTO target_packages
      (id, status, version, created_at, created_by, approved_at, scenario, final_target_return, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.targetPackages || []).forEach((item) => targetStatement.run(
      item.id,
      item.status || "",
      Number(item.version || 0),
      item.createdAt || null,
      item.createdBy || null,
      item.approvedAt || null,
      item.scenario || null,
      Number.isFinite(Number(item.finalTargetReturn)) ? Number(item.finalTargetReturn) : null,
      json(item),
    ));

    const portfolioStatement = sqlite.prepare(`
      INSERT INTO portfolios
      (id, status, version, created_at, created_by, approved_at, target_package_id, benchmark, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const holdingStatement = sqlite.prepare(`
      INSERT INTO portfolio_holdings
      (portfolio_id, position_no, ticker, asset_class, sleeve, weight, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    (db.portfolios || []).forEach((item) => {
      const { holdings, ...portfolioRecord } = item;
      portfolioStatement.run(
        item.id,
        item.status || "",
        Number(item.version || 0),
        item.createdAt || null,
        item.createdBy || null,
        item.approvedAt || null,
        item.targetPackageId || null,
        item.benchmark || null,
        json(portfolioRecord),
      );
      (Array.isArray(holdings) ? holdings : []).forEach((holding, index) => holdingStatement.run(
        item.id,
        index,
        holding.ticker || holding.symbol || null,
        holding.assetClass || null,
        holding.sleeve || null,
        Number.isFinite(Number(holding.weight)) ? Number(holding.weight) : null,
        json(holding),
      ));
    });

    const navStatement = sqlite.prepare(`
      INSERT INTO non_equity_nav_packages
      (id, status, as_of_date, bond, alternative, cash, submitted_at, submitted_by, approved_at, approved_by, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.nonEquityNavPackages || []).forEach((item) => navStatement.run(
      item.id,
      item.status || "",
      item.asOfDate || null,
      Number(item.bond || 0),
      Number(item.alternative || 0),
      Number(item.cash || 0),
      item.submittedAt || null,
      item.submittedBy || null,
      item.approvedAt || null,
      item.approvedBy || null,
      json(item),
    ));

    const tradePackageStatement = sqlite.prepare(`
      INSERT INTO trade_authorization_packages
      (id, version, portfolio_id, saved_at, saved_by, raw_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const tradeOrderStatement = sqlite.prepare(`
      INSERT INTO trade_orders
      (package_id, order_no, action, ticker, quantity, price, execution_status, committee_status, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.tradeAuthorizationPackages || []).forEach((item) => {
      const { orders, ...packageRecord } = item;
      tradePackageStatement.run(
        item.id,
        Number(item.version || 0),
        item.portfolioId || null,
        item.savedAt || null,
        item.savedBy || null,
        json(packageRecord),
      );
      (Array.isArray(orders) ? orders : []).forEach((order, index) => tradeOrderStatement.run(
        item.id,
        index,
        order.action || null,
        order.ticker || null,
        Number.isFinite(Number(order.quantity)) ? Number(order.quantity) : null,
        Number.isFinite(Number(order.price)) ? Number(order.price) : null,
        order.executionStatus || null,
        order.committeeStatus || null,
        json(order),
      ));
    });

    const distributionStatement = sqlite.prepare(`
      INSERT INTO report_distributions
      (id, version, portfolio_id, target_package_id, status, report_period, recipient_group, distribution_date, distributed_at, distributed_by, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.reportDistributions || []).forEach((item) => distributionStatement.run(
      item.id,
      Number(item.version || 0),
      item.portfolioId || "",
      item.targetPackageId || null,
      item.status || "",
      item.reportPeriod || null,
      item.recipientGroup || null,
      item.distributionDate || null,
      item.distributedAt || null,
      item.distributedBy || null,
      json(item),
    ));

    const approvalStatement = sqlite.prepare(`
      INSERT INTO approvals
      (id, type, target_id, actor_id, actor_name, decision, note, created_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.approvals || []).forEach((item) => approvalStatement.run(
      item.id,
      item.type || "",
      item.targetId || "",
      item.actorId || null,
      item.actorName || null,
      item.decision || "",
      item.note || null,
      item.createdAt || null,
      json(item),
    ));

    const importStatement = sqlite.prepare(`
      INSERT INTO import_records
      (id, batch_id, type, file_name, row_count, status, byte_length, content_hash, loaded_at, loaded_by, raw_text, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.imports || []).forEach((item) => {
      const { rawText, ...compact } = item;
      importStatement.run(
        item.id,
        item.batchId || null,
        item.type || "",
        item.fileName || null,
        Number(item.rows || 0),
        item.status || null,
        Number(item.byteLength || Buffer.byteLength(String(rawText || ""), "utf8")),
        item.contentHash || contentHash(rawText || ""),
        item.loadedAt || item.importedAt || null,
        item.loadedBy || item.importedBy || null,
        rawText || "",
        json(compact),
      );
    });

    const refreshStatement = sqlite.prepare(`
      INSERT INTO public_data_refreshes
      (id, recorded_at, recorded_by, generated_at, source_name, source_url, start_date, end_date, is_latest, history_ordinal, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const dataSetStatement = sqlite.prepare(`
      INSERT OR REPLACE INTO public_data_sets
      (refresh_id, data_set_key, file_name, row_count, byte_length, content_hash, raw_text, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const historyOrdinalById = new Map((db.publicDataCache?.refreshHistory || [])
      .map((item, index) => [item.id, index]));
    const refreshById = new Map();
    (db.publicDataCache?.refreshHistory || []).forEach((item) => refreshById.set(item.id, item));
    if (db.publicDataCache?.latest?.id) refreshById.set(db.publicDataCache.latest.id, db.publicDataCache.latest);
    refreshById.forEach((item, id) => {
      const { dataSets, ...refreshRecord } = item;
      const isLatest = db.publicDataCache?.latest?.id === id;
      refreshStatement.run(
        id,
        item.recordedAt || null,
        item.recordedBy || null,
        item.generatedAt || null,
        item.sourceName || null,
        item.sourceUrl || null,
        item.startDate || null,
        item.endDate || null,
        isLatest ? 1 : 0,
        historyOrdinalById.has(id) ? historyOrdinalById.get(id) : null,
        json(refreshRecord),
      );
      Object.entries(dataSets || {}).forEach(([key, dataSet]) => {
        const { rawText, ...compactDataSet } = dataSet || {};
        dataSetStatement.run(
          id,
          key,
          dataSet?.fileName || "",
          Number(dataSet?.rows || 0),
          Number(dataSet?.byteLength || Buffer.byteLength(String(rawText || ""), "utf8")),
          dataSet?.contentHash || contentHash(rawText || ""),
          rawText || "",
          json(compactDataSet),
        );
      });
    });

    const auditStatement = sqlite.prepare(`
      INSERT INTO audit_log
      (id, event_time, actor_id, actor_name, actor_group, action, result, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (db.auditLog || []).forEach((item) => auditStatement.run(
      item.id,
      item.time || now,
      item.actorId || null,
      item.actorName || null,
      item.actorGroup || null,
      item.action || "",
      item.result || "",
      item.detail || null,
    ));
  }

  function writeState(sqlite, db, reason = "save") {
    db.meta.updatedAt = new Date().toISOString();
    const now = new Date().toISOString();
    const text = `${JSON.stringify(db, null, 2)}\n`;
    const hash = contentHash(text);
    const schemaVersion = Number(db.meta?.schemaVersion || 1);
    const current = sqlite.prepare("SELECT json, content_hash, created_at FROM app_state WHERE id = 1").get();
    if (current?.content_hash === hash && reason === "application save" && normalizedReady(sqlite)) return;

    sqlite.exec("BEGIN IMMEDIATE");
    try {
      if (current?.json) {
        sqlite.prepare("INSERT INTO app_state_backups (id, created_at, reason, content_hash, json) VALUES (?, ?, ?, ?, ?)")
          .run(randomUUID(), now, reason, current.content_hash || contentHash(current.json), current.json);
      }
      writeNormalizedTables(sqlite, db, now);
      sqlite.prepare(`
        INSERT INTO app_state (id, json, content_hash, schema_version, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          json = excluded.json,
          content_hash = excluded.content_hash,
          schema_version = excluded.schema_version,
          updated_at = excluded.updated_at
      `).run(text, hash, schemaVersion, current?.created_at || now, now);
      sqlite.prepare("INSERT OR REPLACE INTO persistence_meta (key, value) VALUES (?, ?)")
        .run("lastWriteReason", reason);
      sqlite.prepare("INSERT OR REPLACE INTO persistence_meta (key, value) VALUES (?, ?)")
        .run("lastWriteAt", now);
      sqlite.prepare("INSERT OR REPLACE INTO persistence_meta (key, value) VALUES (?, ?)")
        .run("normalizedSchemaVersion", String(normalizedSchemaVersion));
      sqlite.exec(`
        DELETE FROM app_state_backups
        WHERE id NOT IN (
          SELECT id FROM app_state_backups
          ORDER BY created_at DESC
          LIMIT 10
        )
      `);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  function recoverFromBackup(sqlite) {
    const rows = sqlite.prepare("SELECT json, id, created_at FROM app_state_backups ORDER BY created_at DESC").all();
    for (const row of rows) {
      try {
        const parsed = parseDatabaseText(row.json, `SQLite backup ${row.id}`);
        writeState(sqlite, parsed.db, `recovered from backup ${row.id}`);
        return parsed.db;
      } catch {
        // Keep trying older backups.
      }
    }
    throw new Error("Cannot recover SQLite database state from app_state or backups");
  }

  function load() {
    const sqlite = open();
    try {
      if (normalizedReady(sqlite)) {
        try {
          const db = readNormalizedState(sqlite);
          if (migrateDatabase(db)) writeState(sqlite, db, "normalized schema migration");
          return db;
        } catch {
          return recoverFromBackup(sqlite);
        }
      }
      const row = sqlite.prepare("SELECT json FROM app_state WHERE id = 1").get();
      if (!row?.json) {
        const db = seedDatabase();
        writeState(sqlite, db, existsSync(legacyJsonPath)
          ? "initial migration from JSON to normalized SQLite"
          : "initial normalized SQLite database");
        return db;
      }
      try {
        const parsed = parseDatabaseText(row.json, dbPath);
        writeState(sqlite, parsed.db, "migration from app_state to normalized SQLite");
        return parsed.db;
      } catch {
        return recoverFromBackup(sqlite);
      }
    } finally {
      sqlite.close();
    }
  }

  function save(db) {
    const sqlite = open();
    try {
      writeState(sqlite, db, "application save");
    } finally {
      sqlite.close();
    }
  }

  return {
    kind: "sqlite",
    dbPath,
    legacyJsonPath,
    load,
    save,
    storageInfo() {
      return {
        kind: "sqlite",
        dbPath,
        legacyJsonPath,
        backupLimit: 10,
        normalized: true,
        normalizedSchemaVersion,
      };
    },
  };
}

function createPersistence(dbPath) {
  return extname(dbPath).toLowerCase() === ".sqlite"
    ? createSqlitePersistence(dbPath)
    : createJsonPersistence(dbPath);
}

export function createStore(dbPath) {
  const persistence = createPersistence(dbPath);
  const load = persistence.load;
  const save = persistence.save;

  function audit(db, actor, action, result, detail = "") {
    db.auditLog.push({
      id: randomUUID(),
      time: new Date().toISOString(),
      actorId: actor?.id || "",
      actorName: actor?.name || "Unknown",
      actorGroup: actor?.group || "",
      action,
      result,
      detail,
    });
  }

  function findUser(db, userId) {
    return db.users.find((user) => user.id === userId && user.active);
  }

  function actorCan(actor, permission) {
    return Boolean(actor && permissionMap[permission]?.includes(actor.group));
  }

  function approvedBySingleDecisionRole(db, type, targetId) {
    const approvals = db.approvals.filter((item) => item.type === type && item.targetId === targetId);
    if (!approvals.length) return false;
    const latest = approvals[approvals.length - 1];
    return latest.decision === "Approve";
  }

  function requirePermission(db, actor, permission, action) {
    if (actorCan(actor, permission)) {
      audit(db, actor, action, "Allowed");
      return;
    }
    audit(db, actor, action, "Blocked", `Required permission: ${permission}`);
    save(db);
    const error = new Error(`Permission denied: ${action} requires ${permission}`);
    error.statusCode = 403;
    throw error;
  }

  function login(userId, password = "") {
    const db = load();
    const user = findUser(db, userId);
    if (!user) {
      const error = new Error("Login failed: active user not found");
      error.statusCode = 401;
      throw error;
    }
    if (password !== "" && user.passwordHash !== hashPassword(password)) {
      audit(db, user, "Login", "Blocked", "Password mismatch");
      save(db);
      const error = new Error("Login failed: password does not match this role");
      error.statusCode = 401;
      throw error;
    }
    const session = {
      id: randomUUID(),
      userId: user.id,
      createdAt: new Date().toISOString(),
      active: true,
    };
    db.sessions.push(session);
    audit(db, user, "Login", "Allowed");
    save(db);
    return { session, user: sanitizeUser(user) };
  }

  function actorFromSession(db, sessionId) {
    const session = db.sessions.find((item) => item.id === sessionId && item.active);
    return session ? findUser(db, session.userId) : null;
  }

  function requireActiveSession(db, sessionId) {
    const actor = actorFromSession(db, sessionId);
    if (!actor) {
      const error = new Error("Session is not active");
      error.statusCode = 401;
      throw error;
    }
    return actor;
  }

  function withActor(sessionId, permission, action, callback) {
    const db = load();
    const actor = actorFromSession(db, sessionId);
    requirePermission(db, actor, permission, action);
    const value = callback(db, actor);
    save(db);
    return value;
  }

  return {
    load,
    save,
    storageInfo: persistence.storageInfo,
    login,
    sessionInfo(sessionId) {
      const db = load();
      const user = requireActiveSession(db, sessionId);
      return { user: sanitizeUser(user) };
    },
    listUsers(sessionId) {
      return withActor(sessionId, "admin", "List users", (db) => db.users.map(sanitizeUser));
    },
    createUser(sessionId, user) {
      return withActor(sessionId, "admin", "Create user", (db, actor) => {
        const now = new Date().toISOString();
        const record = {
          id: randomUUID(),
          name: user.name,
          group: user.group,
          role: user.role,
          active: user.active !== false,
          ...(user.password ? { passwordHash: hashPassword(user.password), passwordUpdatedAt: now } : {}),
        };
        db.users.push(record);
        audit(db, actor, "User created", "Allowed", `${record.name} / ${record.group}`);
        return sanitizeUser(record);
      });
    },
    updateUserProfile(sessionId, profile) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      const targetUserId = profile.userId || actor.id;
      const target = db.users.find((user) => user.id === targetUserId && user.active);
      if (!target) {
        audit(db, actor, "User profile update", "Blocked", `Target user not found: ${targetUserId}`);
        save(db);
        const error = new Error("Target user not found");
        error.statusCode = 404;
        throw error;
      }
      if (target.id !== actor.id && !actorCan(actor, "admin")) {
        audit(db, actor, "User profile update", "Blocked", `Cannot update ${target.name}`);
        save(db);
        const error = new Error("Permission denied: only system administrator can update another user");
        error.statusCode = 403;
        throw error;
      }

      const nextName = String(profile.name || "").trim();
      if (!nextName) {
        const error = new Error("User name is required");
        error.statusCode = 400;
        throw error;
      }
      const duplicate = db.users.find((user) => user.id !== target.id
        && user.active
        && String(user.name || "").trim().toLowerCase() === nextName.toLowerCase());
      if (duplicate) {
        const error = new Error("User name is already used by another active user");
        error.statusCode = 409;
        throw error;
      }

      const previousName = target.name;
      target.name = nextName;
      if (String(profile.password || "")) {
        target.passwordHash = hashPassword(profile.password);
        target.passwordUpdatedAt = new Date().toISOString();
      }
      audit(db, actor, "User profile updated", "Allowed", `${previousName} -> ${target.name}`);
      save(db);
      return sanitizeUser(target);
    },
    readSystemConfig(sessionId) {
      const db = load();
      requireActiveSession(db, sessionId);
      return normalizeSystemConfig(db.systemConfig);
    },
    readSystemConfigForTargetSources(sessionId) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      if (!["System Administrator", "Decision Committee"].includes(actor.group)) {
        audit(db, actor, "Read target source configuration", "Blocked", "Requires system administrator or decision committee");
        save(db);
        const error = new Error("Permission denied: target source configuration requires system administrator or decision committee");
        error.statusCode = 403;
        throw error;
      }
      audit(db, actor, "Read target source configuration", "Allowed");
      save(db);
      return normalizeSystemConfig(db.systemConfig);
    },
    updateSystemConfig(sessionId, config) {
      return withActor(sessionId, "admin", "Update system configuration", (db, actor) => {
        db.systemConfig = normalizeSystemConfig(config);
        audit(db, actor, "System configuration updated", "Allowed", `${db.systemConfig.publicCpiSources.length} CPI source(s) configured`);
        return db.systemConfig;
      });
    },
    latestApprovedTargetPackage(sessionId) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      const approved = db.targetPackages
        .filter((target) => target.status === "Approved" && Number.isFinite(Number(target.finalTargetReturn)))
        .sort((a, b) => String(b.approvedAt || b.createdAt || "").localeCompare(String(a.approvedAt || a.createdAt || "")));
      audit(db, actor, "Read latest approved target package", "Allowed", approved[0]?.id || "None");
      save(db);
      return approved[0] || null;
    },
    latestApprovedPortfolio(sessionId) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      const approved = db.portfolios
        .filter((portfolio) => portfolio.status === "Approved" && isEquityImplementationPortfolio(portfolio))
        .sort((a, b) => String(b.approvedAt || b.createdAt || "").localeCompare(String(a.approvedAt || a.createdAt || "")));
      audit(db, actor, "Read latest approved portfolio", "Allowed", approved[0]?.id || "None");
      save(db);
      return approved[0] || null;
    },
    submitNonEquityNav(sessionId, nav) {
      return withActor(sessionId, "execution", "Submit non-equity NAV", (db, actor) => {
        db.nonEquityNavPackages ||= [];
        const record = {
          id: randomUUID(),
          status: "Submitted",
          asOfDate: String(nav?.asOfDate || ""),
          bond: Math.max(0, Number(nav?.bond || 0)),
          alternative: Math.max(0, Number(nav?.alternative || 0)),
          cash: Math.max(0, Number(nav?.cash || 0)),
          submittedAt: new Date().toISOString(),
          submittedBy: actor.id,
          submittedByName: actor.name,
        };
        db.nonEquityNavPackages.push(record);
        audit(db, actor, "Non-equity NAV submitted", "Allowed", `${record.asOfDate || "Undated"} NAV package`);
        return record;
      });
    },
    approveNonEquityNav(sessionId, packageId, decision) {
      return withActor(sessionId, "decision", "Approve non-equity NAV", (db, actor) => {
        db.nonEquityNavPackages ||= [];
        const navPackage = db.nonEquityNavPackages.find((item) => item.id === packageId);
        if (!navPackage) {
          const error = new Error("Non-equity NAV package not found");
          error.statusCode = 404;
          throw error;
        }
        navPackage.status = decision === "Approve" ? "Approved" : "Rejected";
        navPackage.approvedAt = decision === "Approve" ? new Date().toISOString() : "";
        navPackage.approvedBy = decision === "Approve" ? actor.id : "";
        navPackage.approvedByName = decision === "Approve" ? actor.name : "";
        navPackage.rejectedAt = decision === "Approve" ? "" : new Date().toISOString();
        navPackage.rejectedBy = decision === "Approve" ? "" : actor.id;
        navPackage.rejectedByName = decision === "Approve" ? "" : actor.name;
        audit(db, actor, "Non-equity NAV approval recorded", "Allowed", `${decision}: ${navPackage.id}`);
        return navPackage;
      });
    },
    latestApprovedNonEquityNav(sessionId) {
      return withActor(sessionId, "report", "Read latest approved non-equity NAV", (db) => {
        db.nonEquityNavPackages ||= [];
        return db.nonEquityNavPackages
          .filter((item) => item.status === "Approved")
          .sort((a, b) => String(b.approvedAt || b.submittedAt || "").localeCompare(String(a.approvedAt || a.submittedAt || "")))[0] || null;
      });
    },
    saveTradeAuthorizations(sessionId, payload) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      if (!actorCan(actor, "execution") && !actorCan(actor, "decision")) {
        audit(db, actor, "Save trade authorizations", "Blocked", "Execution Team or Decision Committee required");
        save(db);
        const error = new Error("Permission denied: trade authorization storage requires Execution Team or Decision Committee");
        error.statusCode = 403;
        throw error;
      }
      db.tradeAuthorizationPackages ||= [];
      const orders = Array.isArray(payload?.orders) ? payload.orders : [];
      const record = {
        id: randomUUID(),
        version: db.tradeAuthorizationPackages.length + 1,
        portfolioId: String(payload?.portfolioId || ""),
        orders: orders.map((order) => ({
          action: String(order?.action || "Buy"),
          ticker: String(order?.ticker || "").trim().toUpperCase(),
          quantity: Number(order?.quantity || 0),
          price: Number(order?.price || 0),
          reasonType: String(order?.reasonType || "Compliant"),
          remark: String(order?.remark || ""),
          executionApprover: String(order?.executionApprover || ""),
          executionStatus: String(order?.executionStatus || "Pending"),
          committeeStatus: String(order?.committeeStatus || "Pending"),
          authorizedAt: String(order?.authorizedAt || ""),
          source: String(order?.source || ""),
        })),
        savedAt: new Date().toISOString(),
        savedBy: actor.id,
        savedByName: actor.name,
      };
      db.tradeAuthorizationPackages.push(record);
      audit(db, actor, "Trade authorizations saved", "Allowed", `${record.orders.length} order(s), v${record.version}`);
      save(db);
      return record;
    },
    latestTradeAuthorizations(sessionId) {
      return withActor(sessionId, "report", "Read latest trade authorizations", (db) => {
        db.tradeAuthorizationPackages ||= [];
        return [...db.tradeAuthorizationPackages]
          .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0] || null;
      });
    },
    submitReportDistribution(sessionId, payload) {
      return withActor(sessionId, "execution", "Distribute formal report", (db, actor) => {
        const portfolioId = String(payload?.portfolioId || "").trim();
        if (!portfolioId) {
          const error = new Error("Approved portfolio is required before report distribution");
          error.statusCode = 422;
          throw error;
        }
        if (String(payload?.status || "") !== "Sent to Committee") {
          const error = new Error("Only a formal report sent to the Decision Committee can be recorded");
          error.statusCode = 422;
          throw error;
        }
        db.reportDistributions ||= [];
        const distributedAt = new Date().toISOString();
        const record = {
          id: randomUUID(),
          version: db.reportDistributions.length + 1,
          portfolioId,
          targetPackageId: String(payload?.targetPackageId || ""),
          status: "Sent to Committee",
          reportPeriod: String(payload?.reportPeriod || ""),
          recipientGroup: String(payload?.recipientGroup || "Decision Committee").trim() || "Decision Committee",
          distributionDate: String(payload?.distributionDate || distributedAt.slice(0, 10)),
          distributedAt,
          distributedBy: actor.id,
          distributedByName: actor.name,
        };
        db.reportDistributions.push(record);
        audit(db, actor, "Formal report distributed", "Allowed", `${record.recipientGroup}; portfolio ${record.portfolioId}; v${record.version}`);
        return record;
      });
    },
    latestReportDistribution(sessionId, options = {}) {
      return withActor(sessionId, "report", "Read latest report distribution", (db) => {
        db.reportDistributions ||= [];
        const portfolioId = String(options.portfolioId || "").trim();
        return db.reportDistributions
          .filter((item) => !portfolioId || item.portfolioId === portfolioId)
          .sort((a, b) => String(b.distributedAt || "").localeCompare(String(a.distributedAt || "")))[0] || null;
      });
    },
    createTargetPackage(sessionId, targetPackage) {
      return withActor(sessionId, "decision", "Create target package", (db, actor) => {
        const record = {
          id: randomUUID(),
          status: "Submitted",
          version: db.targetPackages.length + 1,
          createdAt: new Date().toISOString(),
          createdBy: actor.id,
          ...targetPackage,
        };
        db.targetPackages.push(record);
        audit(db, actor, "Target package submitted", "Allowed", `v${record.version}`);
        return record;
      });
    },
    approveTargetPackage(sessionId, targetPackageId, decision, note = "") {
      return withActor(sessionId, "decision", "Approve target package", (db, actor) => {
        const target = db.targetPackages.find((item) => item.id === targetPackageId);
        if (!target) {
          const error = new Error("Target package not found");
          error.statusCode = 404;
          throw error;
        }
        const approval = {
          id: randomUUID(),
          type: "Target Package",
          targetId: targetPackageId,
          actorId: actor.id,
          actorName: actor.name,
          decision,
          note,
          createdAt: new Date().toISOString(),
        };
        db.approvals.push(approval);
        if (approvedBySingleDecisionRole(db, "Target Package", targetPackageId)) {
          target.status = "Approved";
          target.approvedAt = new Date().toISOString();
        }
        audit(db, actor, "Target package approval recorded", "Allowed", `${decision}: ${note}`);
        return { target, approval };
      });
    },
    submitPortfolio(sessionId, portfolio) {
      return withActor(sessionId, "execution", "Submit portfolio", (db, actor) => {
        const record = {
          id: randomUUID(),
          status: "Submitted",
          version: db.portfolios.length + 1,
          createdAt: new Date().toISOString(),
          createdBy: actor.id,
          ...portfolio,
        };
        db.portfolios.push(record);
        audit(db, actor, "Portfolio submitted", "Allowed", `v${record.version}`);
        return record;
      });
    },
    approvePortfolio(sessionId, portfolioId, decision, note = "") {
      return withActor(sessionId, "decision", "Approve portfolio", (db, actor) => {
        const portfolio = db.portfolios.find((item) => item.id === portfolioId);
        if (!portfolio) {
          const error = new Error("Portfolio not found");
          error.statusCode = 404;
          throw error;
        }
        const approval = {
          id: randomUUID(),
          type: "Portfolio",
          targetId: portfolioId,
          actorId: actor.id,
          actorName: actor.name,
          decision,
          note,
          createdAt: new Date().toISOString(),
        };
        db.approvals.push(approval);
        if (approvedBySingleDecisionRole(db, "Portfolio", portfolioId)) {
          portfolio.status = "Approved";
          portfolio.approvedAt = new Date().toISOString();
        }
        audit(db, actor, "Portfolio approval recorded", "Allowed", `${decision}: ${note}`);
        return { portfolio, approval };
      });
    },
    importData(sessionId, type, fileName, text) {
      return withActor(sessionId, "data", `Load ${type}`, (db, actor) => {
        const rows = String(text || "").trim() ? String(text).trim().split(/\r?\n/).length - 1 : 0;
        const loadedAt = new Date().toISOString();
        const batchId = `DL-${loadedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${String(db.imports.length + 1).padStart(3, "0")}`;
        const record = {
          id: randomUUID(),
          batchId,
          type,
          fileName,
          rows,
          status: "Stored",
          byteLength: Buffer.byteLength(String(text || ""), "utf8"),
          contentHash: createHash("sha256").update(String(text || "")).digest("hex"),
          loadedAt,
          loadedBy: actor.id,
          importedAt: loadedAt,
          importedBy: actor.id,
          rawText: text,
        };
        db.imports.push(record);
        audit(db, actor, "Data loaded", "Allowed", `${type}: ${fileName}, ${rows} row(s)`);
        return { ...record, rawText: undefined };
      });
    },
    latestImportRecords(sessionId, types = []) {
      return withActor(sessionId, "report", "Read latest imported data", (db) => {
        const allowedTypes = new Set((Array.isArray(types) ? types : []).filter(Boolean));
        const records = (db.imports || [])
          .filter((record) => !allowedTypes.size || allowedTypes.has(record.type))
          .sort((a, b) => String(b.importedAt || b.loadedAt || "").localeCompare(String(a.importedAt || a.loadedAt || "")));
        return records.map((record) => ({ ...record }));
      });
    },
    recordPublicDataCache(sessionId, metadata) {
      return withActor(sessionId, "annualData", "Record annual public data cache", (db, actor) => {
        const storedDataSets = Object.fromEntries(Object.entries(metadata.dataSets || {}).map(([key, data]) => {
          const rawText = String(data.rawText || "");
          return [key, {
            fileName: data.fileName || `${key}.csv`,
            rows: Number(data.rows || 0),
            byteLength: Buffer.byteLength(rawText, "utf8"),
            contentHash: createHash("sha256").update(rawText).digest("hex"),
            rawText,
          }];
        }));
        const record = {
          id: randomUUID(),
          recordedAt: new Date().toISOString(),
          recordedBy: actor.id,
          generatedAt: metadata.generatedAt || "",
          sourceName: metadata.sourceName || "",
          sourceUrl: metadata.sourceUrl || "",
          startDate: metadata.startDate || "",
          endDate: metadata.endDate || "",
          cache: metadata.cache || {},
          outputs: metadata.outputs || {},
          dataSets: summarizePublicDataSets(storedDataSets),
        };
        db.publicDataCache.latest = { ...record, dataSets: storedDataSets };
        db.publicDataCache.refreshHistory.unshift(record);
        db.publicDataCache.refreshHistory = db.publicDataCache.refreshHistory.slice(0, 50);
        audit(db, actor, "Annual public data cache recorded", "Allowed", `${record.endDate || "unknown date"}: ${record.cache.incrementalTickers || 0} incremental ticker(s)`);
        return record;
      });
    },
    latestPublicDataCache(sessionId, options = {}) {
      const db = load();
      const actor = requireActiveSession(db, sessionId);
      if (!actorCan(actor, "publicDataRead")) {
        audit(db, actor, "Read public data cache", "Blocked", "Requires system administrator, decision committee, or execution team");
        save(db);
        const error = new Error("Permission denied: public data cache requires public data read access");
        error.statusCode = 403;
        throw error;
      }
      audit(db, actor, "Read public data cache", "Allowed");
      save(db);
      if (!db.publicDataCache.latest) return null;
      if (options.includeData) return db.publicDataCache.latest;
      return {
        ...db.publicDataCache.latest,
        dataSets: summarizePublicDataSets(db.publicDataCache.latest.dataSets),
      };
    },
    auditLog(sessionId) {
      return withActor(sessionId, "audit", "Read audit log", (db) => db.auditLog);
    },
  };
}
