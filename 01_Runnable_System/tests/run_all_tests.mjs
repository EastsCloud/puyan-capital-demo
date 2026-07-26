import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const suites = [
  { name: "Workflow acceptance test", script: "tests/run_acceptance_tests.mjs" },
  { name: "Static UI wiring check", script: "tests/run_static_ui_checks.mjs" },
  { name: "Backend foundation check", script: "tests/run_backend_checks.mjs" },
  { name: "End-to-end workflow check", script: "tests/run_e2e_workflow_checks.mjs" },
  { name: "Ticker replacement plan data check", script: "tests/run_replacement_plan_checks.mjs" },
  { name: "Public data engine and cache check", script: "tests/run_public_data_engine_checks.mjs" },
  { name: "Market data source registry check", script: "tests/run_market_data_source_registry_checks.mjs" },
  { name: "SQLite live store check", script: "tests/run_sqlite_live_store_checks.mjs" },
  { name: "SQLite snapshot export check", script: "tests/run_sqlite_snapshot_checks.mjs" },
  { name: "Replay date regression check", script: "tests/run_replay_date_regression_checks.mjs" },
  { name: "Historical replay evidence audit", script: "tests/run_historical_replay_evidence_audit.mjs" },
];

const results = [];

for (const suite of suites) {
  try {
    const output = execFileSync(process.execPath, [join(root, suite.script)], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    results.push({ status: "PASS", name: suite.name, detail: output.trim().split(/\r?\n/).join(" / ") });
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim();
    results.push({ status: "FAIL", name: suite.name, detail });
  }
}

const lines = [];
lines.push("# Test Suite Result");
lines.push("");
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push("| Status | Suite | Detail |");
lines.push("| --- | --- | --- |");
for (const result of results) {
  lines.push(`| ${result.status} | ${result.name} | ${String(result.detail).replaceAll("|", "\\|").replace(/\s+/g, " ")} |`);
}

const reportPath = join(outDir, "test_suite_result.md");
writeFileSync(reportPath, `${lines.join("\n")}\n`);

const failed = results.filter((result) => result.status === "FAIL");
if (failed.length) {
  console.error(`Test suite failed: ${failed.length} suite(s) failed`);
  console.error(`Result file: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(`All test suites passed: ${results.length} suites`);
  console.log(`Result file: ${reportPath}`);
}
