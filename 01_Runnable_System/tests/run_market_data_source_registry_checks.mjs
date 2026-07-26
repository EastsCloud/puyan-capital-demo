import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
const registryPath = join(root, "config", "market_data_sources.json");
const manifestPath = join(root, "data", "public_data_engine_output", "public_data_engine_manifest.json");
mkdirSync(outDir, { recursive: true });

const checks = [];

function record(status, check, detail) {
  checks.push({ status, check, detail });
  if (status === "FAIL") throw new Error(`${check}: ${detail}`);
}

function readJson(path) {
  if (!existsSync(path)) record("FAIL", `File exists: ${path}`, "missing file");
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeReport() {
  const lines = [
    "# Market Data Source Registry Check Result",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Status | Check | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.status} | ${item.check} | ${String(item.detail).replaceAll("|", "\\|")} |`),
  ];
  const reportPath = join(outDir, "market_data_source_registry_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

try {
  const registry = readJson(registryPath);
  const manifest = readJson(manifestPath);
  const sources = registry.sources || [];
  const byId = new Map(sources.map((source) => [source.id, source]));

  record(registry.version ? "PASS" : "FAIL", "Registry has version", registry.version || "missing");
  record(Array.isArray(sources) && sources.length >= 5 ? "PASS" : "FAIL", "Registry lists public, fallback, and planned vendor sources", `${sources.length} source(s)`);
  record(byId.has("eodhd-eod-adjusted-close") ? "PASS" : "FAIL", "EODHD personal test source is registered", "eodhd-eod-adjusted-close");
  record(byId.has("yahoo-chart-adjusted-close") ? "PASS" : "FAIL", "Public price source is registered", "yahoo-chart-adjusted-close");
  record(byId.has("administrator-manual-market-data") ? "PASS" : "FAIL", "Manual fallback source is registered", "administrator-manual-market-data");
  record(byId.has("future-institutional-market-data-vendor") ? "PASS" : "FAIL", "Future paid vendor interface is registered", "future-institutional-market-data-vendor");

  const ids = new Set();
  sources.forEach((source) => {
    record(source.id && !ids.has(source.id) ? "PASS" : "FAIL", `Unique source id: ${source.id || "missing"}`, source.id || "missing");
    ids.add(source.id);
    record(Number.isFinite(Number(source.priority)) ? "PASS" : "FAIL", `Priority configured: ${source.id}`, String(source.priority));
    record(Array.isArray(source.usedFor) && source.usedFor.length > 0 ? "PASS" : "FAIL", `Usage configured: ${source.id}`, `${source.usedFor?.length || 0} use(s)`);
    record(source.refreshCadence ? "PASS" : "FAIL", `Refresh cadence configured: ${source.id}`, source.refreshCadence || "missing");
    record(source.manualFallback ? "PASS" : "FAIL", `Fallback configured: ${source.id}`, source.manualFallback || "missing");
    record(source.configuredIn ? "PASS" : "FAIL", `Owning file configured: ${source.id}`, source.configuredIn || "missing");
  });

  const activeProviderId = manifest.provider?.active === "eodhd"
    ? "eodhd-eod-adjusted-close"
    : "yahoo-chart-adjusted-close";
  const activeProvider = byId.get(activeProviderId);
  record(manifest.sourceName?.includes(activeProvider.name) ? "PASS" : "FAIL", "Manifest source name matches active registry provider", `${manifest.sourceName} / ${activeProvider.name}`);
  record(String(manifest.sourceUrl || "").startsWith(activeProvider.endpoint) ? "PASS" : "FAIL", "Manifest source URL matches active registry endpoint", manifest.sourceUrl || "missing");
  record(registry.defaultRefreshPolicy?.annualReferencePackage?.includes("once") ? "PASS" : "FAIL", "Annual reference package policy is explicit", registry.defaultRefreshPolicy?.annualReferencePackage || "missing");
  record(registry.defaultRefreshPolicy?.monthlyRebalanceCheck?.includes("monthly") ? "PASS" : "FAIL", "Monthly rebalance check policy is explicit", registry.defaultRefreshPolicy?.monthlyRebalanceCheck || "missing");

  const reportPath = writeReport();
  console.log(`Market data source registry checks passed: ${checks.length} checks`);
  console.log(`Result file: ${reportPath}`);
} catch (error) {
  try {
    writeReport();
  } catch {
    // Keep original error visible.
  }
  console.error("Market data source registry checks failed");
  console.error(error.message);
  process.exitCode = 1;
}
