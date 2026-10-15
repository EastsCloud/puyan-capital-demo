import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import Fastify from "fastify";
import { ZodError } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../src/eodhd.js", async () => ({ ...(await import("../src/eodhd-client.js")), getActiveEodhdToken: async () => "test-token" }));
vi.mock("../src/db.js", () => {
  const query = async (sql: string, values?: unknown[]) => {
    if (values === undefined) {
      const result = (await state.db.exec(sql)).at(-1) ?? {};
      return { rows: result.rows ?? [], rowCount: result.affectedRows ?? result.rows?.length ?? 0 };
    }
    const result = await state.db.query(sql, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { pool: { query, connect: async () => ({ query, release() {} }) } };
});
vi.mock("../src/auth.js", () => ({ requireUser:(request:any)=>request.currentUser,requirePasswordChanged: (request: any) => {
  if (!request.currentUser) throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  return request.currentUser;
} }));
vi.mock("../src/market-history.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/market-history.js")>();
  return { ...actual,
    collectHistoricalSeries: async (requests: Array<{symbol:string}>) => {
      const symbol=requests[0].symbol;const unavailable=symbol==="NOREAL";const count=symbol==="CRCL"?72:150;
      return { series:unavailable?[]:[{symbol,exchange:symbol==="CRCL"?"NYQ":"NMS",sourceName:"Yahoo Finance chart",points:[]}], coverage:[{symbol,providerSymbol:symbol,provider:"Yahoo Finance chart",observations:unavailable?0:count,firstDate:"2023-10-06",lastDate:"2026-10-09",status:unavailable?"unavailable":count<100?"short_history":"ready",reason:unavailable?"No price data":null,fallbackReason:"test"}] };
    },
    fetchYahooSeries: async (symbol: string) => ({symbol,exchange:symbol==="CRCL"?"NYQ":"NMS",points:[]}),
  };
});
import { registerProposedPortfolioRoutes } from "../src/proposed-portfolio.js";
import { registerSecurityRoutes } from "../src/securities.js";
import {registerWorkflowRoutes} from '../src/workflows.js';

