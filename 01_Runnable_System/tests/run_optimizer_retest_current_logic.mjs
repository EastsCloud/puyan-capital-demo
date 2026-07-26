import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pricePath = join(root, "data", "public_data_engine_output", "auto_historical_prices.csv");
const universePath = join(root, "data", "public_data_engine_output", "auto_ticker_universe.csv");
const marketStatsPath = join(root, "data", "public_data_engine_output", "auto_market_statistics.csv");
const dbPath = join(root, "server", "data", "db.json");

const settings = {
  scenario: "balanced",
  marketBenchmark: "VTI",
  riskFreeRate: 4.5,
  targetReturnIsFloor: true,
  riskFreeRates: {
    us: 4.5,
    developed: 0.5,
    hongkong: 4.2,
    chinaa: 1.8,
  },
  usCma: 8,
  lookbackMonths: 36,
  frequency: "weekly",
  drawdownRatioLow: 0.6,
  drawdownRatioHigh: 0.8,
  betaRelativeTolerance: 0.05,
  returnShortfallTolerance: 0.05,
  returnExcessReviewTolerance: 0.5,
  drawdownExcessTolerance: 0.1,
  maxSingleSecuritySleeveShare: 0.35,
  betaReasonableFloor: 0.5,
  minimumPositiveExcessReturn: 0.5,
  minimumPositiveMarketRiskPremium: 0.5,
};

const defaultAllocation = {
  balanced: {
    assets: {
      equity: { label: "Equity", range: [45, 65], weight: 55, return: 6.7, volatility: 15.5, drawdown: -19.0 },
      bond: { label: "Bond", range: [20, 35], weight: 25, return: 3.6, volatility: 5.2, drawdown: -6.5 },
      alternative: { label: "Alternative", range: [8, 18], weight: 12, return: 4.6, volatility: 11.0, drawdown: -13.0 },
      cash: { label: "Cash & cash-like", range: [5, 15], weight: 8, return: 2.4, volatility: 0.7, drawdown: -0.2 },
    },
    regions: {
      us: { label: "U.S. equity", share: 60, return: 7.5, volatility: 16.0, drawdown: -19.0 },
      developed: { label: "Developed ex-U.S. equity", share: 15, return: 5.8, volatility: 15.5, drawdown: -19.0 },
      emerging: { label: "Emerging markets equity", share: 25, return: 6.44, volatility: 21.5, drawdown: -22.0 },
    },
  },
};

const holdings = [
  { region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core", symbol: "VTI", weight: 6, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Active", theme: "Core", symbol: "SPY", weight: 6, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "AAPL", weight: 5, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "MSFT", weight: 5, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors", symbol: "NVDA", weight: 4, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Growth", theme: "AI & Semiconductors", symbol: "QQQ", weight: 4, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "JPM", weight: 5, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "XOM", weight: 5, lockedWeight: false },
  { region: "United States", assetClass: "Equity", styleFactor: "Cyclical", theme: "Value & Cyclical", symbol: "DIA", weight: 5, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF", symbol: "EWJ", weight: 1.25, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Active", theme: "Japan ETF", symbol: "DXJ", weight: 1.25, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Japan Industrials", symbol: "7203.T", weight: 1.25, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "8306.T", weight: 1.25, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Quality Compounders", symbol: "6758.T", weight: 1.25, lockedWeight: false },
  { region: "Japan", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform", symbol: "9984.T", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF", symbol: "EWH", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Active", theme: "Hong Kong ETF", symbol: "2800.HK", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "0005.HK", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "0388.HK", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Technology Platform", symbol: "0700.HK", weight: 1.25, lockedWeight: false },
  { region: "Hong Kong", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Platform", symbol: "3690.HK", weight: 1.25, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF", symbol: "ASHR", weight: 0.84, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Active", theme: "China A ETF", symbol: "KBA", weight: 0.84, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "601318.SS", weight: 0.83, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Cyclical", theme: "Financials", symbol: "000001.SZ", weight: 0.83, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "Consumer Leaders", symbol: "600519.SS", weight: 0.83, lockedWeight: false },
  { region: "China A", assetClass: "Equity", styleFactor: "Growth", theme: "EV & Battery", symbol: "300750.SZ", weight: 0.83, lockedWeight: false },
];

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function parseCsvObjects(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parsePrices(text) {
  return parseCsvObjects(text).map((record) => {
    const row = { date: new Date(`${record.Date}T00:00:00Z`) };
    Object.entries(record).forEach(([key, value]) => {
      if (key === "Date") return;
      const number = Number.parseFloat(value);
      if (Number.isFinite(number)) row[key.toUpperCase()] = number;
    });
    return row;
  }).filter((row) => !Number.isNaN(row.date.getTime())).sort((left, right) => left.date - right.date);
}

function parseUniverse(text) {
  return parseCsvObjects(text).map((record) => ({
    ticker: String(record.Ticker || "").trim().toUpperCase(),
    name: record.Name || "",
    market: record.Market || "",
    region: record.Region || "United States",
    assetClass: record.AssetClass || "Equity",
    styleFactor: record.StyleFactor || "Active",
    theme: record.Theme || "Core",
  })).filter((record) => record.ticker);
}

function parseMarketStats(text) {
  const scenarioMap = { Bull: "bull", Balanced: "balanced", Bear: "bear" };
  const result = {};
  parseCsvObjects(text).forEach((record) => {
    const key = scenarioMap[record.Scenario];
    if (!key) return;
    if (!result[key]) result[key] = { note: record["Scenario Note"], assets: {}, regions: {} };
    const row = {
      label: record["Sleeve Label"],
      return: Number.parseFloat(record["Historical Return"]),
      volatility: Number.parseFloat(record.Volatility),
      drawdown: Number.parseFloat(record["Max Drawdown"]),
      range: [Number.parseFloat(record["Suggested Low"]), Number.parseFloat(record["Suggested High"])],
      weight: Number.parseFloat(record["Suggested Weight"]),
      share: Number.parseFloat(record["Equity Share"]),
      correlation: record["Correlation Note"],
    };
    if (record["Row Type"] === "Asset") result[key].assets[record["Sleeve Key"]] = row;
    if (record["Row Type"] === "Region") result[key].regions[record["Sleeve Key"]] = row;
  });
  return result;
}

function regionKey(region) {
  const normalized = String(region || "").toLowerCase();
  if (normalized.includes("united") || normalized === "us") return "us";
  if (normalized.includes("japan")) return "japan";
  if (normalized.includes("hong")) return "hongkong";
  if (normalized.includes("china")) return "chinaa";
  return normalized.replace(/[^a-z0-9]/g, "");
}

function equitySleeveKey(region) {
  const key = regionKey(region);
  if (key === "us") return "us";
  if (key === "japan") return "developed";
  if (key === "hongkong" || key === "chinaa") return "emerging";
  return key;
}

function periodKey(date) {
  const weekStart = new Date(date);
  weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return weekStart.toISOString().slice(0, 10);
}

function filterLookback(rows) {
  const endDate = rows[rows.length - 1].date;
  const startDate = new Date(endDate);
  startDate.setUTCMonth(startDate.getUTCMonth() - settings.lookbackMonths);
  return rows.filter((row) => row.date >= startDate);
}

function resampleRows(rows) {
  const byPeriod = new Map();
  rows.forEach((row) => byPeriod.set(periodKey(row.date), row));
  return [...byPeriod.values()].sort((left, right) => left.date - right.date);
}

function periodsPerYear() {
  return settings.frequency === "daily" ? 252 : (settings.frequency === "monthly" ? 12 : 52);
}

function annualizedReturnFromReturns(returns) {
  if (!returns.length) return null;
  const cumulative = returns.reduce((value, periodReturn) => value * (1 + periodReturn), 1);
  return (cumulative ** (periodsPerYear() / returns.length) - 1) * 100;
}

function maxDrawdownFromReturns(returns) {
  if (!returns.length) return null;
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  returns.forEach((periodReturn) => {
    value *= 1 + periodReturn;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  });
  return maxDrawdown * 100;
}

function returnPairs(rows, symbol, benchmark) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous[symbol] > 0 && current[symbol] > 0 && previous[benchmark] > 0 && current[benchmark] > 0) {
      pairs.push({
        asset: current[symbol] / previous[symbol] - 1,
        benchmark: current[benchmark] / previous[benchmark] - 1,
      });
    }
  }
  return pairs;
}

