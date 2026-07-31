import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "tests", "output");
mkdirSync(outDir, { recursive: true });

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const results = [];

function record(status, name, detail) {
  results.push({ status, name, detail });
}

function pass(name, detail = "") {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function assert(condition, name, detail) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function allMatches(text, regex) {
  return Array.from(text.matchAll(regex));
}

function unique(values) {
  return Array.from(new Set(values));
}

function writeReport() {
  const lines = [];
  lines.push("# Static UI Check Result");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| Status | Check | Detail |");
  lines.push("| --- | --- | --- |");
  for (const result of results) {
    lines.push(`| ${result.status} | ${result.name} | ${String(result.detail).replaceAll("|", "\\|")} |`);
  }
  const reportPath = join(outDir, "static_ui_check_result.md");
  writeFileSync(reportPath, `${lines.join("\n")}\n`);
  return reportPath;
}

function checkIds() {
  const htmlIds = allMatches(indexHtml, /\bid="([^"]+)"/g).map((match) => match[1]);
  const duplicateIds = unique(htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index));
  assert(duplicateIds.length === 0, "HTML ids are unique", duplicateIds.length ? duplicateIds.join(", ") : "no duplicates");

  const idSet = new Set(htmlIds);
  const codeIds = unique(allMatches(appJs, /\bel\("([^"]+)"\)/g).map((match) => match[1]));
  const missingIds = codeIds.filter((id) => !idSet.has(id));
  assert(missingIds.length === 0, "All app.js el(\"id\") references exist in index.html", missingIds.length ? missingIds.join(", ") : `${codeIds.length} references checked`);
}

function checkCoreUiSections() {
  const requiredSectionGroups = [
    ["Annual Target Return"],
    ["Target Beta", "Beta Engine"],
    ["Portfolio Construction", "Proposed Portfolio"],
    ["User Administration"],
    ["Approval", "Decision Committee Approval"],
    ["Actual Holdings", "Load Actual Execution Data"],
    ["Trade", "Trade Authorization", "Execution Log"],
    ["Report", "Performance & Risk Report"],
    ["Optimizer", "Optimization"],
  ];

  for (const labels of requiredSectionGroups) {
    const found = labels.some((text) => indexHtml.includes(text));
    assert(found, `Core UI section exists: ${labels[0]}`, found ? `matched one of: ${labels.join(" / ")}` : "section text missing");
  }
}

