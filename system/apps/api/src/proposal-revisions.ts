import type {FastifyInstance} from 'fastify';
import {hasPermission} from '@isater/domain';
import {z} from 'zod';
import {pool} from './db.js';
import {requirePasswordChanged} from './auth.js';
import {writeAudit} from './audit.js';
const conflict = (message: string) => Object.assign(new Error(message), {statusCode: 409});
const key = (h: any) => `${h.ticker}|${h.exchange_code ?? h.exchangeCode}`;
export function proposalChanges(before: any[], after: any[]) {
  const previous = new Map(before.map(h => [key(h), h]));
  const next = new Map(after.map(h => [key(h), h]));
  const added = after.filter(h => !previous.has(key(h))).map(key);
  const removed = before.filter(h => !next.has(key(h))).map(key);
  const modified = after.filter(h => {const old = previous.get(key(h)); return old && (Math.abs(Number(old.weight)-Number(h.weight)) > 0.000000005 || old.style !== h.style || old.sleeve !== h.sleeve || Boolean(old.locked) !== Boolean(h.locked));}).map(h => ({security: key(h), before: Number(previous.get(key(h)).weight), after: Number(h.weight)}));
  return {changed: added.length + removed.length + modified.length > 0, added, removed, modified};
}
export async function registerProposalRevisionRoutes(app: FastifyInstance) {
  app.post('/api/workflows/:workflowId/proposed-portfolio/reopen', async(request) => {
    const user = requirePasswordChanged(request);
    if (!hasPermission(user.role, 'portfolio:prepare')) throw Object.assign(new Error('Forbidden'), {statusCode:403});
    const {workflowId} = request.params as {workflowId:string};
    const input = z.object({baseProposalId:z.string().uuid()}).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const wf = (await client.query("SELECT * FROM workflow_cases WHERE id=$1 AND organization_id=$2 AND status='active' FOR UPDATE", [workflowId,user.organizationId])).rows[0];
      if (!wf || !['backtest','optimization'].includes(wf.current_step)) throw conflict('只能从回测或优化阶段返回修改；审批和已实施组合不能直接更改。');
      const latest = (await client.query('SELECT id,status FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1', [workflowId])).rows[0];
      if (latest?.id !== input.baseProposalId || latest.status === 'approved') throw conflict('组合已变化，请刷新后重新确认。');
      if ((await client.query("SELECT id FROM optimization_jobs WHERE workflow_case_id=$1 AND status IN ('queued','preparing','running') AND lease_expires_at>now()", [workflowId])).rows[0]) throw conflict('优化仍在运行，请等任务结束后再修改组合。');
      const updated = (await client.query("UPDATE workflow_cases SET current_step='proposed_portfolio',version=version+1,payload=payload||$2::jsonb||jsonb_build_object('revisionOpenedAt',clock_timestamp()),updated_at=now() WHERE id=$1 RETURNING *", [workflowId,JSON.stringify({revisionBaseProposalId:latest.id})])).rows[0];
      await writeAudit(client,{organizationId:user.organizationId,actorUserId:user.id,action:'proposed_portfolio.reopen',entityType:'workflow_case',entityId:workflowId,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{baseProposalId:latest.id,from:wf.current_step,marketAllocationsUnchanged:true}});
      await client.query('COMMIT'); return {workflow:updated};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });
  app.get('/api/workflows/:workflowId/proposed-portfolio/history', async(request) => {
    const user = requirePasswordChanged(request); const {workflowId} = request.params as {workflowId:string};
    const workflow=(await pool.query('SELECT id,payload FROM workflow_cases WHERE id=$1 AND organization_id=$2',[workflowId,user.organizationId])).rows[0];
    if (!workflow) throw Object.assign(new Error('Workflow not found'),{statusCode:404});
    const result = await pool.query(`SELECT p.id,p.version,p.status,p.parent_version_id,p.change_summary,p.created_at,p.sleeve_target_version_id,
      COALESCE((SELECT json_agg(json_build_object('ticker',h.ticker,'exchange_code',h.exchange_code,'sleeve',h.sleeve,'style',h.style,'weight',h.weight) ORDER BY h.sleeve,h.ticker) FROM proposed_holdings h WHERE h.proposed_portfolio_version_id=p.id),'[]') AS holdings,
      (SELECT json_build_object('id',b.id,'hard_control_pass',b.hard_control_pass,'metrics',b.metrics,'start_date',b.start_date,'end_date',b.end_date,'history_mode',b.history_mode,'run_at',b.run_at) FROM backtest_runs b WHERE b.proposed_portfolio_version_id=p.id ORDER BY b.run_at DESC LIMIT 1) AS backtest
      FROM proposed_portfolio_versions p WHERE p.workflow_case_id=$1 ORDER BY p.version DESC LIMIT 100`,[workflowId]);
    return {versions:result.rows.map((v,i)=>({...v,isCurrent:i===0,isHistorical:i!==0,requiresRetest:i===0&&Boolean(workflow.payload?.revisionOpenedAt)&&(!v.backtest||new Date(v.backtest.run_at).getTime()<new Date(workflow.payload.revisionOpenedAt).getTime())})),marketAllocationsEditable:false};
  });
}