const app = Fastify();
let organizationId: string; let otherOrganizationId: string; let adminId: string; let workflowId: string; let approvedId: string;
let existingNames: any[]; let allNames: any[];
const user = (role = "execution_team", organization = organizationId) => ({ id: adminId, organizationId: organization, role, locale: "zh-CN", mustChangePassword: false });
beforeAll(async () => {
  state.db = new PGlite({ extensions: { pgcrypto } });
  const directory = new URL("../../../db/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files.filter((file) => Number(file.slice(0,4)) < 20)) await state.db.exec(await readFile(new URL(file, directory), "utf8"));
  organizationId = (await state.db.query("INSERT INTO organizations (name) VALUES ('Proposal tests') RETURNING id")).rows[0].id;
  otherOrganizationId = (await state.db.query("INSERT INTO organizations (name) VALUES ('Other tests') RETURNING id")).rows[0].id;
  adminId = (await state.db.query("INSERT INTO users (organization_id, username, display_name, role, password_hash, must_change_password) VALUES ($1, 'test-admin', 'Test', 'system_admin', 'not-a-credential', false) RETURNING id", [organizationId])).rows[0].id;
  const portfolioId = (await state.db.query("INSERT INTO portfolios (organization_id, code, name) VALUES ($1, 'TEST', 'Test') RETURNING id", [organizationId])).rows[0].id;
  workflowId = (await state.db.query("INSERT INTO workflow_cases (organization_id, portfolio_id, workflow_type, business_year, status, current_step, created_by) VALUES ($1, $2, 'annual_cycle', 2026, 'active', 'proposed_portfolio', $3) RETURNING id", [organizationId, portfolioId, adminId])).rows[0].id;
  const annualId = (await state.db.query("INSERT INTO annual_data_packages (workflow_case_id, version, as_of_date, scenario, model_version, source_manifest, recommendation, created_by) VALUES ($1, 1, '2026-01-01', 'balanced', 'test', '[]', '{}', $2) RETURNING id", [workflowId, adminId])).rows[0].id;
  const targetId = (await state.db.query("INSERT INTO target_return_versions (workflow_case_id, version, annual_data_package_id, operating_cost_rate, expected_cpi_rate, scenario_adjustment_rate, target_return_rate, calculation, created_by) VALUES ($1, 1, $2, 0, 0, 0, 0.08, '{}', $3) RETURNING id", [workflowId, annualId, adminId])).rows[0].id;
  const sleeveId = (await state.db.query("INSERT INTO sleeve_target_versions (workflow_case_id, target_return_version_id, version, targets, reconciliation_difference, created_by) VALUES ($1, $2, 1, '{}', 0, $3) RETURNING id", [workflowId, targetId, adminId])).rows[0].id;
  approvedId = (await state.db.query("INSERT INTO proposed_portfolio_versions (workflow_case_id, sleeve_target_version_id, version, status, created_by) VALUES ($1, $2, 1, 'approved', $3) RETURNING id", [workflowId, sleeveId, adminId])).rows[0].id;
  existingNames = (await state.db.query("SELECT * FROM ticker_universe ORDER BY sleeve, style, ticker")).rows;
  for (const name of existingNames) await state.db.query("INSERT INTO proposed_holdings (proposed_portfolio_version_id, ticker, exchange_code, market, sleeve, style, weight) VALUES ($1,$2,$3,$4,$5,$6,0.125)", [approvedId, name.ticker, name.exchange_code, name.market, name.sleeve, name.style]);
  // Apply the new migration to a populated database, just as a deployment would.
  for(const file of files.filter(file=>Number(file.slice(0,4))>=20))await state.db.exec(await readFile(new URL(file,directory),'utf8'));
  app.decorateRequest("currentUser", null);
  app.addHook("onRequest", async (request) => { request.currentUser = user(request.headers["x-test-role"] as string ?? "execution_team", request.headers["x-test-org"] as string ?? organizationId) as any; });
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof ZodError ? 400 : (error as any).statusCode ?? 500).send({ error: (error as Error).message }));
  await registerProposedPortfolioRoutes(app); await registerSecurityRoutes(app);await registerWorkflowRoutes(app); await app.ready();
}, 30_000);
afterAll(async () => { await app.close(); await state.db?.close(); });

