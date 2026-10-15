import type { FastifyInstance } from 'fastify';
import { hasPermission } from '@isater/domain';
import { requirePasswordChanged } from './auth.js';
import { pool } from './db.js';
import { writeAudit } from './audit.js';
import type { AuthenticatedUser } from './types.js';

const active="('queued','preparing','running')";
export async function recoverExpiredOptimizationJobs() {
  await pool.query(`UPDATE optimization_jobs SET status='interrupted',error_code='worker_interrupted',message='计算任务已中断，请重新发起；现有组合未改变。',finished_at=now(),updated_at=now() WHERE status IN ${active} AND lease_expires_at<=now()`);
}
export async function latestOptimizationJob(workflowId:string,organizationId:string) {
  await recoverExpiredOptimizationJobs();
  return (await pool.query('SELECT * FROM optimization_jobs WHERE workflow_case_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 1',[workflowId,organizationId])).rows[0]??null;
}
export async function registerOptimizationJobs(app:FastifyInstance,compute:(job:any,user:AuthenticatedUser,info:{id:string;ip:string},signal:AbortSignal,progress:(value:Record<string,unknown>)=>Promise<void>)=>Promise<any>) {
  const running=new Map<string,AbortController>();const pending=new Set<Promise<void>>();
  app.addHook('onClose',async()=>{for(const controller of running.values())controller.abort();await Promise.allSettled([...pending]);});
  app.get('/api/workflows/:workflowId/optimization/jobs/:jobId',async(request)=>{
    const user=requirePasswordChanged(request);const {workflowId,jobId}=request.params as {workflowId:string;jobId:string};
    await recoverExpiredOptimizationJobs();const job=(await pool.query('SELECT * FROM optimization_jobs WHERE id=$1 AND workflow_case_id=$2 AND organization_id=$3',[jobId,workflowId,user.organizationId])).rows[0];
    if(!job)throw Object.assign(new Error('Optimization job not found'),{statusCode:404});
    const result=job.optimization_run_id?await pool.query('SELECT * FROM optimization_runs WHERE id=$1',[job.optimization_run_id]):{rows:[]};
    return {optimizationJob:job,optimizationRun:result.rows[0]??null};
  });
  app.post('/api/workflows/:workflowId/optimization/runs',async(request,reply)=>{
    const user=requirePasswordChanged(request);if(!hasPermission(user.role,'optimization:run'))throw Object.assign(new Error('Forbidden'),{statusCode:403});
    const {workflowId}=request.params as {workflowId:string};await recoverExpiredOptimizationJobs();
    const workflow=(await pool.query("SELECT id FROM workflow_cases WHERE id=$1 AND organization_id=$2 AND status='active' AND current_step='optimization'",[workflowId,user.organizationId])).rows[0];
    if(!workflow)throw Object.assign(new Error('Optimization is not the current workflow step'),{statusCode:409});
    const existing=(await pool.query(`SELECT * FROM optimization_jobs WHERE status IN ${active} LIMIT 1`)).rows[0];
    if(existing){if(existing.organization_id===user.organizationId&&existing.workflow_case_id===workflowId)return reply.code(202).send({optimizationJob:existing});return reply.code(409).send({error:'optimizer_busy',message:'优化服务器正在处理另一项任务，请稍后重试。'});}
    const prior=(await pool.query(`SELECT b.* FROM backtest_runs b JOIN proposed_portfolio_versions p ON p.id=b.proposed_portfolio_version_id WHERE p.workflow_case_id=$1 AND p.id=(SELECT id FROM proposed_portfolio_versions WHERE workflow_case_id=$1 ORDER BY version DESC LIMIT 1) ORDER BY b.run_at DESC LIMIT 1`,[workflowId])).rows[0];
    if(!prior||prior.hard_control_pass)throw Object.assign(new Error('A failed backtest of the current proposal is required'),{statusCode:409});
    let job:any;const client=await pool.connect();
    try{await client.query('BEGIN');job=(await client.query(`INSERT INTO optimization_jobs(organization_id,workflow_case_id,proposed_portfolio_version_id,backtest_run_id,requested_by,progress) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[user.organizationId,workflowId,prior.proposed_portfolio_version_id,prior.id,user.id,{phase:'queued'}])).rows[0];
      await writeAudit(client,{organizationId:user.organizationId,actorUserId:user.id,action:'optimization.job.start',entityType:'optimization_job',entityId:job.id,outcome:'allowed',requestId:request.id,ipAddress:request.ip});await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');if((error as {code?:string}).code==='23505')return reply.code(409).send({error:'optimizer_busy',message:'已有优化任务正在运行，请刷新查看进度。'});throw error;}finally{client.release();}
    const controller=new AbortController();running.set(job.id,controller);
    const progress=async(value:Record<string,unknown>)=>{controller.signal.throwIfAborted();await pool.query(`UPDATE optimization_jobs SET status=$2,progress=progress||$3::jsonb,updated_at=now(),lease_expires_at=now()+interval '30 seconds' WHERE id=$1 AND status IN ${active} RETURNING id`,[job.id,value.phase==='preparing'?'preparing':'running',JSON.stringify(value)]);};
    const timeout=setTimeout(()=>controller.abort(),120000);
    const heartbeat=setInterval(()=>{void pool.query(`UPDATE optimization_jobs SET lease_expires_at=now()+interval '30 seconds' WHERE id=$1 AND status IN ${active}`,[job.id]).catch(()=>controller.abort());},8000);
    // Defer work until the short HTTP response has been sent.
    const task=new Promise<void>(resolve=>setImmediate(resolve)).then(async()=>{
      try{await progress({phase:'preparing'});const result=await compute(job,user,{id:request.id,ip:request.ip},controller.signal,progress);controller.signal.throwIfAborted();
        await pool.query(`UPDATE optimization_jobs SET status='succeeded',optimization_run_id=$2,message='已生成并复核预算内找到的可行方案。',finished_at=now(),updated_at=now() WHERE id=$1 AND status IN ${active}`,[job.id,result.id]);
      }catch(error){const known=error as Error&{code?:string;diagnostics?:unknown};const noCandidate=known.code==='search_budget_exhausted'||known.code==='search_no_candidate';
        request.log.error({err:error,optimizationJobId:job.id},'Optimization job ended');
        const message=noCandidate?'搜索预算内未找到通过全部风控的方案，不代表数学上无解。请调整组合或由金融人员复核目标。':controller.signal.aborted?'任务已达到时间预算或服务正在重启，请重新发起；现有组合未改变。':known.code==='optimization_data_unready'?known.message:'优化任务未完成，请查看服务器日志；现有组合未改变。';
        await pool.query(`UPDATE optimization_jobs SET status=$2,error_code=$3,message=$4,progress=progress||$5::jsonb,finished_at=now(),updated_at=now() WHERE id=$1 AND status IN ${active}`,[job.id,noCandidate?'no_candidate':controller.signal.aborted?'interrupted':'failed',known.code??'optimization_failed',message,JSON.stringify({diagnostics:known.diagnostics??null})]);
      }finally{clearTimeout(timeout);clearInterval(heartbeat);running.delete(job.id);}
    }).catch(error=>request.log.error({err:error},'Could not persist optimization job outcome'));
    pending.add(task);void task.finally(()=>pending.delete(task));return reply.code(202).send({optimizationJob:job});
  });
}
