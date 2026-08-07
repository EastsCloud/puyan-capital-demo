import type { FastifyInstance } from "fastify";
import {
  betaControl,
  drawdownControl,
  hasPermission,
  returnControl,
  type BacktestTolerance,
  type CapmTarget,
} from "@isater/domain";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool } from "./db.js";
import { eodhdSymbol, fetchEodhdPrices, getActiveEodhdToken } from "./eodhd.js";

type SleeveKey = "us" | "developedNonUs" | "emerging";

export interface PricePoint {
  date: string;
  week: string;
  value: number;
}

export interface PriceSeries {
  symbol: string;
  currency: string;
  exchange: string;
  points: PricePoint[];
  sourceUrl: string;
  sourceName: "EODHD" | "Yahoo Finance chart";
  fallbackReason?: string;
}

function forbidden(message = "Forbidden") {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 403;
  return error;
}

function invalidState(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 409;
  return error;
}

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

export function weekKey(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function yahooSymbol(ticker: string, market: string): string {
  if (market === "JP") return `${ticker}.T`;
  if (market === "HK") return `${ticker}.HK`;
  if (market === "CN_A") return `${ticker}.${ticker.startsWith("6") ? "SS" : "SZ"}`;
  return ticker;
}

export async function fetchYahooSeries(symbol: string): Promise<PriceSeries> {
  const sourceUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1wk&events=history&includeAdjustedClose=true`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 Isater/0.1" }, signal: AbortSignal.timeout(25_000) });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 2) throw invalidState(`Historical prices unavailable for ${symbol}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  const payload = await response!.json() as {
    chart?: { result?: Array<{
      meta?: { currency?: string; exchangeName?: string };
      timestamp?: number[];
      indicators?: { adjclose?: Array<{ adjclose?: Array<number | null> }>; quote?: Array<{ close?: Array<number | null> }> };
    }>; error?: { description?: string } };
  };
  const result = payload.chart?.result?.[0];
  if (!result?.timestamp?.length) throw invalidState(`Historical prices unavailable for ${symbol}: ${payload.chart?.error?.description ?? "empty series"}`);
  const prices = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? [];
  const byWeek = new Map<string, PricePoint>();
  result.timestamp.forEach((timestamp, index) => {
    const value = prices[index];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    byWeek.set(weekKey(timestamp), { date, week: weekKey(timestamp), value });
  });
  const points = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
  if (points.length < 100) throw invalidState(`Historical prices for ${symbol} contain fewer than 100 weekly observations`);
  return {
    symbol,
    currency: result.meta?.currency ?? "",
    exchange: result.meta?.exchangeName ?? "",
    points,
    sourceUrl,
    sourceName: "Yahoo Finance chart",
  };
}

export async function fetchEodhdWeeklySeries(token: string, providerSymbol: string, canonicalSymbol: string): Promise<PriceSeries> {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 3);
  from.setUTCDate(from.getUTCDate() - 14);
  const result = await fetchEodhdPrices(token, providerSymbol, {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    period: "w",
  });
  const points = result.points.map((point) => {
    const timestamp = Math.floor(new Date(`${point.date}T00:00:00Z`).getTime() / 1000);
    return { date: point.date, week: weekKey(timestamp), value: point.value };
  });
  if (points.length < 100) throw invalidState(`Historical prices for ${providerSymbol} contain fewer than 100 weekly observations`);
  return {
    symbol: canonicalSymbol,
    currency: "",
    exchange: providerSymbol.split(".").at(-1) ?? "",
    points,
    sourceUrl: result.sourceUrl,
    sourceName: "EODHD",
  };
}

export function weightedReturns(series: Array<{ data: PriceSeries; weight: number }>, commonWeeks: string[]): number[] {
  const maps = series.map((item) => ({ weight: item.weight, prices: new Map(item.data.points.map((point) => [point.week, point.value])) }));
  const returns: number[] = [];
  for (let index = 1; index < commonWeeks.length; index += 1) {
    const previous = commonWeeks[index - 1];
    const current = commonWeeks[index];
    returns.push(maps.reduce((sum, item) => sum + item.weight * (item.prices.get(current)! / item.prices.get(previous)! - 1), 0));
  }
  return returns;
}

