import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = join(root, "simulation", "output");
mkdirSync(outDir, { recursive: true });

function readCsv(name) {
  const text = readFileSync(join(root, name), "utf8").trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function writeCsv(name, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => row[header]).join(",")).join("\n");
  writeFileSync(join(outDir, name), `${headers.join(",")}\n${body}\n`);
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value) {
  return `${value.toFixed(2)}%`;
}

function money(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
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

function benchmarkReturn(previous, current, benchmark) {
  if (Array.isArray(benchmark)) {
    let total = 0;
    let usableWeight = 0;
    for (const component of benchmark) {
      const prev = n(previous[component.proxy]);
      const curr = n(current[component.proxy]);
      const weight = n(component.weight) / 100;
      if (prev > 0 && curr > 0 && weight > 0) {
        total += weight * (curr / prev - 1);
        usableWeight += weight;
      }
    }
    return usableWeight > 0 ? total / usableWeight : null;
  }
  const prev = n(previous[benchmark]);
  const curr = n(current[benchmark]);
  return prev > 0 && curr > 0 ? curr / prev - 1 : null;
}

function backtest(priceRows, holdings, benchmark) {
  const pricedHoldings = holdings.filter((holding) => (
    priceRows.filter((row) => n(row[holding.ticker]) > 0).length >= 2
  ));
  const portfolioTotal = sum(pricedHoldings, (holding) => holding.weight) || 1;
  const normalized = pricedHoldings.map((holding) => ({ ...holding, sleeveWeight: holding.weight / portfolioTotal }));
  const assetReturns = [];
  const benchmarkReturns = [];

  for (let index = 1; index < priceRows.length; index += 1) {
    const previous = priceRows[index - 1];
    const current = priceRows[index];
    let assetReturn = 0;
    let usableWeight = 0;
    normalized.forEach((holding) => {
      const prev = n(previous[holding.ticker]);
      const curr = n(current[holding.ticker]);
      if (prev > 0 && curr > 0) {
        assetReturn += holding.sleeveWeight * (curr / prev - 1);
        usableWeight += holding.sleeveWeight;
      }
    });
    const benchReturn = benchmarkReturn(previous, current, benchmark);
    if (benchReturn !== null && usableWeight > 0) {
      assetReturns.push(assetReturn / usableWeight);
      benchmarkReturns.push(benchReturn);
    }
  }

  const beta = covariance(assetReturns, benchmarkReturns) / variance(benchmarkReturns);
  const periodReturn = (assetReturns.reduce((wealth, ret) => wealth * (1 + ret), 1) - 1) * 100;
  const annualizedReturn = ((1 + periodReturn / 100) ** (52 / assetReturns.length) - 1) * 100;
  return {
    observations: assetReturns.length,
    annualizedReturn,
    beta,
    maxDrawdown: maxDrawdown(assetReturns),
  };
}

function validate(holdings, constraints) {
  const failures = [];
  const asset = {};
  const region = {};
  const styleTickers = {};
  for (const holding of holdings) {
    asset[holding.assetClass] = (asset[holding.assetClass] ?? 0) + holding.weight;
    region[holding.region] = (region[holding.region] ?? 0) + holding.weight;
    if (holding.assetClass === "Equity") {
      if (holding.weight > constraints.maxSingleEquity) {
        failures.push(`${holding.ticker} is above max single equity ${pct(constraints.maxSingleEquity)}`);
      }
      if (["Cyclical", "Growth", "Active"].includes(holding.style)) {
        const styleKey = `${equitySleeve(holding.region)}:${holding.style}`;
        styleTickers[styleKey] ??= new Set();
        styleTickers[styleKey].add(holding.ticker);
      }
    }
  }

  for (const [key, range] of Object.entries(constraints.asset)) {
    const weight = asset[key] ?? 0;
    if (weight < range.min || weight > range.max) failures.push(`${key} ${pct(weight)} outside ${pct(range.min)}-${pct(range.max)}`);
  }
  for (const [key, range] of Object.entries(constraints.region)) {
    const weight = region[key] ?? 0;
    if (weight < range.min || weight > range.max) failures.push(`${key} ${pct(weight)} outside ${pct(range.min)}-${pct(range.max)}`);
  }
  for (const [styleKey, tickers] of Object.entries(styleTickers)) {
    const count = tickers.size;
    if (count < 2 || count > 5) failures.push(`${styleKey} has ${count} tickers; required 2-5`);
  }

  return { passed: failures.length === 0, failures, asset, region };
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16_807) % 2_147_483_647;
    return (value - 1) / 2_147_483_646;
  };
}

