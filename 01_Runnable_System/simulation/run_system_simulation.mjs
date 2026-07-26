import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = join(root, "simulation", "output");
mkdirSync(outputDir, { recursive: true });

function readCsv(name) {
  const text = readFileSync(join(root, name), "utf8").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value, digits = 2) {
  return `${value.toFixed(digits)}%`;
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function variance(values) {
  const mean = sum(values, (value) => value) / values.length;
  return sum(values, (value) => (value - mean) ** 2) / (values.length - 1);
}

function covariance(a, b) {
  const meanA = sum(a, (value) => value) / a.length;
  const meanB = sum(b, (value) => value) / b.length;
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += (a[index] - meanA) * (b[index] - meanB);
  }
  return total / (a.length - 1);
}

function maxDrawdown(returns) {
  let wealth = 1;
  let peak = 1;
  let worst = 0;
  for (const ret of returns) {
    wealth *= 1 + ret;
    peak = Math.max(peak, wealth);
    worst = Math.min(worst, wealth / peak - 1);
  }
  return worst * 100;
}

function roleAllowed(user, permission) {
  const matrix = {
    admin: ["System Administrator"],
    decision: ["Decision Committee"],
    execution: ["Execution Team"],
    data: ["System Administrator", "Execution Team"],
    report: ["System Administrator", "Decision Committee", "Execution Team"],
  };
  return matrix[permission].includes(user.group);
}

function tryAction(audit, user, permission, action) {
  const allowed = roleAllowed(user, permission);
  audit.push({
    actor: user.name,
    group: user.group,
    action,
    result: allowed ? "allowed" : "blocked",
  });
  return allowed;
}

function validateConstraints(holdings, constraints) {
  const byAsset = new Map();
  const byRegion = new Map();
  const styleTickers = new Map();
  const failures = [];

  for (const holding of holdings) {
    byAsset.set(holding.assetClass, (byAsset.get(holding.assetClass) ?? 0) + holding.weight);
    byRegion.set(holding.region, (byRegion.get(holding.region) ?? 0) + holding.weight);
    if (holding.assetClass === "Equity") {
      styleTickers.set(holding.style, new Set([...(styleTickers.get(holding.style) ?? []), holding.ticker]));
      if (holding.weight > constraints.maxSingleEquity) {
        failures.push(`${holding.ticker} single equity weight ${pct(holding.weight)} exceeds max ${pct(constraints.maxSingleEquity)}`);
      }
    }
  }

  for (const [assetClass, range] of Object.entries(constraints.asset)) {
    const value = byAsset.get(assetClass) ?? 0;
    if (value < range.min || value > range.max) {
      failures.push(`${assetClass} weight ${pct(value)} outside ${pct(range.min)}-${pct(range.max)} corridor`);
    }
  }

  for (const [region, range] of Object.entries(constraints.region)) {
    const value = byRegion.get(region) ?? 0;
    if (value < range.min || value > range.max) {
      failures.push(`${region} weight ${pct(value)} outside ${pct(range.min)}-${pct(range.max)} corridor`);
    }
  }

  for (const style of constraints.requiredStyles) {
    const count = styleTickers.get(style)?.size ?? 0;
    if (count < 2 || count > 5) {
      failures.push(`${style} has ${count} equity tickers; required 2-5`);
    }
  }

  return {
    failures,
    passed: failures.length === 0,
    assetWeights: Object.fromEntries(byAsset),
    regionWeights: Object.fromEntries(byRegion),
  };
}

