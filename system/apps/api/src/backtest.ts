import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
import { pool, type DatabaseClient } from "./db.js";
import { eodhdSymbol, getActiveEodhdToken } from "./eodhd.js";
import { collectHistoricalSeries, historyReport, yahooSymbol, type PriceSeries } from "./market-history.js";
import { businessFingerprint, commonHistoryWeeks, shortHistoryOption, SHORT_HISTORY_TECHNICAL_MINIMUM, SHORT_HISTORY_WARNING } from "./short-history.js";
import { weightedReturns, annualizedReturn, maximumDrawdown, calculateBeta } from './backtest-math.js';
export { fetchEodhdWeeklySeries, fetchYahooSeries, weekKey, yahooSymbol, type PriceSeries, type PricePoint } from "./market-history.js";

type SleeveKey = "us" | "developedNonUs" | "emerging";

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

export { weightedReturns, annualizedReturn, maximumDrawdown, calculateBeta } from './backtest-math.js';

export async function saveObservations(series: PriceSeries[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const observations = series.flatMap((item) => item.points.map((point) => ({
      symbol: item.symbol, date: point.date, value: point.value, currency: item.currency,
      sourceName: item.sourceName, sourceUrl: item.sourceUrl,
    })));
    const batchSize = 500;
    for (let offset = 0; offset < observations.length; offset += batchSize) {
      const batch = observations.slice(offset, offset + batchSize);
      const values: unknown[] = [];
      const rows = batch.map((observation, index) => {
        const base = index * 6;
        values.push(observation.symbol, observation.date, observation.value, observation.currency,
          observation.sourceName, observation.sourceUrl);
        return `($${base + 1}, $${base + 2}, 'adjusted_close_weekly_v2', $${base + 3}, NULLIF($${base + 4}, ''), $${base + 5}, $${base + 6}, now())`;
      });
      await client.query(
        `INSERT INTO market_observations
          (instrument_key, observation_date, field, value, currency, source_name, source_url, retrieved_at)
         VALUES ${rows.join(",")}
         ON CONFLICT (instrument_key, observation_date, field, source_name)
         DO UPDATE SET value = EXCLUDED.value, currency = EXCLUDED.currency,
           source_url = EXCLUDED.source_url, retrieved_at = EXCLUDED.retrieved_at`,
        values,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function backtestParameters(organizationId: string, db: Pick<DatabaseClient, "query"> = pool): Promise<BacktestTolerance & { months: number; frequency: string }> {
  const effective = await db.query("SELECT parameters FROM parameter_sets WHERE organization_id = $1 AND status = 'effective' LIMIT 1", [organizationId]);
  const defaults = effective.rows[0] ? null : await db.query("SELECT parameters FROM default_business_parameters ORDER BY version DESC LIMIT 1");
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
  async function loadContext(workflowId: string, user: { organizationId: string; locale?: string }, db: Pick<DatabaseClient, "query"> = pool) {
    const workflow = await db.query("SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'", [workflowId, user.organizationId]);
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "backtest") throw invalidState("Backtest is not the current workflow step");
    const proposal = await db.query(
      `SELECT p.*, s.targets, a.recommendation
         FROM proposed_portfolio_versions p
         JOIN sleeve_target_versions s ON s.id = p.sleeve_target_version_id
         JOIN target_return_versions t ON t.id = s.target_return_version_id
         JOIN annual_data_packages a ON a.id = t.annual_data_package_id
        WHERE p.workflow_case_id = $1 ORDER BY p.version DESC LIMIT 1`, [workflowId],
    );
    if (!proposal.rows[0]) throw invalidState("Submitted proposed portfolio not found");
    const holdings = await db.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1 ORDER BY sleeve, style, ticker", [proposal.rows[0].id]);
    const targets = jsonValue<{ equityTargets: Array<any> }>(proposal.rows[0].targets);
    const recommendation = jsonValue<{ marketWeights: { chinaA: number; hongKong: number } }>(proposal.rows[0].recommendation);
    if (!Number.isFinite(recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong) || recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong <= 0) throw invalidState("Emerging-market benchmark weights are missing or invalid");
    const policy = await backtestParameters(user.organizationId, db);
    const sleeveBenchmarkSymbols: Record<SleeveKey, Array<{ symbol: string; eodhdSymbol: string; weight: number }>> = {
      us: [{ symbol: "^GSPC", eodhdSymbol: "GSPC.INDX", weight: 1 }],
      developedNonUs: [{ symbol: "^N225", eodhdSymbol: "N225.INDX", weight: 1 }],
      emerging: [
        { symbol: "000001.SS", eodhdSymbol: "000001.SHG", weight: recommendation.marketWeights.chinaA / (recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong) },
        { symbol: "^HSI", eodhdSymbol: "HSI.INDX", weight: recommendation.marketWeights.hongKong / (recommendation.marketWeights.chinaA + recommendation.marketWeights.hongKong) },
      ],
    };
    if (!holdings.rows.length || (["us", "developedNonUs", "emerging"] as SleeveKey[]).some(sleeve => !holdings.rows.some(item => item.sleeve === sleeve) || !targets.equityTargets.find(item => item.key === sleeve))) throw invalidState("Saved proposal must contain holdings and targets for all three sleeves");
    const holdingSymbols = holdings.rows.map((holding) => ({
      ...holding,
      providerSymbol: yahooSymbol(holding.ticker, holding.market),
      eodhdSymbol: eodhdSymbol(holding.ticker, holding.market),
    }));
    const requests = [...holdingSymbols.map((item) => ({ symbol: item.providerSymbol, eodhdSymbol: item.eodhdSymbol, market: item.market })),
      ...Object.values(sleeveBenchmarkSymbols).flat().filter(item => item.weight > 0).map((item) => ({ symbol: item.symbol, eodhdSymbol: item.eodhdSymbol }))];
    const uniqueRequests = [...new Map(requests.map((item) => [item.symbol, item])).values()];
    const allSymbols = uniqueRequests.map((item) => item.symbol);
    return { proposal, targets, policy, sleeveBenchmarkSymbols, holdingSymbols, uniqueRequests, allSymbols };
  }
  async function prepare(context: Awaited<ReturnType<typeof loadContext>>, user: { organizationId: string; locale?: string }) {
    const { proposal, policy, sleeveBenchmarkSymbols, holdingSymbols, uniqueRequests } = context;
    const eodhdToken = await getActiveEodhdToken(user.organizationId);
    const collected = await collectHistoricalSeries(uniqueRequests, eodhdToken);
    const report = historyReport(collected, (["us", "developedNonUs", "emerging"] as SleeveKey[]).map(sleeve => ({ sleeve, symbols: [...holdingSymbols.filter(item => item.sleeve === sleeve).map(item => item.providerSymbol), ...sleeveBenchmarkSymbols[sleeve].filter(item => item.weight > 0).map(item => item.symbol)] })), user.locale === "zh-CN");
    return { ...context, eodhdConfigured: Boolean(eodhdToken), allSeries: collected.series, report: { ...report, proposedPortfolioVersion: Number(proposal.rows[0].version), shortHistory: shortHistoryOption(report, collected.series, proposal.rows[0].id, policy) } };
  }
  async function snapshotReport(prepared: Awaited<ReturnType<typeof prepare>>, workflowId: string, user: { id: string; organizationId: string }) {
    if (!prepared.report.shortHistory.eligible) return prepared.report;
    await pool.query("DELETE FROM backtest_data_snapshots WHERE organization_id = $1 AND expires_at <= now()", [user.organizationId]);
    const saved = await pool.query(`INSERT INTO backtest_data_snapshots
      (organization_id,workflow_case_id,proposed_portfolio_version_id,created_by,business_fingerprint,coverage_fingerprint,snapshot_payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, expires_at`,
    [user.organizationId, workflowId, prepared.proposal.rows[0].id, user.id, businessFingerprint(prepared), prepared.report.shortHistory.coverageFingerprint,
      JSON.stringify({ allSeries: prepared.allSeries, report: prepared.report, eodhdConfigured: prepared.eodhdConfigured })]);
    return { ...prepared.report, shortHistory: { ...prepared.report.shortHistory, snapshotId: String(saved.rows[0].id), expiresAt: new Date(saved.rows[0].expires_at).toISOString() } };
  }
  app.post("/api/workflows/:workflowId/backtest/preflight", async (request) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "backtest:run")) throw forbidden();
    const { workflowId } = request.params as { workflowId: string };
    return { report: await snapshotReport(await prepare(await loadContext(workflowId, user), user), workflowId, user) };
  });

  app.get("/api/workflows/:workflowId/backtest/context", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query("SELECT id FROM workflow_cases WHERE id = $1 AND organization_id = $2", [workflowId, user.organizationId]);
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const latest = await pool.query(
      `SELECT b.* FROM backtest_runs b JOIN proposed_portfolio_versions p ON p.id = b.proposed_portfolio_version_id
        WHERE p.workflow_case_id = $1 AND p.id = (SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1)
        ORDER BY b.run_at DESC LIMIT 1`, [workflowId],
    );
    return { policy: await backtestParameters(user.organizationId), backtestRun: latest.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/backtest/runs", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "backtest:run")) throw forbidden();
    const { workflowId } = request.params as { workflowId: string };
    const input = z.object({ shortHistoryConfirmation: z.object({
      acknowledged: z.literal(true), proposedPortfolioVersionId: z.string().uuid(), coverageFingerprint: z.string().regex(/^[a-f0-9]{64}$/), snapshotId: z.string().uuid().optional(),
    }).optional() }).parse(request.body ?? {});
    const consent = input.shortHistoryConfirmation;
    if (consent && user.role !== "execution_team") throw forbidden("Only the execution team can confirm a short-history backtest");
    const context = await loadContext(workflowId, user);
    let prepared: Awaited<ReturnType<typeof prepare>>;
    if (consent) {
      const snapshot = consent.snapshotId ? await pool.query(`SELECT * FROM backtest_data_snapshots WHERE id=$1 AND organization_id=$2 AND workflow_case_id=$3 AND created_by=$4 AND expires_at > now()`, [consent.snapshotId,user.organizationId,workflowId,user.id]) : { rows: [] };
      const stored = snapshot.rows[0];
      if (!stored) return reply.code(422).send({ error: "backtest_snapshot_expired", message: user.locale === "zh-CN" ? "价格快照不存在或已过期，请重新点击“检查全部价格覆盖”后确认（快照保留30分钟）。" : "Price snapshot missing or expired. Check all price coverage again and confirm within 30 minutes." });
      if (stored.proposed_portfolio_version_id !== context.proposal.rows[0].id || consent.proposedPortfolioVersionId !== context.proposal.rows[0].id || stored.business_fingerprint !== businessFingerprint(context) || stored.coverage_fingerprint !== consent.coverageFingerprint) {
        return reply.code(422).send({ error: "short_history_confirmation_stale", message: user.locale === "zh-CN" ? "组合或参数已变化，请重新检查价格覆盖后确认。" : "Proposal or policy changed. Check price coverage again before confirming." });
      }
      const payload = jsonValue<Pick<Awaited<ReturnType<typeof prepare>>, "allSeries" | "report" | "eodhdConfigured">>(stored.snapshot_payload);
      prepared = { ...context, ...payload, report: { ...payload.report, shortHistory: { ...payload.report.shortHistory, snapshotId: String(stored.id), expiresAt: new Date(stored.expires_at).toISOString() } } };
    } else {
      prepared = await prepare(context, user);
    }
    const { proposal, targets, policy, sleeveBenchmarkSymbols, holdingSymbols, uniqueRequests, allSymbols, eodhdConfigured, allSeries } = prepared;
    const report = !consent && !prepared.report.ready ? await snapshotReport(prepared, workflowId, user) : prepared.report;
    if (!report.ready && (!consent || !report.shortHistory.eligible)) return reply.code(422).send({ error: "backtest_data_unready", message: report.issues.map(item => item.message).join(" "), report });
    const confirmedWeeks = consent ? commonHistoryWeeks(allSeries) : null;
    let confirmation: Record<string, any> | null = null;
    if (consent) {
      // Commit consent independently: evidence must remain even if a later calculation fails.
      const evidence = await pool.connect();
      try {
        await evidence.query("BEGIN");
        const saved = await evidence.query(`INSERT INTO backtest_history_confirmations
          (organization_id, workflow_case_id, proposed_portfolio_version_id, confirmed_by, coverage_fingerprint, warning_text, history_snapshot, data_snapshot_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, confirmed_at`,
        [user.organizationId, workflowId, proposal.rows[0].id, user.id, consent.coverageFingerprint, SHORT_HISTORY_WARNING,
          JSON.stringify({ proposalVersion: Number(proposal.rows[0].version), report, policy, usedWeeks: confirmedWeeks,
            prices: allSeries, dataSnapshotId: consent.snapshotId,
            usedDataRanges: allSeries.map(series => { const points = series.points.filter(point => confirmedWeeks!.includes(point.week)); return { symbol: series.symbol, provider: series.sourceName, firstDate: points[0]?.date, lastDate: points.at(-1)?.date, observations: points.length }; }) }), consent.snapshotId]);
        confirmation = { id: saved.rows[0].id, confirmedAt: saved.rows[0].confirmed_at, confirmedById: user.id, confirmedByName: user.displayName,
          proposalVersion: Number(proposal.rows[0].version), usedWeeks: confirmedWeeks, commonWeeks: confirmedWeeks!.length,
          firstWeek: confirmedWeeks![0], lastWeek: confirmedWeeks!.at(-1), dataSnapshotId: consent.snapshotId, warning: SHORT_HISTORY_WARNING };
        await writeAudit(evidence, { organizationId: user.organizationId, actorUserId: user.id, action: "backtest.short_history.confirm", entityType: "backtest_history_confirmation", entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: confirmation });
        await evidence.query("COMMIT");
      } catch (error) { await evidence.query("ROLLBACK"); throw error; } finally { evidence.release(); }
    }
    try {
      await saveObservations(allSeries);
      const bySymbol = new Map(allSeries.map((item) => [item.symbol, item]));
      const sleeveMetrics = [];
      const reviewFlags: Array<{ sleeve: SleeveKey; control: string; reason: string }> = [];
      for (const sleeve of ["us", "developedNonUs", "emerging"] as SleeveKey[]) {
        const sleeveHoldings = holdingSymbols.filter((item) => item.sleeve === sleeve);
        const securities = sleeveHoldings.map((item) => ({ data: bySymbol.get(item.providerSymbol)!, weight: Number(item.weight) }));
        const benchmarks = sleeveBenchmarkSymbols[sleeve].filter(item => item.weight > 0).map((item) => ({ data: bySymbol.get(item.symbol)!, weight: item.weight }));
        const commonWeeks = confirmedWeeks ?? [...new Set(securities[0].data.points.map((point) => point.week))]
          .filter((week) => [...securities, ...benchmarks].every((item) => item.data.points.some((point) => point.week === week)))
          .sort();
        if (commonWeeks.length < (confirmation ? SHORT_HISTORY_TECHNICAL_MINIMUM : 100)) throw invalidState(`${sleeve} has insufficient aligned weekly observations`);
        if (confirmation) reviewFlags.push({ sleeve, control: "short_history", reason: SHORT_HISTORY_WARNING });
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
        const locked = await client.query("SELECT id, current_step FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active' FOR UPDATE", [workflowId, user.organizationId]);
        const latestProposal = await client.query("SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1", [workflowId]);
        if (!locked.rows[0] || locked.rows[0].current_step !== "backtest" || latestProposal.rows[0]?.id !== proposal.rows[0].id) throw invalidState("Workflow or proposal changed while backtesting; run again for the current version");
        if (businessFingerprint(await loadContext(workflowId, user, client)) !== businessFingerprint(prepared)) throw invalidState("Proposal or policy changed while backtesting; check coverage again");
        const next = await client.query("SELECT COALESCE(max(run_number), 0)::int + 1 AS run_number FROM backtest_runs WHERE proposed_portfolio_version_id = $1", [proposal.rows[0].id]);
        const saved = await client.query(
          `INSERT INTO backtest_runs
            (proposed_portfolio_version_id, run_number, start_date, end_date, frequency, benchmark_manifest, data_manifest,
             metrics, hard_control_pass, review_flags, model_version, run_by, history_mode, short_history_confirmation_id)
           VALUES ($1, $2, $3, $4, 'weekly', $5, $6, $7, $8, $9, 'isater-backtest-1.2.1', $10, $11, $12) RETURNING *`,
          [proposal.rows[0].id, next.rows[0].run_number, startDate, endDate,
            JSON.stringify({ sleeves: sleeveBenchmarkSymbols, methodology: report.methodology }),
            JSON.stringify({ provider: [...new Set(allSeries.map((item) => item.sourceName))].join(" + "), primaryProvider: "EODHD",
              primaryProviderStatus: eodhdConfigured ? (allSeries.every((item) => item.sourceName === "EODHD") ? "succeeded" : "partial_fallback") : "not_configured",
              symbols: allSymbols, eodhdSymbols: uniqueRequests.map((item) => item.eodhdSymbol), retrievedAt: report.checkedAt, backtestedAt: new Date().toISOString(), dataSnapshotId: consent?.snapshotId ?? null,
              persistedToMarketObservations: true, coverageReport: { ...report, shortHistory: { ...report.shortHistory, accepted: Boolean(confirmation) } }, shortHistoryConfirmation: confirmation,
              sources: allSeries.map((item) => ({ symbol: item.symbol, provider: item.sourceName, url: item.sourceUrl, fallbackReason: item.fallbackReason ?? null })) }),
            JSON.stringify({ sleeves: sleeveMetrics }), hardControlPass, JSON.stringify(reviewFlags), user.id, confirmation ? "confirmed_short_history" : "standard", confirmation?.id ?? null],
        );
        await client.query("UPDATE proposed_portfolio_versions SET status = $1 WHERE id = $2", [hardControlPass ? "backtest_passed" : "backtest_failed", proposal.rows[0].id]);
        await writeAudit(client, {
          organizationId: user.organizationId, actorUserId: user.id, action: "backtest.run", entityType: "backtest_run",
          entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip,
          detail: { runNumber: saved.rows[0].run_number, hardControlPass,
            source: [...new Set(allSeries.map((item) => item.sourceName))].join(" + "), startDate, endDate, shortHistoryConfirmationId: confirmation?.id ?? null },
        });
        await client.query("COMMIT");
        return reply.code(201).send({ backtestRun: saved.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (!confirmation) throw error;
      request.log.error({ err: error, shortHistoryConfirmationId: confirmation.id }, "Confirmed short-history backtest failed");
      return reply.code((error as { statusCode?: number }).statusCode ?? 500).send({ error: "confirmed_backtest_failed", message: user.locale === "zh-CN" ? `确认已记录（${confirmation.id}），但回测未完成。${(error as { statusCode?: number }).statusCode === 409 ? (error as Error).message : "请查看服务器日志。"}` : `Confirmation recorded (${confirmation.id}), but backtest failed. ${(error as { statusCode?: number }).statusCode === 409 ? (error as Error).message : "Check server logs."}`, shortHistoryConfirmationId: confirmation.id, report });
    }
  });
}
