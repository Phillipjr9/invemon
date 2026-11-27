import { mfaConfigured } from '../mfa.mjs';
import { db,headers,HttpError,fail } from '../core.mjs';
import { requireOperations,REQUIRED_TABLES } from '../operations.mjs';
import { emailConfigured } from '../notifications.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed.');
  requireOperations(req);
  const sql=db();
  const tables=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
  const columns=await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='support_requests' AND column_name IN ('revision','updated_at')`;
  const found=new Set(tables.map(row=>row.table_name));
  const missingTables=REQUIRED_TABLES.filter(name=>!found.has(name));
  const missingColumns=['revision','updated_at'].filter(name=>!columns.some(row=>row.column_name===name));
  const mfaColumns=await sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('app_users','app_sessions')`;
  const expectedMfa=['app_users.mfa_secret','app_users.mfa_pending_secret','app_users.mfa_pending_expires','app_users.mfa_last_step','app_users.mfa_recovery_hashes','app_sessions.mfa_verified'];
  const missingMfaColumns=expectedMfa.filter(name=>!mfaColumns.some(row=>`${row.table_name}.${row.column_name}`===name));
  const mfaInUse=missingMfaColumns.length?false:(await sql`SELECT EXISTS(SELECT 1 FROM app_users WHERE mfa_secret IS NOT NULL) AS enabled`)[0].enabled;
  let originConfigured=false;
  try{
   const origin=new URL(process.env.APP_ORIGIN);
   const secure=origin.protocol==='https:'||(process.env.NODE_ENV!=='production'&&origin.protocol==='http:');
   originConfigured=secure&&!origin.username&&!origin.password&&origin.origin===String(process.env.APP_ORIGIN).replace(/\/$/,'');
  }catch{/* Invalid/missing configuration is not ready. */}
  const ready=!missingTables.length&&!missingColumns.length&&!missingMfaColumns.length&&originConfigured&&(!mfaInUse||mfaConfigured());
  return res.status(ready?200:503).json({ready,databaseReachable:true,schema:{missingTables,missingSupportColumns:missingColumns,missingMfaColumns},configuration:{originConfigured,mfaConfigured:mfaConfigured(),mfaInUse,emailConfigured:emailConfigured(),supportStaffConfigured:Boolean(process.env.SUPPORT_AGENT_IDS?.trim()),maintenanceWritesEnabled:process.env.MAINTENANCE_WRITES_ENABLED==='true'},liveMoney:false,notice:'Database/schema reachability only. Email delivery, data-provider health, backups, security and financial-service readiness are not certified.'});
 }catch(error){return fail(res,error);}
}
