import type {FastifyInstance,FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from './db.js';
import {config} from './config.js';
import {requirePasswordChanged} from './auth.js';
import {archiveError,json} from './archives.js';
import {writeAudit} from './audit.js';

function admin(request:FastifyRequest){const user=requirePasswordChanged(request);if(user.role!=='system_admin')throw archiveError('Forbidden',403);return user;}
const resetSchema=z.object({confirmation:z.literal('RESET ARCHIVE'),archiveId:z.string().uuid(),expectedRevision:z.number().int().positive(),expectedWorkflowVersion:z.number().int().positive().nullable()});

// Reset means a fresh, explicitly linked workspace, not erasure of financial evidence.
export async function registerArchiveResetRoutes(app:FastifyInstance){
 app.get('/api/admin/archive-reset/status',async request=>{
  const user=admin(request);const archive=(await pool.query(`SELECT a.id,a.name,a.kind,a.revision,w.version AS workflow_version
   FROM archive_selection s JOIN investment_archives a ON a.id=s.archive_id AND a.organization_id=s.organization_id
   LEFT JOIN workflow_cases w ON w.id=a.workflow_case_id WHERE s.organization_id=$1`,[user.organizationId])).rows[0]??null;
  return {enabled:config.ENABLE_DEMO_RESET&&Boolean(archive),configurationEnabled:config.ENABLE_DEMO_RESET,archive,confirmation:'RESET ARCHIVE',preservesOriginal:true};
 });
 app.post('/api/admin/archive-reset',async request=>{
  const user=admin(request);if(!config.ENABLE_DEMO_RESET)throw archiveError('Demo reset is disabled',403);const input=resetSchema.parse(request.body);
  const db=await pool.connect();
  try{
   await db.query('BEGIN');await db.query('SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE',[user.organizationId]);
   const current=(await db.query(`SELECT a.* FROM archive_selection s JOIN investment_archives a ON a.id=s.archive_id AND a.organization_id=s.organization_id WHERE s.organization_id=$1 FOR UPDATE OF a`,[user.organizationId])).rows[0];
   if(!current||current.id!==input.archiveId||request.headers['x-archive-id']!==current.id||current.revision!==input.expectedRevision)throw archiveError('档案或资料已变化，请重新读取后确认；未重置任何记录。');
   const workflow=current.workflow_case_id?(await db.query('SELECT version FROM workflow_cases WHERE id=$1 FOR UPDATE',[current.workflow_case_id])).rows[0]:null;
   if((workflow?.version??null)!==input.expectedWorkflowVersion)throw archiveError('年度流程已变化，请刷新后重新确认；未重置任何记录。');
   const researchBusy=(await db.query("SELECT id FROM research_backtest_runs WHERE archive_id=$1 AND status IN ('queued','running') AND deadline_at>now() LIMIT 1",[current.id])).rows[0];
   const optimizationBusy=current.workflow_case_id?(await db.query("SELECT id FROM optimization_jobs WHERE workflow_case_id=$1 AND status IN ('queued','preparing','running') AND lease_expires_at>now() LIMIT 1",[current.workflow_case_id])).rows[0]:null;
   if(researchBusy||optimizationBusy)throw archiveError('当前档案仍有计算任务运行，请等待任务结束后再重置。');
   const originalConfiguration=json(current.configuration);const rootName=typeof originalConfiguration.resetRootName==='string'?originalConfiguration.resetRootName:current.name;
   const priorSequence=Number(originalConfiguration.resetSequence??0);const sequence=Number.isSafeInteger(priorSequence)&&priorSequence>=0&&priorSequence<1000000?priorSequence+1:1;
   const name=`${rootName.slice(0,135)} · reset ${sequence}`;
   const organizationParameters=(await db.query("SELECT version,parameters,effective_from,created_at FROM parameter_sets WHERE organization_id=$1 AND status='effective' LIMIT 1",[user.organizationId])).rows[0];
   const parameters=organizationParameters??(await db.query('SELECT version,parameters,created_at FROM default_business_parameters ORDER BY version DESC LIMIT 1')).rows[0];
   const configuration={parameterSnapshot:json(parameters.parameters),parameterSnapshotVersion:parameters.version,parameterSnapshotSource:organizationParameters?'organization':'system_default',parameterSnapshotEffectiveFrom:parameters.effective_from??parameters.created_at,resetRootName:rootName,resetSequence:sequence,resetFromArchiveId:current.id};
   const portfolio=(await db.query('INSERT INTO portfolios(organization_id,code,name,is_active) VALUES($1,$2,$3,false) RETURNING id',[user.organizationId,`ARCH-${randomUUID()}`,name])).rows[0];
   const workflowId=current.kind==='annual'?(await db.query("INSERT INTO workflow_cases(organization_id,portfolio_id,workflow_type,business_year,status,current_step,created_by) VALUES($1,$2,'annual_cycle',$3,'active','annual_data',$4) RETURNING id",[user.organizationId,portfolio.id,current.business_year,user.id])).rows[0].id:null;
   const replacement=(await db.query('INSERT INTO investment_archives(organization_id,portfolio_id,workflow_case_id,name,kind,business_year,source_archive_id,configuration,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[user.organizationId,portfolio.id,workflowId,name,current.kind,current.business_year,current.id,JSON.stringify(configuration),user.id])).rows[0];
   await db.query('UPDATE archive_selection SET archive_id=$2,selected_by=$3,updated_at=clock_timestamp() WHERE organization_id=$1',[user.organizationId,replacement.id,user.id]);
   await db.query('UPDATE portfolios SET is_active=(id=$2) WHERE organization_id=$1',[user.organizationId,portfolio.id]);
   await writeAudit(db,{organizationId:user.organizationId,actorUserId:user.id,action:'archive.reset',entityType:'investment_archive',entityId:current.id,outcome:'allowed',requestId:request.id,ipAddress:request.ip,detail:{originalArchiveId:current.id,replacementArchiveId:replacement.id,kind:current.kind,resetMode:'fresh_linked_workspace',originalEvidencePreserved:true,otherArchivesChanged:false,principalRequiresCommittee:current.kind==='annual'}});
   await db.query('COMMIT');return {ok:true,archive:replacement,originalArchiveId:current.id,preservedOriginal:true};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 });
}