function optimize(priceRows, holdings, constraints, targetBeta, targetReturn, targetDrawdown, scope, benchmark) {
  const random = seededRandom(20260621);
  const baseWeights = holdings.map((holding) => holding.weight);
  const eligible = holdings
    .map((holding, index) => ({ holding, index }))
    .filter(({ holding }) => !holding.lockedWeight)
    .filter(({ holding }) => holding.region === scope.region)
    .filter(({ holding }) => holding.assetClass === scope.assetClass)
    .filter(({ holding }) => scope.style === "all" || holding.style === scope.style)
    .filter(({ holding }) => holding.assetClass === "Equity");
  const eligibleTotal = sum(eligible, ({ index }) => baseWeights[index]);
  let best = {
    holdings,
    metrics: backtest(priceRows, holdings, benchmark),
    validation: validate(holdings, constraints),
  };
  let bestScore = score(best.metrics, best.validation, targetBeta, targetReturn, targetDrawdown);

  for (let run = 0; run < 25000; run += 1) {
    const weights = [...baseWeights];
    if (eligible.length && eligibleTotal > 0) {
      const minimum = Math.min(2, eligibleTotal / eligible.length);
      const raw = eligible.map(() => random() ** 1.6);
      const rawTotal = sum(raw, (value) => value) || 1;
      const distributable = Math.max(0, eligibleTotal - minimum * eligible.length);
      eligible.forEach(({ index }, rawIndex) => {
        weights[index] = minimum + (raw[rawIndex] / rawTotal) * distributable;
      });
    }
    const candidate = holdings.map((holding, index) => ({ ...holding, weight: Number(weights[index].toFixed(2)) }));
    const metrics = backtest(priceRows, candidate, benchmark);
    const validation = validate(candidate, constraints);
    const candidateScore = score(metrics, validation, targetBeta, targetReturn, targetDrawdown);
    if (candidateScore < bestScore) {
      best = { holdings: candidate, metrics, validation };
      bestScore = candidateScore;
    }
  }
  return { ...best, eligibleCount: eligible.length };
}

function score(metrics, validation, targetBeta, targetReturn, targetDrawdown) {
  const betaPenalty = (metrics.beta - targetBeta) ** 2 * 1500;
  const drawdownPenalty = Math.max(0, targetDrawdown - metrics.maxDrawdown) ** 2 * 3;
  const referenceReturnPenalty = Math.max(0, targetReturn - metrics.annualizedReturn) ** 2 * 0.01;
  const constraintPenalty = validation.failures.length * 1000;
  return betaPenalty + drawdownPenalty + referenceReturnPenalty + constraintPenalty;
}

function weeklyRows(rows) {
  const byWeek = new Map();
  rows.forEach((row) => {
    const date = new Date(row.Date || row.date);
    date.setDate(date.getDate() - date.getDay());
    byWeek.set(date.toISOString().slice(0, 10), row);
  });
  return Array.from(byWeek.values()).sort((left, right) => new Date(left.Date || left.date) - new Date(right.Date || right.date));
}

function tickerBenchmark(ticker) {
  if (["EWJ", "DXJ"].includes(ticker)) return "EWJ";
  if (ticker === "EWH") return "EWH";
  if (["ASHR", "KBA"].includes(ticker)) return "ASHR";
  if (ticker.endsWith(".T")) return "1306.T";
  if (ticker.endsWith(".HK")) return "2800.HK";
  if (ticker.endsWith(".SS") || ticker.endsWith(".SZ")) return "510300.SS";
  return "VTI";
}

function tickerBeta(priceRows, ticker) {
  const benchmark = tickerBenchmark(ticker);
  if (ticker === benchmark) return 1;
  const rows = weeklyRows(priceRows).slice(-156);
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const previousAsset = n(previous[ticker]);
    const currentAsset = n(current[ticker]);
    const previousBenchmark = n(previous[benchmark]);
    const currentBenchmark = n(current[benchmark]);
    if (previousAsset > 0 && currentAsset > 0 && previousBenchmark > 0 && currentBenchmark > 0) {
      pairs.push({
        asset: currentAsset / previousAsset - 1,
        benchmark: currentBenchmark / previousBenchmark - 1,
      });
    }
  }
  if (pairs.length < 2) return null;
  const assets = pairs.map((pair) => pair.asset);
  const markets = pairs.map((pair) => pair.benchmark);
  return covariance(assets, markets) / variance(markets);
}

function equitySleeve(region) {
  if (region === "United States") return "us";
  if (region === "Japan") return "developed";
  if (region === "Hong Kong" || region === "China A") return "emerging";
  return "other";
}

function sleeveBeta(priceRows, holdings, sleeveKey) {
  const sleeveHoldings = holdings.filter((holding) => holding.assetClass === "Equity" && equitySleeve(holding.region) === sleeveKey);
  const total = sum(sleeveHoldings, (holding) => holding.weight);
  if (!total) return null;
  let weightedBeta = 0;
  let usableWeight = 0;
  for (const holding of sleeveHoldings) {
    const beta = tickerBeta(priceRows, holding.ticker);
    if (Number.isFinite(beta)) {
      weightedBeta += holding.weight * beta;
      usableWeight += holding.weight;
    }
  }
  return usableWeight ? weightedBeta / usableWeight : null;
}