function betaFromPairs(pairs) {
  if (pairs.length < 2) return null;
  const assetMean = pairs.reduce((sum, pair) => sum + pair.asset, 0) / pairs.length;
  const benchmarkMean = pairs.reduce((sum, pair) => sum + pair.benchmark, 0) / pairs.length;
  const covariance = pairs.reduce((sum, pair) => sum + (pair.asset - assetMean) * (pair.benchmark - benchmarkMean), 0);
  const variance = pairs.reduce((sum, pair) => sum + (pair.benchmark - benchmarkMean) ** 2, 0);
  return variance ? covariance / variance : null;
}

function createRandom(seed = 20260714) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function tickerMap(universe) {
  return new Map(universe.map((record) => [record.ticker, record]));
}

function benchmarkForRecord(record, fallbackRegion = "") {
  const key = regionKey(record?.region || fallbackRegion);
  const market = String(record?.market || "").trim().toLowerCase();
  if (key === "us") return settings.marketBenchmark;
  if (market === "us etf") {
    if (key === "japan") return "EWJ";
    if (key === "hongkong") return "EWH";
    if (key === "chinaa") return "ASHR";
  }
  if (key === "japan") return "1306.T";
  if (key === "hongkong") return "2800.HK";
  if (key === "chinaa") return "510300.SS";
  return "";
}

function sleeveDefinitions() {
  return [
    { key: "us", label: "U.S. equity", benchmarkProxies: [{ symbol: settings.marketBenchmark, weight: 1 }] },
    { key: "developed", label: "Developed ex-U.S. equity", benchmarkProxies: [{ symbol: "1306.T", weight: 1 }] },
    { key: "emerging", label: "Emerging markets equity", benchmarkProxies: [{ symbol: "2800.HK", weight: 0.6 }, { symbol: "510300.SS", weight: 0.4 }] },
  ];
}

function holdingMatchesSleeve(holding, definition) {
  return holding.assetClass === "Equity" && equitySleeveKey(holding.region) === definition.key;
}

function sleeveBenchmarkReturn(definition, previous, current) {
  let weighted = 0;
  let usable = 0;
  definition.benchmarkProxies.forEach((proxy) => {
    if (previous[proxy.symbol] > 0 && current[proxy.symbol] > 0) {
      weighted += proxy.weight * (current[proxy.symbol] / previous[proxy.symbol] - 1);
      usable += proxy.weight;
    }
  });
  return usable > 0 ? weighted / usable : null;
}

function sleeveReturnPairs(rows, definition, weights, activeHoldings) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let sleeveReturn = 0;
    let usable = 0;
    activeHoldings.forEach((holding, holdingIndex) => {
      if (!holdingMatchesSleeve(holding, definition)) return;
      const symbol = holding.symbol.toUpperCase();
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previous[symbol] > 0 && current[symbol] > 0 && weight > 0) {
        sleeveReturn += weight * (current[symbol] / previous[symbol] - 1);
        usable += weight;
      }
    });
    const benchmark = sleeveBenchmarkReturn(definition, previous, current);
    if (usable > 0 && benchmark !== null) pairs.push({ asset: sleeveReturn / usable, benchmark });
  }
  return pairs;
}