describe("proposed portfolio persistence and security registration", () => {
  it("upgrades a populated database without changing the existing approved plan", async () => {
    const version = (await state.db.query("SELECT status FROM proposed_portfolio_versions WHERE id = $1", [approvedId])).rows[0];
    expect(version.status).toBe("approved");
    expect((await state.db.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1", [approvedId])).rows).toHaveLength(24);
    expect((await state.db.query("SELECT * FROM ticker_universe WHERE organization_id IS NULL")).rows).toHaveLength(24);
  });
  it("requires an administrator to register a security and audits a successful registration", async () => {
    const payload = { ticker: "TSLA", exchangeCode: "NASDAQ", nameEn: "Test registration", nameZh: "测试收录", style: "growth", sourceName: "Test reference", sourceUrl: "https://example.com/tsla" };
    expect((await app.inject({ method: "POST", url: "/api/admin/securities", payload })).statusCode).toBe(403);
    const result = await app.inject({ method: "POST", url: "/api/admin/securities", headers: { "x-test-role": "system_admin" }, payload });
    expect(result.statusCode).toBe(201); expect(result.json().security).toMatchObject({ market: "US", sleeve: "us", organization_id: organizationId });
    const duplicate = await app.inject({ method: "POST", url: "/api/admin/securities", headers: { "x-test-role": "system_admin" }, payload });
    expect(duplicate.statusCode).toBe(409);
    expect((await state.db.query("SELECT action FROM audit_events WHERE action = 'security.register'")).rows).toHaveLength(1);
  });
  it("does not expose one team's registered securities to another team", async () => {
    const result = await app.inject({ method: "GET", url: "/api/securities", headers: { "x-test-org": otherOrganizationId } });
    expect(result.statusCode).toBe(200); expect(result.json().securities).toHaveLength(24);
    const context = await app.inject({ method: "GET", url: `/api/workflows/${workflowId}/proposed-portfolio/context` });
    expect(context.json().universe.some((item: any) => item.ticker === "TSLA")).toBe(true);
  });
  it("supports 36 names when the effective style limit permits six per style", async () => {
    // Two additional names for each of the six sleeve/style groups.
    for (const [sleeve, market, exchange] of [["us", "US", "NYSE"], ["developedNonUs", "JP", "TSE"], ["emerging", "HK", "HKEX"]]) {
      for (const style of ["growth", "value"]) for (let index = 0; index < 2; index++) await state.db.query(
        "INSERT INTO ticker_universe (ticker, exchange_code, name_en, name_zh, market, sleeve, style, instrument_type, source_name, source_url, organization_id) VALUES ($1,$2,'Test','测试',$3,$4,$5,'equity','test','https://example.com',$6)",
        [`TEST-${sleeve}-${style}-${index}`, exchange, market, sleeve, style, organizationId],
      );
    }
    allNames = (await state.db.query("SELECT * FROM ticker_universe WHERE ticker <> 'TSLA'")).rows;
    expect(allNames).toHaveLength(36);
    const holdings = allNames.map((name) => ({ tickerUniverseId: name.id, weight: 1 / 12 }));
    const rejected = await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/proposed-portfolio/versions`, payload: { holdings } });
    expect(rejected.statusCode).toBe(409); expect(rejected.json().error).toContain("2-5");
    await state.db.query("INSERT INTO parameter_sets (organization_id, version, status, parameters, created_by) VALUES ($1,1,'effective',$2,$3)", [organizationId, { portfolioConstruction: { maxSingleSecurityWeightPct: 35, styleTickerMin: 2, styleTickerMax: 10, equityMarkets: ["US", "JP", "HK", "CN_A"] } }, adminId]);
    const accepted = await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/proposed-portfolio/versions`, payload: { holdings } });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().proposedPortfolioVersion.version).toBe(2);
    const stored = (await state.db.query("SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id = $1", [accepted.json().proposedPortfolioVersion.id])).rows;
    expect(stored).toHaveLength(36);
    for (const sleeve of ["us", "developedNonUs", "emerging"]) expect(stored.filter((item: any) => item.sleeve === sleeve).reduce((sum: number, item: any) => sum + Number(item.weight), 0)).toBeCloseTo(1, 10);
    expect((await state.db.query("SELECT status FROM proposed_portfolio_versions WHERE id = $1", [approvedId])).rows[0].status).toBe("approved");
  });
  it("rejects duplicates, weights that do not reconcile, and changes after the proposal step", async () => {
    const holdings = existingNames.map((name) => ({ tickerUniverseId: name.id, weight: 0.125 }));
    const duplicate = await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/proposed-portfolio/versions`, payload: { holdings: [...holdings, holdings[0]] } });
    expect(duplicate.statusCode).toBe(409); expect(duplicate.json().error).toContain("once");
    const wrongWeights = await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/proposed-portfolio/versions`, payload: { holdings: holdings.map((holding, index) => index === 0 ? { ...holding, weight: 0.1 } : holding) } });
    expect(wrongWeights.statusCode).toBe(409); expect(wrongWeights.json().error).toContain("100%");
    await state.db.query("UPDATE workflow_cases SET current_step = 'backtest' WHERE id = $1", [workflowId]);
    expect((await app.inject({ method: "POST", url: `/api/workflows/${workflowId}/proposed-portfolio/versions`, payload: { holdings } })).statusCode).toBe(409);
  });
  it("allows short-history registration with an explicit warning and auto-generated reference", async () => {
    const headers={"x-test-role":"system_admin"};
    const check=await app.inject({method:"POST",url:"/api/admin/securities/check",headers,payload:{ticker:"CRCL",exchangeCode:"NYSE"}});
    expect(check.statusCode).toBe(200);expect(check.json().validation.coverage.status).toBe("short_history");
    const saved=await app.inject({method:"POST",url:"/api/admin/securities",headers,payload:{ticker:"CRCL",exchangeCode:"NYSE",nameEn:"Test security",nameZh:"测试证券",style:"growth"}});
    expect(saved.statusCode).toBe(201);expect(saved.json().security.source_url).toContain("finance.yahoo.com/quote/CRCL");
    expect(saved.json().security.data_coverage).toMatchObject({status:"short_history",observations:72});
  });
  it("blocks a wrong listing venue and unavailable data without inserting records", async () => {
    const headers={"x-test-role":"system_admin"};
    const payload={ticker:"CRCL",exchangeCode:"NASDAQ",nameEn:"Test",nameZh:"测试",style:"growth"};
    expect((await app.inject({method:"POST",url:"/api/admin/securities",headers,payload})).statusCode).toBe(422);
    expect((await app.inject({method:"POST",url:"/api/admin/securities",headers,payload:{...payload,ticker:"NOREAL"}})).statusCode).toBe(422);
    expect((await state.db.query("SELECT * FROM ticker_universe WHERE ticker = 'NOREAL'")).rows).toHaveLength(0);
  });
});