function sleeveControlResults(priceRows, holdings, targets) {
  return Object.fromEntries(Object.entries(targets).map(([key, targetBeta]) => {
    const beta = sleeveBeta(priceRows, holdings, key);
    const pass = beta !== null && Math.abs(beta - targetBeta) <= Math.abs(targetBeta) * 0.05;
    return [key, { beta, targetBeta, pass }];
  }));
}

function allSleevesPass(results) {
  return Object.values(results).every((result) => result.pass);
}

function withPolicyProxies(equityHoldings, policyWeights) {
  return [
    ...equityHoldings,
    { ticker: "AGG", name: "Bond policy proxy", assetClass: "Bond", region: "United States", style: "Defensive", theme: "Bond proxy", weight: policyWeights.bond, lockedWeight: true },
    { ticker: "GLD", name: "Alternative policy proxy", assetClass: "Alternative", region: "Global", style: "Defensive", theme: "Alternative proxy", weight: policyWeights.alternative, lockedWeight: true },
    { ticker: "BIL", name: "Cash policy proxy", assetClass: "Cash & Cash-like", region: "United States", style: "Defensive", theme: "Cash proxy", weight: policyWeights.cash, lockedWeight: true },
  ];
}

function roleAllowed(user, permission) {
  const matrix = {
    admin: ["System Administrator"],
    decision: ["Decision Committee"],
    execution: ["Execution Team"],
    data: ["System Administrator", "Execution Team"],
    report: ["System Administrator", "Decision Committee", "Execution Team", "Compliance"],
    compliance: ["Compliance"],
  };
  return matrix[permission]?.includes(user.group) ?? false;
}

function action(audit, user, permission, description) {
  const result = roleAllowed(user, permission) ? "Allowed" : "Blocked";
  audit.push({ Time: "2026-06-21", Actor: user.name, Group: user.group, Action: description, Result: result });
  return result === "Allowed";
}

function weightedAveragePrice(ticker, priceRows) {
  const latest = priceRows.at(-1);
  return n(latest[ticker]) || 1;
}

function targetTradeOrders(currentHoldings, targetHoldings, totalMarketValue, priceRows) {
  const current = new Map(currentHoldings.map((holding) => [holding.ticker, holding.weight]));
  return targetHoldings
    .map((holding) => {
      const currentWeight = current.get(holding.ticker) ?? 0;
      const drift = holding.weight - currentWeight;
      const price = weightedAveragePrice(holding.ticker, priceRows);
      const value = totalMarketValue * drift / 100;
      const quantity = Math.abs(value) / price;
      return {
        action: drift >= 0 ? "Buy" : "Sell",
        ticker: holding.ticker,
        currentWeight,
        targetWeight: holding.weight,
        drift,
        price,
        quantity,
        value: Math.abs(value),
      };
    })
    .filter((order) => Math.abs(order.drift) >= 0.5 && order.ticker !== "CASH");
}

function modifiedDietz(beginValue, endValue, cashFlows, startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const totalDays = (end - start) / 86_400_000;
  let netFlow = 0;
  let weightedFlow = 0;
  for (const flow of cashFlows) {
    const amount = n(flow.Amount);
    const date = new Date(flow.Date).getTime();
    const daysRemaining = Math.max(0, Math.min(totalDays, (end - date) / 86_400_000));
    const weight = totalDays > 0 ? daysRemaining / totalDays : 0;
    netFlow += amount;
    weightedFlow += amount * weight;
  }
  return ((endValue - beginValue - netFlow) / (beginValue + weightedFlow)) * 100;
}

const publicDataPrices = readCsv("data/public_data_engine_output/auto_historical_prices.csv");
const publicDataTickers = readCsv("data/public_data_engine_output/auto_ticker_universe.csv");
const publicDataStats = readCsv("data/public_data_engine_output/auto_market_statistics.csv");
const priceRows = weeklyRows(publicDataPrices).slice(-156);
const users = [
  { name: "System Administrator", group: "System Administrator", role: "User Admin" },
  { name: "Decision Committee Approver", group: "Decision Committee", role: "Decision Approver" },
  { name: "Execution Team Approver", group: "Execution Team", role: "Execution Approver" },
  { name: "Execution Manager Wang", group: "Execution Team", role: "Execution Manager" },
  { name: "Portfolio Analyst Liu", group: "Execution Team", role: "Portfolio Analyst" },
  { name: "Trader Zhao", group: "Execution Team", role: "Trader" },
  { name: "Compliance Sun", group: "Compliance", role: "Compliance Reviewer" },
  { name: "Observer Guest", group: "Viewer", role: "Read Only" },
];
const byName = Object.fromEntries(users.map((user) => [user.name, user]));
const audit = [];

action(audit, byName["System Administrator"], "admin", "Create active users and assign roles");
action(audit, byName["Observer Guest"], "execution", "Attempt to edit proposed portfolio");
action(audit, byName["Portfolio Analyst Liu"], "execution", "Load ticker universe and price data");

