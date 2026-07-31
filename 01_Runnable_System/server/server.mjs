import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createStore } from "./core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dbPath = process.env.IMT_DB_PATH || join(root, "server", "data", "db.sqlite");
const port = Number(process.env.PORT || 8787);
const store = createStore(dbPath);
const execFileAsync = promisify(execFile);

const contentTypes = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "application/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".csv": "text/csv;charset=utf-8",
  ".md": "text/markdown;charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const targetSourceUrls = {
  philadelphiaFedCpi: "https://www.philadelphiafed.org/surveys-and-data/cpi-spf",
  philadelphiaFedInflationForecasts: "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/inflation-forecasts",
  clevelandFedNowcasting: "https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting",
  blsCpiApi: "https://api.bls.gov/publicAPI/v2/timeseries/data/",
  blsCpiLatestInfo: "https://www.bls.gov/developers/api_signature_v2.htm",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json;charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function sessionIdFrom(request) {
  return request.headers["x-session-id"] || "";
}

async function runPublicDataEngine(sessionId) {
  const session = store.sessionInfo(sessionId);
  const allowedGroups = new Set(["System Administrator", "Decision Committee"]);
  if (!allowedGroups.has(session.user.group)) {
    const error = new Error("Only the system administrator or decision committee can run the annual public data engine");
    error.statusCode = 403;
    throw error;
  }

  const scriptPath = join(root, "scripts", "public_data_engine.mjs");
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: root,
    timeout: 120_000,
    maxBuffer: 2_000_000,
  });
  const manifestPath = join(root, "data", "public_data_engine_output", "public_data_engine_manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dataSetFiles = {
    historicalPrices: "auto_historical_prices.csv",
    tickerUniverse: "auto_ticker_universe.csv",
    marketStatistics: "auto_market_statistics.csv",
  };
  const dataSets = Object.fromEntries(Object.entries(dataSetFiles).map(([key, fileName]) => {
    const output = manifest.outputs?.[key] || {};
    return [key, {
      fileName,
      rows: output.rows || 0,
      rawText: readFileSync(join(root, "data", "public_data_engine_output", fileName), "utf8"),
    }];
  }));
  const cacheRecord = store.recordPublicDataCache(sessionId, { ...manifest, dataSets });

  return {
    generatedAt: manifest.generatedAt || new Date().toISOString(),
    stdout,
    stderr,
    cache: cacheRecord,
    outputs: {
      historicalPrices: "/data/public_data_engine_output/auto_historical_prices.csv",
      tickerUniverse: "/data/public_data_engine_output/auto_ticker_universe.csv",
      marketStatistics: "/data/public_data_engine_output/auto_market_statistics.csv",
      manifest: "/data/public_data_engine_output/public_data_engine_manifest.json",
    },
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "InvestmentManagementTool/0.3",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function htmlSourceFound(html) {
  return typeof html === "string" && html.length > 1000;
}

function normalizedIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return "";
  return raw;
}

function extractFirstUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s;,]+/i);
  return match ? match[0].replace(/[)\].,]+$/, "") : "";
}