function backtestPortfolio(priceRows, holdings, benchmarkTicker) {
  const equityHoldings = holdings.filter((holding) => holding.assetClass === "Equity");
  const equityWeight = sum(equityHoldings, (holding) => holding.weight);
  const normalized = equityHoldings.map((holding) => ({
    ...holding,
    sleeveWeight: holding.weight / equityWeight,
  }));
  const portfolioReturns = [];
  const benchmarkReturns = [];

  for (let i = 1; i < priceRows.length; i += 1) {
    const previous = priceRows[i - 1];
    const current = priceRows[i];
    const portfolioReturn = sum(normalized, (holding) => {
      const prev = number(previous[holding.ticker]);
      const curr = number(current[holding.ticker]);
      return prev > 0 ? holding.sleeveWeight * (curr / prev - 1) : 0;
    });
    const benchmarkPrev = number(previous[benchmarkTicker]);
    const benchmarkCurr = number(current[benchmarkTicker]);
    const benchmarkReturn = benchmarkPrev > 0 ? benchmarkCurr / benchmarkPrev - 1 : 0;
    portfolioReturns.push(portfolioReturn);
    benchmarkReturns.push(benchmarkReturn);
  }

  const beta = covariance(portfolioReturns, benchmarkReturns) / variance(benchmarkReturns);
  const periodReturn = (portfolioReturns.reduce((wealth, ret) => wealth * (1 + ret), 1) - 1) * 100;
  const annualizedReturn = ((1 + periodReturn / 100) ** (52 / portfolioReturns.length) - 1) * 100;
  return {
    beta,
    periodReturn,
    annualizedReturn,
    maxDrawdown: maxDrawdown(portfolioReturns),
    observations: portfolioReturns.length,
  };
}

function withWeights(holdings, weights) {
  return holdings.map((holding, index) => ({ ...holding, weight: weights[index] }));
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16_807) % 2_147_483_647;
    return (value - 1) / 2_147_483_646;
  };
}

function randomWeights(count, random) {
  const raw = Array.from({ length: count }, () => random() ** 1.6);
  const total = sum(raw, (value) => value) || 1;
  return raw.map((value) => (value / total) * 100);
}

function holdingMatchesOptimizerScope(holding, scope) {
  if (holding.lockedWeight) return false;
  if (scope.region !== "all" && holding.region !== scope.region) return false;
  if (scope.assetClass !== "all" && holding.assetClass !== scope.assetClass) return false;
  if (scope.style !== "all" && holding.style !== scope.style) return false;
  return holding.assetClass === "Equity" && holding.region === "United States";
}

function randomUsEquitySleeveWeights(holdings, baseWeights, random, scope) {
  const weights = [...baseWeights];
  const minimumSelectedEquityWeight = 2;
  const equityIndexes = holdings
    .map((holding, index) => ({ holding, index }))
    .filter((row) => holdingMatchesOptimizerScope(row.holding, scope))
    .map((row) => row.index);
  const sleeveTotal = sum(equityIndexes, (index) => baseWeights[index]);
  if (!equityIndexes.length || sleeveTotal <= 0) return [...baseWeights];
  const perHoldingMinimum = Math.min(minimumSelectedEquityWeight, sleeveTotal / equityIndexes.length);
  const minimumTotal = perHoldingMinimum * equityIndexes.length;
  const raw = equityIndexes.map(() => random() ** 1.6);
  const rawTotal = sum(raw, (value) => value) || 1;
  equityIndexes.forEach((holdingIndex, rawIndex) => {
    const distributable = Math.max(0, sleeveTotal - minimumTotal);
    weights[holdingIndex] = perHoldingMinimum + (raw[rawIndex] / rawTotal) * distributable;
  });
  return weights;
}

function scoreBacktest(metrics, validation, targetBeta, targetReturn, targetDrawdown) {
  const returnPenalty = Math.max(0, targetReturn - metrics.annualizedReturn) ** 2 * 0.1;
  const betaPenalty = (metrics.beta - targetBeta) ** 2 * 1_500;
  const drawdownPenalty = Math.max(0, targetDrawdown - metrics.maxDrawdown) ** 2 * 3;
  const constraintPenalty = validation.failures.length * 1_000;
  return returnPenalty + betaPenalty + drawdownPenalty + constraintPenalty;
}

