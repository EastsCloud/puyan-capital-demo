import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { requirePasswordChanged } from "./auth.js";
import { pool, type DatabaseClient } from "./db.js";
import { brinsonFachlerAttribution, isoBusinessDate, modifiedDietzReturn, performance, valuationDateMatchesLatestEquitySnapshot } from "./monitoring-reporting-math.js";
import { fetchEodhdPrices, getActiveEodhdToken } from "./eodhd.js";

const navSchema = z.object({
  asOfDate: z.string().date(),
  bondNav: z.number().nonnegative(),
  alternativeNav: z.number().nonnegative(),
  cashNav: z.number().nonnegative(),
  sourceNote: z.string().trim().min(1).max(500),
});

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

function requireExecution(request: FastifyRequest) {
  const user = requirePasswordChanged(request);
  if (user.role !== "execution_team") throw forbidden();
  return user;
}

function jsonValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function isoDate(value: string | Date): string {
  return isoBusinessDate(value);
}

interface DailyPoint { date: string; value: number }

interface ReportPriceSeries { symbol: string; points: DailyPoint[]; sourceUrl: string; sourceName: "EODHD" | "Yahoo Finance chart"; fallbackReason?: string }

async function fetchDailySeries(symbol: string, startDate: string, endDate: string): Promise<ReportPriceSeries> {
  const from = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000) - 10 * 86_400;
  const to = Math.floor(new Date(`${endDate}T00:00:00Z`).getTime() / 1000) + 2 * 86_400;
  const sourceUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d&events=history&includeAdjustedClose=true`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 Isater/0.1" }, signal: AbortSignal.timeout(25_000) });
    if (response.ok) break;
    if (response.status !== 429 || attempt === 2) throw invalidState(`Report benchmark unavailable for ${symbol}: HTTP ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }
  const payload = await response!.json() as any;
  const result = payload.chart?.result?.[0];
  if (!result?.timestamp?.length) throw invalidState(`Report benchmark unavailable for ${symbol}`);
  const adjustedValues = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const closeValues = result.indicators?.quote?.[0]?.close ?? [];
  const points = result.timestamp.flatMap((timestamp: number, index: number) => {
    const value = adjustedValues[index] ?? closeValues[index];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return [];
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    return date <= endDate ? [{ date, value }] : [];
  });
  return { symbol, points, sourceUrl, sourceName: "Yahoo Finance chart" };
}

async function fetchPreferredDailySeries(token: string | null, symbol: string, startDate: string, endDate: string): Promise<ReportPriceSeries> {
  if (token) {
    try {
      const result = await fetchEodhdPrices(token, `${symbol}.US`, { from: startDate, to: endDate, period: "d" });
      return { symbol, points: result.points, sourceUrl: result.sourceUrl, sourceName: "EODHD" };
    } catch (error) {
      const fallback = await fetchDailySeries(symbol, startDate, endDate);
      fallback.fallbackReason = error instanceof Error ? error.message : String(error);
      return fallback;
    }
  }
  return fetchDailySeries(symbol, startDate, endDate);
}

function valueOnOrBefore(points: DailyPoint[], date: string): number | null {
  return points.filter((point) => point.date <= date).at(-1)?.value ?? null;
}

function normalizeSeries(points: DailyPoint[]): DailyPoint[] {
  if (points.length < 2 || points[0].value <= 0) return [];
  const first = points[0].value;
  return points.map((point) => ({ date: point.date, value: 100 * point.value / first }));
}

function trimSeries(points: DailyPoint[], startDate: string, endDate: string): DailyPoint[] {
  return points.filter((point) => point.date >= startDate && point.date <= endDate);
}