function checkWorkflowControls() {
  const requiredIds = [
    "costRate",
    "cpiMethod",
    "findPublicSourcesButton",
    "publicSourceStatus",
    "manualCpiSourceName",
    "manualCpiSourceRate",
    "manualCpiSourceDate",
    "manualCpiSourceNote",
    "addManualCpiSourceButton",
    "manualCpiSourceStatus",
    "cpiValidation",
    "approveTargetReturnButton",
    "rejectTargetReturnButton",
    "selectedOutlookRate",
    "riskFreeRateSource",
    "marketBenchmark",
    "drawdownRatioLow",
    "drawdownRatioHigh",
    "configRiskFreeUs",
    "configRiskFreeDeveloped",
    "configRiskFreeHongKong",
    "configRiskFreeChinaA",
    "addHoldingButton",
    "investmentStyle",
    "addUserButton",
    "permissionVisibilityGrid",
    "proposalStatus",
    "newVersionButton",
    "priceCsvInput",
    "backtestLookback",
    "backtestFrequency",
    "backtestWindowStatus",
    "backtestTargetReturn",
    "usEquityRiskFreeDisplay",
    "developedEquityRiskFreeDisplay",
    "emergingEquityRiskFreeDisplay",
    "loadSamplePricesButton",
    "tickerUniverseInput",
    "loadSampleTickerUniverseButton",
    "actualHoldingsInput",
    "loadSampleHoldingsButton",
    "overviewEquityValueLatest",
    "overviewEquityValueStatus",
    "overviewEquityValueSparkline",
    "monitoringEquityValueLatest",
    "monitoringEquityValueChart",
    "monitoringEquityValueStatus",
	    "actualTradesInput",
	    "loadSampleTradesButton",
	    "tradeHoldingCompletionSummary",
	    "tradeHoldingCompletionRows",
	    "cashFlowInput",
    "loadSampleCashFlowsButton",
    "rebalanceLowerDrift",
    "rebalanceUpperDrift",
	    "rebalanceCompletionDays",
	    "configExecutionQuantityTolerance",
	    "configExecutionValueTolerance",
	    "configExecutionWeightTolerance",
    "rebalanceActionStatus",
    "rebalanceCheckFrequency",
    "rebalanceOwner",
    "rebalanceLastCheckDate",
    "rebalanceNextCheckDate",
    "rebalanceEscalationRecipients",
    "rebalanceScheduleStatus",
    "rebalanceActionRows",
    "rebalanceFollowUpStatus",
    "rebalanceFollowUpOwner",
    "rebalanceFollowUpNote",
    "addRebalanceFollowUpButton",
    "rebalanceFollowUpRows",
    "addTradeOrderButton",
    "reportPeriod",
    "reportHeaderPeriod",
    "reportHeaderAsOf",
    "reportHeaderCurrency",
    "reportHeaderStatus",
    "reportBenchmarkReturn",
    "reportActiveReturn",
    "reportVisibleMaxDrawdown",
    "reportReturnMethod",
    "reportValuationBasis",
    "reportBenchmarkBasis",
    "reportAttributionMethod",
    "reportDataQualityStatement",
    "reportEquityValueLatest",
    "reportEquityValueChart",
    "reportEquityValueStatus",
    "attributionPrimaryDriver",
    "attributionVerdict",
    "attributionBenchmarkReturn",
    "committeeTimingContribution",
    "committeeAttributionShare",
    "managerSelectionContribution",
    "executionAttributionShare",
    "betaImplementationContribution",
    "attributionRows",
    "equitySleeveReadinessRows",
    "equitySleeveReadinessStatus",
    "exportReportButton",
    "exportCommitteePackButton",
    "exportAuditLogButton",
    "optimizeWeightsButton",
    "submitOptimizationOptionButton",
    "optimizerSelectionStatus",
    "optimizerAdvice",
    "tickerReplacementPlan",
    "tickerReplacementStatus",
    "tickerReplacementAdvice",
    "acceptTickerReplacementPlanButton",
    "rebalanceOpenAlerts",
    "rebalanceDeadlineStatus",
    "rebalanceEscalationStatus",
    "rebalanceExceptionStatus",
    "annualReviewReadiness",
    "annualReviewCommitteeConclusion",
    "annualReviewExecutionConclusion",
    "annualReviewNextAction",
    "backendUserId",
    "backendLoginButton",
    "backendPullAuditButton",
    "backendStatus",
    "backendSubmitTargetButton",
    "backendApproveTargetDecisionButton",
    "backendSubmitPortfolioButton",
    "backendApprovePortfolioDecisionButton",
    "backendTargetRecordStatus",
    "backendTargetApprovalStatus",
    "backendPortfolioRecordStatus",
    "backendPortfolioApprovalStatus",
    "backendWorkflowStatus",
    "systemLoginScreen",
    "openSystemAdminLoginButton",
    "openSystemDecisionLoginButton",
    "openSystemExecutionLoginButton",
    "demoResetDatabaseButton",
    "globalLoadingOverlay",
    "globalLoadingMessage",
    "decisionLoginForm",
    "executionLoginForm",
    "workflowNav",
    "workflowStatusOverview",
    "workflowOverallStatus",
    "workflowStageCurrent",
    "workflowStageNextControl",
    "currentWorkflowOwnerHint",
    "previousWorkflowButton",
    "nextWorkflowButton",
    "step-user-management",
    "nextTargetReturnButton",
    "stageDraftStatus",
    "stageSubmittedStatus",
    "stageApprovedStatus",
    "stageImplementedStatus",
    "stageMonitoringStatus",
    "stageReviewStatus",
    "runSampleDemoButton",
    "sampleDemoStatus",
    "overviewTargetStatus",
    "overviewBetaStatus",
    "overviewBacktestStatus",
    "overviewBackendStatus",
    "overviewImportsStatus",
    "overviewReportStatus",
    "importStatusStrip",
    "overviewPriceImportStatus",
    "overviewTickerImportStatus",
    "overviewProposedPortfolioStatus",
    "overviewHoldingsImportStatus",
    "overviewTradesImportStatus",
    "overviewCashFlowImportStatus",
    "dataLoadRegistryStatus",
    "dataLoadRegistryRows",
    "dataLoadErrorStatus",
    "dataLoadErrorRows",
    "benchmarkControlMapRows",
    "benchmarkControlMapStatus",
    "step-user-management",
    "step-target",
    "step-beta",
    "systemAdminConfigPanel",
    "parameterMaintenanceRows",
    "parameterMaintenanceVersion",
    "parameterMaintenanceTimestamp",
    "systemDefaultConfigNotice",
    "activateSystemConfigButton",
    "step-portfolio",
    "step-optimize",
    "step-approval",
    "step-monitoring",
    "step-execution",
    "step-report",
  ];

  for (const id of requiredIds) {
    assert(indexHtml.includes(`id="${id}"`), `Required workflow control exists: ${id}`, "control found");
  }
}

