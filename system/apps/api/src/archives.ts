import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from './db.js';
import {requirePasswordChanged} from './auth.js';
import {writeAudit} from './audit.js';
import {verifyPassword} from './security.js';

export const archiveError=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
export const json=<T=any>(value:any):T=>typeof value==='string'?JSON.parse(value):value;
const createSchema=z.object({name:z.string().trim().min(1).max(160),kind:z.enum(['annual','research']),businessYear:z.number().int().min(2000).max(2200),principal:z.number().positive().max(1e15).default(1000000),sourceArchiveId:z.string().uuid().optional()});
export async function selectedArchive(organizationId:string){return (await pool.query('SELECT a.* FROM archive_selection s JOIN investment_archives a ON a.id=s.archive_id AND a.organization_id=s.organization_id WHERE s.organization_id=$1 AND a.deleted_at IS NULL',[organizationId])).rows[0]??null;}

// Explicit IDs keep in-flight computations attached to their original archive. A stale
// browser cannot accidentally submit current-portfolio actions after an admin switch.
export async function guardArchiveRequest(request:FastifyRequest){
 const user=request.currentUser;if(!user)return;
 const path=request.url.split('?')[0];let workflowId=/^\/api\/workflows\/([0-9a-f-]{36})(?:\/|$)/i.exec(path)?.[1];
 const write=!['GET','HEAD','OPTIONS'].includes(request.method);
 if(write&&workflowId&&(await pool.query('SELECT id FROM investment_archives WHERE workflow_case_id=$1 AND organization_id=$2 AND deleted_at IS NOT NULL',[workflowId,user.organizationId])).rows[0])throw archiveError('档案已删除，请先恢复。 / Archive is in the recycle bin.');
 const linked=/^\/api\/(approval-rounds|execution-actions|execution-fill-batches|optimization-runs|rebalance-plans|reports)\/([0-9a-f-]{36})(?:\/|$)/i.exec(path);
 if(!workflowId&&!(write&&(linked||/^\/api\/(portfolio\/current|archives\/[^/]+\/research|workflows\/annual)/.test(path))))return;
 if(write&&linked){const queries:Record<string,string>={
  'approval-rounds':'SELECT workflow_case_id FROM approval_rounds WHERE id=$1',
  'execution-actions':'SELECT workflow_case_id FROM maker_checker_actions WHERE id=$1',
  'execution-fill-batches':'SELECT workflow_case_id FROM execution_fill_batches WHERE id=$1',
  'optimization-runs':'SELECT p.workflow_case_id FROM optimization_runs o JOIN proposed_portfolio_versions p ON p.id=o.proposed_portfolio_version_id WHERE o.id=$1',
  'rebalance-plans':'SELECT c.workflow_case_id FROM rebalance_plans p JOIN rebalance_checks c ON c.id=p.rebalance_check_id WHERE p.id=$1',
  reports:'SELECT workflow_case_id FROM report_versions WHERE id=$1'};workflowId=(await pool.query(queries[linked[1]],[linked[2]])).rows[0]?.workflow_case_id;}
 const selected=await selectedArchive(user.organizationId);
 if(write&&selected){
  if(request.headers['x-archive-id']!==selected.id)throw archiveError('archive_changed_refresh_required');
  if(workflowId&&workflowId!==selected.workflow_case_id)throw archiveError('archive_changed_refresh_required');
  const researchId=/^\/api\/archives\/([^/]+)\/research-runs/.exec(path)?.[1];if(researchId&&researchId!==selected.id)throw archiveError('archive_changed_refresh_required');
  if(selected.kind==='annual'&&workflowId){const principal=(await pool.query('SELECT initial_principal FROM portfolios WHERE id=$1',[selected.portfolio_id])).rows[0];if(principal?.initial_principal==null)throw archiveError('请先由决策委员会在总览中确认本档案本金，再运行正式流程。');}
 }
 if(workflowId){const target=(await pool.query('SELECT kind FROM investment_archives WHERE workflow_case_id=$1 AND organization_id=$2',[workflowId,user.organizationId])).rows[0];if(target&&target.kind!=='annual')throw archiveError('Research archives cannot enter the formal workflow');}
 if(write&&selected?.kind==='research'&&(linked||/^\/api\/(portfolio\/current|workflows)/.test(path)))throw archiveError('Research archives cannot execute formal actions');
}

