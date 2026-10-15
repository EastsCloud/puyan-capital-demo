import type { FastifyInstance } from "fastify";
import { betaControl, drawdownControl, hasPermission, returnControl, type BacktestTolerance, type CapmTarget } from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import {
  annualizedReturn,
  calculateBeta,
  maximumDrawdown,
  saveObservations,
  weightedReturns,
  yahooSymbol,
  type PriceSeries,
} from "./backtest.js";
import { pool } from "./db.js";
import { eodhdSymbol, getActiveEodhdToken } from "./eodhd.js";
import { chooseCachedSeries, collectHistoricalSeries } from "./market-history.js";
import { optimizationHistoryWeeks, SHORT_HISTORY_TECHNICAL_MINIMUM } from "./short-history.js";

import type { AuthenticatedUser } from './types.js';
import { runOptimizerWorker } from './optimizer-runner.js';
import { registerOptimizationJobs, latestOptimizationJob } from './optimization-jobs.js';
import { keyOf as holdingKey, type OptimizerHolding, type SolverSolution as FeasibleSolution, type SleeveKey } from './optimizer-search.js';
export { oneWayTurnover, replacementCandidateSets, type OptimizerHolding } from './optimizer-search.js';
import { businessFingerprint } from './short-history.js';
import {proposalChanges} from './proposal-revisions.js';

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

async function storedSeries(symbol: string, minimumWeeks = 100): Promise<PriceSeries> {
  const rows = await pool.query(
    `SELECT observation_date, value, currency, source_url, source_name
       FROM market_observations
      WHERE instrument_key = $1 AND field = 'adjusted_close_weekly_v2'
        AND observation_date >= CURRENT_DATE - INTERVAL '3 years 14 days'
      ORDER BY observation_date, retrieved_at DESC`, [symbol],
  );
  const series = chooseCachedSeries(symbol, rows.rows, new Date(), minimumWeeks);
  if (!series) throw invalidState(`Stored history for ${symbol} is insufficient; rerun backtest data retrieval`);
  return series;
}

