import { db, randomUUID } from './core.mjs';
import { renderEmail, EMAIL_TYPES } from './email-templates.mjs';
export const DEFAULT_EMAIL_PREFERENCES = { sign_in:false, support_received:true, workspace_saved:false };
export const OPTIONAL_EMAILS = Object.keys(DEFAULT_EMAIL_PREFERENCES);
export const emailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.APP_ORIGIN);
export async function getPreferences(userId) {
 const rows=await db()`SELECT sign_in,support_received,workspace_saved FROM email_preferences WHERE user_id=${userId}`;
 return rows[0] || {...DEFAULT_EMAIL_PREFERENCES};
}
// Return a lazy Neon query so writes + their outbox event can share a transaction.
export function notificationInsert(sql, userId, type, data={}, eventKey=randomUUID()) {
 if(!EMAIL_TYPES.includes(type))throw new Error('Unknown email event');
 const payload={name:String(data.name||'Investor').slice(0,100),occurredAt:new Date().toISOString(),reference:String(data.reference||'').slice(0,64)};
 const optional=OPTIONAL_EMAILS.includes(type);
 return sql`INSERT INTO email_outbox(id,user_id,event_key,type,payload)
 SELECT ${randomUUID()},${userId},${eventKey},${type},${JSON.stringify(payload)}::jsonb
 WHERE (NOT ${optional} OR COALESCE((SELECT CASE ${type} WHEN 'sign_in' THEN sign_in WHEN 'support_received' THEN support_received WHEN 'workspace_saved' THEN workspace_saved END FROM email_preferences WHERE user_id=${userId}),${DEFAULT_EMAIL_PREFERENCES[type] ?? true}))
 ON CONFLICT(event_key) DO NOTHING RETURNING id`;
}
export const notificationBucket = (type,userId,minutes=15) => `${type}:${userId}:${Math.floor(Date.now()/(minutes*60000))}`;
export async function tryNotify(userId,type,data={},eventKey) {
 try { await notificationInsert(db(),userId,type,data,eventKey); } catch(error) { console.error('Notification enqueue failed',{code:error.code}); }
}
export async function sendMessage(row) {
 if(!emailConfigured())throw new Error('not_configured');
 const rendered=renderEmail(row.type,row.payload,process.env.APP_ORIGIN);
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',signal:AbortSignal.timeout(8000),
  headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`invemon-${row.id}`},
  body:JSON.stringify({from:process.env.EMAIL_FROM,to:[row.email],...rendered,...(process.env.EMAIL_REPLY_TO?{reply_to:process.env.EMAIL_REPLY_TO}:{})}),
 });
 if(!response.ok){const error=new Error('provider_rejected');error.status=response.status;throw error;}
 const result=await response.json();if(typeof result.id!=='string'||!result.id)throw new Error('invalid_provider_response');
 return result.id;
}
export async function dispatchNotifications({userId=null,limit=3}={}) {
 if(!emailConfigured())return {configured:false,accepted:0,failed:0};
 const sql=db();
 // Do not replay old security alerts or retry after the provider's idempotency window.
 await sql`UPDATE email_outbox SET status='expired',lease_until=NULL WHERE status IN ('pending','processing') AND created_at<now()-interval '23 hours'`;
 const rows=await sql`UPDATE email_outbox SET status='processing',lease_until=now()+interval '2 minutes',attempts=attempts+1
 WHERE id IN (SELECT id FROM email_outbox WHERE (status='pending' OR (status='processing' AND lease_until<now())) AND attempts<5 AND next_attempt_at<=now() AND (${userId}::uuid IS NULL OR user_id=${userId}::uuid) ORDER BY created_at LIMIT ${Math.min(3,Math.max(1,limit))} FOR UPDATE SKIP LOCKED) RETURNING *`;
 const results=await Promise.all(rows.map(async row=>{
  try {
   const users=await sql`SELECT email FROM app_users WHERE id=${row.user_id}`;
   if(!users[0])return 'skipped';
   // Re-check consent at delivery, including messages queued before an opt-out.
   if(OPTIONAL_EMAILS.includes(row.type) && !(await getPreferences(row.user_id))[row.type]) {
    await sql`UPDATE email_outbox SET status='skipped',lease_until=NULL,last_error=NULL WHERE id=${row.id}`;return 'skipped';
   }
   const providerId=await sendMessage({...row,email:users[0].email});
   await sql`UPDATE email_outbox SET status='accepted',provider_id=${providerId},accepted_at=now(),lease_until=NULL,last_error=NULL WHERE id=${row.id}`;
   return 'accepted';
  } catch(error) {
   // Store only a generic category/status. Provider responses can contain PII.
   const permanent=error.status>=400 && error.status<500 && ![408,409,425,429].includes(error.status);
   const terminal=permanent || row.attempts>=5;
   await sql`UPDATE email_outbox SET status=${terminal?'failed':'pending'},lease_until=NULL,next_attempt_at=now()+(${Math.pow(2,row.attempts)}*interval '1 minute'),last_error=${error.status?`provider_http_${error.status}`:'delivery_unavailable'} WHERE id=${row.id}`;
   return 'failed';
  }
 }));
 return {configured:true,accepted:results.filter(v=>v==='accepted').length,failed:results.filter(v=>v==='failed').length,skipped:results.filter(v=>v==='skipped').length};
}
// Await the bounded attempt: no fire-and-forget work that Vercel could terminate.
export async function attemptUserNotifications(userId) {
 try { return await dispatchNotifications({userId}); } catch(error) { console.error('Notification dispatch deferred',{code:error.code}); return {configured:emailConfigured(),deferred:true}; }
}