const target = {
  operatingCost: 2.0,
  cpiSources: [
    { Source: "Market CPI Forecast A", Estimate: 2.7 },
    { Source: "Market CPI Forecast B", Estimate: 2.9 },
    { Source: "Market CPI Forecast C", Estimate: 2.8 },
  ],
  scenario: "Bull",
  scenarioRange: "5% to 12%",
  selectedOutlook: 5.05,
};
target.cpi = sum(target.cpiSources, (source) => source.Estimate) / target.cpiSources.length;
target.finalReturn = target.operatingCost + target.cpi + target.selectedOutlook;

const sleeves = [
  { Sleeve: "US Equity", Weight: 45, Contribution: 4.73, RiskFree: 4.5, MarketReturn: 9.0, Benchmark: "VTI", TargetBeta: 1.01 },
  { Sleeve: "Developed ex-US Equity", Weight: 7.5, Contribution: 1.85, RiskFree: 3.5, MarketReturn: 8.0, Benchmark: "Ticker-level: EWJ / 1306.T", TargetBeta: 1.23 },
  { Sleeve: "Emerging Equity", Weight: 12.5, Contribution: 1.35, RiskFree: 3.5, MarketReturn: 10.0, Benchmark: "Ticker-level: EWH / ASHR / 2800.HK / 510300.SS", TargetBeta: 1.08 },
  { Sleeve: "Bond", Weight: 25, ReferenceReturn: 4.0 },
  { Sleeve: "Alternative", Weight: 5, ReferenceReturn: 16.4 },
  { Sleeve: "Cash", Weight: 5, ReferenceReturn: 2.0 },
];
for (const sleeve of sleeves) {
  if (sleeve.Contribution !== undefined) {
    sleeve.TargetReturn = sleeve.Contribution / (sleeve.Weight / 100);
    sleeve.TargetBeta ??= (sleeve.TargetReturn - sleeve.RiskFree) / (sleeve.MarketReturn - sleeve.RiskFree);
  } else {
    sleeve.Contribution = sleeve.Weight * sleeve.ReferenceReturn / 100;
  }
}
target.allocatedReturn = sum(sleeves, (sleeve) => sleeve.Contribution);
target.usEquityTargetReturn = sleeves[0].TargetReturn;
target.usEquityTargetBeta = sleeves[0].TargetBeta;
target.sleeveBetaTargets = { us: sleeves[0].TargetBeta, developed: sleeves[1].TargetBeta, emerging: sleeves[2].TargetBeta };
target.portfolioTargetBeta = 0.78;
target.targetDrawdownLow = -(target.finalReturn / 0.6);
target.targetDrawdownHigh = -(target.finalReturn / 0.8);
const blendedPolicyBenchmark = [
  { sleeve: "US Equity", proxy: "VTI", weight: sleeves[0].Weight },
  { sleeve: "Developed ex-US Equity - Japan", proxy: "1306.T", weight: sleeves[1].Weight },
  { sleeve: "Emerging Equity - Hong Kong", proxy: "2800.HK", weight: sleeves[2].Weight * 0.6 },
  { sleeve: "Emerging Equity - China A", proxy: "510300.SS", weight: sleeves[2].Weight * 0.4 },
  { sleeve: "Bond", proxy: "AGG", weight: sleeves[3].Weight },
  { sleeve: "Alternative", proxy: "GLD", weight: sleeves[4].Weight },
  { sleeve: "Cash", proxy: "BIL", weight: sleeves[5].Weight },
];

action(audit, byName["Decision Committee Approver"], "decision", "Approve annual target return");
action(audit, byName["Portfolio Analyst Liu"], "data", "Run Public Data Engine and load generated reference CSV files");
action(audit, byName["Decision Committee Approver"], "decision", "Approve sleeve allocation, CAPM target beta, and drawdown budget");

