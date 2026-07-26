import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const nodeBin = process.execPath;
const checks = [];

function add(status, name, detail = "", recommendation = "") {
  checks.push({ status, name, detail, recommendation });
}

function runScript(name, script, expectedText) {
  try {
    const output = execFileSync(nodeBin, [join(root, script)], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ok = expectedText ? output.includes(expectedText) : true;
    add(ok ? "PASS" : "WARN", name, output.trim().split(/\r?\n/).join(" / "), ok ? "" : `Review ${script} output.`);
  } catch (error) {
    add("FAIL", name, [error.stdout, error.stderr, error.message].filter(Boolean).join("\n").trim(), `Run ${script} directly for details.`);
  }
}

function checkFile(path, label) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    add("FAIL", label, `${path} missing`, "Restore the file from project source.");
    return;
  }
  const size = readFileSync(fullPath).length;
  add(size > 0 ? "PASS" : "FAIL", label, `${path}, ${size} bytes`, size > 0 ? "" : "File is empty.");
}

function checkSyntax(path) {
  try {
    execFileSync(nodeBin, ["--check", join(root, path)], { cwd: root, stdio: "pipe" });
    add("PASS", `Syntax check: ${path}`, "JavaScript syntax accepted");
  } catch (error) {
    add("FAIL", `Syntax check: ${path}`, error.stderr?.toString() || error.message, "Fix syntax error before running the system.");
  }
}

async function checkBackendHttp() {
  const hasFetch = typeof fetch === "function";
  if (!hasFetch) {
    add("WARN", "Backend HTTP check", "fetch is not available in this Node runtime", "Use browser or curl to check http://localhost:8787.");
    return;
  }
  try {
    const response = await fetch("http://localhost:8787/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "admin-1" }),
    });
    const json = await response.json();
    if (response.ok && json.session?.id) {
      add("PASS", "Backend HTTP check", `Backend is running. Logged in as ${json.user?.name || "admin-1"}.`);
    } else {
      add("FAIL", "Backend HTTP check", JSON.stringify(json), "Start the backend with npm start or the bundled node command.");
    }
  } catch (error) {
    const message = error?.cause?.message || error.message || "";
    const blocked = /not permitted|denied|fetch failed/i.test(message);
    add(
      "WARN",
      "Backend HTTP check",
      blocked
        ? "This environment could not call http://localhost:8787 directly, even though the browser may still open it."
        : "Backend does not appear to be responding at http://localhost:8787.",
      blocked
        ? "If the browser opens http://localhost:8787, treat this as an environment warning rather than a system failure."
        : "Start the backend before browser testing."
    );
  }
}

function checkPortHint() {
  const result = spawnSync("lsof", ["-i", ":8787"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.includes("LISTEN")) {
    add("PASS", "Local port 8787", "A process is listening on port 8787.");
  } else {
    add("WARN", "Local port 8787", "No listener detected on port 8787.", "Start the backend before opening http://localhost:8787.");
  }
}

function writeReports() {
  const pass = checks.filter((check) => check.status === "PASS").length;
  const warn = checks.filter((check) => check.status === "WARN").length;
  const fail = checks.filter((check) => check.status === "FAIL").length;
  const overall = fail ? "FAIL" : (warn ? "WARN" : "PASS");

  const lines = [];
  lines.push("# System Self Check Report");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Project path: ${root}`);
  lines.push("");
  lines.push(`Overall status: ${overall}`);
  lines.push("");
  lines.push(`Summary: ${pass} passed, ${warn} warning(s), ${fail} failed.`);
  lines.push("");
  lines.push("| Status | Check | Detail | Recommendation |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of checks) {
    lines.push(`| ${check.status} | ${check.name} | ${String(check.detail).replaceAll("|", "\\|").replace(/\s+/g, " ")} | ${String(check.recommendation || "").replaceAll("|", "\\|")} |`);
  }

  lines.push("");
  lines.push("## How to Interpret");
  lines.push("");
  lines.push("- PASS means the current local prototype check succeeded.");
  lines.push("- WARN means the system files are likely usable, but something optional or environment-related needs attention.");
  lines.push("- FAIL means the system should not be treated as runnable until the item is fixed.");
  lines.push("");
  lines.push("## Current Scope");
  lines.push("");
  lines.push("This self-check verifies local prototype health, backend foundation, workflow simulation, static UI wiring, and optional local backend availability.");
  lines.push("It does not certify production readiness, cybersecurity, broker integration, or live market data integration.");

  const mdPath = join(outDir, "SELF_CHECK_REPORT.md");
  const jsonPath = join(outDir, "SELF_CHECK_REPORT.json");
  writeFileSync(mdPath, `${lines.join("\n")}\n`);
  writeFileSync(jsonPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), root, overall, summary: { pass, warn, fail }, checks }, null, 2)}\n`);
  return { mdPath, jsonPath, overall, pass, warn, fail };
}

checkFile("index.html", "Main HTML exists");
checkFile("app.js", "Main app script exists");
checkFile("styles.css", "Main stylesheet exists");
checkFile("server/core.mjs", "Backend core exists");
checkFile("server/server.mjs", "Backend server exists");
checkFile("data/sample_prices_web_recent.csv", "Sample price data exists");
checkFile("data/standard_actual_holdings.csv", "Standard holdings template exists");
checkFile("docs/System_Run_Verification_Report.md", "Verification report exists");

checkSyntax("app.js");
checkSyntax("server/core.mjs");
checkSyntax("server/server.mjs");
checkSyntax("simulation/run_full_workflow_simulation.mjs");

runScript("Workflow acceptance suite", "tests/run_acceptance_tests.mjs", "Acceptance tests passed");
runScript("Static UI wiring suite", "tests/run_static_ui_checks.mjs", "Static UI checks passed");
runScript("Backend foundation suite", "tests/run_backend_checks.mjs", "Backend checks passed");
runScript("End-to-end workflow suite", "tests/run_e2e_workflow_checks.mjs", "E2E workflow checks passed");
runScript("Combined test suite", "tests/run_all_tests.mjs", "All test suites passed");

checkPortHint();
await checkBackendHttp();

const report = writeReports();
console.log(`Self-check overall status: ${report.overall}`);
console.log(`Summary: ${report.pass} passed, ${report.warn} warning(s), ${report.fail} failed.`);
console.log(`Report: ${report.mdPath}`);
console.log(`JSON: ${report.jsonPath}`);

if (report.fail) process.exitCode = 1;