function optimizeProposal(priceRows, holdings, constraints, targetBeta, targetReturn, targetDrawdown, scope) {
  const random = seededRandom(42);
  const currentWeights = holdings.map((holding) => holding.weight);
  let bestHoldings = holdings;
  let bestMetrics = backtestPortfolio(priceRows, holdings, "VTI");
  let bestValidation = validateConstraints(holdings, constraints);
  let bestScore = scoreBacktest(bestMetrics, bestValidation, targetBeta, targetReturn, targetDrawdown);

  for (let index = 0; index < 20_000; index += 1) {
    const weights = randomUsEquitySleeveWeights(holdings, currentWeights, random, scope);
    const candidate = withWeights(holdings, weights);
    const validation = validateConstraints(candidate, constraints);
    const metrics = backtestPortfolio(priceRows, candidate, "VTI");
    const score = scoreBacktest(metrics, validation, targetBeta, targetReturn, targetDrawdown);
    if (score < bestScore) {
      bestHoldings = candidate;
      bestMetrics = metrics;
      bestValidation = validation;
      bestScore = score;
    }
  }

  return {
    currentWeights,
    holdings: bestHoldings.map((holding) => ({ ...holding, weight: Number(holding.weight.toFixed(2)) })),
    metrics: bestMetrics,
    validation: bestValidation,
  };
}

function adjustmentReason(row, currentBeta, targetBeta) {
  if (row.assetClass !== "Equity") {
    return row.delta > 0
      ? "Add ballast while keeping allocation constraints in range"
      : "Release weight to fund the equity beta adjustment";
  }
  if (currentBeta < targetBeta) {
    return row.delta > 0
      ? "Increase equity exposure that improves beta fit"
      : "Reduce lower-priority equity exposure to fund beta improvement";
  }
  return row.delta > 0
    ? "Increase lower-beta exposure to reduce excess beta"
    : "Reduce higher-beta exposure to control beta";
}

function reconcileTrades(approvedTrades, actualTrades) {
  return approvedTrades.map((approved) => {
    const actual = actualTrades.find((trade) => (
      trade.Action === approved.action &&
      trade.Ticker === approved.ticker &&
      number(trade.Quantity) === approved.quantity &&
      Math.abs(number(trade.Price) - approved.price) < 0.01
    ));
    return {
      approved: `${approved.action} ${approved.quantity} ${approved.ticker} @ ${approved.price}`,
      result: actual ? `matched ${actual.ExternalTradeId}` : "missing actual trade",
    };
  });
}

function modifiedDietz(beginValue, endValue, cashFlows, startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const totalDays = (end - start) / 86_400_000;
  let netFlow = 0;
  let weightedFlow = 0;
  for (const flow of cashFlows) {
    const amount = number(flow.Amount);
    const flowDate = new Date(flow.CashFlowDate).getTime();
    const daysRemaining = Math.max(0, Math.min(totalDays, (end - flowDate) / 86_400_000));
    const weight = totalDays > 0 ? daysRemaining / totalDays : 0;
    netFlow += amount;
    weightedFlow += amount * weight;
  }
  return ((endValue - beginValue - netFlow) / (beginValue + weightedFlow)) * 100;
}

const users = [
  { name: "System Administrator", group: "System Administrator" },
  { name: "Decision Committee Approver", group: "Decision Committee" },
  { name: "Execution Team Approver", group: "Execution Team" },
  { name: "Execution Manager", group: "Execution Team" },
];

const audit = [];
tryAction(audit, users[0], "admin", "create and maintain users");
tryAction(audit, users[0], "decision", "approve annual target");
tryAction(audit, users[1], "decision", "approve annual target");
tryAction(audit, users[1], "execution", "edit proposed holdings");
tryAction(audit, users[2], "execution", "approve trade orders");
tryAction(audit, users[3], "execution", "edit proposed holdings");
tryAction(audit, users[3], "data", "import actual holdings and trades");
tryAction(audit, users[1], "decision", "approve portfolio version");