function checkExternalDataInputs() {
  const inputTags = allMatches(indexHtml, /<input\b[^>]*>/g).map((match) => match[0]);
  const fileInputs = unique(inputTags
    .filter((tag) => /\btype="file"/.test(tag))
    .map((tag) => tag.match(/\bid="([^"]+)"/)?.[1])
    .filter(Boolean));
  const expected = ["priceCsvInput", "tickerUniverseInput", "actualHoldingsInput", "actualTradesInput", "cashFlowInput"];
  for (const id of expected) {
    assert(fileInputs.includes(id), `External data file input exists: ${id}`, "file input found");
    assert(appJs.includes(`el("${id}").addEventListener("change"`), `External data file input is wired: ${id}`, "change listener found");
  }
}

function checkRoleAndApprovalLogic() {
  const requiredCodeSignals = [
    ["actorCan(permission)", "role-based permission function"],
    ["requirePermission(", "permission guard"],
    ["Permission denied", "permission denial audit signal"],
    ["skipForExecutionFlow", "execution team workflow skips decision-owned target step"],
    ["profileNextWorkflowPage", "role-aware first workflow step after account page"],
    ["annualData", "decision-owned annual public-data permission"],
    ["publicDataRead", "approved public-data cache read permission"],
    ["step-public-data\", label: \"Annual Public Data\", owner: \"Decision Committee\"", "annual public data step owned by decision committee"],
    ["currentWorkflowOwnerHint", "current step owner reminder"],
    ["invalidCommitteeApprovers", "committee approver validation"],
    ["Approve", "approval status handling"],
    ["Permission denied", "blocked action status"],
  ];

  for (const [signal, label] of requiredCodeSignals) {
    assert(appJs.includes(signal), `Role and approval logic includes ${label}`, signal);
  }
}

