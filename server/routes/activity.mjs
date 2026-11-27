import {db,headers,guard,session,body,rateLimit,HttpError,fail} from '../core.mjs';
const eventId=/^(journal|withdrawal|review|cancelled):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req,res){
 headers(res);
 try{
  guard(req,['GET','POST']);const user=await session(req),sql=db();await rateLimit(req,`activity-${user.id}`,req.method==='GET'?120:40);
  if(req.method==='POST'){
   const input=body(req);
   if(input.action==='read'){
    if(typeof input.id!=='string'||!eventId.test(input.id))throw new HttpError(400,'Invalid notification ID.');
    const found=await sql`SELECT id FROM customer_activity_events WHERE id=${input.id} AND user_id=${user.id}`;
    if(!found.length)throw new HttpError(404,'Notification not found.');
    await sql`INSERT INTO account_notification_reads(user_id,event_id) SELECT ${user.id},id FROM customer_activity_events WHERE user_id=${user.id} AND id=${input.id} ON CONFLICT DO NOTHING`;
   }else if(input.action==='read-all'){
    // Mark only events present in this statement's snapshot, not future events.
    await sql`INSERT INTO account_notification_reads(user_id,event_id) SELECT ${user.id},id FROM customer_activity_events WHERE user_id=${user.id} ON CONFLICT DO NOTHING`;
   }else throw new HttpError(400,'Unsupported notification action.');
   return res.status(200).json({ok:true});
  }
  const params=new URL(req.url||'/api/activity','https://internal.invalid').searchParams;
  const view=params.get('view')||'feed';if(!['feed','inbox'].includes(view))throw new HttpError(400,'Unsupported activity view.');
  const before=params.get('before');if(before!==null&&!eventId.test(before))throw new HttpError(400,'Invalid activity cursor.');
  const rows=await sql`SELECT e.id,e.created_at,e.kind,e.title,e.description,e.reference,e.destination,e.amounts,(r.event_id IS NOT NULL) AS read
   FROM customer_activity_events e LEFT JOIN account_notification_reads r ON r.user_id=e.user_id AND r.event_id=e.id
   WHERE e.user_id=${user.id} AND (${before}::text IS NULL OR (e.created_at,e.id)<(SELECT c.created_at,c.id FROM customer_activity_events c WHERE c.id=${before} AND c.user_id=${user.id}))
   ORDER BY e.created_at DESC,e.id DESC LIMIT 31`;
  const entries=rows.slice(0,30);
  const counts=view==='inbox'?await sql`SELECT count(*)::text AS count FROM customer_activity_events e WHERE e.user_id=${user.id} AND NOT EXISTS(SELECT 1 FROM account_notification_reads r WHERE r.user_id=e.user_id AND r.event_id=e.id)`:null;
  return res.status(200).json({entries,nextCursor:rows.length>30?entries.at(-1).id:null,...(counts?{unreadCount:counts[0].count}:{}),notice:'Requests and reviews are not posted payments. Accounting changes are not independent proof of settlement.'});
 }catch(error){return fail(res,error);}
}