function compactHtmlText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCpiRateFromHtml(html) {
  const text = compactHtmlText(html);
  if (!text) return null;
  const windows = [];
  for (const match of text.matchAll(/(?:CPI|consumer price|inflation|headline)[^.]{0,220}?(-?\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) {
    windows.push(Number.parseFloat(match[1]));
  }
  const rate = windows.find((value) => Number.isFinite(value) && value > -10 && value < 30);
  return Number.isFinite(rate) ? Number(rate.toFixed(2)) : null;
}

function numericCpiSource(name, rate, note, sourceDate, message, source = {}) {
  return {
    name,
    rate,
    sourceDate,
    enteredBy: "Backend public source lookup",
    sourceUrl: sourceDisplayUrl(source) || extractFirstUrl(note),
    note,
    status: "Included in calculation",
    selected: false,
    requiresManualRate: false,
    message,
  };
}

function manualCpiSource(name, note, sourceDate, message) {
  return {
    name,
    rate: null,
    sourceDate,
    enteredBy: "Backend public source lookup",
    sourceUrl: extractFirstUrl(note),
    note,
    status: "Excluded from calculation",
    selected: false,
    requiresManualRate: true,
    message,
  };
}

function sourceDisplayUrl(source) {
  return source.documentationUrl || source.url || extractFirstUrl(source.note);
}

function trustedSourceNote(source) {
  return source.url || source.note || "";
}

function monthNumber(period) {
  const value = Number.parseInt(String(period || "").replace("M", ""), 10);
  return Number.isFinite(value) ? value : 0;
}

async function fetchBlsCpiReference(sourceDate, source = {}) {
  const apiUrl = source.url || targetSourceUrls.blsCpiApi;
  const documentationUrl = source.documentationUrl || targetSourceUrls.blsCpiLatestInfo;
  const currentYear = Number.parseInt(String(sourceDate || "").slice(0, 4), 10) || new Date().getFullYear();
  const startYear = currentYear - 1;
  const response = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: ["CUSR0000SA0"],
      startyear: String(startYear),
      endyear: String(currentYear),
    }),
  });
  if (!response.ok) throw new Error(`BLS CPI API HTTP ${response.status}`);
  const payload = await response.json();
  const series = payload?.Results?.series?.[0]?.data || [];
  const monthly = series
    .filter((item) => /^M\d\d$/.test(item.period || "") && Number.isFinite(Number.parseFloat(item.value)))
    .map((item) => ({
      year: Number.parseInt(item.year, 10),
      month: monthNumber(item.period),
      value: Number.parseFloat(item.value),
      periodName: item.periodName,
    }))
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
  if (monthly.length < 13) throw new Error("BLS CPI API returned fewer than 13 monthly observations");
  const latest = monthly[monthly.length - 1];
  const prior = monthly.find((item) => item.year === latest.year - 1 && item.month === latest.month) || monthly[monthly.length - 13];
  if (!prior?.value) throw new Error("BLS CPI API did not include comparable prior-year CPI");
  const yoy = (latest.value / prior.value - 1) * 100;
  return {
    name: "BLS CPI-U latest 12-month change reference",
    rate: Number(yoy.toFixed(2)),
    sourceDate: `${latest.year}-${String(latest.month).padStart(2, "0")}`,
    enteredBy: "Backend public source lookup",
    sourceUrl: documentationUrl,
    note: `${apiUrl} ; official API documentation: ${documentationUrl}`,
    status: "Excluded from calculation",
    selected: false,
    requiresManualRate: false,
    message: "Historical CPI reference only, not a forward forecast. Include only if the Decision Committee explicitly accepts it.",
  };
}