function tickerBeta(symbol, region, rows, universeByTicker) {
  const normalized = symbol.toUpperCase();
  const record = universeByTicker.get(normalized);
  const benchmark = benchmarkForRecord(record, region);
  if (!benchmark) return null;
  if (normalized === benchmark) return 1;
  return betaFromPairs(returnPairs(rows, normalized, benchmark));
}

function sleeveWeightedBeta(rows, definition, weights, activeHoldings, universeByTicker) {
  let weighted = 0;
  let usable = 0;
  activeHoldings.forEach((holding, index) => {
    if (!holdingMatchesSleeve(holding, definition)) return;
    const weight = Number(weights[index] || 0);
    if (weight <= 0) return;
    const beta = tickerBeta(holding.symbol, holding.region, rows, universeByTicker);
    if (!Number.isFinite(beta)) return;
    weighted += weight * beta;
    usable += weight;
  });
  return usable > 0 ? weighted / usable : null;
}

function capmTargetBeta(targetReturn, cma, riskFreeRate) {
  const rawExcessReturn = targetReturn - riskFreeRate;
  const rawMarketPremium = cma - riskFreeRate;
  const targetReturnForCapm = rawExcessReturn <= 0
    ? riskFreeRate + settings.minimumPositiveExcessReturn
    : targetReturn;
  const cmaForCapm = rawMarketPremium < settings.minimumPositiveMarketRiskPremium
    ? riskFreeRate + settings.minimumPositiveMarketRiskPremium
    : cma;
  const beta = (targetReturnForCapm - riskFreeRate) / (cmaForCapm - riskFreeRate);
  return {
    beta,
    betaControlActive: beta >= settings.betaReasonableFloor,
    targetReturnForCapm,
    cmaForCapm,
    riskFreeRate,
    adjustedForNegativeExcess: rawExcessReturn <= 0,
    adjustedForLowMarketPremium: rawMarketPremium < settings.minimumPositiveMarketRiskPremium,
    belowReasonableFloor: beta < settings.betaReasonableFloor,
  };
}

function returnStatus(actual, target) {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) return { label: "No data", hardPass: false, review: false };
  const floor = target - Math.max(Math.abs(target), 0.000001) * settings.returnShortfallTolerance;
  const reviewCeiling = target + Math.max(Math.abs(target), 0.000001) * settings.returnExcessReviewTolerance;
  if (actual < floor - 0.000001) return { label: "Fail", hardPass: false, review: false, floor, reviewCeiling };
  if (actual > reviewCeiling + 0.000001) return { label: "Review", hardPass: true, review: true, floor, reviewCeiling };
  return { label: "Pass", hardPass: true, review: false, floor, reviewCeiling };
}

function betaPass(actual, target, active = true) {
  if (!active) return true;
  return Number.isFinite(actual) && Number.isFinite(target)
    && Math.abs(actual - target) <= Math.abs(target) * settings.betaRelativeTolerance + 0.000001;
}

function drawdownPass(actual, band) {
  return Number.isFinite(actual) && band
    && Math.abs(actual) <= Math.abs(band.low) * (1 + settings.drawdownExcessTolerance) + 0.000001;
}

function recommendedBaselineReturn(recommendation) {
  const equityWeight = recommendation.assets.equity.weight;
  const equityContribution = Object.values(recommendation.regions).reduce((sum, region) => (
    sum + (equityWeight * region.share / 100 / 100) * region.return
  ), 0);
  return equityContribution
    + (recommendation.assets.bond.weight / 100) * recommendation.assets.bond.return
    + (recommendation.assets.alternative.weight / 100) * recommendation.assets.alternative.return
    + (recommendation.assets.cash.weight / 100) * recommendation.assets.cash.return;
}

function targetPackageFinalReturn() {
  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  const approved = (db.targetPackages || [])
    .filter((item) => item.status === "Approved" && Number.isFinite(Number(item.finalTargetReturn)))
    .sort((left, right) => new Date(right.approvedAt || right.createdAt) - new Date(left.approvedAt || left.createdAt))[0];
  return approved ? Number(approved.finalTargetReturn) : 6.833333333333334;
}

