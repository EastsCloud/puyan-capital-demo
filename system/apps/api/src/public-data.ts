import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  buildAnnualAllocationRecommendation,
  hasPermission,
  type AnnualDataSeries,
  type MarketScenario,
  type MonthlyObservation,
} from "@isater/domain";
import { z } from "zod";
import { writeAudit } from "./audit.js";
import { effectiveAnnualPolicy } from "./annual-policy.js";
import { requirePasswordChanged } from "./auth.js";
import { config } from "./config.js";
import { pool } from "./db.js";

const runSchema = z.object({ scenario: z.enum(["bull", "balanced", "bear"]) });
const activateSourcesSchema = z.object({
  settings: z.record(z.object({ enabled: z.boolean(), priority: z.number().int().positive() })),
  changeSummary: z.string().trim().min(1).max(500),
});

interface SourceRow {
  code: string;
  data_key: string;
  display_name: string;
  authority_name: string;
  authority_tier: number;
  category: string;
  adapter_key: string;
  series_key: string | null;
  public_url: string;
  license_note: string | null;
  is_required: boolean;
  enabled: boolean;
  priority: number;
}

interface FetchResult {
  source: SourceRow;
  points: MonthlyObservation[];
  checksum: string;
  transportUrl: string;
}

interface SourceAttempt {
  code: string;
  displayName: string;
  authorityName: string;
  priority: number;
  status: "succeeded" | "failed";
  message?: string;
}

interface LogicalSourceResult {
  dataKey: string;
  result: FetchResult;
  attempts: SourceAttempt[];
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

function upstreamFailure(message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = 502;
  return error;
}

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

async function sourceConfiguration(organizationId: string): Promise<{ version: number; source: "organization" | "system_default"; settings: Record<string, { enabled: boolean; priority: number }>; sources: SourceRow[] }> {
  const effective = await pool.query(
    `SELECT version, settings FROM data_source_setting_versions
      WHERE organization_id = $1 AND status = 'effective' LIMIT 1`,
    [organizationId],
  );
  const fallback = effective.rows[0] ? null : await pool.query(
    "SELECT version, settings FROM default_data_source_settings ORDER BY version DESC LIMIT 1",
  );
  const record = effective.rows[0] ?? fallback!.rows[0];
  const settings = jsonValue<Record<string, { enabled: boolean; priority: number }>>(record.settings);
  const catalog = await pool.query("SELECT * FROM data_source_catalog ORDER BY default_priority");
  const sources = catalog.rows.map((row): SourceRow => ({
    ...row,
    authority_tier: Number(row.authority_tier),
    is_required: Boolean(row.is_required),
    enabled: settings[row.code]?.enabled ?? false,
    priority: settings[row.code]?.priority ?? Number(row.default_priority),
  })).sort((left, right) => left.priority - right.priority);
  return { version: Number(record.version), source: effective.rows[0] ? "organization" : "system_default", settings, sources };
}

function normalizeMonthly(points: Array<{ date: string; value: number }>): MonthlyObservation[] {
  const byMonth = new Map<string, number>();
  points
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value))
    .sort((left, right) => left.date.localeCompare(right.date))
    .forEach((point) => byMonth.set(point.date.slice(0, 7), point.value));
  return [...byMonth].map(([month, value]) => ({ month, value })).sort((left, right) => left.month.localeCompare(right.month));
}

async function fetchFred(source: SourceRow): Promise<FetchResult> {
  if (!source.series_key) throw new Error(`${source.code} has no series key`);
  let body: string;
  let transportUrl: string;
  let points: Array<{ date: string; value: number }>;
  if (config.FRED_API_KEY) {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", source.series_key);
    url.searchParams.set("api_key", config.FRED_API_KEY);
    url.searchParams.set("file_type", "json");
    transportUrl = url.toString().replace(config.FRED_API_KEY, "[configured-key]");
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`FRED returned HTTP ${response.status}`);
    body = await response.text();
    const parsed = JSON.parse(body) as { observations?: Array<{ date: string; value: string }> };
    points = (parsed.observations ?? []).map((item) => ({ date: item.date, value: Number(item.value) }));
  } else {
    const url = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
    url.searchParams.set("id", source.series_key);
    transportUrl = url.toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`FRED public CSV returned HTTP ${response.status}`);
    body = await response.text();
    const lines = body.trim().split(/\r?\n/);
    if (!lines[0]?.startsWith("observation_date,")) throw new Error("FRED CSV header is invalid");
    points = lines.slice(1).map((line) => {
      const separator = line.indexOf(",");
      return { date: line.slice(0, separator), value: Number(line.slice(separator + 1)) };
    });
  }
  const monthly = normalizeMonthly(points);
  if (monthly.length < 24) throw new Error(`FRED series ${source.series_key} has fewer than 24 usable months`);
  return { source, points: monthly, checksum: createHash("sha256").update(body).digest("hex"), transportUrl };
}