function checkRiskAndOptimizationLogic() {
  const requiredCodeSignals = [
    ["validateCapmInputs", "CAPM validation"],
    ["impliedBeta", "target beta calculation"],
    ["updateTargetDrawdown", "target max drawdown calculation"],
    ["betaFromPairs", "historical beta calculation"],
    ["maxDrawdownFromReturns", "historical max drawdown calculation"],
    ["optimizeWeights", "optimization action"],
    ["lockedWeight", "locked holding support"],
    ["equitySleeveBacktestResults", "three-sleeve historical beta calculation"],
    ["backtestControlStatus", "sleeve-by-sleeve return, beta, and drawdown pass controls"],
    ["optimizationProfiles", "three optimization option profiles"],
    ["selectOptimizationOption", "execution selection of an optimization option"],
    ["buildSleeveDrivenOptimizationOption", "independent sleeve optimization"],
    ["findSleeveOptimization", "per-sleeve ticker replacement search"],
    ["acceptTickerReplacementPlan", "execution acceptance of ticker replacement plan"],
    ["tickerHasSufficientHistory", "replacement candidate historical-price check"],
    ["betaWithinTargetTolerance", "relative sleeve beta tolerance"],
    ["returnControlStatus", "three-state return control status"],
    ["returnExcessReviewTolerance", "administrator return excess review threshold"],
    ["targetShortfallGap", "target return is a floor with positive shortfall allocation only"],
    ["expectedBuffer", "over-target baseline creates expected buffer instead of negative equity gap"],
    ["sleeveRiskFreeRate", "market/currency risk-free rate by sleeve"],
    ["singleSecurityMaxSleeveShare", "single-security limit is per sleeve"],
    ["singleSecurityMaxPortfolioWeight", "single-security sleeve limit is converted into portfolio weight for checks"],
    ["feasibleCount", "hard-control pass gate before ticker replacement"],
    ["drawdownControlStatus", "drawdown alert status"],
    ["renderEquitySleeveReadiness", "multi-sleeve beta readiness"],
    ["loadLatestPublicDataCache", "backend cached public data auto-load"],
    ["Annual public data status", "annual public-data status wording"],
    ["approved annual public-data statistics", "approved annual public-data source wording"],
    ["captureAnnualDecisionSnapshot", "annual decision snapshot capture"],
    ["applyAnnualDecisionSnapshotToInputs", "annual decision snapshot restore"],
    ["approvedSleeveSnapshot", "approved sleeve snapshot data source"],
    ["annualDecisionSnapshot", "approved target package carries full annual decision snapshot"],
    ["styleTickerRange", "administrator style ticker min/max range"],
    ["validateStyleConstraints", "per-sleeve style ticker count validation"],
    ["equityStyleTickerKeys.every", "all style buckets checked for ticker range"],
    ["authorizedTradesToStandardCsv", "authorized trade fill CSV generation"],
    ["approvedPortfolioToNextHoldingCsv", "next-day holding snapshot generation"],
    ["loadAuthorizedTradeTestFill", "execution fill bridge for formal test"],
  ];

  for (const [signal, label] of requiredCodeSignals) {
    assert(appJs.includes(signal), `Risk and optimization logic includes ${label}`, signal);
  }

  const acceptStart = appJs.indexOf("function acceptTickerReplacementPlan()");
  const acceptEnd = appJs.indexOf("function renderOptimizationOptions()", acceptStart);
  const acceptBody = acceptStart >= 0 && acceptEnd > acceptStart ? appJs.slice(acceptStart, acceptEnd) : "";
  assert(!acceptBody.includes("tickerReplacementPlan = null"), "Accepted ticker replacement remains available for submission", "accepted plan is retained until committee submission");
  assert(appJs.includes("const replacementAccepted = Boolean(tickerReplacementPlan?.feasible && tickerReplacementPlan.accepted);"), "Ticker replacement submission gate checks accepted plan", "submit action recognizes accepted replacement plan");
  const baselineStart = appJs.indexOf("function recommendedBaselineReturn");
  const baselineEnd = appJs.indexOf("function equityTargetReturnReference", baselineStart);
  const baselineBody = baselineStart >= 0 && baselineEnd > baselineStart ? appJs.slice(baselineStart, baselineEnd) : "";
  assert(baselineBody.includes("equityTargetReturnReference"), "Baseline return uses same reference return as target contribution", "equityTargetReturnReference");
  const allocationApplyStart = appJs.indexOf("function applyAllocationRecommendation");
  const allocationApplyEnd = appJs.indexOf("function updateUsEquityTargetReturn", allocationApplyStart);
  const allocationApplyBody = allocationApplyStart >= 0 && allocationApplyEnd > allocationApplyStart ? appJs.slice(allocationApplyStart, allocationApplyEnd) : "";
  assert(allocationApplyBody.includes("resetTargetApproval"), "Accepting annual data invalidates any old target approval", "resetTargetApproval");
  assert(indexHtml.includes("configStyleTickerMin"), "Admin configuration includes style ticker minimum", "configStyleTickerMin");
  assert(indexHtml.includes("configStyleTickerMax"), "Admin configuration includes style ticker maximum", "configStyleTickerMax");
  assert(indexHtml.includes("configReturnExcessReviewTolerance"), "Admin configuration includes return excess review threshold", "configReturnExcessReviewTolerance");
  assert(indexHtml.includes("configRiskFreeUs"), "Admin configuration includes U.S. risk-free rate", "configRiskFreeUs");
  assert(indexHtml.includes("configRiskFreeDeveloped"), "Admin configuration includes Japan risk-free rate", "configRiskFreeDeveloped");
  assert(indexHtml.includes("configRiskFreeHongKong"), "Admin configuration includes Hong Kong risk-free rate", "configRiskFreeHongKong");
  assert(indexHtml.includes("configRiskFreeChinaA"), "Admin configuration includes China A risk-free rate", "configRiskFreeChinaA");
  assert(indexHtml.includes('id="maxSingleSecurityWeight" type="number" min="0" max="100" step="1" value="35"'), "Portfolio constraint default uses 35% of sleeve", "maxSingleSecurityWeight value=35");
  assert(indexHtml.includes("styleTickerRangePreview"), "Portfolio UI displays active style ticker range", "styleTickerRangePreview");
  assert(appJs.includes("tickers per style bucket, per sleeve"), "Portfolio UI names per-sleeve style ticker rule", "2-5 rule label");
  assert(appJs.includes("excess-review band"), "Backtest and optimizer distinguish high-return review from hard failure", "excess-review band");
  assert(appJs.includes("positive shortfall gap"), "Allocation logic labels positive shortfall gap", "target return floor wording");
  assert(appJs.includes("Non-U.S. sleeves use their own market/currency risk-free rates"), "CAPM result explains sleeve-specific risk-free rates", "market/currency risk-free rate wording");
  const legacyUsOnlyBetaPassName = "currentUsEquity" + "BetaPass";
  assert(!appJs.includes(legacyUsOnlyBetaPassName), "Legacy U.S.-only beta pass variable removed", "sleeve controls drive approval");
  assert(appJs.includes("Ticker replacements, when needed, are included directly in the three sleeve optimization options."), "Optimizer embeds ticker replacements in sleeve solutions", "sleeve solution wording");
  assert(appJs.includes("hardPass: sleeveControlPass"), "Portfolio-level monitoring does not override sleeve approval", "sleeve approval gate");
  assert(appJs.includes("preserveSubmittedPortfolio"), "Role switching preserves the submitted portfolio under committee review", "submitted portfolio is not replaced by an older approved version");
  assert(indexHtml.includes("Load Authorized Trade Fills"), "Execution page exposes production trade-fill action", "Load Authorized Trade Fills");
  assert(appJs.includes('el("loadSampleTradesButton").addEventListener("click", loadAuthorizedTradeTestFill);'), "Execution fill action no longer loads a stale static sample trade file", "loadAuthorizedTradeTestFill binding");
  assert(!appJs.includes('line.split(",")') && !appJs.includes('lines[0].split(",")'), "Standard CSV parsing supports quoted comma fields", "splitCsvLine is used for CSV rows");
  assert(indexHtml.includes("formalReportReadinessStatus"), "Report page exposes formal issue readiness status", "formalReportReadinessStatus");
  assert(appJs.includes("reportFormalReadiness"), "Report exports are gated by formal readiness", "reportFormalReadiness");
  assert(appJs.includes("Detailed report metrics are hidden until the formal report is ready"), "Blocked formal report hides detailed metrics until approval", "blocked report detail wording");
  assert(indexHtml.includes("Investment Committee Performance Report"), "Report has a formal investment committee masthead", "Investment Committee Performance Report");
  assert(indexHtml.includes("Reporting Basis & Disclosures"), "Report presents methodology and disclosure information", "Reporting Basis & Disclosures");
  assert(indexHtml.includes("not a formally approved Brinson"), "Report clearly labels attribution methodology limitations", "attribution limitation");
  assert(appJs.includes("NAV-based period return") && appJs.includes("Modified Dietz return"), "Report identifies the active return calculation method", "return method disclosure");
  assert(appJs.includes("market-data estimates do not replace broker"), "Report export includes formal data-source disclosure", "data-source disclosure");
  assert(appJs.includes("loaded latest backend cache instead"), "Public data engine falls back to backend cache on live refresh failure", "backend cache fallback");
}