function createTargetModel(finalTargetReturn, recommendation) {
  const equityWeight = recommendation.assets.equity.weight;
  const sleeveWeights = Object.fromEntries(["us", "developed", "emerging"].map((key) => [
    key,
    equityWeight * recommendation.regions[key].share / 100,
  ]));
  const baselineReturn = recommendedBaselineReturn(recommendation);
  const rawTargetGap = finalTargetReturn - baselineReturn;
  const targetGap = settings.targetReturnIsFloor ? Math.max(0, rawTargetGap) : rawTargetGap;
  const expectedBuffer = settings.targetReturnIsFloor ? Math.max(0, baselineReturn - finalTargetReturn) : 0;
  const equityGapBase = Math.max(Object.values(sleeveWeights).reduce((sum, value) => sum + value, 0), 0.01);
  const contributions = Object.fromEntries(["us", "developed", "emerging"].map((key) => {
    const weight = sleeveWeights[key];
    return [key, (weight / 100) * recommendation.regions[key].return + targetGap * (weight / equityGapBase)];
  }));
  const targets = {
    us: {
      weight: sleeveWeights.us,
      targetReturn: contributions.us / (sleeveWeights.us / 100),
      cma: recommendation.regions.us.return,
      riskFreeRate: settings.riskFreeRates.us,
    },
    developed: {
      weight: sleeveWeights.developed,
      targetReturn: contributions.developed / (sleeveWeights.developed / 100),
      cma: recommendation.regions.developed.return,
      riskFreeRate: settings.riskFreeRates.developed,
    },
    emerging: {
      weight: sleeveWeights.emerging,
      targetReturn: contributions.emerging / (sleeveWeights.emerging / 100),
      cma: recommendation.regions.emerging.return,
      riskFreeRate: (settings.riskFreeRates.hongkong * 0.6) + (settings.riskFreeRates.chinaa * 0.4),
    },
  };
  Object.values(targets).forEach((target) => {
    target.capm = capmTargetBeta(target.targetReturn, target.cma, target.riskFreeRate);
    target.beta = target.capm.beta;
    target.betaControlActive = target.capm.betaControlActive;
  });
  const equityTargetReturn = Object.values(targets).reduce((sum, target) => sum + target.weight * target.targetReturn, 0)
    / Object.values(targets).reduce((sum, target) => sum + target.weight, 0);
  const band = {
    low: -(equityTargetReturn / settings.drawdownRatioLow),
    high: -(equityTargetReturn / settings.drawdownRatioHigh),
  };
  const riskInputs = Object.entries(targets).map(([key, target]) => {
    const region = recommendation.regions[key];
    return {
      key,
      share: target.weight / Object.values(targets).reduce((sum, item) => sum + item.weight, 0),
      volatility: region.volatility || 15,
      historicalDrawdown: Number.isFinite(region.drawdown) && region.drawdown < 0 ? Math.abs(region.drawdown) : (region.volatility || 15) * 1.35,
    };
  });
  const averageVolatility = riskInputs.reduce((sum, item) => sum + item.share * item.volatility, 0) || 1;
  const averageDrawdown = riskInputs.reduce((sum, item) => sum + item.share * item.historicalDrawdown, 0) || 1;
  riskInputs.forEach((item) => {
    const riskFactor = Math.min(1.35, Math.max(0.75, (item.volatility / averageVolatility) * 0.6 + (item.historicalDrawdown / averageDrawdown) * 0.4));
    targets[item.key].drawdownBand = { low: band.low * riskFactor, high: band.high * riskFactor, riskFactor };
  });
  return { finalTargetReturn, baselineReturn, rawTargetGap, targetGap, expectedBuffer, equityTargetReturn, drawdownBand: band, sleeves: targets };
}

function portfolioPairs(rows, weights, activeHoldings) {
  const pairs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    let portfolioReturn = 0;
    let usable = 0;
    activeHoldings.forEach((holding, holdingIndex) => {
      if (holding.assetClass !== "Equity") return;
      const symbol = holding.symbol.toUpperCase();
      const weight = Number(weights[holdingIndex] || 0) / 100;
      if (previous[symbol] > 0 && current[symbol] > 0 && weight > 0) {
        portfolioReturn += weight * (current[symbol] / previous[symbol] - 1);
        usable += weight;
      }
    });
    if (usable > 0) pairs.push({ asset: portfolioReturn / usable });
  }
  return pairs;
}

function proposedEquityTargetReturn(activeHoldings, targetModel) {
  let weighted = 0;
  let usable = 0;
  sleeveDefinitions().forEach((definition) => {
    const target = targetModel.sleeves[definition.key];
    const proposedWeight = activeHoldings
      .filter((holding) => holdingMatchesSleeve(holding, definition))
      .reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
    if (proposedWeight > 0 && Number.isFinite(target.targetReturn)) {
      weighted += proposedWeight * target.targetReturn;
      usable += proposedWeight;
    }
  });
  return usable > 0 ? weighted / usable : null;
}

function metricsForWeights(rows, weights, activeHoldings, targetModel, universeByTicker) {
  const definitions = sleeveDefinitions();
  const sleeves = Object.fromEntries(definitions.map((definition) => {
    const target = targetModel.sleeves[definition.key];
    const pairs = sleeveReturnPairs(rows, definition, weights, activeHoldings);
    const returns = pairs.map((pair) => pair.asset);
    const annualizedReturn = annualizedReturnFromReturns(returns);
    const maxDrawdown = maxDrawdownFromReturns(returns);
    const beta = sleeveWeightedBeta(rows, definition, weights, activeHoldings, universeByTicker);
    const rStatus = returnStatus(annualizedReturn, target.targetReturn);
    return [definition.key, {
      label: definition.label,
      targetReturn: target.targetReturn,
      targetBeta: target.beta,
      drawdownBand: target.drawdownBand,
      annualizedReturn,
      maxDrawdown,
      beta,
      returnPass: rStatus.hardPass,
      returnReview: rStatus.review,
      returnStatus: rStatus.label,
      betaControlActive: target.betaControlActive,
      betaPass: betaPass(beta, target.beta, target.betaControlActive),
      drawdownPass: drawdownPass(maxDrawdown, target.drawdownBand),
      periods: pairs.length,
    }];
  }));
  const pairs = portfolioPairs(rows, weights, activeHoldings);
  const returns = pairs.map((pair) => pair.asset);
  const targetReturn = proposedEquityTargetReturn(activeHoldings, targetModel);
  return {
    annualizedReturn: annualizedReturnFromReturns(returns),
    maxDrawdown: maxDrawdownFromReturns(returns),
    targetReturn,
    periods: pairs.length,
    sleeves,
  };
}