function compositeSeries(components: Array<{ points: DailyPoint[]; weight: number }>): DailyPoint[] {
  if (components.some((item) => item.points.length < 2)) return [];
  const dates = [...new Set(components.flatMap((item) => item.points.map((point) => point.date)))].sort();
  const starts = components.map((item) => item.points[0].value);
  return dates.flatMap((date) => {
    const values = components.map((item) => valueOnOrBefore(item.points, date));
    if (values.some((value) => value == null)) return [];
    const completeValues = values as number[];
    return [{ date, value: 100 * completeValues.reduce((sum, value, index) => sum + components[index].weight * value / starts[index], 0) }];
  });
}

async function refreshReportBenchmarks(organizationId: string, workflowId: string, startDate: string, endDate: string, recommendation: any) {
  const symbols = ["SPY", "EWJ", "ASHR", "EWH"];
  const eodhdToken = await getActiveEodhdToken(organizationId);
  const fetched = await Promise.all(symbols.map((symbol) => fetchPreferredDailySeries(eodhdToken, symbol, startDate, endDate)));
  const bySymbol = new Map(fetched.map((item) => [item.symbol, item]));
  const us = normalizeSeries(trimSeries(bySymbol.get("SPY")!.points, startDate, endDate));
  const japan = normalizeSeries(trimSeries(bySymbol.get("EWJ")!.points, startDate, endDate));
  const marketWeights = recommendation.marketWeights ?? { chinaA: 0.5, hongKong: 0.5 };
  const emergingTotal = Number(marketWeights.chinaA) + Number(marketWeights.hongKong);
  const china = trimSeries(bySymbol.get("ASHR")!.points, startDate, endDate);
  const hongKong = trimSeries(bySymbol.get("EWH")!.points, startDate, endDate);
  const emerging = compositeSeries([
    { points: china, weight: Number(marketWeights.chinaA) / emergingTotal },
    { points: hongKong, weight: Number(marketWeights.hongKong) / emergingTotal },
  ]);
  const series = { us, developedNonUs: japan, emerging };
  const coverage = Object.fromEntries(Object.entries(series).map(([sleeve, points]) => [sleeve, {
    points: points.length,
    firstDate: points[0]?.date ?? null,
    lastDate: points.at(-1)?.date ?? null,
  }]));
  const complete = Object.values(series).every((points) => points.length >= 2 && points[0].date === startDate && points.at(-1)!.date === endDate);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const next = await client.query(`SELECT COALESCE(max(version),0)::int + 1 AS version FROM report_benchmark_versions WHERE workflow_case_id = $1`, [workflowId]);
    const saved = await client.query(
      `INSERT INTO report_benchmark_versions (workflow_case_id, version, start_date, end_date, base_currency, status, manifest)
       VALUES ($1,$2,$3,$4,'USD',$5,$6::jsonb) RETURNING *`,
      [workflowId, next.rows[0].version, startDate, endDate, complete ? "complete" : "incomplete", JSON.stringify({
        methodology: "Daily adjusted-close USD-listed investable benchmarks; emerging benchmark uses approved China A/Hong Kong weights. Adjusted prices incorporate distributions and currency effects.",
        sleeves: { us: "SPY", developedNonUs: "EWJ", emerging: "approved weights of ASHR and EWH" },
        provider: [...new Set(fetched.map((item) => item.sourceName))].join(" + "),
        primaryProvider: "EODHD",
        primaryProviderStatus: eodhdToken ? (fetched.every((item) => item.sourceName === "EODHD") ? "succeeded" : "partial_fallback") : "not_configured",
        retrievedAt: new Date().toISOString(), coverage,
        sources: fetched.map((item) => ({ symbol: item.symbol, provider: item.sourceName, url: item.sourceUrl, fallbackReason: item.fallbackReason ?? null })),
      })],
    );
    for (const [sleeve, points] of Object.entries(series)) {
      for (const point of points) {
        await client.query(`INSERT INTO report_benchmark_observations (benchmark_version_id, sleeve, observation_date, value, currency) VALUES ($1,$2,$3,$4,'USD')`, [saved.rows[0].id, sleeve, point.date, point.value]);
      }
    }
    await client.query("COMMIT");
    return saved.rows[0];
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function workflowContext(client: DatabaseClient, workflowId: string, organizationId: string) {
  const result = await client.query(
    `SELECT w.*, p.initial_principal, p.base_currency FROM workflow_cases w
      JOIN portfolios p ON p.id = w.portfolio_id
     WHERE w.id = $1 AND w.organization_id = $2 AND w.status = 'active'`, [workflowId, organizationId],
  );
  if (!result.rows[0]) throw invalidState("Active workflow not found");
  return result.rows[0];
}

async function buildReportData(client: DatabaseClient, workflow: any, nav: any) {
  const [curveResult, sleeveResult, annualResult, targetResult, sleeveTargetResult] = await Promise.all([
    client.query(`SELECT business_date, market_value FROM equity_value_observations WHERE portfolio_id = $1 AND business_date <= $2 ORDER BY business_date`, [workflow.portfolio_id, nav.as_of_date]),
    client.query(
      `SELECT ps.business_date, l.classification->>'sleeve' AS sleeve, sum(l.market_value)::numeric AS market_value
         FROM equity_value_observations e
         JOIN position_snapshots ps ON ps.id = e.position_snapshot_id
         JOIN position_snapshot_lines l ON l.position_snapshot_id = ps.id
        WHERE e.portfolio_id = $1 AND ps.status = 'effective' AND ps.business_date <= $2
        GROUP BY ps.business_date, l.classification->>'sleeve' ORDER BY ps.business_date`, [workflow.portfolio_id, nav.as_of_date],
    ),
    client.query(`SELECT recommendation FROM annual_data_packages WHERE workflow_case_id = $1 AND accepted_at IS NOT NULL ORDER BY version DESC LIMIT 1`, [workflow.id]),
    client.query(`SELECT target_return_rate FROM target_return_versions WHERE workflow_case_id = $1 AND approved_at IS NOT NULL ORDER BY version DESC LIMIT 1`, [workflow.id]),
    client.query(`SELECT targets FROM sleeve_target_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1`, [workflow.id]),
  ]);
  const curve = curveResult.rows.map((row) => ({ date: isoDate(row.business_date), value: Number(row.market_value) }));
  if (!curve.length) throw invalidState("At least one effective equity position snapshot is required");
  const cashFlowResult = await client.query(
    `SELECT flow_date, amount, currency, flow_type, reference, note
       FROM external_cash_flows
      WHERE workflow_case_id = $1 AND flow_date >= $2 AND flow_date <= $3
      ORDER BY flow_date, recorded_at`,
    [workflow.id, curve[0].date, nav.as_of_date],
  );
  const recommendation = jsonValue<any>(annualResult.rows[0]?.recommendation ?? {});
  const principal = Number(workflow.initial_principal);
  const endingValues = {
    equity: curve.at(-1)!.value,
    bond: Number(nav.bond_nav),
    alternative: Number(nav.alternative_nav),
    cash: Number(nav.cash_nav),
  };
  const totalNav = Object.values(endingValues).reduce((sum, value) => sum + value, 0);
  const externalCashFlows = cashFlowResult.rows.map((row) => ({ ...row, flow_date: isoDate(row.flow_date), amount: Number(row.amount) }));
  const dietz = modifiedDietzReturn(principal, totalNav, curve[0].date, isoDate(nav.as_of_date), externalCashFlows.map((flow) => ({ date: flow.flow_date, amount: flow.amount })));
  const netExternalFlow = dietz.netFlow;
  const flowAdjustedReturn = dietz.returnRate;
  const assetWeights = recommendation.assetWeights ?? { equity: 0.35, bond: 0.20, alternative: 0.25, cash: 0.20 };
  const assetClassContributions = (Object.keys(endingValues) as Array<keyof typeof endingValues>).map((key) => {
    const initialValue = principal * Number(assetWeights[key]);
    const profitLoss = endingValues[key] - initialValue;
    return { key, targetWeight: Number(assetWeights[key]), initialValue, endingValue: endingValues[key], profitLoss, contributionPct: profitLoss / principal };
  });
  const sleeveSeries = new Map<string, Array<{ date: string; value: number }>>();
  for (const row of sleeveResult.rows) {
    const key = String(row.sleeve);
    const series = sleeveSeries.get(key) ?? [];
    series.push({ date: isoDate(row.business_date), value: Number(row.market_value) });
    sleeveSeries.set(key, series);
  }
  const sleeveMetrics = ["us", "developedNonUs", "emerging"].map((key) => ({ key, ...performance(sleeveSeries.get(key) ?? []) }));
  const nonEquityContribution = assetClassContributions.filter((item) => item.key !== "equity").reduce((sum, item) => sum + item.contributionPct, 0);
  const firstEquity = curve[0].value;
  const openingAllocationEffect = (firstEquity - principal * Number(assetWeights.equity)) / principal;
  const equityImplementationEffect = (curve.at(-1)!.value - firstEquity) / principal;
  const benchmarkVersion = await client.query(
    `SELECT * FROM report_benchmark_versions
      WHERE workflow_case_id = $1 AND status = 'complete' AND start_date <= $2 AND end_date >= $3
      ORDER BY version DESC LIMIT 1`,
    [workflow.id, curve[0].date, isoDate(nav.as_of_date)],
  );
  let attribution: Record<string, any> = {
    marketEffect: null, allocationEffect: nonEquityContribution + openingAllocationEffect,
    selectionEffect: equityImplementationEffect, interactionEffect: null, nonEquityEffect: nonEquityContribution,
    openingAllocationEffect, totalContribution: nonEquityContribution + openingAllocationEffect + equityImplementationEffect,
    pureSelectionAvailable: false,
    methodology: "Benchmark series are incomplete. Allocation includes opening asset-allocation variance and non-equity results; equity implementation still includes market effects.",
  };
  if (benchmarkVersion.rows[0]) {
    const observations = await client.query(`SELECT sleeve, observation_date, value FROM report_benchmark_observations WHERE benchmark_version_id = $1 ORDER BY sleeve, observation_date`, [benchmarkVersion.rows[0].id]);
    const targets = jsonValue<any>(sleeveTargetResult.rows[0]?.targets ?? {});
    const targetTotal = (targets.equityTargets ?? []).reduce((sum: number, item: any) => sum + Number(item.weight), 0);
    const actualStarts = Object.fromEntries([...sleeveSeries.entries()].map(([key, values]) => [key, values[0]?.value ?? 0]));
    const actualStartTotal = Object.values(actualStarts).reduce((sum, value) => sum + Number(value), 0);
    const sleeves = ["us", "developedNonUs", "emerging"].map((key) => {
      const actual = sleeveSeries.get(key) ?? [];
      const benchmark = observations.rows.filter((row) => row.sleeve === key);
      const target = (targets.equityTargets ?? []).find((item: any) => item.key === key);
      return {
        key,
        portfolioWeight: Number(actualStarts[key] ?? 0) / actualStartTotal,
        benchmarkWeight: Number(target?.weight ?? 0) / targetTotal,
        portfolioReturn: actual.length >= 2 ? actual.at(-1)!.value / actual[0].value - 1 : 0,
        benchmarkReturn: benchmark.length >= 2 ? Number(benchmark.at(-1)!.value) / Number(benchmark[0].value) - 1 : 0,
      };
    });
    if (actualStartTotal > 0 && targetTotal > 0 && sleeves.every((item) => Number.isFinite(item.portfolioReturn) && Number.isFinite(item.benchmarkReturn))) {
      const result = brinsonFachlerAttribution(sleeves);
      const equityScale = firstEquity / principal;
      attribution = {
        marketEffect: equityScale * result.benchmarkReturn,
        allocationEffect: openingAllocationEffect + equityScale * result.allocationEffect,
        selectionEffect: equityScale * result.selectionEffect,
        interactionEffect: equityScale * result.interactionEffect,
        nonEquityEffect: nonEquityContribution,
        openingAllocationEffect,
        totalContribution: openingAllocationEffect + nonEquityContribution + equityScale * result.portfolioReturn,
        pureSelectionAvailable: true,
        benchmarkVersion: benchmarkVersion.rows[0].version,
        sleeves,
        methodology: "Brinson-Fachler arithmetic attribution. Sleeve benchmarks use matching-period adjusted prices of USD-listed investable ETFs. Market, allocation, selection and interaction reconcile to realized equity return; non-equity contribution is shown separately.",
      };
    }
  }
  return {
    asOfDate: isoDate(nav.as_of_date), currency: workflow.base_currency, principal, totalNav,
    totalReturn: flowAdjustedReturn, targetReturn: Number(targetResult.rows[0]?.target_return_rate ?? 0),
    targetAchieved: flowAdjustedReturn >= Number(targetResult.rows[0]?.target_return_rate ?? 0),
    externalCashFlows, netExternalFlow, returnMethod: externalCashFlows.length ? "modified_dietz" : "simple",
    equityCurve: curve, sleeveMetrics, assetClassContributions,
    attribution,
    dataQuality: { equityObservationCount: curve.length, sleeveMetricsAvailable: curve.length >= 20, nonEquityNavApproved: true, benchmarkAttributionAvailable: attribution.pureSelectionAvailable },
  };
}

function pdfEscape(value: string): string { return value.replace(/([\\()])/g, "\\$1"); }

function simplePdf(lines: string[]): Buffer {
  const content = ["BT", "/F1 11 Tf", "48 790 Td", ...lines.flatMap((line, index) => [index === 0 ? "" : "0 -18 Td", `(${pdfEscape(line)}) Tj`]).filter(Boolean), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

export async function registerReportingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/workflows/:workflowId/non-equity-nav/context", async (request) => {
    const user = requirePasswordChanged(request); const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(`SELECT w.id, w.current_step, p.id AS portfolio_id, p.initial_principal, p.base_currency FROM workflow_cases w JOIN portfolios p ON p.id = w.portfolio_id WHERE w.id = $1 AND w.organization_id = $2`, [workflowId, user.organizationId]);
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const [latest, annual, latestEquity] = await Promise.all([
      pool.query(`SELECT * FROM non_equity_nav_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1`, [workflowId]),
      pool.query(`SELECT recommendation FROM annual_data_packages WHERE workflow_case_id = $1 AND accepted_at IS NOT NULL ORDER BY version DESC LIMIT 1`, [workflowId]),
      pool.query(
        `SELECT max(e.business_date) AS business_date
           FROM equity_value_observations e
           JOIN position_snapshots ps ON ps.id = e.position_snapshot_id
          WHERE e.portfolio_id = $1 AND ps.status = 'effective'`,
        [workflow.rows[0].portfolio_id],
      ),
    ]);
    const recommendation = jsonValue<any>(annual.rows[0]?.recommendation ?? {});
    const navVersion = latest.rows[0] ? { ...latest.rows[0], as_of_date: isoDate(latest.rows[0].as_of_date) } : null;
    const latestEquityBusinessDate = latestEquity.rows[0]?.business_date ? isoDate(latestEquity.rows[0].business_date) : null;
    return { workflowStep: workflow.rows[0].current_step, principal: Number(workflow.rows[0].initial_principal), currency: workflow.rows[0].base_currency, assetWeights: recommendation.assetWeights ?? { bond: 0.2, alternative: 0.25, cash: 0.2 }, latestEquityBusinessDate, navVersion };
  });

  app.post("/api/workflows/:workflowId/non-equity-nav/versions", async (request, reply) => {
    const user = requireExecution(request); const input = navSchema.parse(request.body); const { workflowId } = request.params as { workflowId: string };
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); const workflow = await workflowContext(client, workflowId, user.organizationId);
      if (workflow.current_step !== "non_equity_nav") throw invalidState("Non-equity NAV is not the current workflow step");
      const latestEquity = await client.query(
        `SELECT max(e.business_date) AS business_date
           FROM equity_value_observations e
           JOIN position_snapshots ps ON ps.id = e.position_snapshot_id
          WHERE e.portfolio_id = $1 AND ps.status = 'effective'`,
        [workflow.portfolio_id],
      );
      if (!latestEquity.rows[0]?.business_date) throw invalidState("An effective equity position snapshot is required before non-equity NAV submission");
      const latestEquityBusinessDate = isoDate(latestEquity.rows[0].business_date);
      if (!valuationDateMatchesLatestEquitySnapshot(input.asOfDate, latestEquityBusinessDate)) {
        throw invalidState(`Non-equity NAV date must match the latest effective equity position date: ${latestEquityBusinessDate}`);
      }
      const next = await client.query(`SELECT COALESCE(max(version),0)::int + 1 AS version FROM non_equity_nav_versions WHERE workflow_case_id = $1`, [workflowId]);
      const saved = await client.query(
        `INSERT INTO non_equity_nav_versions (workflow_case_id, version, as_of_date, bond_nav, alternative_nav, cash_nav, status, source_note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7,$8) RETURNING *`,
        [workflowId, next.rows[0].version, input.asOfDate, input.bondNav, input.alternativeNav, input.cashNav, input.sourceNote, user.id],
      );
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "non_equity_nav.submit", entityType: "non_equity_nav_version", entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { version: saved.rows[0].version, asOfDate: input.asOfDate } });
      await client.query("COMMIT"); return reply.code(201).send({ navVersion: saved.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.get("/api/workflows/:workflowId/reports/context", async (request) => {
    const user = requirePasswordChanged(request); const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(`SELECT id, current_step FROM workflow_cases WHERE id = $1 AND organization_id = $2`, [workflowId, user.organizationId]);
    if (!workflow.rows[0]) throw invalidState("Workflow not found");
    const latest = await pool.query(`SELECT * FROM report_versions WHERE workflow_case_id = $1 ORDER BY version DESC LIMIT 1`, [workflowId]);
    return { workflowStep: workflow.rows[0].current_step, report: latest.rows[0] ? { ...latest.rows[0], report_data: jsonValue(latest.rows[0].report_data) } : null };
  });

  app.post("/api/workflows/:workflowId/reports", async (request, reply) => {
    const user = requireExecution(request);
    const { workflowId } = request.params as { workflowId: string };
    const preparationClient = await pool.connect();
    let benchmarkRefreshError: string | null = null;
    try {
      const workflow = await workflowContext(preparationClient, workflowId, user.organizationId);
      if (!["reporting", "monitoring"].includes(workflow.current_step)) throw invalidState("Reporting is not available at the current workflow step");
      const [nav, opening, annual] = await Promise.all([
        preparationClient.query(`SELECT * FROM non_equity_nav_versions WHERE workflow_case_id = $1 AND status = 'approved' ORDER BY version DESC LIMIT 1`, [workflowId]),
        preparationClient.query(`SELECT min(business_date) AS start_date FROM equity_value_observations WHERE portfolio_id = $1 AND business_date <= (SELECT as_of_date FROM non_equity_nav_versions WHERE workflow_case_id = $2 AND status = 'approved' ORDER BY version DESC LIMIT 1)`, [workflow.portfolio_id, workflowId]),
        preparationClient.query(`SELECT recommendation FROM annual_data_packages WHERE workflow_case_id = $1 AND accepted_at IS NOT NULL ORDER BY version DESC LIMIT 1`, [workflowId]),
      ]);
      if (!nav.rows[0]) throw invalidState("Approved non-equity NAV is required");
      if (!opening.rows[0]?.start_date) throw invalidState("At least one effective equity position snapshot is required");
      try {
        await refreshReportBenchmarks(
          user.organizationId,
          workflowId,
          isoDate(opening.rows[0].start_date),
          isoDate(nav.rows[0].as_of_date),
          jsonValue<any>(annual.rows[0]?.recommendation ?? {}),
        );
      } catch (error) {
        benchmarkRefreshError = error instanceof Error ? error.message : String(error);
      }
    } finally {
      preparationClient.release();
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN"); const workflow = await workflowContext(client, workflowId, user.organizationId);
      if (!["reporting", "monitoring"].includes(workflow.current_step)) throw invalidState("Reporting is not available at the current workflow step");
      const nav = await client.query(`SELECT * FROM non_equity_nav_versions WHERE workflow_case_id = $1 AND status = 'approved' ORDER BY version DESC LIMIT 1`, [workflowId]);
      if (!nav.rows[0]) throw invalidState("Approved non-equity NAV is required");
      const reportData = await buildReportData(client, workflow, nav.rows[0]);
      const next = await client.query(`SELECT COALESCE(max(version),0)::int + 1 AS version FROM report_versions WHERE workflow_case_id = $1`, [workflowId]);
      const saved = await client.query(`INSERT INTO report_versions (workflow_case_id, version, as_of_date, status, report_data, generated_by) VALUES ($1,$2,$3,'draft',$4::jsonb,$5) RETURNING *`, [workflowId, next.rows[0].version, nav.rows[0].as_of_date, JSON.stringify(reportData), user.id]);
      await writeAudit(client, { organizationId: user.organizationId, actorUserId: user.id, action: "report.generate", entityType: "report_version", entityId: saved.rows[0].id, outcome: "allowed", requestId: request.id, ipAddress: request.ip, detail: { version: saved.rows[0].version, asOfDate: isoDate(nav.rows[0].as_of_date), benchmarkAttributionAvailable: reportData.dataQuality.benchmarkAttributionAvailable, benchmarkRefreshError } });
      await client.query("COMMIT"); return reply.code(201).send({ report: { ...saved.rows[0], report_data: reportData } });
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.get("/api/reports/:reportId/pdf", async (request, reply) => {
    const user = requirePasswordChanged(request); const { reportId } = request.params as { reportId: string };
    const result = await pool.query(`SELECT r.*, w.organization_id FROM report_versions r JOIN workflow_cases w ON w.id = r.workflow_case_id WHERE r.id = $1 AND w.organization_id = $2`, [reportId, user.organizationId]);
    if (!result.rows[0]) throw invalidState("Report not found");
    const data = jsonValue<any>(result.rows[0].report_data);
    const pct = (value: number | null | undefined) => value == null ? "Unavailable" : `${(value * 100).toFixed(2)}%`;
    const attributionLines = data.attribution.pureSelectionAvailable
      ? [
          `Market contribution: ${pct(data.attribution.marketEffect)}`,
          `Allocation contribution: ${pct(data.attribution.allocationEffect)}`,
          `Security-selection contribution: ${pct(data.attribution.selectionEffect)}`,
          `Interaction contribution: ${pct(data.attribution.interactionEffect)}`,
          `Non-equity contribution: ${pct(data.attribution.nonEquityEffect)}`,
          `Attribution benchmark version: ${data.attribution.benchmarkVersion}`,
        ]
      : [
          `Allocation and non-equity contribution: ${pct(data.attribution.allocationEffect)}`,
          `Equity implementation including market: ${pct(data.attribution.selectionEffect)}`,
          "Pure security-selection attribution: unavailable",
        ];
    const pdf = simplePdf(["Puyan Capital - Isater Investment Report", `Report version: ${result.rows[0].version}`, `As of: ${data.asOfDate}`, `Initial principal: ${data.currency} ${data.principal.toFixed(2)}`, `Net asset value: ${data.currency} ${data.totalNav.toFixed(2)}`, `Total return: ${pct(data.totalReturn)}`, `Target return: ${pct(data.targetReturn)}`, ...attributionLines, `Total contribution: ${pct(data.attribution.totalContribution)}`, "Generated from approved Isater records."]);
    return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `attachment; filename=Isater-report-v${result.rows[0].version}.pdf`).send(pdf);
  });
}