export async function registerArchiveRoutes(app:FastifyInstance){
 app.get('/api/archives',async request=>{const user=requirePasswordChanged(request);const includeDeleted=user.role==='system_admin'&&(request.query as {includeDeleted?:string}).includeDeleted==='true';return {archives:(await pool.query(`SELECT a.*,w.status AS workflow_status,w.current_step FROM investment_archives a LEFT JOIN workflow_cases w ON w.id=a.workflow_case_id WHERE a.organization_id=$1 AND ($2::boolean OR a.deleted_at IS NULL) ORDER BY a.created_at DESC,a.id`,[user.organizationId,includeDeleted])).rows,selectedArchive:await selectedArchive(user.organizationId)};});
 for(const action of ['delete','restore'] as const)app.post(`/api/admin/archives/:archiveId/${action}`,async request=>{
  const user=requirePasswordChanged(request);if(user.role!=='system_admin')throw archiveError('Forbidden',403);
  const {archiveId}=z.object({archiveId:z.string().uuid()}).parse(request.params);
  const input=z.object({password:z.string().min(1).max(1024),expectedRevision:z.number().int().positive()}).parse(request.body);
  const attempts=await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE actor_user_id=$1 AND action='archive.password_check' AND outcome='denied' AND occurred_at>now()-interval '15 minutes'",[user.id]);
  if(Number(attempts.rows[0]?.count)>=5)throw archiveError('密码错误次数过多，请15分钟后重试。',429);
  const account=(await pool.query("SELECT password_hash FROM users WHERE id=$1 AND organization_id=$2 AND status='active'",[user.id,user.organizationId])).rows[0];
  if(!account||!await verifyPassword(account.password_hash,input.password)){
   await writeAudit(pool,{organizationId:user.organizationId,actorUserId:user.id,action:'archive.password_check',entityType:'investment_archive',entityId:archiveId,outcome:'denied',requestId:request.id,ipAddress:request.ip});
   throw archiveError('当前登录密码不正确，未修改档案。 / Incorrect current password.',400);
  }
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[user.organizationId]);
   const archive=(await db.query('SELECT * FROM investment_archives WHERE id=$1 AND organization_id=$2 FOR UPDATE',[archiveId,user.organizationId])).rows[0];
   if(!archive)throw archiveError('Archive not found',404);
   if(archive.revision!==input.expectedRevision)throw archiveError('档案已变化，请刷新后重试。');
   if(action==='delete'){
    if(archive.deleted_at)throw archiveError('档案已在回收站。');
    if((await db.query('SELECT archive_id FROM archive_selection WHERE organization_id=$1 AND archive_id=$2',[user.organizationId,archiveId])).rows[0])throw archiveError('请先切换到其他档案，再删除当前档案。');
    const busy=(await db.query("SELECT id FROM research_backtest_runs WHERE archive_id=$1 AND status IN ('queued','running') AND deadline_at>now()",[archiveId])).rows[0];
    const optimizing=archive.workflow_case_id&&(await db.query("SELECT id FROM optimization_jobs WHERE workflow_case_id=$1 AND status IN ('queued','preparing','running') AND lease_expires_at>now()",[archive.workflow_case_id])).rows[0];
    if(busy||optimizing)throw archiveError('档案仍有计算任务运行，请等待完成。');
   }else if(!archive.deleted_at)throw archiveError('档案未删除，无需恢复。');
   const updated=(await db.query(`UPDATE investment_archives SET deleted_at=${action==='delete'?'now()':'NULL'},deleted_by=${action==='delete'?'$2':'NULL'},revision=revision+1 WHERE id=$1 RETURNING *`,action==='delete'?[archiveId,user.id]:[archiveId])).rows[0];
   await writeAudit(db,{organizationId:user.organizationId,actorUserId:user.id,action:`archive.${action}`,entityType:'investment_archive',entityId:archiveId,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{name:archive.name,evidencePreserved:true,mode:'recoverable',previousRevision:archive.revision}});
   await db.query('COMMIT');return {archive:updated};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
 app.post('/api/admin/archives',async(request,reply)=>{
  const user=requirePasswordChanged(request);if(user.role!=='system_admin')throw archiveError('Forbidden',403);const input=createSchema.parse(request.body);const db=await pool.connect();
  try{await db.query('BEGIN');await db.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[user.organizationId]);
   let configuration:any={};
   if(input.sourceArchiveId){const source=(await db.query('SELECT * FROM investment_archives WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[input.sourceArchiveId,user.organizationId])).rows[0];if(!source)throw archiveError('Archive not found',404);configuration=json(source.configuration);
    if(source.workflow_case_id){const proposal=(await db.query(`SELECT pp.id,s.targets FROM proposed_portfolio_versions pp JOIN sleeve_target_versions s ON s.id=pp.sleeve_target_version_id WHERE pp.workflow_case_id=$1 ORDER BY pp.version DESC LIMIT 1`,[source.workflow_case_id])).rows[0];
     if(proposal){const targets=json(proposal.targets);const holdings=(await db.query('SELECT * FROM proposed_holdings WHERE proposed_portfolio_version_id=$1',[proposal.id])).rows;const weighted=holdings.map(h=>({ticker:h.ticker,exchangeCode:h.exchange_code,weightPercent:100*Number(h.weight)*Number(targets.equityTargets.find((s:any)=>s.key===h.sleeve)?.weight??0)}));const sum=weighted.reduce((n,h)=>n+h.weightPercent,0);if(sum>0)configuration={...configuration,holdings:weighted.map(h=>({...h,weightPercent:h.weightPercent/sum*100}))};}
    }
   }
   if(!configuration.parameterSnapshot){const organizationParameters=(await db.query("SELECT version,parameters,effective_from,created_at FROM parameter_sets WHERE organization_id=$1 AND status='effective' LIMIT 1",[user.organizationId])).rows[0];const effective=organizationParameters??(await db.query('SELECT version,parameters,created_at FROM default_business_parameters ORDER BY version DESC LIMIT 1')).rows[0];configuration.parameterSnapshot=json(effective.parameters);configuration.parameterSnapshotVersion=effective.version;configuration.parameterSnapshotSource=organizationParameters?'organization':'system_default';configuration.parameterSnapshotEffectiveFrom=effective.effective_from??effective.created_at;}
   configuration.suggestedPrincipal=input.principal;
   const p=(await db.query(`INSERT INTO portfolios(organization_id,code,name,is_active) VALUES($1,$2,$3,false) RETURNING id`,[user.organizationId,`ARCH-${randomUUID()}`,input.name])).rows[0];
   let workflowId=null;if(input.kind==='annual')workflowId=(await db.query(`INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES($1,$2,'annual_cycle',$3,'active','annual_data',$4) RETURNING id`,[user.organizationId,p.id,input.businessYear,user.id])).rows[0].id;
   const archive=(await db.query(`INSERT INTO investment_archives(organization_id,portfolio_id,workflow_case_id,name,kind,business_year,source_archive_id,configuration,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[user.organizationId,p.id,workflowId,input.name,input.kind,input.businessYear,input.sourceArchiveId??null,JSON.stringify(configuration),user.id])).rows[0];
   await writeAudit(db,{organizationId:user.organizationId,actorUserId:user.id,action:'archive.create',entityType:'investment_archive',entityId:archive.id,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{kind:input.kind,sourceArchiveId:input.sourceArchiveId??null,approvalsAndActualsCopied:false,selected:false}});
   await db.query('COMMIT');return reply.code(201).send({archive});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
 app.post('/api/admin/archives/:archiveId/select',async request=>{
  const user=requirePasswordChanged(request);if(user.role!=='system_admin')throw archiveError('Forbidden',403);const {archiveId}=z.object({archiveId:z.string().uuid()}).parse(request.params);const db=await pool.connect();
  try{await db.query('BEGIN');await db.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[user.organizationId]);const archive=(await db.query('SELECT * FROM investment_archives WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',[archiveId,user.organizationId])).rows[0];if(!archive)throw archiveError('Archive not found',404);
   await db.query('INSERT INTO archive_selection(organization_id,archive_id,selected_by) VALUES($1,$2,$3) ON CONFLICT(organization_id) DO UPDATE SET archive_id=$2,selected_by=$3,updated_at=clock_timestamp()',[user.organizationId,archiveId,user.id]);
   await db.query('UPDATE portfolios SET is_active=(id=$2) WHERE organization_id=$1',[user.organizationId,archive.portfolio_id]);
   await writeAudit(db,{organizationId:user.organizationId,actorUserId:user.id,action:'archive.select',entityType:'investment_archive',entityId:archiveId,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{organizationWide:true,recordsChanged:false}});await db.query('COMMIT');return {archive};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
}