function controlStatus(metrics, targetModel) {
  const rStatus = returnStatus(metrics.annualizedReturn, metrics.targetReturn);
  const sleeveResults = Object.values(metrics.sleeves);
  const sleeveControlPass = sleeveResults.every((sleeve) => sleeve.returnPass && sleeve.betaPass && sleeve.drawdownPass);
  const returnReview = rStatus.review || sleeveResults.some((sleeve) => sleeve.returnReview);
  return {
    returnPass: rStatus.hardPass,
    returnReview,
    returnStatus: rStatus.label,
    drawdownPass: drawdownPass(metrics.maxDrawdown, targetModel.drawdownBand),
    sleeveControlPass,
    sleeveBetaPass: sleeveResults.every((sleeve) => sleeve.betaPass),
    hardPass: rStatus.hardPass && drawdownPass(metrics.maxDrawdown, targetModel.drawdownBand) && sleeveControlPass,
    cleanPass: rStatus.hardPass && drawdownPass(metrics.maxDrawdown, targetModel.drawdownBand) && sleeveControlPass && !returnReview,
  };
}

function scoreMetrics(metrics, targetModel) {
  if (!metrics || !Number.isFinite(metrics.annualizedReturn) || !Number.isFinite(metrics.maxDrawdown)) return Infinity;
  const controls = controlStatus(metrics, targetModel);
  let score = controls.hardPass ? 0 : 1_000_000;
  const portfolioStatus = returnStatus(metrics.annualizedReturn, metrics.targetReturn);
  score += Math.max(0, (portfolioStatus.floor ?? 0) - metrics.annualizedReturn) ** 2 * 18;
  score += Math.max(0, Math.abs(metrics.maxDrawdown) - Math.abs(targetModel.drawdownBand.low) * (1 + settings.drawdownExcessTolerance)) ** 2 * 20;
  Object.values(metrics.sleeves).forEach((sleeve) => {
    const sleeveReturn = returnStatus(sleeve.annualizedReturn, sleeve.targetReturn);
    score += Math.max(0, (sleeveReturn.floor ?? 0) - sleeve.annualizedReturn) ** 2 * 18;
    score += Math.max(0, Math.abs(sleeve.beta - sleeve.targetBeta) - Math.abs(sleeve.targetBeta) * settings.betaRelativeTolerance) ** 2 * 1400;
    score += Math.max(0, Math.abs(sleeve.maxDrawdown) - Math.abs(sleeve.drawdownBand.low) * (1 + settings.drawdownExcessTolerance)) ** 2 * 20;
    score += (sleeve.returnReview ? 0.3 : 0);
  });
  score += controls.returnReview ? 0.5 : 0;
  return score;
}

function capSleeveWeights(values, total) {
  const maximum = total * settings.maxSingleSecuritySleeveShare;
  if (!values.length || total > values.length * maximum) return null;
  const capped = [...values];
  for (let pass = 0; pass < values.length; pass += 1) {
    const over = capped.map((value, index) => ({ value, index })).filter((item) => item.value > maximum);
    if (!over.length) return capped;
    const excess = over.reduce((sum, item) => sum + item.value - maximum, 0);
    over.forEach((item) => { capped[item.index] = maximum; });
    const recipients = capped.map((value, index) => ({ value, index })).filter((item) => item.value < maximum - 0.0001);
    const capacity = recipients.reduce((sum, item) => sum + maximum - item.value, 0);
    if (capacity + 0.0001 < excess) return null;
    recipients.forEach((item) => {
      capped[item.index] += excess * ((maximum - item.value) / capacity);
    });
  }
  return capped;
}

function randomWeights(baseWeights, activeHoldings, random, variation) {
  const weights = [...baseWeights];
  sleeveDefinitions().forEach((definition) => {
    const indexes = activeHoldings
      .map((holding, index) => ({ holding, index }))
      .filter((item) => holdingMatchesSleeve(item.holding, definition) && !item.holding.lockedWeight)
      .map((item) => item.index);
    const total = indexes.reduce((sum, index) => sum + Number(baseWeights[index] || 0), 0);
    if (!indexes.length || total <= 0) return;
    const raw = indexes.map((index) => Math.max(0.001, Number(baseWeights[index] || 0) * (1 + ((random() * 2 - 1) * variation))));
    const rawTotal = raw.reduce((sum, value) => sum + value, 0) || 1;
    const capped = capSleeveWeights(raw.map((value) => value / rawTotal * total), total);
    if (!capped) return;
    indexes.forEach((holdingIndex, valueIndex) => { weights[holdingIndex] = capped[valueIndex]; });
  });
  return weights;
}

function directedSleeveBetaWeights(rows, baseWeights, activeHoldings, targetModel, universeByTicker, maxPasses = 80) {
  const weights = [...baseWeights].map((weight) => Number(weight || 0));
  const minimumWeight = 0.01;

  sleeveDefinitions().forEach((definition) => {
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const sleeve = metricsForWeights(rows, weights, activeHoldings, targetModel, universeByTicker).sleeves[definition.key];
      if (!sleeve || sleeve.beta === null || sleeve.targetBeta === null || sleeve.betaControlActive === false) break;
      if (betaPass(sleeve.beta, sleeve.targetBeta, sleeve.betaControlActive)) break;

      const sleeveWeight = activeHoldings
        .filter((holding) => holdingMatchesSleeve(holding, definition))
        .reduce((sum, holding) => sum + Number(weights[activeHoldings.indexOf(holding)] || 0), 0);
      const needsLowerBeta = sleeve.beta > sleeve.targetBeta;
      const candidates = activeHoldings
        .map((holding, index) => ({ holding, index }))
        .filter((row) => holdingMatchesSleeve(row.holding, definition) && !row.holding.lockedWeight)
        .map((row) => ({
          ...row,
          beta: tickerBeta(row.holding.symbol, row.holding.region, rows, universeByTicker),
          weight: Number(weights[row.index] || 0),
          maxWeight: sleeveWeight * settings.maxSingleSecuritySleeveShare,
        }))
        .filter((row) => Number.isFinite(row.beta));

      const recipients = candidates
        .filter((row) => needsLowerBeta
          ? row.beta < sleeve.beta && row.weight < row.maxWeight - 0.0001
          : row.beta > sleeve.beta && row.weight < row.maxWeight - 0.0001)
        .sort((left, right) => needsLowerBeta ? left.beta - right.beta : right.beta - left.beta);
      const donors = candidates
        .filter((row) => needsLowerBeta
          ? row.beta > sleeve.targetBeta && row.weight > minimumWeight + 0.0001
          : row.beta < sleeve.targetBeta && row.weight > minimumWeight + 0.0001)
        .sort((left, right) => needsLowerBeta ? right.beta - left.beta : left.beta - right.beta);

      if (!recipients.length || !donors.length) break;

      const recipient = recipients[0];
      const donor = donors[0];
      const betaGap = Math.abs(recipient.beta - donor.beta);
      if (betaGap < 0.0001) break;

      const requiredShift = Math.abs(sleeve.beta - sleeve.targetBeta) * Math.max(sleeveWeight, 0.0001) / betaGap;
      const shift = Math.min(requiredShift, recipient.maxWeight - recipient.weight, donor.weight - minimumWeight);
      if (shift < 0.001) break;

      weights[recipient.index] += shift;
      weights[donor.index] -= shift;
    }
  });

  return weights;
}

