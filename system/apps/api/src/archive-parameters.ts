import {pool,type DatabaseClient,type DatabasePool} from './db.js';
export async function archiveParameters(organizationId:string,workflowId?:string,db:Pick<DatabaseClient|DatabasePool,'query'>=pool):Promise<Record<string,any>|null>{
 if(!workflowId)return null;
 const row=(await db.query("SELECT configuration->'parameterSnapshot' AS parameters FROM investment_archives WHERE organization_id=$1 AND workflow_case_id=$2",[organizationId,workflowId])).rows[0];
 return row?.parameters?(typeof row.parameters==='string'?JSON.parse(row.parameters):row.parameters):null;
}