async function runTargetSourceLookup(sessionId, options = {}) {
  const systemConfig = store.readSystemConfigForTargetSources(sessionId);

  const sourceDate = normalizedIsoDate(options.sourceDate) || new Date().toISOString().slice(0, 10);
  const errors = [];
  const sources = [];

  const configuredSources = (systemConfig.publicCpiSources || [])
    .filter((source) => source.active !== false)
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));

  for (const source of configuredSources) {
    if (source.kind === "historical-cpi-api") {
      try {
        sources.push(await fetchBlsCpiReference(sourceDate, source));
      } catch (error) {
        errors.push(`${source.name}: ${error.message}`);
        sources.push(manualCpiSource(
          source.name,
          `${trustedSourceNote(source)}${source.documentationUrl ? ` ; ${source.documentationUrl}` : ""}`,
          sourceDate,
          "Historical CPI reference could not be read automatically. Use this link only as historical context, not as a forecast unless committee approves.",
        ));
      }
      continue;
    }

    try {
      const response = await fetchWithTimeout(source.url);
      const html = await response.text();
      if (!response.ok || !htmlSourceFound(html)) throw new Error(`HTTP ${response.status}`);
      const extractedRate = extractCpiRateFromHtml(html);
      const record = Number.isFinite(extractedRate)
        ? numericCpiSource(
          source.name,
          extractedRate,
          trustedSourceNote(source),
          sourceDate,
          "Trusted public source reached and a CPI/inflation percentage was extracted automatically. Review the source link before approval.",
          source,
        )
        : manualCpiSource(
          source.name,
          trustedSourceNote(source),
          sourceDate,
          source.kind === "nowcast-page"
            ? "Trusted public source reached. If a machine-readable forecast is not returned, enter the latest nowcast manually and include it if committee accepts it."
            : "Trusted public source reached. Enter the latest CPI forecast from the appropriate official data file, then include it in calculation.",
        );
      record.sourceUrl = sourceDisplayUrl(source);
      record.priority = source.priority;
      record.institution = source.institution || "";
      sources.push(record);
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
      const record = manualCpiSource(
        source.name,
        trustedSourceNote(source),
        sourceDate,
        "Trusted public source could not be read automatically. Open the link and enter the forecast manually.",
      );
      record.sourceUrl = sourceDisplayUrl(source);
      record.priority = source.priority;
      record.institution = source.institution || "";
      sources.push(record);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceDate,
    status: errors.length ? "Manual review required" : "Sources reached",
    errors,
    sources,
    sourcePolicy: "System Administrator configured trusted-source priority list",
    outlookNote: `Public references checked by configured priority: ${configuredSources.map((source) => `${source.priority}. ${source.name} ${sourceDisplayUrl(source)}`).join("; ")}`,
  };
}