function optimizeWeightsOnly(rows, baseWeights, activeHoldings, targetModel, universeByTicker, seedOffset = 0, iterations = 5000) {
  const profiles = [
    { id: "A", label: "Balanced Fit", variation: 0.28 },
    { id: "B", label: "Risk Control", variation: 0.18 },
    { id: "C", label: "Return Focus", variation: 0.42 },
  ];
  return profiles.map((profile, profileIndex) => {
    const random = createRandom(20260714 + seedOffset + profileIndex * 997);
    const directedWeights = directedSleeveBetaWeights(rows, baseWeights, activeHoldings, targetModel, universeByTicker);
    const directedMetrics = metricsForWeights(rows, directedWeights, activeHoldings, targetModel, universeByTicker);
    let best = { weights: [...baseWeights], metrics: metricsForWeights(rows, baseWeights, activeHoldings, targetModel, universeByTicker) };
    let bestScore = scoreMetrics(best.metrics, targetModel);
    const directedScore = scoreMetrics(directedMetrics, targetModel);
    if (directedScore < bestScore) {
      best = { weights: directedWeights, metrics: directedMetrics };
      bestScore = directedScore;
    }
    for (let index = 0; index < iterations; index += 1) {
      const weights = randomWeights(directedWeights, activeHoldings, random, profile.variation);
      const metrics = metricsForWeights(rows, weights, activeHoldings, targetModel, universeByTicker);
      const score = scoreMetrics(metrics, targetModel);
      if (score < bestScore) {
        best = { weights, metrics };
        bestScore = score;
      }
    }
    return { ...profile, ...best, score: bestScore, controls: controlStatus(best.metrics, targetModel) };
  });
}

function tickerHasHistory(symbol, rows) {
  return rows.filter((row) => row[symbol] > 0).length >= Math.min(rows.length, 12);
}

function replacementCandidates(holding, definition, activeHoldings, rows, universe, universeByTicker, sleeveResult) {
  const held = new Set(activeHoldings.map((item) => item.symbol.toUpperCase()));
  const style = holding.styleFactor.toLowerCase();
  const currentBeta = tickerBeta(holding.symbol, holding.region, rows, universeByTicker);
  return universe
    .filter((record) => record.assetClass === "Equity")
    .filter((record) => record.region === holding.region)
    .filter((record) => record.styleFactor.toLowerCase() === style)
    .filter((record) => !held.has(record.ticker))
    .filter((record) => tickerHasHistory(record.ticker, rows))
    .map((record) => {
      const beta = tickerBeta(record.ticker, record.region, rows, universeByTicker);
      const returns = tickerReturns(record.ticker, rows);
      const annualizedReturn = annualizedReturnFromReturns(returns);
      const maxDrawdown = maxDrawdownFromReturns(returns);
      const sleeveWeight = activeHoldings
        .filter((item) => holdingMatchesSleeve(item, definition))
        .reduce((sum, item) => sum + Number(item.weight || 0), 0);
      const estimatedBeta = Number.isFinite(sleeveResult.beta) && Number.isFinite(currentBeta) && Number.isFinite(beta)
        ? sleeveResult.beta + (beta - currentBeta) * Number(holding.weight || 0) / Math.max(sleeveWeight, 0.0001)
        : beta;
      const betaDistance = Number.isFinite(estimatedBeta) ? Math.abs(estimatedBeta - sleeveResult.targetBeta) : 99;
      const reviewPenalty = sleeveResult.returnReview && Number.isFinite(annualizedReturn)
        ? Math.max(0, annualizedReturn - sleeveResult.targetReturn * (1 + settings.returnExcessReviewTolerance)) / 20
        : 0;
      return { record, beta, annualizedReturn, maxDrawdown, betaDistance, priority: betaDistance + reviewPenalty + Math.abs(maxDrawdown || 0) / 100 };
    })
    .filter((candidate) => Number.isFinite(candidate.beta))
    .sort((left, right) => left.priority - right.priority);
}

function tickerReturns(symbol, rows) {
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1][symbol];
    const current = rows[index][symbol];
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function replacementHoldings(activeHoldings, replacements) {
  const output = activeHoldings.map((holding) => ({ ...holding }));
  replacements.forEach((replacement) => {
    output[replacement.index] = {
      ...output[replacement.index],
      symbol: replacement.candidate.record.ticker,
      region: replacement.candidate.record.region,
      styleFactor: replacement.candidate.record.styleFactor,
      theme: replacement.candidate.record.theme,
    };
  });
  return output;
}