function checkFrontendBackendWiring() {
  const requiredCodeSignals = [
    ["backendRequest", "backend API wrapper"],
    ["/api/login", "backend login endpoint"],
    ["/api/targets", "target package sync endpoint"],
    ["/api/portfolios", "portfolio sync endpoint"],
    ["/api/portfolios/latest-approved", "latest approved portfolio reload endpoint"],
    ["/api/imports", "data load sync endpoint"],
    ["/api/imports/latest", "latest runtime import reload endpoint"],
    ["/api/non-equity-nav", "non-equity NAV approval endpoint"],
    ["/api/trade-authorizations", "trade authorization persistence endpoint"],
    ["/api/users/profile", "user profile sync endpoint"],
    ["/api/audit-log", "backend audit pull endpoint"],
    ["syncTargetPackageToBackend", "target package sync function"],
    ["syncPortfolioToBackend", "portfolio sync function"],
    ["submitCurrentPortfolioToBackendForApproval", "execution portfolio backend submission function"],
    ["syncPortfolioApprovalToBackend", "decision committee portfolio backend approval function"],
    ["loadLatestApprovedPortfolioFromBackend", "approved portfolio reload function"],
    ["applyApprovedPortfolioPackage", "approved portfolio state hydration"],
    ["loadLatestApprovedNonEquityNavFromBackend", "approved non-equity NAV reload function"],
    ["applyApprovedNonEquityNavPackage", "approved non-equity NAV state hydration"],
    ["restoreRuntimeImportsFromBackend", "runtime data hydration after refresh"],
    ["loadLatestTradeAuthorizationsFromBackend", "trade authorization reload function"],
    ["queueTradeAuthorizationSync", "trade authorization state sync function"],
    ["Loaded from approved backend portfolio", "approved portfolio decision hydration"],
    ["restoreCommitteeApprovalFromBackendPortfolio", "approval hydration survives role-user refresh"],
    ["hasBackendApprovedPortfolio", "backend approval prevents local reload checks from clearing approval"],
    ["clearBackendPortfolioWorkflowState();", "new portfolio version clears only portfolio approval state"],
    ["syncImportToBackend", "data load sync function"],
    ["loginBackendUser", "backend login function"],
    ["restoreBackendSession", "backend session restore function"],
    ["localStorage", "browser session persistence"],
    ["/api/session", "backend session validation endpoint"],
    ["/api/demo/reset", "administrator demo database reset endpoint"],
    ["resetDemoDatabaseFromLogin", "login-page demo reset action"],
    ["beginGlobalLoading", "blocking loading overlay"],
  ];

  for (const [signal, label] of requiredCodeSignals) {
    assert(appJs.includes(signal), `Frontend-backend wiring includes ${label}`, signal);
  }
  assert(indexHtml.includes('name="password" type="password" autocomplete="current-password"'),
    "Login forms support the browser password manager", "current-password autocomplete fields");
}