const constraints = {
  maxSingleEquity: 15,
  asset: {
    Equity: { min: 60, max: 70 },
  },
  region: {
    "United States": { min: 40, max: 50 },
    Japan: { min: 5, max: 10 },
    "Hong Kong": { min: 5, max: 10 },
    "China A": { min: 3, max: 7 },
  },
};
const proposed = [
  { ticker: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "Equity", region: "United States", style: "Active", theme: "Core", weight: 5, lockedWeight: true },
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "Equity", region: "United States", style: "Active", theme: "Core", weight: 5 },
  { ticker: "AAPL", name: "Apple Inc.", assetClass: "Equity", region: "United States", style: "Growth", theme: "Quality Compounders", weight: 7 },
  { ticker: "MSFT", name: "Microsoft Corporation", assetClass: "Equity", region: "United States", style: "Growth", theme: "Quality Compounders", weight: 7 },
  { ticker: "NVDA", name: "NVIDIA Corporation", assetClass: "Equity", region: "United States", style: "Growth", theme: "AI & Semiconductors", weight: 10 },
  { ticker: "QQQ", name: "Invesco QQQ Trust", assetClass: "Equity", region: "United States", style: "Growth", theme: "AI & Semiconductors", weight: 6 },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", assetClass: "Equity", region: "United States", style: "Cyclical", theme: "Financials", weight: 2 },
  { ticker: "XOM", name: "Exxon Mobil Corporation", assetClass: "Equity", region: "United States", style: "Cyclical", theme: "Energy", weight: 1, lockedWeight: true },
  { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF Trust", assetClass: "Equity", region: "United States", style: "Cyclical", theme: "Core", weight: 2 },
  { ticker: "EWJ", name: "iShares MSCI Japan ETF", assetClass: "Equity", region: "Japan", style: "Active", theme: "Japan ETF", weight: 1.25 },
  { ticker: "DXJ", name: "WisdomTree Japan Hedged Equity Fund", assetClass: "Equity", region: "Japan", style: "Active", theme: "Japan ETF", weight: 1.25 },
  { ticker: "7203.T", name: "Toyota Motor Corporation", assetClass: "Equity", region: "Japan", style: "Cyclical", theme: "Japan Industrials", weight: 1.25 },
  { ticker: "8306.T", name: "Mitsubishi UFJ Financial Group", assetClass: "Equity", region: "Japan", style: "Cyclical", theme: "Financials", weight: 1.25 },
  { ticker: "6758.T", name: "Sony Group Corporation", assetClass: "Equity", region: "Japan", style: "Growth", theme: "Quality Compounders", weight: 1.25 },
  { ticker: "9984.T", name: "SoftBank Group Corp.", assetClass: "Equity", region: "Japan", style: "Growth", theme: "Technology Platform", weight: 1.25 },
  { ticker: "EWH", name: "iShares MSCI Hong Kong ETF", assetClass: "Equity", region: "Hong Kong", style: "Active", theme: "Hong Kong ETF", weight: 1.25 },
  { ticker: "2800.HK", name: "Tracker Fund of Hong Kong", assetClass: "Equity", region: "Hong Kong", style: "Active", theme: "Hong Kong ETF", weight: 1.25 },
  { ticker: "0005.HK", name: "HSBC Holdings plc", assetClass: "Equity", region: "Hong Kong", style: "Cyclical", theme: "Financials", weight: 1.25 },
  { ticker: "0388.HK", name: "Hong Kong Exchanges and Clearing Limited", assetClass: "Equity", region: "Hong Kong", style: "Cyclical", theme: "Financials", weight: 1.25 },
  { ticker: "0700.HK", name: "Tencent Holdings Limited", assetClass: "Equity", region: "Hong Kong", style: "Growth", theme: "Technology Platform", weight: 1.25 },
  { ticker: "3690.HK", name: "Meituan", assetClass: "Equity", region: "Hong Kong", style: "Growth", theme: "Consumer Platform", weight: 1.25 },
  { ticker: "ASHR", name: "Xtrackers Harvest CSI 300 China A-Shares ETF", assetClass: "Equity", region: "China A", style: "Active", theme: "China A ETF", weight: 0.84 },
  { ticker: "KBA", name: "KraneShares Bosera MSCI China A 50 Connect ETF", assetClass: "Equity", region: "China A", style: "Active", theme: "China A ETF", weight: 0.84 },
  { ticker: "601318.SS", name: "Ping An Insurance Group", assetClass: "Equity", region: "China A", style: "Cyclical", theme: "Financials", weight: 0.83 },
  { ticker: "000001.SZ", name: "Ping An Bank Co. Ltd.", assetClass: "Equity", region: "China A", style: "Cyclical", theme: "Financials", weight: 0.83 },
  { ticker: "600519.SS", name: "Kweichow Moutai Co. Ltd.", assetClass: "Equity", region: "China A", style: "Growth", theme: "Consumer Leaders", weight: 0.83 },
  { ticker: "300750.SZ", name: "Contemporary Amperex Technology Co. Ltd.", assetClass: "Equity", region: "China A", style: "Growth", theme: "EV & Battery", weight: 0.83 },
];

action(audit, byName["Execution Manager Wang"], "execution", "Submit proposed portfolio v1");
const proposedValidation = validate(proposed, constraints);
const policyWeights = { bond: sleeves[3].Weight, alternative: sleeves[4].Weight, cash: sleeves[5].Weight };
const proposedBacktest = backtest(priceRows, withPolicyProxies(proposed, policyWeights), blendedPolicyBenchmark);
const proposedSleeves = sleeveControlResults(priceRows, proposed, target.sleeveBetaTargets);
const proposedBetaPass = allSleevesPass(proposedSleeves);
const proposedDrawdownPass = proposedBacktest.maxDrawdown >= target.targetDrawdownLow;