function replacementChoices(baseMetrics, rows, activeHoldings, universe, universeByTicker) {
  const definitions = sleeveDefinitions();
  const failing = definitions.filter((definition) => {
    const sleeve = baseMetrics.sleeves[definition.key];
    return !sleeve.returnPass || sleeve.returnReview || !sleeve.betaPass || !sleeve.drawdownPass;
  });
  return (failing.length ? failing : definitions).flatMap((definition) => {
    const sleeve = baseMetrics.sleeves[definition.key];
    return activeHoldings
      .map((holding, index) => ({ holding, index }))
      .filter((item) => holdingMatchesSleeve(item.holding, definition))
      .flatMap((item) => replacementCandidates(item.holding, definition, activeHoldings, rows, universe, universeByTicker, sleeve)
        .slice(0, 3)
        .map((candidate) => ({ definition, index: item.index, holding: item.holding, candidate })));
  }).sort((left, right) => left.candidate.priority - right.candidate.priority);
}

function replacementSets(choices, size, maximum = 160) {
  const sets = [];
  const visit = (start, selected) => {
    if (sets.length >= maximum) return;
    if (selected.length === size) {
      sets.push(selected);
      return;
    }
    for (let index = start; index < choices.length; index += 1) {
      const choice = choices[index];
      if (selected.some((item) => item.index === choice.index || item.candidate.record.ticker === choice.candidate.record.ticker)) continue;
      visit(index + 1, [...selected, choice]);
    }
  };
  visit(0, []);
  return sets;
}

function findReplacementPlan(rows, baseWeights, baseMetrics, activeHoldings, targetModel, universe, universeByTicker) {
  const choices = replacementChoices(baseMetrics, rows, activeHoldings, universe, universeByTicker);
  for (let size = 1; size <= 4; size += 1) {
    const candidates = replacementSets(choices, size, 48)
      .map((replacements) => {
        const candidateHoldings = replacementHoldings(activeHoldings, replacements);
        const options = optimizeWeightsOnly(rows, baseWeights, candidateHoldings, targetModel, universeByTicker, size * 10000, 2500);
        const best = options.sort((left, right) => {
          if (left.controls.cleanPass !== right.controls.cleanPass) return left.controls.cleanPass ? -1 : 1;
          if (left.controls.hardPass !== right.controls.hardPass) return left.controls.hardPass ? -1 : 1;
          return left.score - right.score;
        })[0];
        return { replacements, holdings: candidateHoldings, option: best };
      })
      .sort((left, right) => {
        if (left.option.controls.cleanPass !== right.option.controls.cleanPass) return left.option.controls.cleanPass ? -1 : 1;
        if (left.option.controls.hardPass !== right.option.controls.hardPass) return left.option.controls.hardPass ? -1 : 1;
        return left.option.score - right.option.score;
      });
    const clean = candidates.find((candidate) => candidate.option.controls.cleanPass);
    if (clean) return { feasible: true, clean: true, ...clean };
    const hard = candidates.find((candidate) => candidate.option.controls.hardPass);
    if (hard) return { feasible: true, clean: false, ...hard };
  }
  return { feasible: false, checkedChoices: choices.length };
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}

function summarizeMetrics(metrics, targetModel) {
  const controls = controlStatus(metrics, targetModel);
  return {
    portfolio: {
      return: formatPercent(metrics.annualizedReturn),
      target: formatPercent(metrics.targetReturn),
      drawdown: formatPercent(metrics.maxDrawdown),
      status: controls.cleanPass ? "Clean pass" : (controls.hardPass ? "Hard pass with review" : "Not passed"),
    },
    sleeves: Object.fromEntries(Object.entries(metrics.sleeves).map(([key, sleeve]) => [key, {
      return: formatPercent(sleeve.annualizedReturn),
      targetReturn: formatPercent(sleeve.targetReturn),
      returnStatus: sleeve.returnStatus,
      beta: Number.isFinite(sleeve.beta) ? sleeve.beta.toFixed(3) : "n/a",
      targetBeta: Number.isFinite(sleeve.targetBeta) ? sleeve.targetBeta.toFixed(3) : "n/a",
      betaStatus: sleeve.betaPass ? "Pass" : "Fail",
      drawdown: formatPercent(sleeve.maxDrawdown),
      drawdownLimit: sleeve.drawdownBand ? formatPercent(sleeve.drawdownBand.low * (1 + settings.drawdownExcessTolerance)) : "n/a",
      drawdownStatus: sleeve.drawdownPass ? "Pass" : "Fail",
    }])),
  };
}

function allocateExtremeBeta(totalWeight, betas, direction) {
  const maximum = totalWeight * settings.maxSingleSecuritySleeveShare;
  const ordered = [...betas].filter((item) => Number.isFinite(item.beta))
    .sort((left, right) => direction === "min" ? left.beta - right.beta : right.beta - left.beta);
  let remaining = totalWeight;
  let weighted = 0;
  let used = 0;
  for (const item of ordered) {
    if (remaining <= 0) break;
    const weight = Math.min(maximum, remaining);
    weighted += weight * item.beta;
    used += weight;
    remaining -= weight;
  }
  return used > 0 && remaining <= 0.0001 ? weighted / used : null;
}