async function fetchHkma(source: SourceRow): Promise<FetchResult> {
  const endpoint = "https://api.hkma.gov.hk/public/market-data-and-statistics/monthly-statistical-bulletin/financial/capital-market-statistics";
  const url = `${endpoint}?pagesize=1000`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HKMA returned HTTP ${response.status}`);
  const body = await response.text();
  const parsed = JSON.parse(body) as {
    header?: { success?: boolean };
    result?: { records?: Array<{ end_of_month?: string; eq_mkt_hs_index?: number | null }> };
  };
  if (!parsed.header?.success) throw new Error("HKMA response indicates failure");
  const records = parsed.result?.records ?? [];
  const points = records
    .filter((record): record is { end_of_month: string; eq_mkt_hs_index: number } =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(record.end_of_month ?? "") && Number.isFinite(record.eq_mkt_hs_index),
    )
    .map((record) => ({ month: record.end_of_month, value: record.eq_mkt_hs_index }))
    .sort((left, right) => left.month.localeCompare(right.month));
  if (points.length < 24) throw new Error("HKMA Hang Seng series has fewer than 24 usable months");
  return { source, points, checksum: createHash("sha256").update(body).digest("hex"), transportUrl: url };
}

async function fetchTaiwanMonthlyIndices(source: SourceRow): Promise<FetchResult> {
  const endpoint = "https://apiservice.mol.gov.tw/OdService/download/A17030000J-000050-1oj";
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Taiwan government data API returned HTTP ${response.status}`);
  const body = await response.text();
  const records = JSON.parse(body) as Array<Record<string, string>>;
  const field = source.series_key ?? "中國-香港恆生指數";
  const points = records
    .filter((record) => /^\d{4}-\d{2}$/.test(record["月別"] ?? "") && Number.isFinite(Number(record[field])))
    .map((record) => ({ month: record["月別"], value: Number(record[field]) }))
    .sort((left, right) => left.month.localeCompare(right.month));
  if (points.length < 24) throw new Error(`Taiwan government series has only ${points.length} usable months; 24 are required`);
  return { source, points, checksum: createHash("sha256").update(body).digest("hex"), transportUrl: endpoint };
}

async function fetchSource(source: SourceRow): Promise<FetchResult> {
  if (source.adapter_key === "fred_series") return fetchFred(source);
  if (source.adapter_key === "hkma_capital_market") return fetchHkma(source);
  if (source.adapter_key === "taiwan_mol_monthly_indices") return fetchTaiwanMonthlyIndices(source);
  throw new Error(`No adapter is registered for ${source.adapter_key}`);
}