const cpiSources = [
  { name: "Market forecast A", estimate: 2.7 },
  { name: "Market forecast B", estimate: 2.9 },
  { name: "Market forecast C", estimate: 2.8 },
];
const operatingCost = 4.0;
const cpiEstimate = sum(cpiSources, (source) => source.estimate) / cpiSources.length;
const scenario = { name: "Balanced", min: -2, max: 2, selected: 0.0 };
const annualTargetReturn = operatingCost + cpiEstimate + scenario.selected;

const sleeves = [
  { name: "US Equity", assetClass: "Equity", weight: 50, targetContribution: 4.25, riskFree: 4.5, marketReturn: 9.0, benchmark: "VTI" },
  { name: "Developed ex-US Equity", assetClass: "Equity", weight: 10, targetContribution: 0.8, riskFree: 3.5, marketReturn: 8.0, benchmark: "VEA" },
  { name: "Emerging Equity", assetClass: "Equity", weight: 5, targetContribution: 0.5, riskFree: 3.5, marketReturn: 10.0, benchmark: "VWO" },
  { name: "Bond", assetClass: "Bond", weight: 25, referenceReturn: 4.0 },
  { name: "Alternative", assetClass: "Alternative", weight: 5, referenceReturn: 3.0 },
  { name: "Cash & Cash-like", assetClass: "Cash & Cash-like", weight: 5, referenceReturn: 2.0 },
];

for (const sleeve of sleeves) {
  if (sleeve.assetClass === "Equity") {
    sleeve.sleeveTargetReturn = sleeve.targetContribution / (sleeve.weight / 100);
    sleeve.targetBeta = (sleeve.sleeveTargetReturn - sleeve.riskFree) / (sleeve.marketReturn - sleeve.riskFree);
  } else {
    sleeve.targetContribution = sleeve.weight * sleeve.referenceReturn / 100;
  }
}

const totalSleeveContribution = sum(sleeves, (sleeve) => sleeve.targetContribution);
const usSleeve = sleeves[0];
const drawdownRatio = { min: 0.6, max: 0.8 };
const targetMaxDrawdown = {
  tighter: -(usSleeve.sleeveTargetReturn / drawdownRatio.max),
  deeper: -(usSleeve.sleeveTargetReturn / drawdownRatio.min),
};

const constraints = {
  maxSingleEquity: 15,
  requiredStyles: ["Cyclical", "Growth", "Active"],
  asset: {
    Equity: { min: 40, max: 70 },
    Bond: { min: 10, max: 40 },
    Alternative: { min: 0, max: 20 },
    "Cash & Cash-like": { min: 0, max: 20 },
  },
  region: {
    "United States": { min: 50, max: 80 },
    Global: { min: 0, max: 30 },
  },
};

const defaultProposal = [
  { ticker: "VTI", assetClass: "Equity", region: "United States", style: "Growth", weight: 35 },
  { ticker: "NVDA", assetClass: "Equity", region: "United States", style: "Growth", weight: 10 },
  { ticker: "BIL", assetClass: "Bond", region: "United States", style: "Defensive", weight: 25 },
  { ticker: "CASH", assetClass: "Cash & Cash-like", region: "Global", style: "Defensive", weight: 30 },
];

const styleCandidate = [
  { ticker: "VTI", assetClass: "Equity", region: "United States", style: "Cyclical", weight: 15 },
  { ticker: "AAPL", assetClass: "Equity", region: "United States", style: "Cyclical", weight: 10 },
  { ticker: "NVDA", assetClass: "Equity", region: "United States", style: "Growth", weight: 10 },
  { ticker: "MSFT", assetClass: "Equity", region: "United States", style: "Growth", weight: 10 },
  { ticker: "BIL", assetClass: "Bond", region: "United States", style: "Defensive", weight: 35 },
  { ticker: "CASH", assetClass: "Cash & Cash-like", region: "Global", style: "Defensive", weight: 20 },
];

