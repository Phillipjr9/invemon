import { db,headers,body,HttpError,fail,randomUUID } from '../core.mjs';
import { requireOperations } from '../operations.mjs';
export default async function handler(req,res){
 headers(res);
 try{
  if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Method not allowed.');
  requireOperations(req);
  const execute=req.method==='POST'&&body(req).execute===true;
  if(execute&&process.env.MAINTENANCE_WRITES_ENABLED!=='true')throw new HttpError(403,'Maintenance writes are disabled.');
  const sql=db();
  // Only expired transient authentication records. Never deletes accounts,
  // tickets, audit history, workspaces or provider/email delivery history.
  const rows=execute
   ?await sql`WITH sessions AS (DELETE FROM app_sessions WHERE token_hash IN (SELECT token_hash FROM app_sessions WHERE expires_at<now() ORDER BY expires_at LIMIT 1000) RETURNING token_hash),
    limits AS (DELETE FROM app_rate_limits WHERE key IN (SELECT key FROM app_rate_limits WHERE expires_at<now() ORDER BY expires_at LIMIT 1000) RETURNING key),
    tokens AS (DELETE FROM account_action_tokens WHERE token_hash IN (SELECT token_hash FROM account_action_tokens WHERE expires_at<now() ORDER BY expires_at LIMIT 1000) RETURNING token_hash),
    logged AS (INSERT INTO security_events(id,user_id,action) VALUES (${randomUUID()},NULL,'maintenance.expired_auth_cleanup'))
    SELECT (SELECT count(*)::int FROM sessions) AS sessions,(SELECT count(*)::int FROM limits) AS rate_limits,(SELECT count(*)::int FROM tokens) AS action_tokens`
   :await sql`SELECT (SELECT count(*)::int FROM (SELECT 1 FROM app_sessions WHERE expires_at<now() LIMIT 1000) s) AS sessions,
    (SELECT count(*)::int FROM (SELECT 1 FROM app_rate_limits WHERE expires_at<now() LIMIT 1000) r) AS rate_limits,
    (SELECT count(*)::int FROM (SELECT 1 FROM account_action_tokens WHERE expires_at<now() LIMIT 1000) t) AS action_tokens`;
  return res.status(200).json({dryRun:!execute,batchLimitPerTable:1000,counts:rows[0],notice:'Expired transient authentication records only. No account or financial data retention policy is applied.'});
 }catch(error){return fail(res,error);}
}