export async function registerOptimizationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/optimization/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const latest = await pool.query(
      `SELECT o.* FROM optimization_runs o JOIN proposed_portfolio_versions p ON p.id = o.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 AND p.id=(SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1)
          AND o.backtest_run_id=(SELECT id FROM backtest_runs WHERE proposed_portfolio_version_id=p.id ORDER BY run_at DESC LIMIT 1) AND p.workflow_case_id IN
          (SELECT id FROM workflow_cases WHERE organization_id = $2)
        ORDER BY o.run_at DESC LIMIT 1`, [workflowId, user.organizationId],
    );
    const optimizationJob=await latestOptimizationJob(workflowId,user.organizationId);
    const current=(await pool.query('SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1',[workflowId])).rows[0];
    const currentBacktest=current?(await pool.query('SELECT id FROM backtest_runs WHERE proposed_portfolio_version_id=$1 ORDER BY run_at DESC LIMIT 1',[current.id])).rows[0]:null;
    const currentJob=optimizationJob?.proposed_portfolio_version_id===current?.id&&optimizationJob?.backtest_run_id===currentBacktest?.id?optimizationJob:null;
    const optimizationRun=currentJob&&!currentJob.optimization_run_id?null:latest.rows[0]??null;
    return { optimizationRun, optimizationJob:currentJob };
  });

  async function compute(job:any,user:AuthenticatedUser,request:{id:string;ip:string},signal:AbortSignal,progress:(value:Record<string,unknown>)=>Promise<void>) {
    const workflowId=String(job.workflow_case_id);
    const workflow = await pool.query("SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'", [workflowId, user.organizationId]);
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "optimization") throw invalidState("Optimization is not the current workflow step");
    const prior = await pool.query(
      `SELECT b.*, p.sleeve_target_version_id, p.workflow_case_id
         FROM backtest_runs b JOIN proposed_portfolio_versions p ON p.id = b.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 ORDER BY b.run_at DESC LIMIT 1`, [workflowId],
    );
    if (!prior.rows[0] || prior.rows[0].hard_control_pass || prior.rows[0].id!==job.backtest_run_id || prior.rows[0].proposed_portfolio_version_id!==job.proposed_portfolio_version_id) throw invalidState("The source backtest or proposal changed; start a new optimization job");
    const confirmedShort = prior.rows[0].history_mode === "confirmed_short_history";
    const priorData = jsonValue<Record<string, any>>(prior.rows[0].data_manifest);
    const confirmedWeeks: string[] | null = confirmedShort ? priorData.shortHistoryConfirmation?.usedWeeks ?? null : null;
    if (confirmedShort && (!prior.rows[0].short_history_confirmation_id || !confirmedWeeks || confirmedWeeks.length < SHORT_HISTORY_TECHNICAL_MINIMUM)) throw invalidState("Short-history confirmation is missing; rerun backtest with explicit confirmation");
    const minimumWeeks = confirmedShort ? SHORT_HISTORY_TECHNICAL_MINIMUM : 100;
    const frozenSeries = new Map<string, PriceSeries>();
    if (confirmedShort) {
      const evidence = await pool.query("SELECT history_snapshot FROM backtest_history_confirmations WHERE id=$1 AND organization_id=$2", [prior.rows[0].short_history_confirmation_id, user.organizationId]);
      const prices: PriceSeries[] = evidence.rows[0] ? jsonValue<Record<string, any>>(evidence.rows[0].history_snapshot).prices ?? [] : [];
      for (const series of prices) frozenSeries.set(series.symbol, series);
    }
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
    const priorBenchmarkManifest = jsonValue<{ sleeves: Record<SleeveKey, Array<{ symbol: string; weight: number }>> }>(prior.rows[0].benchmark_manifest);
    const universeResult = await pool.query(
      "SELECT * FROM ticker_universe WHERE enabled = true AND sleeve = ANY($1::text[]) AND (organization_id IS NULL OR organization_id = $2) ORDER BY sleeve, style, ticker",
      [failedSleeves, user.organizationId],
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
    const retrieveSeries = async (symbol: string, providerSymbol: string, market?: string) => {
      signal.throwIfAborted();
      const result = await collectHistoricalSeries([{ symbol, eodhdSymbol: providerSymbol, market }], eodhdToken, undefined, {signal});
      const coverage = result.coverage[0];
      if (coverage.status === "unavailable" || coverage.observations < minimumWeeks) throw invalidState(`${symbol}: ${coverage.observations} complete weekly observations; at least ${minimumWeeks} required. ${coverage.reason ?? ""}`);
      await saveObservations(result.series);
      return result.series[0];
    };
    const seriesCache = new Map<string, Promise<PriceSeries>>([...frozenSeries].map(([symbol, series]) => [symbol, Promise.resolve(series)]));
    const priceSeries = (holding: OptimizerHolding): Promise<PriceSeries> => {
      const symbol = yahooSymbol(holding.ticker, holding.market);
      const cached = seriesCache.get(symbol);
      if (cached) return cached;
      const requested = (async () => {
        try {
          return await storedSeries(symbol, minimumWeeks);
        } catch {
          return retrieveSeries(symbol, eodhdSymbol(holding.ticker, holding.market), holding.market);
        }
      })();
      seriesCache.set(symbol, requested);
      return requested;
    };
    const contextHash=businessFingerprint({proposal:{rows:[{id:proposalId,version:1}]},targets,policy:parameters,sleeveBenchmarkSymbols:priorBenchmarkManifest.sleeves,holdingSymbols:holdingsResult.rows});
    const solutionsBySleeve = new Map<SleeveKey, FeasibleSolution[]>();
    const diagnostics:Record<string,unknown>[]=[];
    const priceBySymbol=new Map<string,PriceSeries>(frozenSeries);
    for (const sleeve of failedSleeves) {
      signal.throwIfAborted();await progress({phase:'preparing',sleeve,completedSleeves:solutionsBySleeve.size,totalSleeves:failedSleeves.length});
      const holdings=originalHoldings.filter(h=>h.sleeve===sleeve);
      const permitted=parameters.portfolioConstruction?.equityMarkets??['US','JP','HK','CN_A'];
      const universe=[...new Map(universeResult.rows.filter(h=>h.sleeve===sleeve&&permitted.includes(h.market)).map(h=>normalizeHolding(h)).map(h=>[holdingKey(h),h])).values()];
      const activeBenchmarks=priorBenchmarkManifest.sleeves[sleeve].filter(item=>Number(item.weight)>0);
      const indexSymbols:Record<string,string>={'^GSPC':'GSPC.INDX','^N225':'N225.INDX','000001.SS':'000001.SHG','^HSI':'HSI.INDX'};
      const benchmarkSeries:PriceSeries[]=[];
      for(const item of activeBenchmarks) {
        signal.throwIfAborted();let data=frozenSeries.get(item.symbol);
        if(!data){try{data=await storedSeries(item.symbol,minimumWeeks);}catch{data=await retrieveSeries(item.symbol,indexSymbols[item.symbol]??item.symbol);}}
        benchmarkSeries.push(data);priceBySymbol.set(data.symbol,data);
      }
      const securities:PriceSeries[]=[];for(const h of holdings){signal.throwIfAborted();const data=await priceSeries(h);securities.push(data);priceBySymbol.set(data.symbol,data);}
      const priorMetric=jsonValue<{sleeves:any[]}>(prior.rows[0].metrics).sleeves.find(item=>item.sleeve===sleeve);
      const weeks=optimizationHistoryWeeks([...securities,...benchmarkSeries],confirmedWeeks).filter(week=>!priorMetric?.startDate||week>=String(priorMetric.startDate).slice(0,10)&&week<=String(priorMetric.endDate).slice(0,10));
      if(weeks.length<minimumWeeks||(confirmedWeeks&&weeks.length!==confirmedWeeks.length))throw Object.assign(invalidState(`${sleeve}: original prices do not cover the accepted backtest window; rerun the backtest coverage check`),{code:'optimization_data_unready'});
      const target=targets.equityTargets.find(item=>item.key===sleeve);
      const input={holdings,universe:[] as OptimizerHolding[],series:[...securities,...benchmarkSeries],weeks,benchmarks:activeBenchmarks,target,tolerance,maxWeightPct,budget:{maxEvaluations:12000,maxCandidateSets:1}};
      await progress({phase:'running',sleeve,evaluations:0});
      let lastProgress=0;const notify=(value:Record<string,unknown>)=>{if(Date.now()-lastProgress<500)return;lastProgress=Date.now();void progress({phase:'running',sleeve,...value}).catch(()=>{});};
      let solved=await runOptimizerWorker(input,signal,notify);
      const originalDiagnostics=solved.diagnostics;
      if(!solved.solutions.length) {
        const alternatives=universe.filter(h=>!holdings.some(original=>holdingKey(original)===holdingKey(h))).slice(0,24);
        const missing:string[]=[];const usable:OptimizerHolding[]=[];
        // Serial, bounded retrieval. Missing replacements are reported, never fatal for other candidates.
        for(const h of alternatives){signal.throwIfAborted();await progress({phase:'preparing',sleeve,replacementPricesLoaded:usable.length,replacementPriceLimit:alternatives.length});
          try{const data=await priceSeries(h);if(!weeks.every(week=>data.points.some(point=>point.week===week))){missing.push(holdingKey(h));continue;}priceBySymbol.set(data.symbol,data);usable.push(h);}
          catch(error){signal.throwIfAborted();missing.push(holdingKey(h));}
        }
        await progress({phase:'running',sleeve});
        solved=await runOptimizerWorker({...input,universe:usable,series:[...new Map([...input.series,...usable.map(h=>priceBySymbol.get(yahooSymbol(h.ticker,h.market))!)].map(s=>[s.symbol,s])).values()],budget:{maxEvaluations:28000,maxCandidateSets:64,maxReplacements:2}},signal,notify);
        diagnostics.push({sleeve,weightOnly:originalDiagnostics,replacement:solved.diagnostics,missingReplacementPrices:missing,universeTruncated:universe.length>holdings.length+24});
      }else diagnostics.push({sleeve,weightOnly:solved.diagnostics});
      if(!solved.solutions.length)throw Object.assign(new Error('Search budget did not find a compliant solution'),{code:solved.outcome==='budget_exhausted'?'search_budget_exhausted':'search_no_candidate',diagnostics});
      // Independently recompute every retained result using the main backtest math.
      await progress({phase:'validating',sleeve});
      for(const solution of solved.solutions) {
        const sum=solution.weights.reduce((s,w)=>s+w,0);
        if(Math.abs(sum-1)>1e-8||solution.weights.some(w=>!Number.isFinite(w)||w<=0||w>maxWeightPct/100+1e-10))throw new Error('Optimizer weight validation failed');
        for(const locked of holdings.filter(h=>h.locked)){const i=solution.holdings.findIndex(h=>holdingKey(h)===holdingKey(locked));if(i<0||Math.abs(solution.weights[i]-locked.weight)>1e-10)throw new Error('Optimizer changed a locked holding');}
        for(const style of ['growth','value'])if(solution.holdings.filter(h=>h.style===style).length!==holdings.filter(h=>h.style===style).length)throw new Error('Optimizer changed style counts');
        const securityReturns=weightedReturns(solution.holdings.map((h,i)=>({data:priceBySymbol.get(yahooSymbol(h.ticker,h.market))!,weight:solution.weights[i]})),weeks);
        const benchmarkReturns=weightedReturns(benchmarkSeries.map((data,i)=>({data,weight:Number(activeBenchmarks[i].weight)})),weeks);
        const actualReturn=annualizedReturn(securityReturns),actualDrawdown=maximumDrawdown(securityReturns),actualBeta=calculateBeta(securityReturns,benchmarkReturns);
        const r=returnControl(actualReturn,Number(target.targetReturn),tolerance),d=drawdownControl(actualDrawdown,Number(target.maximumDrawdownLimit),maximumDrawdown(benchmarkReturns),tolerance),b=betaControl(actualBeta,target.capm as CapmTarget,r.hardPass,d.hardPass,tolerance);
        if(!r.hardPass||!d.hardPass||!b.hardPass)throw new Error('Optimizer independent risk verification failed');
        solution.metrics={annualizedReturn:actualReturn,beta:actualBeta,maximumDrawdown:actualDrawdown};solution.controls={return:r,beta:b,drawdown:d};
      }
      solutionsBySleeve.set(sleeve,solved.solutions);
    }
    const strategyLabels = ["低换手（预算内）", "Beta 贴近目标（预算内）", "回撤缓冲（预算内）"];
    const candidateSignatures=new Set<string>();
    const allCandidates = strategyLabels.map((label, strategyIndex) => {
      const sleeveResults = failedSleeves.map((sleeve) => (solutionsBySleeve.get(sleeve)![strategyIndex] ?? solutionsBySleeve.get(sleeve)![0]));
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
            startDate:item.startDate,endDate:item.endDate,observationCount:item.observationCount,
            holdings: [...proposed, ...removed].sort((left, right) => left.style.localeCompare(right.style) || left.ticker.localeCompare(right.ticker)),
          };
        }),
      };
    }).filter(candidate=>{const signature=JSON.stringify(candidate.sleeveResults.map(item=>item.holdings.map(h=>[h.ticker,h.exchangeCode,h.proposedWeight])));if(candidateSignatures.has(signature))return false;candidateSignatures.add(signature);return true;});
    await progress({phase:'persisting',completedSleeves:failedSleeves.length});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const active=await client.query("SELECT id FROM optimization_jobs WHERE id=$1 AND status IN ('queued','preparing','running') FOR UPDATE",[job.id]);
      const current=await client.query("SELECT id FROM workflow_cases WHERE id=$1 AND organization_id=$2 AND current_step='optimization' AND status='active' FOR UPDATE",[workflowId,user.organizationId]);
      const latest=await client.query("SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1",[workflowId]);
      signal.throwIfAborted();if(!active.rows[0]||!current.rows[0]||latest.rows[0]?.id!==proposalId||JSON.stringify(await effectiveParameters(user.organizationId))!==JSON.stringify(parameters))throw new Error('Optimization context changed before persistence');
      const next = await client.query("SELECT COALESCE(max(run_number), 0)::int + 1 AS run_number FROM optimization_runs WHERE proposed_portfolio_version_id = $1", [proposalId]);
      const saved = await client.query(
        `INSERT INTO optimization_runs
          (proposed_portfolio_version_id, backtest_run_id, run_number, model_version, constraints, candidates, run_by)
         VALUES ($1, $2, $3, 'isater-optimizer-1.3.0', $4, $5, $6) RETURNING *`,
        [proposalId, prior.rows[0].id, next.rows[0].run_number,
          { solveBySleeve: true, phaseOrder: ["weight_only", "minimum_ticker_replacement"], maxSingleSecurityWeightPct: maxWeightPct, failedSleeves, contextHash, parameterSnapshot:parameters, diagnostics, globalOptimalityProven:false, searchMethod:"bounded coordinate search; up to 24 replacement securities and 64 sets; max 2 replacements" }, allCandidates, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "optimization.run", entityType: "optimization_run", entityId: saved.rows[0].id,
        outcome: "allowed", requestId: request.id, ipAddress: request.ip,
        detail: {
          failedSleeves,
          candidateCount: allCandidates.length,
          phases: [...new Set(allCandidates.map((item) => item.phase))],
          fewestReplacementsAmongRetained: Math.min(...allCandidates.map((item) => item.tickerReplacements)),
        },
      });
      await client.query("UPDATE optimization_jobs SET status='succeeded',optimization_run_id=$2,message='已生成并复核预算内找到的可行方案。',progress=progress||$3::jsonb,finished_at=now(),updated_at=now() WHERE id=$1",[job.id,saved.rows[0].id,JSON.stringify({phase:'completed',diagnostics})]);
      await client.query("COMMIT");
      return saved.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  await registerOptimizationJobs(app,compute);

  app.post("/api/optimization-runs/:runId/select", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "optimization:run")) throw forbidden();
    const { runId } = request.params as { runId: string };
    const input = z.object({ candidateKey: z.string().min(1) }).parse(request.body);
    const run = await pool.query(
      `SELECT o.*, p.workflow_case_id, p.sleeve_target_version_id
         FROM optimization_runs o JOIN proposed_portfolio_versions p ON p.id = o.proposed_portfolio_version_id
         JOIN workflow_cases w ON w.id = p.workflow_case_id
        WHERE o.id = $1 AND w.organization_id = $2 AND w.current_step = 'optimization'
          AND o.backtest_run_id=(SELECT id FROM backtest_runs WHERE proposed_portfolio_version_id=p.id ORDER BY run_at DESC LIMIT 1)`, [runId, user.organizationId],
    );
    if (!run.rows[0]) throw invalidState("Active optimization run not found");
    const constraints=jsonValue<Record<string,any>>(run.rows[0].constraints);
    if(constraints.parameterSnapshot&&JSON.stringify(await effectiveParameters(user.organizationId))!==JSON.stringify(constraints.parameterSnapshot))throw invalidState('Parameters changed after optimization; generate a new optimization run');
    const candidates = jsonValue<any[]>(run.rows[0].candidates);
    const candidate = candidates.find((item) => item.key === input.candidateKey);
    if (!candidate) throw invalidState("Optimization candidate not found");
    const original = await pool.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1 ORDER BY sleeve, style, ticker", [run.rows[0].proposed_portfolio_version_id]);
    if(constraints.contextHash){const source=(await pool.query('SELECT benchmark_manifest FROM backtest_runs WHERE id=$1',[run.rows[0].backtest_run_id])).rows[0];const target=(await pool.query('SELECT targets FROM sleeve_target_versions WHERE id=$1',[run.rows[0].sleeve_target_version_id])).rows[0];const hash=businessFingerprint({proposal:{rows:[{id:run.rows[0].proposed_portfolio_version_id,version:1}]},targets:jsonValue(target.targets),policy:await effectiveParameters(user.organizationId),sleeveBenchmarkSymbols:jsonValue<any>(source.benchmark_manifest).sleeves,holdingSymbols:original.rows});if(hash!==constraints.contextHash)throw invalidState('Portfolio targets, holdings or parameters changed; generate a new optimization run');}
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
      const currentWorkflow=await client.query("SELECT id FROM workflow_cases WHERE id=$1 AND organization_id=$2 AND current_step='optimization' AND status='active' FOR UPDATE",[run.rows[0].workflow_case_id,user.organizationId]);
      const latestProposal=await client.query("SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1",[run.rows[0].workflow_case_id]);
      if(!currentWorkflow.rows[0]||latestProposal.rows[0]?.id!==run.rows[0].proposed_portfolio_version_id)throw invalidState('Proposal changed or candidate was already accepted; reload the current workflow');
      const next = await client.query("SELECT COALESCE(max(version), 0)::int + 1 AS version FROM proposed_portfolio_versions WHERE workflow_case_id = $1", [run.rows[0].workflow_case_id]);
      const proposal = await client.query(
        `INSERT INTO proposed_portfolio_versions
          (workflow_case_id, sleeve_target_version_id, version, status, created_by, submitted_at,parent_version_id,change_summary)
         VALUES ($1, $2, $3, 'backtest_passed', $4, now(),$5,$6) RETURNING *`,
        [run.rows[0].workflow_case_id, run.rows[0].sleeve_target_version_id, next.rows[0].version, user.id,run.rows[0].proposed_portfolio_version_id,proposalChanges(original.rows,[...original.rows.filter(h=>!optimizedSleeves.has(h.sleeve)),...candidateHoldings.map(h=>({...h,weight:h.proposedWeight,locked:original.rows.find(old=>old.ticker===h.ticker&&old.exchange_code===h.exchangeCode)?.locked??false}))])],
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [proposal.rows[0].id, holding.ticker, holding.exchangeCode, holding.market, holding.sleeve, holding.style, holding.proposedWeight,original.rows.find(item=>item.ticker===holding.ticker&&item.exchange_code===holding.exchangeCode)?.locked??false],
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
        optimizerModelVersion: "isater-optimizer-1.3.0",
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
            startDate:optimized.startDate??item.startDate,endDate:optimized.endDate??item.endDate,observationCount:optimized.observationCount??item.observationCount,
            returnControl: optimized.controls.return,
            betaControl: optimized.controls.beta,
            drawdownControl: optimized.controls.drawdown,
            hardPass: true,
          } : item;
        }),
      };
      const flags=jsonValue<Array<Record<string,any>>>(priorBacktest.rows[0].review_flags).filter(item=>item.control==='short_history');
      for(const metric of optimizedMetrics.sleeves){if(metric.returnControl?.review)flags.push({sleeve:metric.sleeve,control:'return',reason:'Return is materially above the target; committee review is required.'});if(metric.betaControl?.review)flags.push({sleeve:metric.sleeve,control:'beta',reason:'Low or inactive beta control; committee review is required.'});}
      await client.query(
        `INSERT INTO backtest_runs
          (proposed_portfolio_version_id, run_number, start_date, end_date, frequency, benchmark_manifest, data_manifest,
           metrics, hard_control_pass, review_flags, model_version, run_by, history_mode, short_history_confirmation_id)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, true, $8, 'isater-optimizer-validation-1.3.0', $9, $10, $11)`,
        [proposal.rows[0].id, priorBacktest.rows[0].start_date, priorBacktest.rows[0].end_date, priorBacktest.rows[0].frequency,
          priorBacktest.rows[0].benchmark_manifest, optimizedDataManifest, optimizedMetrics,
          flags, user.id, priorBacktest.rows[0].history_mode ?? "standard", priorBacktest.rows[0].short_history_confirmation_id ?? null],
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