const fullStyleCandidate = [
  { ticker: "VTI", assetClass: "Equity", region: "United States", style: "Cyclical", weight: 15, lockedWeight: true },
  { ticker: "AAPL", assetClass: "Equity", region: "United States", style: "Cyclical", weight: 8 },
  { ticker: "NVDA", assetClass: "Equity", region: "United States", style: "Growth", weight: 8 },
  { ticker: "MSFT", assetClass: "Equity", region: "United States", style: "Growth", weight: 7 },
  { ticker: "JPM", assetClass: "Equity", region: "United States", style: "Active", weight: 6 },
  { ticker: "XOM", assetClass: "Equity", region: "United States", style: "Active", weight: 6, lockedWeight: true },
  { ticker: "BIL", assetClass: "Bond", region: "United States", style: "Defensive", weight: 30, lockedWeight: true },
  { ticker: "CASH", assetClass: "Cash & Cash-like", region: "Global", style: "Defensive", weight: 20, lockedWeight: true },
];

const priceFile = existsSync(join(root, "data", "sample_prices_web_recent.csv"))
  ? "data/sample_prices_web_recent.csv"
  : "data/sample_prices.csv";
const priceRows = readCsv(priceFile);
const priceColumns = Object.keys(priceRows[0]).filter((header) => header !== "Date");
const actualHoldings = readCsv("data/standard_actual_holdings.csv");
const actualTrades = readCsv("data/standard_actual_trades.csv");
const cashFlows = readCsv("data/standard_cash_flows.csv");

const defaultValidation = validateConstraints(defaultProposal, constraints);
const styleValidation = validateConstraints(styleCandidate, constraints);
const fullStyleValidation = validateConstraints(fullStyleCandidate, constraints);
const backtestCoverageMissing = fullStyleCandidate
  .filter((holding) => holding.assetClass === "Equity")
  .map((holding) => holding.ticker)
  .filter((ticker) => !priceColumns.includes(ticker));

const backtestCandidate = backtestCoverageMissing.length === 0 ? fullStyleCandidate : styleCandidate;
const backtestCandidateName = backtestCoverageMissing.length === 0 ? "Full style candidate" : "Price-covered style candidate";
const styleBacktest = backtestPortfolio(priceRows, backtestCandidate, "VTI");
const betaStatus = Math.abs(styleBacktest.beta - usSleeve.targetBeta) <= 0.1 ? "passed" : "failed";
const drawdownStatus = styleBacktest.maxDrawdown >= targetMaxDrawdown.deeper ? "passed" : "failed";
const optimizerScope = { region: "United States", assetClass: "Equity", style: "all" };
const optimization = optimizeProposal(
  priceRows,
  backtestCandidate,
  constraints,
  usSleeve.targetBeta,
  usSleeve.sleeveTargetReturn,
  targetMaxDrawdown.deeper,
  optimizerScope,
);
const optimizationRows = optimization.holdings.map((holding, index) => ({
  ...holding,
  currentWeight: backtestCandidate[index].weight,
  suggestedWeight: holding.weight,
  delta: holding.weight - backtestCandidate[index].weight,
})).filter((row) => Math.abs(row.delta) >= 0.25)
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
const optimizedBetaStatus = Math.abs(optimization.metrics.beta - usSleeve.targetBeta) <= 0.1 ? "passed" : "failed";
const optimizedReturnStatus = optimization.metrics.annualizedReturn >= usSleeve.sleeveTargetReturn * 0.95 ? "passed" : "failed";
const optimizedDrawdownStatus = optimization.metrics.maxDrawdown >= targetMaxDrawdown.deeper ? "passed" : "failed";

const actualWeightByTicker = new Map(actualHoldings.map((holding) => [holding.Ticker, number(holding.Weight)]));
const defaultWeightByTicker = new Map(defaultProposal.map((holding) => [holding.ticker, holding.weight]));
const driftRows = [...new Set([...actualWeightByTicker.keys(), ...defaultWeightByTicker.keys()])].map((ticker) => {
  const actual = actualWeightByTicker.get(ticker) ?? 0;
  const target = defaultWeightByTicker.get(ticker) ?? 0;
  return { ticker, actual, target, drift: actual - target };
});
const rebalanceAlerts = driftRows.filter((row) => Math.abs(row.drift) > 2);

