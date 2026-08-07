import type { FastifyInstance } from "fastify";
import { betaControl, drawdownControl, hasPermission, returnControl, type BacktestTolerance, type CapmTarget } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import {
  annualizedReturn,
  calculateBeta,
  fetchEodhdWeeklySeries,
  fetchYahooSeries,
  maximumDrawdown,
  saveObservations,
  weekKey,
  weightedReturns,
  yahooSymbol,
  type PriceSeries,
} from "./backtest.js";
import { pool } from "./db.js";
import { eodhdSymbol, getActiveEodhdToken } from "./eodhd.js";

type SleeveKey = "us" | "developedNonUs" | "emerging";

export interface OptimizerHolding {
  ticker: string;
  exchangeCode: string;
  market: "US" | "JP" | "HK" | "CN_A";
  sleeve: SleeveKey;
  style: "growth" | "value";
  weight: number;
  locked: boolean;
}

interface FeasibleSolution {
  sleeve: SleeveKey;
  phase: "weight_only" | "minimum_ticker_replacement";
  tickerReplacements: number;
  weights: number[];
  holdings: OptimizerHolding[];
  turnover: number;
  metrics: { annualizedReturn: number; beta: number; maximumDrawdown: number };
  controls: Record<string, unknown>;
  dataSources: Array<{ symbol: string; provider: string; url: string; fallbackReason: string | null }>;
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

async function effectiveParameters(organizationId: string): Promise<Record<string, any>> {
  const effective = await pool.query("SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1", [organizationId]);
  if (effective.rows[0]) return jsonValue(effective.rows[0].parameters);
  const defaults = await pool.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
  return jsonValue(defaults.rows[0].parameters);
}

async function storedSeries(symbol: string): Promise<PriceSeries> {
  const rows = await pool.query(
    `SELECT DISTINCT ON (observation_date) observation_date, value, currency, source_url, source_name
       FROM market_observations
      WHERE instrument_key = $1 AND field = 'adjusted_close'
      ORDER BY observation_date, CASE WHEN source_name = 'EODHD' THEN 0 ELSE 1 END, retrieved_at DESC`, [symbol],
  );
  if (rows.rows.length < 100) throw invalidState(`Stored history for ${symbol} is insufficient; rerun backtest data retrieval`);
  return {
    symbol,
    currency: rows.rows[0].currency ?? "",
    exchange: "",
    sourceUrl: rows.rows[0].source_url ?? "",
    sourceName: rows.rows[0].source_name === "EODHD" ? "EODHD" : "Yahoo Finance chart",
    points: rows.rows.map((row) => {
      const raw = row.observation_date instanceof Date ? row.observation_date.toISOString().slice(0, 10) : String(row.observation_date).slice(0, 10);
      return { date: raw, week: weekKey(new Date(`${raw}T00:00:00Z`).getTime() / 1000), value: Number(row.value) };
    }),
  };
}

function weightVectors(count: number, maxPct: number): number[][] {
  const increment = count <= 6 ? 1 : count <= 8 ? 2 : 5;
  const results: number[][] = [];
  const current: number[] = [];
  const visit = (index: number, remaining: number) => {
    if (index === count - 1) {
      if (remaining >= increment && remaining <= maxPct && remaining % increment === 0) {
        results.push([...current, remaining].map((value) => value / 100));
      }
      return;
    }
    const left = count - index - 1;
    for (let value = increment; value <= maxPct; value += increment) {
      const next = remaining - value;
      if (next < left * increment || next > left * maxPct) continue;
      current.push(value); visit(index + 1, next); current.pop();
    }
  };
  visit(0, 100);
  return results;
}

function holdingKey(holding: Pick<OptimizerHolding, "ticker" | "exchangeCode">): string {
  return `${holding.ticker}|${holding.exchangeCode}`;
}

function combinations<T>(values: T[], count: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, selected: T[]) => {
    if (selected.length === count) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
}

export function replacementCandidateSets(original: OptimizerHolding[], universe: OptimizerHolding[]): Array<{
  holdings: OptimizerHolding[];
  replacements: number;
}> {
  const styleCounts = new Map<OptimizerHolding["style"], number>();
  original.forEach((holding) => styleCounts.set(holding.style, (styleCounts.get(holding.style) ?? 0) + 1));
  const growth = combinations(universe.filter((holding) => holding.style === "growth"), styleCounts.get("growth") ?? 0);
  const value = combinations(universe.filter((holding) => holding.style === "value"), styleCounts.get("value") ?? 0);
  const originalKeys = new Set(original.map(holdingKey));
  return growth.flatMap((growthHoldings) => value.map((valueHoldings) => {
    const holdings = [...growthHoldings, ...valueHoldings].sort((left, right) => left.style.localeCompare(right.style) || left.ticker.localeCompare(right.ticker));
    return { holdings, replacements: holdings.filter((holding) => !originalKeys.has(holdingKey(holding))).length };
  })).sort((left, right) => left.replacements - right.replacements);
}

export function oneWayTurnover(original: OptimizerHolding[], proposed: OptimizerHolding[], proposedWeights: number[]): number {
  const originalWeights = new Map(original.map((holding) => [holdingKey(holding), holding.weight]));
  const proposedMap = new Map(proposed.map((holding, index) => [holdingKey(holding), proposedWeights[index]]));
  const keys = new Set([...originalWeights.keys(), ...proposedMap.keys()]);
  return [...keys].reduce((sum, key) => sum + Math.abs((proposedMap.get(key) ?? 0) - (originalWeights.get(key) ?? 0)), 0) / 2;
}

export async function registerOptimizationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/optimization/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const latest = await pool.query(
      `SELECT o.* FROM optimization_runs o JOIN proposed_portfolio_versions p ON p.id = o.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 AND p.workflow_case_id IN
          (SELECT id FROM workflow_cases WHERE organization_id = $2)
        ORDER BY o.run_at DESC LIMIT 1`, [workflowId, user.organizationId],
    );
    return { optimizationRun: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/optimization/runs", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "optimization:run")) throw forbidden();
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query("SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'", [workflowId, user.organizationId]);
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "optimization") throw invalidState("Optimization is not the current workflow step");
    const prior = await pool.query(
      `SELECT b.*, p.sleeve_target_version_id, p.workflow_case_id
         FROM backtest_runs b JOIN proposed_portfolio_versions p ON p.id = b.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 ORDER BY b.run_at DESC LIMIT 1`, [workflowId],
    );
    if (!prior.rows[0] || prior.rows[0].hard_control_pass) throw invalidState("A failed backtest is required for optimization");
    const priorMetrics = jsonValue<{ sleeves: Array<{ sleeve: SleeveKey; hardPass: boolean }> }>(prior.rows[0].metrics);
    const failedSleeves = priorMetrics.sleeves.filter((item) => !item.hardPass).map((item) => item.sleeve);
    const proposalId = prior.rows[0].proposed_portfolio_version_id;
    const holdingsResult = await pool.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1 ORDER BY sleeve, style, ticker", [proposalId]);
    const targetsResult = await pool.query("SELECT targets FROM sleeve_target_versions WHERE id = $1", [prior.rows[0].sleeve_target_version_id]);
    const targets = jsonValue<{ equityTargets: Array<any> }>(targetsResult.rows[0].targets);
    const parameters = await effectiveParameters(user.organizationId);
    const backtest = parameters.backtest ?? {};
    const tolerance: BacktestTolerance = {
      betaRelative: Number(backtest.betaRelativeTolerance ?? 0.05), returnShortfall: Number(backtest.returnShortfallTolerance ?? 0.05),
      returnExcessReview: Number(backtest.returnExcessReviewTolerance ?? 0.50), drawdownExcess: Number(backtest.drawdownExcessTolerance ?? 0.10),
    };
    const maxWeightPct = Number(parameters.portfolioConstruction?.maxSingleSecurityWeightPct ?? 35);
    const benchmarkBySleeve: Record<SleeveKey, string[]> = { us: ["^GSPC"], developedNonUs: ["^N225"], emerging: ["000001.SS", "^HSI"] };
    const priorBenchmarkManifest = jsonValue<{ sleeves: Record<SleeveKey, Array<{ symbol: string; weight: number }>> }>(prior.rows[0].benchmark_manifest);
    const universeResult = await pool.query(
      "SELECT * FROM ticker_universe WHERE enabled = true AND sleeve = ANY($1::text[]) ORDER BY sleeve, style, ticker",
      [failedSleeves],
    );
    const normalizeHolding = (item: any, defaultWeight = 0): OptimizerHolding => ({
      ticker: String(item.ticker),
      exchangeCode: String(item.exchange_code ?? item.exchangeCode),
      market: item.market,
      sleeve: item.sleeve,
      style: item.style,
      weight: Number(item.weight ?? defaultWeight),
      locked: Boolean(item.locked),
    });
    const originalHoldings = holdingsResult.rows.map((item) => normalizeHolding(item));
    const originalWeights = new Map(originalHoldings.map((holding) => [holdingKey(holding), holding.weight]));
    const eodhdToken = await getActiveEodhdToken(user.organizationId);
    const seriesCache = new Map<string, Promise<PriceSeries>>();
    const priceSeries = (holding: OptimizerHolding): Promise<PriceSeries> => {
      const symbol = yahooSymbol(holding.ticker, holding.market);
      const cached = seriesCache.get(symbol);
      if (cached) return cached;
      const requested = (async () => {
        try {
          return await storedSeries(symbol);
        } catch {
          let fetched: PriceSeries;
          if (eodhdToken) {
            try {
              fetched = await fetchEodhdWeeklySeries(eodhdToken, eodhdSymbol(holding.ticker, holding.market), symbol);
            } catch (error) {
              fetched = await fetchYahooSeries(symbol);
              fetched.fallbackReason = error instanceof Error ? error.message : String(error);
            }
          } else {
            fetched = await fetchYahooSeries(symbol);
          }
          await saveObservations([fetched]);
          return fetched;
        }
      })();
      seriesCache.set(symbol, requested);
      return requested;
    };
    const solutionsBySleeve = new Map<SleeveKey, FeasibleSolution[]>();
    for (const sleeve of failedSleeves) {
      const holdings = holdingsResult.rows.filter((item) => item.sleeve === sleeve).map((item) => normalizeHolding(item));
      const universe = universeResult.rows.filter((item) => item.sleeve === sleeve).map((item) => normalizeHolding(item));
      const benchmarkSeries = await Promise.all(benchmarkBySleeve[sleeve].map(storedSeries));
      const benchmarkWeights = priorBenchmarkManifest.sleeves[sleeve].map((item) => Number(item.weight));
      const target = targets.equityTargets.find((item) => item.key === sleeve);
      const evaluate = async (candidateHoldings: OptimizerHolding[], replacements: number): Promise<FeasibleSolution[]> => {
        const securitySeries = await Promise.all(candidateHoldings.map(priceSeries));
        const commonWeeks = securitySeries[0].points.map((point) => point.week)
          .filter((week) => [...securitySeries, ...benchmarkSeries].every((series) => series.points.some((point) => point.week === week))).sort();
        if (commonWeeks.length < 100) return [];
        const benchmarkReturns = weightedReturns(benchmarkSeries.map((data, index) => ({ data, weight: benchmarkWeights[index] })), commonWeeks);
        const benchmarkDrawdown = maximumDrawdown(benchmarkReturns);
        const feasible: FeasibleSolution[] = [];
        for (const weights of weightVectors(candidateHoldings.length, maxWeightPct)) {
          const portfolioReturns = weightedReturns(securitySeries.map((data, index) => ({ data, weight: weights[index] })), commonWeeks);
          const actualReturn = annualizedReturn(portfolioReturns);
          const actualDrawdown = maximumDrawdown(portfolioReturns);
          const actualBeta = calculateBeta(portfolioReturns, benchmarkReturns);
          const returnResult = returnControl(actualReturn, Number(target.targetReturn), tolerance);
          const drawdownResult = drawdownControl(actualDrawdown, Number(target.maximumDrawdownLimit), benchmarkDrawdown, tolerance);
          const betaResult = betaControl(actualBeta, target.capm as CapmTarget, returnResult.hardPass, drawdownResult.hardPass, tolerance);
          if (!returnResult.hardPass || !drawdownResult.hardPass || !betaResult.hardPass) continue;
          feasible.push({
            sleeve,
            phase: replacements === 0 ? "weight_only" : "minimum_ticker_replacement",
            tickerReplacements: replacements,
            weights,
            holdings: candidateHoldings,
            turnover: oneWayTurnover(holdings, candidateHoldings, weights),
            metrics: { annualizedReturn: actualReturn, beta: actualBeta, maximumDrawdown: actualDrawdown },
            controls: { return: returnResult, beta: betaResult, drawdown: drawdownResult },
            dataSources: securitySeries.map((series) => ({
              symbol: series.symbol,
              provider: series.sourceName,
              url: series.sourceUrl,
              fallbackReason: series.fallbackReason ?? null,
            })),
          });
        }
        return feasible;
      };
      let feasible = await evaluate(holdings, 0);
      if (!feasible.length) {
        const replacementSets = replacementCandidateSets(holdings, universe).filter((item) => item.replacements > 0);
        for (const replacementCount of [...new Set(replacementSets.map((item) => item.replacements))]) {
          const results = await Promise.all(
            replacementSets.filter((item) => item.replacements === replacementCount).map((item) => evaluate(item.holdings, replacementCount)),
          );
          feasible = results.flat();
          if (feasible.length) break;
        }
      }
      if (!feasible.length) throw invalidState(`${sleeve} has no compliant solution after minimum-ticker-replacement search`);
      const selections = [
        [...feasible].sort((a, b) => a.turnover - b.turnover || Math.abs(a.metrics.beta - Number(target.targetBeta)) - Math.abs(b.metrics.beta - Number(target.targetBeta))),
        [...feasible].sort((a, b) => Math.abs(a.metrics.beta - Number(target.targetBeta)) - Math.abs(b.metrics.beta - Number(target.targetBeta)) || a.turnover - b.turnover),
        [...feasible].sort((a, b) => b.metrics.maximumDrawdown - a.metrics.maximumDrawdown || a.turnover - b.turnover),
      ];
      const used = new Set<string>();
      solutionsBySleeve.set(sleeve, selections.map((selection) => {
        const chosen = selection.find((item) => {
          const signature = item.holdings.map(holdingKey).join("|") + item.weights.join(",");
          if (used.has(signature)) return false;
          used.add(signature);
          return true;
        });
        return chosen ?? selection[0];
      }));
    }
    const strategyLabels = ["最小换手", "Beta 贴近目标", "回撤缓冲"];
    const allCandidates = strategyLabels.map((label, strategyIndex) => {
      const sleeveResults = failedSleeves.map((sleeve) => solutionsBySleeve.get(sleeve)![strategyIndex]);
      return {
        key: ["minimum-turnover", "beta-target", "drawdown-buffer"][strategyIndex],
        label,
        phase: sleeveResults.some((item) => item.phase === "minimum_ticker_replacement") ? "minimum_ticker_replacement" : "weight_only",
        tickerReplacements: sleeveResults.reduce((sum, item) => sum + item.tickerReplacements, 0),
        turnover: sleeveResults.reduce((sum, item) => sum + item.turnover, 0) / sleeveResults.length,
        sleeveResults: sleeveResults.map((item) => {
          const proposedKeys = new Set(item.holdings.map(holdingKey));
          const proposed = item.holdings.map((holding, index) => ({
            ticker: holding.ticker,
            exchangeCode: holding.exchangeCode,
            market: holding.market,
            sleeve: holding.sleeve,
            style: holding.style,
            currentWeight: originalWeights.get(holdingKey(holding)) ?? 0,
            proposedWeight: item.weights[index],
          }));
          const removed = originalHoldings.filter((holding) => holding.sleeve === item.sleeve && !proposedKeys.has(holdingKey(holding)))
            .map((holding) => ({
              ticker: holding.ticker,
              exchangeCode: holding.exchangeCode,
              market: holding.market,
              sleeve: holding.sleeve,
              style: holding.style,
              currentWeight: holding.weight,
              proposedWeight: 0,
            }));
          return {
            sleeve: item.sleeve,
            phase: item.phase,
            tickerReplacements: item.tickerReplacements,
            turnover: item.turnover,
            metrics: item.metrics,
            controls: item.controls,
            dataSources: item.dataSources,
            holdings: [...proposed, ...removed].sort((left, right) => left.style.localeCompare(right.style) || left.ticker.localeCompare(right.ticker)),
          };
        }),
      };
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query("SELECT COALESCE(max(run_number), 0)::int + 1 AS run_number FROM optimization_runs WHERE proposed_portfolio_version_id = $1", [proposalId]);
      const saved = await client.query(
        `INSERT INTO optimization_runs
          (proposed_portfolio_version_id, backtest_run_id, run_number, model_version, constraints, candidates, run_by)
         VALUES ($1, $2, $3, 'isater-optimizer-1.1.0', $4, $5, $6) RETURNING *`,
        [proposalId, prior.rows[0].id, next.rows[0].run_number,
          { solveBySleeve: true, phaseOrder: ["weight_only", "minimum_ticker_replacement"], maxSingleSecurityWeightPct: maxWeightPct, failedSleeves }, allCandidates, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "optimization.run", entityType: "optimization_run", entityId: saved.rows[0].id,
        outcome: "allowed", requestId: request.id, ipAddress: request.ip,
        detail: {
          failedSleeves,
          candidateCount: allCandidates.length,
          phases: [...new Set(allCandidates.map((item) => item.phase))],
          minimumTickerReplacements: Math.min(...allCandidates.map((item) => item.tickerReplacements)),
        },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ optimizationRun: saved.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.post("/api/optimization-runs/:runId/select", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "optimization:run")) throw forbidden();
    const { runId } = request.params as { runId: string };
    const input = z.object({ candidateKey: z.string().min(1) }).parse(request.body);
    const run = await pool.query(
      `SELECT o.*, p.workflow_case_id, p.sleeve_target_version_id
         FROM optimization_runs o JOIN proposed_portfolio_versions p ON p.id = o.proposed_portfolio_version_id
         JOIN workflow_cases w ON w.id = p.workflow_case_id
        WHERE o.id = $1 AND w.organization_id = $2 AND w.current_step = 'optimization'`, [runId, user.organizationId],
    );
    if (!run.rows[0]) throw invalidState("Active optimization run not found");
    const candidates = jsonValue<any[]>(run.rows[0].candidates);
    const candidate = candidates.find((item) => item.key === input.candidateKey);
    if (!candidate) throw invalidState("Optimization candidate not found");
    const original = await pool.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1 ORDER BY sleeve, style, ticker", [run.rows[0].proposed_portfolio_version_id]);
    const sleeveResults = (candidate.sleeveResults ?? [{
      sleeve: candidate.sleeve,
      phase: candidate.phase,
      tickerReplacements: candidate.tickerReplacements,
      turnover: candidate.turnover,
      metrics: candidate.metrics,
      controls: candidate.controls,
      holdings: candidate.holdings,
    }]) as Array<any>;
    const optimizedSleeves = new Set(sleeveResults.map((item) => item.sleeve));
    const candidateHoldings = sleeveResults.flatMap((item) => item.holdings).filter((item) => Number(item.proposedWeight) > 0);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query("SELECT COALESCE(max(version), 0)::int + 1 AS version FROM proposed_portfolio_versions WHERE workflow_case_id = $1", [run.rows[0].workflow_case_id]);
      const proposal = await client.query(
        `INSERT INTO proposed_portfolio_versions
          (workflow_case_id, sleeve_target_version_id, version, status, created_by, submitted_at)
         VALUES ($1, $2, $3, 'backtest_passed', $4, now()) RETURNING *`,
        [run.rows[0].workflow_case_id, run.rows[0].sleeve_target_version_id, next.rows[0].version, user.id],
      );
      for (const holding of original.rows.filter((item) => !optimizedSleeves.has(item.sleeve))) {
        await client.query(
          `INSERT INTO proposed_holdings (proposed_portfolio_version_id, ticker, exchange_code, market, sleeve, style, weight, locked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [proposal.rows[0].id, holding.ticker, holding.exchange_code, holding.market, holding.sleeve, holding.style, holding.weight, holding.locked],
        );
      }
      for (const holding of candidateHoldings) {
        await client.query(
          `INSERT INTO proposed_holdings (proposed_portfolio_version_id, ticker, exchange_code, market, sleeve, style, weight, locked)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
          [proposal.rows[0].id, holding.ticker, holding.exchangeCode, holding.market, holding.sleeve, holding.style, holding.proposedWeight],
        );
      }
      const priorBacktest = await client.query("SELECT * FROM backtest_runs WHERE id = $1", [run.rows[0].backtest_run_id]);
      const priorMetrics = jsonValue<{ sleeves: any[] }>(priorBacktest.rows[0].metrics);
      const priorDataManifest = jsonValue<Record<string, any>>(priorBacktest.rows[0].data_manifest);
      const finalHoldings = [
        ...original.rows.filter((item) => !optimizedSleeves.has(item.sleeve)).map((item) => ({ ticker: item.ticker, market: item.market })),
        ...candidateHoldings.map((item) => ({ ticker: item.ticker, market: item.market })),
      ];
      const optimizedDataManifest = {
        ...priorDataManifest,
        symbols: [...new Set(finalHoldings.map((item) => yahooSymbol(item.ticker, item.market)))],
        optimizationSources: sleeveResults.flatMap((item) => item.dataSources ?? []),
        optimizerModelVersion: "isater-optimizer-1.1.0",
        optimizedAt: new Date().toISOString(),
      };
      const resultBySleeve = new Map(sleeveResults.map((item) => [item.sleeve, item]));
      const optimizedMetrics = {
        sleeves: priorMetrics.sleeves.map((item) => {
          const optimized = resultBySleeve.get(item.sleeve);
          return optimized ? {
            ...item,
            annualizedReturn: optimized.metrics.annualizedReturn,
            beta: optimized.metrics.beta,
            maximumDrawdown: optimized.metrics.maximumDrawdown,
            returnControl: optimized.controls.return,
            betaControl: optimized.controls.beta,
            drawdownControl: optimized.controls.drawdown,
            hardPass: true,
          } : item;
        }),
      };
      await client.query(
        `INSERT INTO backtest_runs
          (proposed_portfolio_version_id, run_number, start_date, end_date, frequency, benchmark_manifest, data_manifest,
           metrics, hard_control_pass, review_flags, model_version, run_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, true, $8, 'isater-optimizer-validation-1.1.0', $9)`,
        [proposal.rows[0].id, priorBacktest.rows[0].start_date, priorBacktest.rows[0].end_date, priorBacktest.rows[0].frequency,
          priorBacktest.rows[0].benchmark_manifest, optimizedDataManifest, optimizedMetrics,
          priorBacktest.rows[0].review_flags, user.id],
      );
      await client.query("UPDATE optimization_runs SET selected_candidate_key = $1, selected_by = $2, selected_at = now() WHERE id = $3", [candidate.key, user.id, runId]);
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "optimization.select", entityType: "optimization_run", entityId: runId,
        outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { candidateKey: candidate.key, optimizedPortfolioVersionId: proposal.rows[0].id },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ proposedPortfolioVersion: proposal.rows[0], candidate });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
}