describe('revision without reset and historical comparison',()=>{
 let base:string,newId:string,baseline:any[],backtestId:string;
 const post=(suffix:string,payload:any,headers?:Record<string,string>)=>app.inject({method:'POST',url:`/api/workflows/${workflowId}/${suffix}`,payload,headers});
 it('reopens the latest failed proposal with an audit, without changing saved holdings or approved history',async()=>{
  base=(await state.db.query('SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1',[workflowId])).rows[0].id;
  baseline=(await state.db.query('SELECT h.*,u.id AS universe_id FROM proposed_holdings h JOIN ticker_universe u ON u.ticker=h.ticker AND u.exchange_code=h.exchange_code WHERE h.proposed_portfolio_version_id=$1 ORDER BY h.sleeve,h.ticker',[base])).rows;
  backtestId=(await state.db.query("INSERT INTO backtest_runs(proposed_portfolio_version_id,run_number,start_date,end_date,frequency,benchmark_manifest,data_manifest,metrics,hard_control_pass,model_version,run_by) VALUES ($1,1,'2023-01-01','2026-01-01','weekly','{}','{}','{\"sleeves\":[]}',false,'test',$2) RETURNING id",[base,adminId])).rows[0].id;
  await state.db.query("UPDATE workflow_cases SET current_step='optimization' WHERE id=$1",[workflowId]);
  expect((await post('proposed-portfolio/reopen',{baseProposalId:base},{'x-test-role':'decision_committee'})).statusCode).toBe(403);
  expect((await post('proposed-portfolio/reopen',{baseProposalId:base},{'x-test-org':otherOrganizationId})).statusCode).toBe(409);
  const response=await post('proposed-portfolio/reopen',{baseProposalId:base});expect(response.statusCode,response.body).toBe(200);expect(response.json().workflow.current_step).toBe('proposed_portfolio');
  expect((await state.db.query('SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id=$1',[base])).rows).toHaveLength(baseline.length);
  expect((await state.db.query('SELECT status FROM proposed_portfolio_versions WHERE id=$1',[approvedId])).rows[0].status).toBe('approved');
 });
 it('reuses an unchanged version but records modifications as a new untested version',async()=>{
  const holdings=baseline.map(h=>({tickerUniverseId:h.universe_id,weight:Number(h.weight)}));
  const unchanged=await post('proposed-portfolio/versions',{baseProposalId:base,holdings});expect(unchanged.statusCode,unchanged.body).toBe(200);expect(unchanged.json().unchanged).toBe(true);expect(unchanged.json().proposedPortfolioVersion.id).toBe(base);
  expect((await post('actions',{action:'submit_proposed_portfolio',payload:{proposedPortfolioVersionId:base,revisionOpenedAt:'2000-01-01'}})).statusCode).toBe(403);
  expect((await post('actions',{action:'submit_proposed_portfolio',payload:{proposedPortfolioVersionId:base}})).statusCode).toBe(200);
  expect((await post('actions',{action:'record_backtest_fail',payload:{backtestRunId:backtestId}})).statusCode).toBe(409);
  expect((await post('proposed-portfolio/reopen',{baseProposalId:base})).statusCode).toBe(200);
  const modified=holdings.map((h,i)=>({...h,weight:h.weight+(i===0?.01:i===1?-.01:0)}));
  const saved=await post('proposed-portfolio/versions',{baseProposalId:base,holdings:modified});expect(saved.statusCode,saved.body).toBe(201);newId=saved.json().proposedPortfolioVersion.id;expect(saved.json().proposedPortfolioVersion).toMatchObject({parent_version_id:base,change_summary:{changed:true}});
  expect((await state.db.query('SELECT * FROM backtest_runs WHERE proposed_portfolio_version_id=$1',[newId])).rows).toHaveLength(0);
  expect((await post('proposed-portfolio/versions',{baseProposalId:base,holdings})).statusCode).toBe(409);
 });
 it('compares scoped historical results and blocks stale backtests from advancing the new proposal',async()=>{
  const response=await app.inject({method:'GET',url:`/api/workflows/${workflowId}/proposed-portfolio/history`});const versions=response.json().versions;
  expect(versions[0]).toMatchObject({id:newId,isCurrent:true,backtest:null});expect(versions.find((v:any)=>v.id===base)).toMatchObject({isHistorical:true,backtest:{id:backtestId}});
  expect((await app.inject({method:'GET',url:`/api/workflows/${workflowId}/proposed-portfolio/history`,headers:{'x-test-org':otherOrganizationId}})).statusCode).toBe(404);
  expect((await post('actions',{action:'submit_proposed_portfolio',payload:{proposedPortfolioVersionId:base}})).statusCode).toBe(409);
  expect((await post('actions',{action:'submit_proposed_portfolio',payload:{proposedPortfolioVersionId:newId}})).statusCode).toBe(200);
  expect((await post('actions',{action:'record_backtest_pass',payload:{backtestRunId:backtestId}})).statusCode).toBe(409);
 });
 it('does not allow revision during approval/implementation or while an optimizer is active',async()=>{
  for(const step of ['portfolio_approval','implementation','monitoring']){await state.db.query('UPDATE workflow_cases SET current_step=$2 WHERE id=$1',[workflowId,step]);expect((await post('proposed-portfolio/reopen',{baseProposalId:newId})).statusCode).toBe(409);}
  await state.db.query("UPDATE workflow_cases SET current_step='optimization' WHERE id=$1",[workflowId]);
  const job=(await state.db.query('INSERT INTO optimization_jobs(organization_id,workflow_case_id,proposed_portfolio_version_id,backtest_run_id,requested_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',[organizationId,workflowId,newId,backtestId,adminId])).rows[0].id;
  expect((await post('proposed-portfolio/reopen',{baseProposalId:newId})).statusCode).toBe(409);await state.db.query("UPDATE optimization_jobs SET status='interrupted' WHERE id=$1",[job]);
 });
 it('allows only the latest passing proposal to be submitted for committee approval',async()=>{
  await state.db.query("UPDATE proposed_portfolio_versions SET status='backtest_passed' WHERE id=ANY($1::uuid[])",[[base,newId]]);
  await state.db.query('UPDATE backtest_runs SET hard_control_pass=true WHERE id=$1',[backtestId]);
  const currentRun=(await state.db.query("INSERT INTO backtest_runs(proposed_portfolio_version_id,run_number,start_date,end_date,frequency,benchmark_manifest,data_manifest,metrics,hard_control_pass,model_version,run_by) VALUES ($1,1,'2023-01-01','2026-01-01','weekly','{}','{}','{\"sleeves\":[]}',true,'test',$2) RETURNING id",[newId,adminId])).rows[0].id;
  await state.db.query("UPDATE workflow_cases SET current_step='backtest' WHERE id=$1",[workflowId]);
  expect((await post('actions',{action:'record_backtest_pass',payload:{backtestRunId:currentRun}})).statusCode).toBe(200);
  expect((await post('approval-rounds',{action:'approve_portfolio',payload:{proposedPortfolioVersionId:base}})).statusCode).toBe(409);
  const approved=await post('approval-rounds',{action:'approve_portfolio',payload:{proposedPortfolioVersionId:newId}});expect(approved.statusCode,approved.body).toBe(201);
 });
});