const approvedTrades = [
  { action: "Buy", ticker: "VTI", quantity: 10, price: 300, approvedBy: "Execution Lead" },
];
const tradeReconciliation = reconcileTrades(approvedTrades, actualTrades);
const dietzReturn = modifiedDietz(1_000_000, 1_030_000, cashFlows, "2026-06-01", "2026-06-30");

const lines = [];
lines.push("# Investment Management System Simulation");
lines.push("");
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push("## 1. Roles and permission test");
lines.push("");
lines.push("| Actor | Group | Action | Result |");
lines.push("| --- | --- | --- | --- |");
for (const row of audit) {
  lines.push(`| ${row.actor} | ${row.group} | ${row.action} | ${row.result} |`);
}
lines.push("");
lines.push("## 2. Annual target and target beta");
lines.push("");
lines.push(`- Operating cost input: ${pct(operatingCost)}`);
lines.push(`- CPI estimate: ${pct(cpiEstimate)} from ${cpiSources.length} selected market forecasts`);
lines.push(`- Market scenario: ${scenario.name}, allowed range ${pct(scenario.min)} to ${pct(scenario.max)}, selected ${pct(scenario.selected)}`);
lines.push(`- Total annual target return: ${pct(annualTargetReturn)}`);
lines.push(`- Sleeve contribution total: ${pct(totalSleeveContribution)}; gap to target: ${pct(totalSleeveContribution - annualTargetReturn)}`);
lines.push(`- US equity sleeve target return: ${pct(usSleeve.sleeveTargetReturn)}`);
lines.push(`- US equity target beta by CAPM: ${usSleeve.targetBeta.toFixed(3)} using ${usSleeve.benchmark}, risk-free ${pct(usSleeve.riskFree)}, market return ${pct(usSleeve.marketReturn)}`);
lines.push(`- Target max drawdown band: ${pct(targetMaxDrawdown.deeper)} to ${pct(targetMaxDrawdown.tighter)}`);
lines.push("");
lines.push("## 3. Proposal validation");
lines.push("");
lines.push(`- Current default proposal: ${defaultValidation.passed ? "passed" : "failed"}`);
for (const failure of defaultValidation.failures) lines.push(`  - ${failure}`);
lines.push(`- Price-covered style candidate: ${styleValidation.passed ? "passed" : "failed"}`);
for (const failure of styleValidation.failures) lines.push(`  - ${failure}`);
lines.push(`- Full style candidate: ${fullStyleValidation.passed ? "passed" : "failed"}`);
for (const failure of fullStyleValidation.failures) lines.push(`  - ${failure}`);
lines.push("");
lines.push("## 4. Backtest");
lines.push("");
lines.push(`- Price file used: ${priceFile}`);
lines.push(`- Available price columns: ${priceColumns.join(", ")}`);
lines.push(`- Full style candidate missing price history: ${backtestCoverageMissing.length ? backtestCoverageMissing.join(", ") : "none"}`);
lines.push(`- Backtest candidate: ${backtestCandidateName}`);
lines.push(`- ${backtestCandidateName} observations: ${styleBacktest.observations}`);
lines.push(`- ${backtestCandidateName} annualized return: ${pct(styleBacktest.annualizedReturn)}`);
lines.push(`- ${backtestCandidateName} return status: hard control against the proposed equity return target`);
lines.push(`- ${backtestCandidateName} beta vs VTI: ${styleBacktest.beta.toFixed(3)} (${betaStatus}; target ${usSleeve.targetBeta.toFixed(3)})`);
lines.push(`- ${backtestCandidateName} max drawdown: ${pct(styleBacktest.maxDrawdown)} (${drawdownStatus}; target not deeper than ${pct(targetMaxDrawdown.deeper)})`);
lines.push("");
lines.push("## 5. Optimization advice");
lines.push("");
lines.push(`- Optimization scope: region ${optimizerScope.region}, asset class ${optimizerScope.assetClass}, style ${optimizerScope.style}`);
lines.push(`- Locked weights: ${backtestCandidate.filter((holding) => holding.lockedWeight).map((holding) => holding.ticker).join(", ") || "none"}`);
lines.push(`- Suggested portfolio beta vs VTI: ${optimization.metrics.beta.toFixed(3)} (${optimizedBetaStatus}; target ${usSleeve.targetBeta.toFixed(3)})`);
lines.push(`- Suggested portfolio annualized return: ${pct(optimization.metrics.annualizedReturn)} (${optimizedReturnStatus}; target ${pct(usSleeve.sleeveTargetReturn)} with 5% relative tolerance)`);
lines.push(`- Suggested portfolio max drawdown: ${pct(optimization.metrics.maxDrawdown)} (${optimizedDrawdownStatus}; target not deeper than ${pct(targetMaxDrawdown.deeper)})`);
lines.push(`- Suggested portfolio constraints: ${optimization.validation.passed ? "passed" : "failed"}`);
lines.push(`- Approval control result after optimization: ${optimizedReturnStatus === "passed" && optimizedBetaStatus === "passed" && optimizedDrawdownStatus === "passed" && optimization.validation.passed ? "pass" : "needs review"}`);
lines.push("");
lines.push("| Ticker | Current weight | Suggested weight | Change | Reason |");
lines.push("| --- | ---: | ---: | ---: | --- |");
for (const row of optimizationRows) {
  lines.push(`| ${row.ticker} | ${pct(row.currentWeight)} | ${pct(row.suggestedWeight)} | ${row.delta >= 0 ? "+" : ""}${pct(row.delta)} | ${adjustmentReason(row, styleBacktest.beta, usSleeve.targetBeta)} |`);
}
lines.push("");
lines.push("## 6. Actual holdings import and rebalance alerts");
lines.push("");
lines.push("| Ticker | Target weight | Actual weight | Drift | Alert |");
lines.push("| --- | ---: | ---: | ---: | --- |");
for (const row of driftRows) {
  lines.push(`| ${row.ticker} | ${pct(row.target)} | ${pct(row.actual)} | ${pct(row.drift)} | ${Math.abs(row.drift) > 2 ? "yes" : "no"} |`);
}
lines.push("");
lines.push(`- Alerts triggered: ${rebalanceAlerts.length ? rebalanceAlerts.map((row) => `${row.ticker} ${pct(row.drift)}`).join(", ") : "none"}`);
lines.push("");
lines.push("## 7. Trade reconciliation");
lines.push("");
for (const row of tradeReconciliation) {
  lines.push(`- ${row.approved}: ${row.result}`);
}
lines.push("");
lines.push("## 8. Cash-flow-adjusted reporting");
lines.push("");
lines.push(`- Modified Dietz return example for 2026-06-01 to 2026-06-30: ${pct(dietzReturn)}`);
lines.push("");
lines.push("## 9. Simulation findings");
lines.push("");
lines.push("- The role model works: unauthorized actions are blocked and can be audit logged.");
lines.push("- The target-return to US-equity target-beta chain runs, but sleeve contribution should be reviewed when the gap to the total target is material.");
lines.push("- The market-data layer must keep aligned history across every proposed ticker; otherwise a valid proposal cannot be backtested.");
lines.push(`- This run used ${priceFile}, so the full style candidate could ${backtestCoverageMissing.length === 0 ? "be backtested" : "not be fully backtested"}.`);
lines.push("- When a proposal misses target beta, the system now generates concrete weight adjustments instead of only marking the backtest as failed.");
lines.push("- Backtested return, sleeve beta, max drawdown, allocation constraints, and data quality are approval controls for the proposed equity portfolio.");
lines.push("- The actual holdings import triggers rebalance alerts when drift is outside the default +/-2% corridor.");
lines.push("- The trade import can reconcile approved execution orders against actual broker transactions.");

writeFileSync(join(outputDir, "simulation_result.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