function checkNonProductionSignals() {
  const backendFiles = ["package.json", "server/core.mjs", "server/server.mjs"];
  const backendExists = backendFiles.every((file) => existsSync(join(root, file)));
  assert(backendExists, "Backend foundation is present", backendFiles.join(", "));

  const serverCore = readFileSync(join(root, "server", "core.mjs"), "utf8");
  const authSignals = ["login", "sessions", "requirePermission", "auditLog"].filter((signal) => serverCore.includes(signal));
  assert(authSignals.length === 4, "Backend includes session and permission foundation", authSignals.join(", "));
  assert(serverCore.includes("maxSingleSecurityWeight: 35"), "Backend default single-security limit is 35% of sleeve", "maxSingleSecurityWeight: 35");
  assert(serverCore.includes("riskFreeRates"), "Backend default includes market/currency risk-free rates", "riskFreeRates");
  assert(serverCore.includes("rebalanceLowerDrift: -20") && serverCore.includes("rebalanceUpperDrift: 20"), "Backend default rebalance corridor matches monthly relative drift rule", "-20 / 20");
  assert(serverCore.includes("rebalanceCompletionDays: 3"), "Backend default rebalance completion deadline is 3 trading days", "rebalanceCompletionDays: 3");
  assert(serverCore.includes("executionQuantityTolerance: 0.01") && serverCore.includes("executionValueTolerance: 0.02"), "Backend default execution tolerances are present", "quantity/value tolerances");
  assert(serverCore.includes("nonEquityNavPackages"), "Backend persists non-equity NAV approval records", "nonEquityNavPackages");
  assert(serverCore.includes("latestImportRecords"), "Backend restores latest imported execution data", "latestImportRecords");
  assert(serverCore.includes("tradeAuthorizationPackages"), "Backend persists trade authorization records", "tradeAuthorizationPackages");
  assert(serverCore.includes("reportDistributions") && serverCore.includes("latestReportDistribution"), "Backend persists formal report distributions", "reportDistributions");
  const serverEntry = readFileSync(join(root, "server", "server.mjs"), "utf8");
  assert(serverEntry.includes("db.sqlite"), "Backend default live database is SQLite", "server/data/db.sqlite");
  assert(serverEntry.includes("/api/report-distributions"), "Backend exposes report distribution API", "/api/report-distributions");
  assert(serverCore.includes("app_state") && serverCore.includes("app_state_backups"), "Backend includes SQLite live-state and backup tables", "app_state, app_state_backups");
  ["users", "sessions", "target_packages", "portfolios", "portfolio_holdings", "approvals", "import_records", "report_distributions", "public_data_refreshes", "audit_log"].forEach((table) => {
    assert(serverCore.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `SQLite live database includes dedicated ${table} table`, table);
  });
  assert(serverCore.includes("normalizedSchemaVersion"), "SQLite live database records normalized schema version", "normalizedSchemaVersion");
  const backendDbPath = join(root, "server", "data", "db.json");
  if (existsSync(backendDbPath)) {
    const backendDb = JSON.parse(readFileSync(backendDbPath, "utf8"));
    const params = backendDb.systemConfig?.businessParameters || {};
    assert(Number(params.maxSingleSecurityWeight) === 35, "Current backend database stores 35% sleeve limit", String(params.maxSingleSecurityWeight));
    assert(Boolean(params.riskFreeRates?.us && params.riskFreeRates?.developed && params.riskFreeRates?.hongkong && params.riskFreeRates?.chinaa), "Current backend database stores market/currency risk-free rates", JSON.stringify(params.riskFreeRates || {}));
  }
}

checkIds();
checkCoreUiSections();
checkWorkflowControls();
checkExternalDataInputs();
checkRoleAndApprovalLogic();
checkRiskAndOptimizationLogic();
checkFrontendBackendWiring();
checkNonProductionSignals();

const failures = results.filter((result) => result.status === "FAIL");
const reportPath = writeReport();

if (failures.length) {
  console.error(`Static UI checks failed: ${failures.length} failure(s)`);
  console.error(`Result file: ${reportPath}`);
  process.exitCode = 1;
} else {
  console.log(`Static UI checks passed: ${results.length} checks`);
  console.log(`Result file: ${reportPath}`);
}