async function fetchLogicalSource(dataKey: string, sources: SourceRow[]): Promise<LogicalSourceResult> {
  const attempts: SourceAttempt[] = [];
  for (const source of sources.sort((left, right) => left.priority - right.priority)) {
    try {
      const result = await fetchSource(source);
      attempts.push({ code: source.code, displayName: source.display_name, authorityName: source.authority_name,
        priority: source.priority, status: "succeeded" });
      return { dataKey, result, attempts };
    } catch (error) {
      attempts.push({ code: source.code, displayName: source.display_name, authorityName: source.authority_name,
        priority: source.priority, status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }
  throw Object.assign(new Error(`All configured sources failed for ${dataKey}`), { dataKey, attempts });
}

function toModelSeries(logicalResults: LogicalSourceResult[]): AnnualDataSeries {
  const byKey = new Map(logicalResults.map((item) => [item.dataKey, item.result.points]));
  const required = (dataKey: string) => {
    const points = byKey.get(dataKey);
    if (!points) throw new Error(`Required data item ${dataKey} is unavailable`);
    return points;
  };
  return {
    usEquity: required("us_equity"),
    japanEquity: required("japan_equity"),
    chinaEquity: required("china_equity"),
    hongKongEquity: required("hong_kong_equity"),
    usCpi: required("us_cpi"),
    usTenYearYieldPct: required("us_ten_year_yield"),
    usTBillYieldPct: required("us_tbill_yield"),
    globalCommodity: required("global_commodity"),
  };
}

async function persistObservations(results: FetchResult[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const result of results) {
      for (const point of result.points) {
        await client.query(
          `INSERT INTO market_observations
            (instrument_key, observation_date, field, value, source_name, source_url, retrieved_at, source_checksum)
           VALUES ($1, $2, 'monthly_level', $3, $4, $5, now(), $6)
           ON CONFLICT (instrument_key, observation_date, field, source_name)
           DO UPDATE SET value = excluded.value, source_url = excluded.source_url,
                         retrieved_at = excluded.retrieved_at, source_checksum = excluded.source_checksum`,
          [result.source.code, `${point.month}-01`, point.value, result.source.authority_name, result.source.public_url, result.checksum],
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

export async function registerPublicDataRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/data-sources/effective", async (request) => {
    const user = requirePasswordChanged(request);
    return sourceConfiguration(user.organizationId);
  });

  app.post("/api/admin/data-sources/activate", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "parameters:manage")) throw forbidden();
    const input = activateSourcesSchema.parse(request.body);
    const catalog = await pool.query("SELECT code FROM data_source_catalog");
    const validCodes = new Set(catalog.rows.map((row) => String(row.code)));
    if (Object.keys(input.settings).some((code) => !validCodes.has(code))) throw invalidState("Unknown data source code");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const next = await client.query(
        "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM data_source_setting_versions WHERE organization_id = $1",
        [user.organizationId],
      );
      await client.query("UPDATE data_source_setting_versions SET status = 'retired' WHERE organization_id = $1 AND status = 'effective'", [user.organizationId]);
      const saved = await client.query(
        `INSERT INTO data_source_setting_versions
          (organization_id, version, status, settings, change_summary, created_by, effective_from)
         VALUES ($1, $2, 'effective', $3, $4, $5, now()) RETURNING *`,
        [user.organizationId, next.rows[0].version, input.settings, input.changeSummary, user.id],
      );
      await writeAudit(client, {
        organizationId: user.organizationId, actorUserId: user.id, action: "data_sources.activate",
        entityType: "data_source_setting_version", entityId: saved.rows[0].id, outcome: "allowed",
        requestId: request.id, ipAddress: request.ip, detail: { version: saved.rows[0].version, changeSummary: input.changeSummary },
      });
      await client.query("COMMIT");
      return reply.code(201).send({ settingVersion: saved.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/workflows/:workflowId/annual-data/latest", async (request) => {
    const user = requirePasswordChanged(request);
    const { workflowId } = request.params as { workflowId: string };
    const result = await pool.query(
      `SELECT p.*, r.status AS run_status, r.source_setting_version
         FROM annual_data_packages p
         JOIN public_data_runs r ON r.id = p.public_data_run_id
         JOIN workflow_cases w ON w.id = p.workflow_case_id
        WHERE p.workflow_case_id = $1 AND w.organization_id = $2
        ORDER BY p.version DESC LIMIT 1`,
      [workflowId, user.organizationId],
    );
    return { annualDataPackage: result.rows[0] ?? null };
  });

  app.post("/api/workflows/:workflowId/annual-data/runs", async (request, reply) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, "annual_data:run")) throw forbidden();
    const input = runSchema.parse(request.body);
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await pool.query(
      "SELECT * FROM workflow_cases WHERE id = $1 AND organization_id = $2 AND status = 'active'",
      [workflowId, user.organizationId],
    );
    if (!workflow.rows[0] || workflow.rows[0].current_step !== "annual_data") throw invalidState("Annual public data is not the current workflow step");
    const configuration = await sourceConfiguration(user.organizationId);
    const annualPolicy = await effectiveAnnualPolicy(user.organizationId);
    const requiredKeys = new Set(configuration.sources.filter((source) => source.is_required).map((source) => source.data_key));
    const enabledKeys = new Set(configuration.sources.filter((source) => source.enabled).map((source) => source.data_key));
    const disabledRequired = [...requiredKeys].filter((dataKey) => !enabledKeys.has(dataKey));
    if (disabledRequired.length) throw invalidState(`Required data items have no enabled source: ${disabledRequired.join(", ")}`);
    const runNumber = await pool.query(
      "SELECT COALESCE(max(run_number), 0)::int + 1 AS run_number FROM public_data_runs WHERE workflow_case_id = $1",
      [workflowId],
    );
    const run = await pool.query(
      `INSERT INTO public_data_runs
        (workflow_case_id, run_number, scenario, status, model_version, source_setting_version, started_by)
       VALUES ($1, $2, $3, 'running', 'annual-regime-allocation-v1.1.0', $4, $5) RETURNING *`,
      [workflowId, runNumber.rows[0].run_number, input.scenario, configuration.version, user.id],
    );
    try {
      const enabled = configuration.sources.filter((source) => source.enabled);
      const groups = new Map<string, SourceRow[]>();
      enabled.forEach((source) => groups.set(source.data_key, [...(groups.get(source.data_key) ?? []), source]));
      const groupEntries = [...groups.entries()];
      const settled = await Promise.allSettled(groupEntries.map(([dataKey, sources]) => fetchLogicalSource(dataKey, sources)));
      const logicalResults = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
      const errors = settled.flatMap((item, index) => item.status === "rejected"
        ? [{ dataKey: groupEntries[index][0], message: item.reason instanceof Error ? item.reason.message : String(item.reason),
          attempts: (item.reason as { attempts?: SourceAttempt[] })?.attempts ?? [] }]
        : []);
      if (errors.length) throw Object.assign(new Error("One or more required public sources failed"), { sourceErrors: errors });
      const results = logicalResults.map((item) => item.result);
      const recommendation = buildAnnualAllocationRecommendation(
        input.scenario as MarketScenario,
        toModelSeries(logicalResults),
        annualPolicy.policy,
      );
      const recommendationWithParameterAudit = {
        ...recommendation,
        businessParameterVersion: Number(annualPolicy.parameterSet.version),
        businessParameterSource: annualPolicy.source,
        businessParameterEffectiveFrom: annualPolicy.parameterSet.effective_from ?? annualPolicy.parameterSet.created_at ?? null,
      };
      await persistObservations(results);
      const manifest = results.map((result) => ({
        code: result.source.code,
        dataKey: result.source.data_key,
        displayName: result.source.display_name,
        authorityName: result.source.authority_name,
        authorityTier: result.source.authority_tier,
        priority: result.source.priority,
        publicUrl: result.source.public_url,
        licenseNote: result.source.license_note,
        transportUrl: result.transportUrl,
        observationCount: result.points.length,
        firstObservation: result.points[0].month,
        lastObservation: result.points.at(-1)!.month,
        checksum: result.checksum,
        attempts: logicalResults.find((item) => item.dataKey === result.source.data_key)?.attempts ?? [],
      }));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE public_data_runs SET status = 'succeeded', source_manifest = $2,
                  recommendation = $3, completed_at = now() WHERE id = $1`,
          [run.rows[0].id, manifest, recommendationWithParameterAudit],
        );
        const nextVersion = await client.query(
          "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM annual_data_packages WHERE workflow_case_id = $1",
          [workflowId],
        );
        const packageResult = await client.query(
          `INSERT INTO annual_data_packages
            (workflow_case_id, version, as_of_date, scenario, model_version, source_manifest, recommendation, created_by, public_data_run_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [workflowId, nextVersion.rows[0].version, recommendation.asOfDate, input.scenario,
            recommendation.modelVersion, manifest, recommendationWithParameterAudit, user.id, run.rows[0].id],
        );
        await writeAudit(client, {
          organizationId: user.organizationId, actorUserId: user.id, action: "annual_data.run",
          entityType: "annual_data_package", entityId: packageResult.rows[0].id, outcome: "allowed",
          requestId: request.id, ipAddress: request.ip,
          detail: {
            scenario: input.scenario,
            modelVersion: recommendation.modelVersion,
            sourceCount: manifest.length,
            businessParameterVersion: Number(annualPolicy.parameterSet.version),
            businessParameterSource: annualPolicy.source,
            policySnapshot: annualPolicy.policy,
          },
        });
        await client.query("COMMIT");
        return reply.code(201).send({ annualDataPackage: packageResult.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const sourceErrors = (error as { sourceErrors?: unknown[] }).sourceErrors ?? [{ message: error instanceof Error ? error.message : String(error) }];
      await pool.query(
        "UPDATE public_data_runs SET status = 'failed', error_summary = $2, completed_at = now() WHERE id = $1",
        [run.rows[0].id, sourceErrors],
      );
      const detail = sourceErrors.map((item) => {
        const entry = item as { sourceCode?: string; dataKey?: string; message?: string; attempts?: SourceAttempt[] };
        const attempts = entry.attempts?.map((attempt) => `${attempt.code} (${attempt.message ?? attempt.status})`).join(", ");
        return `${entry.dataKey ?? entry.sourceCode ?? "model"}: ${entry.message ?? "unknown error"}${attempts ? ` [${attempts}]` : ""}`;
      }).join("; ");
      throw upstreamFailure(`Public data run failed: ${detail}`);
    }
  });
}