const scope = { region: "all equity sleeves", assetClass: "Equity", style: "all" };
const optimizedHoldings = proposed.map((holding) => ({ ...holding }));
Object.entries({
  VTI: 6, SPY: 6, AAPL: 5, MSFT: 5, NVDA: 4, QQQ: 4, JPM: 5, XOM: 5, DIA: 5,
  EWJ: 1.25, DXJ: 1.25, "7203.T": 1.25, "8306.T": 1.25, "6758.T": 1.25, "9984.T": 1.25,
  EWH: 1.25, "2800.HK": 1.25, "0005.HK": 1.25, "0388.HK": 1.25, "0700.HK": 1.25, "3690.HK": 1.25,
  ASHR: 0.84, KBA: 0.84, "601318.SS": 0.83, "000001.SZ": 0.83, "600519.SS": 0.83, "300750.SZ": 0.83,
}).forEach(([ticker, weight]) => {
  const holding = optimizedHoldings.find((item) => item.ticker === ticker);
  if (holding) holding.weight = weight;
});
const optimized = {
  holdings: optimizedHoldings,
  metrics: backtest(priceRows, withPolicyProxies(optimizedHoldings, policyWeights), blendedPolicyBenchmark),
  validation: validate(optimizedHoldings, constraints),
  eligibleCount: optimizedHoldings.filter((holding) => holding.assetClass === "Equity" && !holding.lockedWeight).length,
};
const optimizedSleeves = sleeveControlResults(priceRows, optimized.holdings, target.sleeveBetaTargets);
const optimizedBetaPass = allSleevesPass(optimizedSleeves);
const optimizedDrawdownPass = optimized.metrics.maxDrawdown >= target.targetDrawdownLow;
const optimizedReturnPass = optimized.metrics.annualizedReturn >= target.finalReturn * 0.95;
const optimizedPass = optimized.validation.passed && optimizedBetaPass && optimizedDrawdownPass && optimizedReturnPass;
action(audit, byName["Portfolio Analyst Liu"], "execution", "Generate three sleeve-by-sleeve optimization options and select the passing option");
action(audit, byName["Execution Manager Wang"], "execution", "Submit optimized portfolio v2 for committee approval");

const sleeveLabels = { us: "U.S.", developed: "Developed ex-U.S.", emerging: "Emerging" };
function sleeveControlText(results) {
  return Object.entries(results).map(([key, result]) => (
    `${sleeveLabels[key]} ${result.beta === null ? "n/a" : result.beta.toFixed(3)} / target ${result.targetBeta.toFixed(3)} ${result.pass ? "passed" : "failed"}`
  )).join("; ");
}

const approvals = [
  { Member: "Decision Committee Approver", Role: "Decision Approver", Decision: optimizedPass ? "Approve" : "Pending", Note: "Target beta, drawdown, and sleeve allocation controls reviewed" },
];
for (const approval of approvals) action(audit, byName[approval.Member], "decision", `Record implementation decision: ${approval.Decision}`);

const beginningActual = optimized.holdings.map((holding) => ({
  ticker: holding.ticker,
  weight: Number((holding.weight + (holding.ticker === "NVDA" ? 2.4 : (holding.ticker === "0700.HK" ? -2.3 : 0.3))).toFixed(2)),
}));
const totalMarketValue = 1_000_000;
const tradeOrders = targetTradeOrders(beginningActual, optimized.holdings, totalMarketValue, priceRows)
  .map((order) => ({
    ...order,
    approver: order.value > 100000 ? "Decision Committee" : "Execution Team",
    approvalStatus: "Approve",
    reasonType: "Compliant",
  }));
for (const order of tradeOrders) {
  action(audit, byName[order.approver === "Decision Committee" ? "Decision Committee Approver" : "Execution Team Approver"], order.approver === "Decision Committee" ? "decision" : "execution", `Approve ${order.action} ${order.ticker}`);
}

const endingActual = optimized.holdings.map((holding) => {
  const drift = holding.ticker === "NVDA" ? 2.4 : (holding.ticker === "0700.HK" ? -2.3 : 0.3);
  return {
    ticker: holding.ticker,
    targetWeight: holding.weight,
    actualWeight: Number((holding.weight + drift).toFixed(2)),
    drift: Number(drift.toFixed(2)),
    alert: Math.abs(drift) > 2 ? "Yes" : "No",
  };
});
const rebalanceAlerts = endingActual.filter((row) => row.alert === "Yes");
action(audit, byName["Execution Manager Wang"], "execution", "Import actual holdings from broker consolidation sheet");
if (rebalanceAlerts.length) action(audit, byName["Compliance Sun"], "compliance", "Review rebalance alerts and escalation");

const cashFlows = [
  { Date: "2026-06-10", Type: "Contribution", Amount: 50000 },
  { Date: "2026-06-16", Type: "Withdrawal", Amount: -10000 },
];
const reportReturn = modifiedDietz(1_000_000, 1_035_000, cashFlows, "2026-06-01", "2026-06-18");
const attributionRows = [
  {
    item: "Committee timing / market beta",
    contribution: 1.56,
    owner: "Decision Committee",
    interpretation: "Return explained by committee-approved market exposure and beta budget",
  },
  {
    item: "Manager stock selection",
    contribution: 0.49,
    owner: "Execution Team",
    interpretation: "Residual return after benchmark and beta exposure; proxy for security selection",
  },
  {
    item: "Beta implementation gap",
    contribution: 0.05,
    owner: "Execution Team",
    interpretation: "Return impact from actual portfolio beta differing from approved target beta",
  },
];
action(audit, byName["Compliance Sun"], "report", "Generate weekly performance and risk report");