function betaFeasibilityRanges(rows, activeHoldings, universeByTicker) {
  return Object.fromEntries(sleeveDefinitions().map((definition) => {
    const sleeveHoldings = activeHoldings.filter((holding) => holdingMatchesSleeve(holding, definition));
    const totalWeight = sleeveHoldings.reduce((sum, holding) => sum + Number(holding.weight || 0), 0);
    const betas = sleeveHoldings.map((holding) => ({
      symbol: holding.symbol,
      beta: tickerBeta(holding.symbol, holding.region, rows, universeByTicker),
    }));
    return [definition.key, {
      targetBeta: targetModel.sleeves[definition.key]?.beta,
      currentTickerMinBeta: allocateExtremeBeta(totalWeight, betas, "min"),
      currentTickerMaxBeta: allocateExtremeBeta(totalWeight, betas, "max"),
      tickers: betas.map((item) => `${item.symbol}:${Number.isFinite(item.beta) ? item.beta.toFixed(2) : "n/a"}`),
    }];
  }));
}

const priceRows = resampleRows(filterLookback(parsePrices(readFileSync(pricePath, "utf8"))));
const universe = parseUniverse(readFileSync(universePath, "utf8"));
const universeByTicker = tickerMap(universe);
const marketStats = parseMarketStats(readFileSync(marketStatsPath, "utf8"));
const recommendation = marketStats[settings.scenario] || defaultAllocation[settings.scenario];
const finalTargetReturn = targetPackageFinalReturn();
const targetModel = createTargetModel(finalTargetReturn, recommendation);
const baseWeights = holdings.map((holding) => holding.weight);
const baseMetrics = metricsForWeights(priceRows, baseWeights, holdings, targetModel, universeByTicker);
const baseControls = controlStatus(baseMetrics, targetModel);
const weightOnlyOptions = optimizeWeightsOnly(priceRows, baseWeights, holdings, targetModel, universeByTicker);
const cleanWeightOnly = weightOnlyOptions.filter((option) => option.controls.cleanPass);
const hardWeightOnly = weightOnlyOptions.filter((option) => option.controls.hardPass);
const bestWeightOnly = [...weightOnlyOptions].sort((left, right) => {
  if (left.controls.cleanPass !== right.controls.cleanPass) return left.controls.cleanPass ? -1 : 1;
  if (left.controls.hardPass !== right.controls.hardPass) return left.controls.hardPass ? -1 : 1;
  return left.score - right.score;
})[0];
const shouldRunReplacement = process.argv.includes("--replacement");
const replacementPlan = shouldRunReplacement && !hardWeightOnly.length
  ? findReplacementPlan(priceRows, baseWeights, baseMetrics, holdings, targetModel, universe, universeByTicker)
  : null;

const result = {
  backtestWindow: {
    start: priceRows[0]?.date.toISOString().slice(0, 10),
    end: priceRows.at(-1)?.date.toISOString().slice(0, 10),
    periods: Math.max(0, priceRows.length - 1),
    frequency: settings.frequency,
  },
  targetModel: {
    finalTargetReturn: formatPercent(targetModel.finalTargetReturn),
    equityTargetReturn: formatPercent(targetModel.equityTargetReturn),
    baselineReturn: formatPercent(targetModel.baselineReturn),
    expectedBuffer: formatPercent(targetModel.expectedBuffer),
    rawTargetGap: formatPercent(targetModel.rawTargetGap),
    targetGap: formatPercent(targetModel.targetGap),
    sleeveTargets: Object.fromEntries(Object.entries(targetModel.sleeves).map(([key, target]) => [key, {
      weight: formatPercent(target.weight),
      targetReturn: formatPercent(target.targetReturn),
      riskFreeRate: formatPercent(target.riskFreeRate),
      targetBeta: Number.isFinite(target.beta) ? target.beta.toFixed(3) : "n/a",
      betaControlActive: target.betaControlActive,
      drawdownBudget: target.drawdownBand ? `${formatPercent(target.drawdownBand.low)} to ${formatPercent(target.drawdownBand.high)}` : "n/a",
    }])),
  },
  base: {
    controls: baseControls,
    metrics: summarizeMetrics(baseMetrics, targetModel),
    betaFeasibility: betaFeasibilityRanges(priceRows, holdings, universeByTicker),
  },
  weightOnly: {
    cleanPassCount: cleanWeightOnly.length,
    hardPassCount: hardWeightOnly.length,
    options: weightOnlyOptions.map((option) => ({
      id: option.id,
      label: option.label,
      controls: option.controls,
      metrics: summarizeMetrics(option.metrics, targetModel),
    })),
    best: {
      id: bestWeightOnly.id,
      controls: bestWeightOnly.controls,
      metrics: summarizeMetrics(bestWeightOnly.metrics, targetModel),
      topWeightChanges: holdings.map((holding, index) => ({
        symbol: holding.symbol,
        from: holding.weight,
        to: Number(bestWeightOnly.weights[index].toFixed(2)),
        change: Number((bestWeightOnly.weights[index] - holding.weight).toFixed(2)),
      })).filter((item) => Math.abs(item.change) >= 0.1)
        .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))
        .slice(0, 12),
    },
  },
  replacementPlan: replacementPlan ? {
    feasible: replacementPlan.feasible,
    clean: replacementPlan.clean || false,
    checkedChoices: replacementPlan.checkedChoices,
    replacements: replacementPlan.replacements?.map((replacement) => ({
      sleeve: replacement.definition.label,
      replace: replacement.holding.symbol,
      with: replacement.candidate.record.ticker,
      candidateBeta: Number(replacement.candidate.beta).toFixed(3),
      candidateReturn: formatPercent(replacement.candidate.annualizedReturn),
      candidateDrawdown: formatPercent(replacement.candidate.maxDrawdown),
    })) || [],
    controls: replacementPlan.option?.controls,
    metrics: replacementPlan.option ? summarizeMetrics(replacementPlan.option.metrics, targetModel) : null,
  } : null,
};

console.log(JSON.stringify(result, null, 2));