async function handleApi(request, response) {
  const body = await parseBody(request);
  const sessionId = sessionIdFrom(request);

  if (request.method === "POST" && request.url === "/api/login") {
    return sendJson(response, 200, store.login(body.userId, body.password || ""));
  }
  if (request.method === "GET" && request.url === "/api/session") {
    return sendJson(response, 200, store.sessionInfo(sessionId));
  }
  if (request.method === "POST" && request.url === "/api/demo/reset") {
    return sendJson(response, 200, store.resetDemoDatabase(sessionId, body.confirmation || ""));
  }
  if (request.method === "GET" && request.url === "/api/users") {
    return sendJson(response, 200, { users: store.listUsers(sessionId) });
  }
  if (request.method === "GET" && request.url === "/api/system-config") {
    return sendJson(response, 200, { systemConfig: store.readSystemConfig(sessionId) });
  }
  if (request.method === "PUT" && request.url === "/api/system-config") {
    return sendJson(response, 200, { systemConfig: store.updateSystemConfig(sessionId, body.systemConfig || body) });
  }
  if (request.method === "POST" && request.url === "/api/users") {
    return sendJson(response, 201, { user: store.createUser(sessionId, body) });
  }
  if (request.method === "PATCH" && request.url === "/api/users/profile") {
    return sendJson(response, 200, { user: store.updateUserProfile(sessionId, body) });
  }
  if (request.method === "POST" && request.url === "/api/targets") {
    return sendJson(response, 201, { targetPackage: store.createTargetPackage(sessionId, body) });
  }
  if (request.method === "GET" && request.url === "/api/targets/latest-approved") {
    return sendJson(response, 200, { targetPackage: store.latestApprovedTargetPackage(sessionId) });
  }
  if (request.method === "POST" && request.url === "/api/targets/approve") {
    return sendJson(response, 200, store.approveTargetPackage(sessionId, body.targetPackageId, body.decision, body.note));
  }
  if (request.method === "POST" && request.url === "/api/portfolios") {
    return sendJson(response, 201, { portfolio: store.submitPortfolio(sessionId, body) });
  }
  if (request.method === "GET" && request.url === "/api/portfolios/latest-approved") {
    return sendJson(response, 200, { portfolio: store.latestApprovedPortfolio(sessionId) });
  }
  if (request.method === "POST" && request.url === "/api/portfolios/approve") {
    return sendJson(response, 200, store.approvePortfolio(sessionId, body.portfolioId, body.decision, body.note));
  }
  if (request.method === "POST" && request.url === "/api/non-equity-nav") {
    return sendJson(response, 201, { navPackage: store.submitNonEquityNav(sessionId, body) });
  }
  if (request.method === "POST" && request.url === "/api/non-equity-nav/approve") {
    return sendJson(response, 200, { navPackage: store.approveNonEquityNav(sessionId, body.packageId, body.decision) });
  }
  if (request.method === "GET" && request.url === "/api/non-equity-nav/latest-approved") {
    return sendJson(response, 200, { navPackage: store.latestApprovedNonEquityNav(sessionId) });
  }
  if (request.method === "POST" && request.url === "/api/trade-authorizations") {
    return sendJson(response, 201, { tradeAuthorizationPackage: store.saveTradeAuthorizations(sessionId, body) });
  }
  if (request.method === "GET" && request.url === "/api/trade-authorizations/latest") {
    return sendJson(response, 200, { tradeAuthorizationPackage: store.latestTradeAuthorizations(sessionId) });
  }
  if (request.method === "POST" && request.url === "/api/report-distributions") {
    return sendJson(response, 201, { reportDistribution: store.submitReportDistribution(sessionId, body) });
  }
  if (request.method === "GET" && request.url?.startsWith("/api/report-distributions/latest")) {
    const url = new URL(request.url, `http://localhost:${port}`);
    return sendJson(response, 200, {
      reportDistribution: store.latestReportDistribution(sessionId, {
        portfolioId: url.searchParams.get("portfolioId") || "",
      }),
    });
  }
  if (request.method === "POST" && request.url === "/api/imports") {
    return sendJson(response, 201, {
      importRecord: store.importData(sessionId, body.type, body.fileName, body.text),
    });
  }
  if (request.method === "GET" && request.url?.startsWith("/api/imports/latest")) {
    const url = new URL(request.url, `http://localhost:${port}`);
    const types = String(url.searchParams.get("types") || "").split(",").map((item) => item.trim()).filter(Boolean);
    return sendJson(response, 200, { imports: store.latestImportRecords(sessionId, types) });
  }
  if (request.method === "POST" && request.url === "/api/public-data/run") {
    return sendJson(response, 200, { publicDataEngine: await runPublicDataEngine(sessionId) });
  }
  if (request.method === "GET" && request.url?.startsWith("/api/public-data/cache")) {
    const url = new URL(request.url, `http://localhost:${port}`);
    return sendJson(response, 200, { publicDataCache: store.latestPublicDataCache(sessionId, { includeData: url.searchParams.get("includeData") === "1" }) });
  }
  if (request.method === "POST" && request.url === "/api/public-data/target-sources") {
    return sendJson(response, 200, { targetSources: await runTargetSourceLookup(sessionId, body) });
  }
  if (request.method === "GET" && request.url === "/api/audit-log") {
    return sendJson(response, 200, { auditLog: store.auditLog(sessionId) });
  }

  return sendJson(response, 404, { error: "API route not found" });
}

function serveStatic(request, response) {
  const urlPath = request.url?.split("?")[0] || "/";
  const rawPath = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = normalize(decodeURIComponent(rawPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain;charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}

export function createInvestmentManagementServer() {
  return createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/api/")) {
        await handleApi(request, response);
        return;
      }
      serveStatic(request, response);
    } catch (error) {
      sendJson(response, error.statusCode || 500, { error: error.message || "Server error" });
    }
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = createInvestmentManagementServer();
  server.listen(port, () => {
    console.log(`Puyan Capital Control Center server running at http://localhost:${port}`);
    console.log(`Database file: ${dbPath}`);
  });
}