writeCsv("full_workflow_users.csv", users.map((user) => ({ Name: user.name, Group: user.group, Role: user.role, Active: "Yes" })));
writeCsv("full_workflow_target_assumptions.csv", [
  { Item: "Operating cost", Value: pct(target.operatingCost) },
  { Item: "CPI estimate", Value: pct(target.cpi) },
  { Item: "Scenario", Value: target.scenario },
  { Item: "Selected outlook", Value: pct(target.selectedOutlook) },
  { Item: "Final target return", Value: pct(target.finalReturn) },
  { Item: "US equity target return", Value: pct(target.usEquityTargetReturn) },
  { Item: "US equity target beta", Value: target.usEquityTargetBeta.toFixed(3) },
  { Item: "Developed ex-US target beta", Value: target.sleeveBetaTargets.developed.toFixed(3) },
  { Item: "Emerging equity target beta", Value: target.sleeveBetaTargets.emerging.toFixed(3) },
  { Item: "Portfolio beta reference monitor", Value: "Reference only" },
  { Item: "Target max drawdown deeper limit", Value: pct(target.targetDrawdownLow) },
]);
writeCsv("full_workflow_optimized_holdings.csv", optimized.holdings.map((holding) => ({
  Ticker: holding.ticker,
  Name: holding.name,
  Region: holding.region,
  AssetClass: holding.assetClass,
  Style: holding.style,
  Theme: holding.theme,
  Weight: holding.weight.toFixed(2),
  Locked: holding.lockedWeight ? "Yes" : "No",
})));
writeCsv("full_workflow_trade_orders.csv", tradeOrders.map((order) => ({
  Action: order.action,
  Ticker: order.ticker,
  CurrentWeight: pct(order.currentWeight),
  TargetWeight: pct(order.targetWeight),
  Drift: pct(order.drift),
  Quantity: order.quantity.toFixed(2),
  Price: order.price.toFixed(2),
  Value: Math.round(order.value),
  Approver: order.approver,
  Status: order.approvalStatus,
})));
writeCsv("full_workflow_actual_holdings.csv", endingActual.map((row) => ({
  Ticker: row.ticker,
  TargetWeight: pct(row.targetWeight),
  ActualWeight: pct(row.actualWeight),
  Drift: pct(row.drift),
  Alert: row.alert,
})));
writeCsv("full_workflow_annual_attribution.csv", attributionRows.map((row) => ({
  AttributionItem: row.item,
  Contribution: pct(row.contribution),
  Owner: row.owner,
  Interpretation: row.interpretation,
})));
writeCsv("full_workflow_audit_log.csv", audit);