export function annualizedReturn(returns: number[]): number {
  const wealth = returns.reduce((value, item) => value * (1 + item), 1);
  return Math.pow(wealth, 52 / returns.length) - 1;
}

export function maximumDrawdown(returns: number[]): number {
  let wealth = 1;
  let peak = 1;
  let worst = 0;
  for (const item of returns) {
    wealth *= 1 + item;
    peak = Math.max(peak, wealth);
    worst = Math.min(worst, wealth / peak - 1);
  }
  return worst;
}

export function calculateBeta(portfolio: number[], benchmark: number[]): number {
  const pMean = portfolio.reduce((sum, value) => sum + value, 0) / portfolio.length;
  const bMean = benchmark.reduce((sum, value) => sum + value, 0) / benchmark.length;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < portfolio.length; index += 1) {
    covariance += (portfolio[index] - pMean) * (benchmark[index] - bMean);
    variance += Math.pow(benchmark[index] - bMean, 2);
  }
  if (variance <= 1e-16) throw invalidState("Benchmark variance is too small to calculate beta");
  return covariance / variance;
}

export async function saveObservations(series: PriceSeries[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of series) {
      for (const point of item.points) {
        await client.query(
          `INSERT INTO market_observations
            (instrument_key, observation_date, field, value, currency, source_name, source_url, retrieved_at)
           VALUES ($1, $2, 'adjusted_close', $3, NULLIF($4, ''), $5, $6, now())
           ON CONFLICT (instrument_key, observation_date, field, source_name)
           DO UPDATE SET value = EXCLUDED.value, currency = EXCLUDED.currency,
             source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at`,
          [item.symbol, point.date, point.value, item.currency, item.sourceName, item.sourceUrl],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function backtestParameters(organizationId: string): Promise<BacktestTolerance & { months: number; frequency: string }> {
  const effective = await pool.query("SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1", [organizationId]);
  const defaults = effective.rows[0] ? null : await pool.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
  const parameters = jsonValue<Record<string, any>>((effective.rows[0] ?? defaults!.rows[0]).parameters);
  const policy = parameters.backtest ?? {};
  return {
    betaRelative: Number(policy.betaRelativeTolerance ?? 0.05),
    returnShortfall: Number(policy.returnShortfallTolerance ?? 0.05),
    returnExcessReview: Number(policy.returnExcessReviewTolerance ?? 0.50),
    drawdownExcess: Number(policy.drawdownExcessTolerance ?? 0.10),
    months: Number(policy.defaultMonths ?? 36),
    frequency: String(policy.defaultFrequency ?? "weekly"),
  };
}

export async function registerBacktestRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/backtest/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query("SELECT id FROM workflow_cases WHERE id = $1 AND organization_id = $2", [workflowId, user.organizationId]);
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const latest = await pool.query(
      `SELECT b.* FROM backtest_runs b JOIN proposed_portfolio_versions p ON p.id = b.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 ORDER BY b.run_at DESC LIMIT 1`, [workflowId],
    );
    return { policy: await backtestParameters(user.organizationId), backtestRun: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/backtest/runs", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "backtest:run")) throw forbidden();
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query("SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'", [workflowId, user.organizationId]);
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "backtest") throw invalidState("Backtest is not the current workflow step");
    const proposal = await pool.query(
      `SELECT p.*, s.targets, a.recommendation
         FROM proposed_portfolio_versions p
         JOIN sleeve_target_versions s ON s.id = p.sleeve_target_version_id
         JOIN target_return_versions t ON t.id = s.target_return_version_id
         JOIN annual_data_packages a ON a.id = t.annual_data_package_id
        WHERE p.workflow_case_id = $1 ORDER BY p.version DESC LIMIT 1`, [workflowId],
    );
    if (!proposal.rows[0]) throw invalidState("Submitted proposed portfolio not found");
    const holdings = await pool.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1 ORDER BY sleeve, style, ticker", [proposal.rows[0].id]);
    const targets = jsonValue<{ equityTargets: Array<any> }>(proposal.rows[0].targets);
    const recommendation = jsonValue<{ marketWeights: { chinaA: number; hongKong: number } }>(proposal.rows[0].recommendation);
    const policy = await backtestParameters(user.organizationId);
    const sleeveBenchmarkSymbols: Record<SleeveKey, Array<{ symbol: string; eodhdSymbol: string; weight: number }>> = {
      us: [{ symbol: "^GSPC", eodhdSymbol: "GSPC.INDX", weight: 1 }],
      developedNonUs: [{ symbol: "^N225", eodhdSymbol: "N225.INDX", weight: 1 }],
      emerging: [
        { symbol: "000001.SS", eodhdSymbol: "000001.SHG", weight: recommendation.marketWeights.chinaA / (recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong) },
        { symbol: "^HSI", eodhdSymbol: "HSI.INDX", weight: recommendation.marketWeights.hongKong / (recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong) },
      ],
    };
    const holdingSymbols = holdings.rows.map((holding) => ({
      ...holding,
      providerSymbol: yahooSymbol(holding.ticker, holding.market),
      eodhdSymbol: eodhdSymbol(holding.ticker, holding.market),
    }));
    const requests = [...holdingSymbols.map((item) => ({ symbol: item.providerSymbol, eodhdSymbol: item.eodhdSymbol })),
      ...Object.values(sleeveBenchmarkSymbols).flat().map((item) => ({ symbol: item.symbol, eodhdSymbol: item.eodhdSymbol }))];
    const uniqueRequests = [...new Map(requests.map((item) => [item.symbol, item])).values()];
    const allSymbols = uniqueRequests.map((item) => item.symbol);
    const eodhdToken = await getActiveEodhdToken(user.organizationId);
    const allSeries: PriceSeries[] = [];
    for (const requestItem of uniqueRequests) {
      if (eodhdToken) {
        try {
          allSeries.push(await fetchEodhdWeeklySeries(eodhdToken, requestItem.eodhdSymbol, requestItem.symbol));
          continue;
        } catch (error) {
          const fallback = await fetchYahooSeries(requestItem.symbol);
          fallback.fallbackReason = error instanceof Error ? error.message : String(error);
          allSeries.push(fallback);
          continue;
        }
      }
      allSeries.push(await fetchYahooSeries(requestItem.symbol));
    }
    await saveObservations(allSeries);
    const bySymbol = new Map(allSeries.map((item) => [item.symbol, item]));
    const sleeveMetrics = [];
    const reviewFlags: Array<{ sleeve: SleeveKey; control: string; reason: string }> = [];
    for (const sleeve of ["us", "developedNonUs", "emerging"] as SleeveKey[]) {
      const sleeveHoldings = holdingSymbols.filter((item) => item.sleeve === sleeve);
      const securities = sleeveHoldings.map((item) => ({ data: bySymbol.get(item.providerSymbol)!, weight: Number(item.weight) }));
      const benchmarks = sleeveBenchmarkSymbols[sleeve].map((item) => ({ data: bySymbol.get(item.symbol)!, weight: item.weight }));
      const commonWeeks = [...new Set(securities[0].data.points.map((point) => point.week))]
        .filter((week) => [...securities, ...benchmarks].every((item) => item.data.points.some((point) => point.week === week)))
        .sort();
      if (commonWeeks.length < 100) throw invalidState(`${sleeve} has fewer than 100 aligned weekly observations`);
      const portfolioReturns = weightedReturns(securities, commonWeeks);
      const benchmarkReturns = weightedReturns(benchmarks, commonWeeks);
      const actualReturn = annualizedReturn(portfolioReturns);
      const actualDrawdown = maximumDrawdown(portfolioReturns);
      const benchmarkDrawdown = maximumDrawdown(benchmarkReturns);
      const actualBeta = calculateBeta(portfolioReturns, benchmarkReturns);
      const target = targets.equityTargets.find((item) => item.key === sleeve);
      const returnResult = returnControl(actualReturn, Number(target.targetReturn), policy);
      const drawdownResult = drawdownControl(actualDrawdown, Number(target.maximumDrawdownLimit), benchmarkDrawdown, policy);
      const betaResult = betaControl(actualBeta, target.capm as CapmTarget, returnResult.hardPass, drawdownResult.hardPass, policy);
      if (returnResult.review) reviewFlags.push({ sleeve, control: "return", reason: "Return is materially above the target floor; review idiosyncratic-risk concentration." });
      if (betaResult.review) reviewFlags.push({ sleeve, control: "beta", reason: "Beta is below the target range while return and drawdown pass; committee review is required." });
      sleeveMetrics.push({
        sleeve, observationCount: portfolioReturns.length, startDate: commonWeeks[0], endDate: commonWeeks.at(-1),
        annualizedReturn: actualReturn, targetReturn: Number(target.targetReturn), returnControl: returnResult,
        beta: actualBeta, targetBeta: Number(target.targetBeta), betaControlActive: Boolean(target.betaControlActive), betaControl: betaResult,
        maximumDrawdown: actualDrawdown, maximumDrawdownLimit: Number(target.maximumDrawdownLimit), benchmarkDrawdown, drawdownControl: drawdownResult,
        hardPass: returnResult.hardPass && drawdownResult.hardPass && betaResult.hardPass,
      });
    }
    const hardControlPass = sleeveMetrics.every((item) => item.hardPass);
    const startDate = sleeveMetrics.map((item) => String(item.startDate)).sort().at(-1)!;
    const endDate = sleeveMetrics.map((item) => String(item.endDate)).sort().at(0)!;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query("SELECT COALESCE(max(run_number), 0)::int + 1 AS run_number FROM backtest_runs WHERE proposed_portfolio_version_id = $1", [proposal.rows[0].id]);
      const saved = await client.query(
        `INSERT INTO backtest_runs
          (proposed_portfolio_version_id, run_number, start_date, end_date, frequency, benchmark_manifest, data_manifest,
           metrics, hard_control_pass, review_flags, model_version, run_by)
         VALUES ($1, $2, $3, $4, 'weekly', $5, $6, $7, $8, $9, 'isater-backtest-1.0.0', $10) RETURNING *`,
        [proposal.rows[0].id, next.rows[0].run_number, startDate, endDate,
          { sleeves: sleeveBenchmarkSymbols, methodology: "constant sleeve weights; weekly total-return proxy from adjusted close" },
          { provider: [...new Set(allSeries.map((item) => item.sourceName))].join(" + "), primaryProvider: "EODHD",
            primaryProviderStatus: eodhdToken ? (allSeries.every((item) => item.sourceName === "EODHD") ? "succeeded" : "partial_fallback") : "not_configured",
            symbols: allSymbols, eodhdSymbols: uniqueRequests.map((item) => item.eodhdSymbol), retrievedAt: new Date().toISOString(),
            persistedToMarketObservations: true,
            sources: allSeries.map((item) => ({ symbol: item.symbol, provider: item.sourceName, url: item.sourceUrl, fallbackReason: item.fallbackReason ?? null })) },
          { sleeves: sleeveMetrics }, hardControlPass, reviewFlags, user.id],
      );
      await client.query("UPDATE proposed_portfolio_versions SET status = $1 WHERE id = $2", [hardControlPass ? "backtest_passed" : "backtest_failed", proposal.rows[0].id]);
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "backtest.run", entityType: "backtest_run",
        entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip,
        detail: { runNumber: saved.rows[0].run_number, hardControlPass,
          source: [...new Set(allSeries.map((item) => item.sourceName))].join(" + "), startDate, endDate },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ backtestRun: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