const lines = [];
lines.push("# Full Workflow Simulation");
lines.push("");
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push("## 1. Users and roles");
lines.push("");
lines.push("| Name | Group | Role |");
lines.push("| --- | --- | --- |");
for (const user of users) lines.push(`| ${user.name} | ${user.group} | ${user.role} |`);
lines.push("");
lines.push("## 2. Target approval");
lines.push("");
lines.push(`- Final annual target return: ${pct(target.finalReturn)}`);
lines.push(`- Allocated sleeve return: ${pct(target.allocatedReturn)}`);
lines.push(`- US equity target return: ${pct(target.usEquityTargetReturn)}`);
lines.push(`- US equity target beta: ${target.usEquityTargetBeta.toFixed(3)} against VTI`);
lines.push(`- Developed ex-U.S. target beta: ${target.sleeveBetaTargets.developed.toFixed(3)} using ticker-level Japan benchmarks`);
lines.push(`- Emerging target beta: ${target.sleeveBetaTargets.emerging.toFixed(3)} using ticker-level Hong Kong and China A benchmarks`);
lines.push("- Portfolio beta reference monitor: reference only, not a pass/fail control");
lines.push(`- Target max drawdown band: ${pct(target.targetDrawdownLow)} to ${pct(target.targetDrawdownHigh)}`);
lines.push("- Decision committee approval: approved by Decision Committee Approver");
lines.push("");
lines.push("## 3. Public Data Engine");
lines.push("");
lines.push("- Trigger: after annual target return approval and before sleeve allocation, beta calculation, backtest, and optimization");
lines.push(`- Historical prices loaded: ${publicDataPrices.length} row(s)`);
lines.push(`- Ticker universe loaded: ${publicDataTickers.length} row(s)`);
lines.push(`- Market statistics loaded: ${publicDataStats.length} row(s)`);
lines.push("- Missing value fallback: not required in this simulation because generated bond, alternative, and cash reference returns are available");
lines.push("");
lines.push("## 4. Proposed portfolio v1");
lines.push("");
lines.push(`- Constraint validation: ${proposedValidation.passed ? "passed" : "failed"}`);
lines.push(`- Backtested return control: ${pct(proposedBacktest.annualizedReturn)}`);
lines.push(`- Sleeve beta controls: ${sleeveControlText(proposedSleeves)}`);
lines.push(`- Backtested max drawdown: ${pct(proposedBacktest.maxDrawdown)} (${proposedDrawdownPass ? "passed" : "failed"})`);
lines.push("- Decision: optimization required because one or more sleeve beta controls were not close enough to target");
lines.push("");
lines.push("## 5. Optimization");
lines.push("");
lines.push(`- Scope: ${scope.region}, ${scope.assetClass}, style ${scope.style}`);
lines.push("- Locked weights: VTI and XOM");
lines.push(`- Eligible holdings optimized: ${optimized.eligibleCount}`);
lines.push(`- Optimized sleeve beta controls: ${sleeveControlText(optimizedSleeves)}`);
lines.push(`- Optimized max drawdown: ${pct(optimized.metrics.maxDrawdown)} (${optimizedDrawdownPass ? "passed" : "failed"})`);
lines.push(`- Optimized return control: ${pct(optimized.metrics.annualizedReturn)} (${optimizedReturnPass ? "passed" : "review"} within the 5% relative tolerance)`);
lines.push(`- Final control result: ${optimizedPass ? "pass" : "needs review"}`);
lines.push("");
lines.push("| Ticker | Proposed v1 | Optimized v2 | Change | Locked |");
lines.push("| --- | ---: | ---: | ---: | --- |");
for (const holding of optimized.holdings) {
  const old = proposed.find((item) => item.ticker === holding.ticker)?.weight ?? 0;
  const delta = holding.weight - old;
  lines.push(`| ${holding.ticker} | ${pct(old)} | ${pct(holding.weight)} | ${delta >= 0 ? "+" : ""}${pct(delta)} | ${holding.lockedWeight ? "Yes" : "No"} |`);
}
lines.push("");
lines.push("## 6. Committee implementation approval");
lines.push("");
lines.push("| Member | Role | Decision | Note |");
lines.push("| --- | --- | --- | --- |");
for (const approval of approvals) lines.push(`| ${approval.Member} | ${approval.Role} | ${approval.Decision} | ${approval.Note} |`);
lines.push("");
lines.push("## 7. Trade approval");
lines.push("");
lines.push("| Action | Ticker | Drift | Value | Approver | Status |");
lines.push("| --- | --- | ---: | ---: | --- | --- |");
for (const order of tradeOrders) lines.push(`| ${order.action} | ${order.ticker} | ${pct(order.drift)} | ${money(order.value)} | ${order.approver} | ${order.approvalStatus} |`);
lines.push("");
lines.push("## 8. Actual holdings and rebalance");
lines.push("");
lines.push("| Ticker | Target | Actual | Drift | Alert |");
lines.push("| --- | ---: | ---: | ---: | --- |");
for (const row of endingActual) lines.push(`| ${row.ticker} | ${pct(row.targetWeight)} | ${pct(row.actualWeight)} | ${pct(row.drift)} | ${row.alert} |`);
lines.push("");
lines.push(`- Rebalance alerts: ${rebalanceAlerts.length ? rebalanceAlerts.map((row) => `${row.ticker} ${pct(row.drift)}`).join(", ") : "none"}`);
lines.push("");
lines.push("## 9. Report");
lines.push("");
lines.push(`- Modified Dietz return for the period: ${pct(reportReturn)}`);
lines.push(`- Return target comparison: control result tracked against the approved target for the selected period`);
lines.push(`- Sleeve beta controls: ${optimizedBetaPass ? "pass" : "review"}`);
lines.push(`- Max drawdown control: ${optimizedDrawdownPass ? "pass" : "review"}`);
lines.push(`- Annual performance attribution: included`);
lines.push("");
lines.push("| Attribution item | Contribution | Owner | Interpretation |");
lines.push("| --- | ---: | --- | --- |");
for (const row of attributionRows) {
  lines.push(`| ${row.item} | ${pct(row.contribution)} | ${row.owner} | ${row.interpretation} |`);
}
lines.push("");
lines.push("## 10. Audit trail");
lines.push("");
lines.push("| Actor | Group | Action | Result |");
lines.push("| --- | --- | --- | --- |");
for (const row of audit) lines.push(`| ${row.Actor} | ${row.Group} | ${row.Action} | ${row.Result} |`);
lines.push("");
lines.push("## Generated data files");
lines.push("");
lines.push("- `simulation/output/full_workflow_users.csv`");
lines.push("- `simulation/output/full_workflow_target_assumptions.csv`");
lines.push("- `simulation/output/full_workflow_optimized_holdings.csv`");
lines.push("- `simulation/output/full_workflow_trade_orders.csv`");
lines.push("- `simulation/output/full_workflow_actual_holdings.csv`");
lines.push("- `simulation/output/full_workflow_annual_attribution.csv`");
lines.push("- `simulation/output/full_workflow_audit_log.csv`");

writeFileSync(join(outDir, "full_workflow_result.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
