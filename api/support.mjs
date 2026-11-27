import { db, headers, guard, session, body, HttpError, fail, rateLimit, randomUUID, checkPassword } from '../server/core.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isSupportAgent(user) {
 // Empty/malformed configuration grants nobody access. Profile/email never grants a role.
 const allowed = String(process.env.SUPPORT_AGENT_IDS || '').split(',').map(id=>id.trim()).filter(id=>UUID.test(id));
 return Boolean(user.email_verified_at && allowed.includes(user.id));
}
export default async function handler(req,res) {
 headers(res);
 try {
  guard(req,['GET','POST']); const user=await session(req), staff=isSupportAgent(user), sql=db();
  await rateLimit(req,'support',req.method==='GET'?120:30);
  if(req.method==='GET') {
   const id=req.query?.id;
   if(id!==undefined) {
    if(typeof id!=='string'||!UUID.test(id))throw new HttpError(400,'Invalid request ID.');
    const tickets=await sql`SELECT id,subject,message,status,revision,created_at,updated_at FROM support_requests WHERE id=${id} AND (user_id=${user.id} OR ${staff})`;
    if(!tickets.length)throw new HttpError(404,'Support request not found.');
    const messages=await sql`SELECT id,actor_role,visibility,message,created_at FROM support_messages WHERE request_id=${id} AND (visibility='public' OR ${staff}) ORDER BY created_at DESC,id DESC LIMIT 100`;
    return res.status(200).json({staff,ticket:tickets[0],messages:messages.reverse(),messageLimit:100});
   }
   const tickets=staff
    ? await sql`SELECT r.id,r.subject,r.status,r.revision,r.created_at,r.updated_at,u.email AS customer_email FROM support_requests r JOIN app_users u ON u.id=r.user_id ORDER BY r.updated_at DESC,r.id DESC LIMIT 50`
    : await sql`SELECT id,subject,status,revision,created_at,updated_at FROM support_requests WHERE user_id=${user.id} ORDER BY updated_at DESC,id DESC LIMIT 50`;
   return res.status(200).json({staff,tickets,limit:50});
  }
  const input=body(req),id=input.id;
  if(typeof id!=='string'||!UUID.test(id)||!Number.isInteger(input.revision)||input.revision<1)throw new HttpError(400,'Provide a valid request ID and revision.');
  if(!['reply','status'].includes(input.action))throw new HttpError(400,'Unsupported support action.');
  if((input.action==='status'||input.visibility==='internal')&&!staff)throw new HttpError(403,'Staff permission required.');
  const rows=await sql`SELECT id,status FROM support_requests WHERE id=${id} AND (user_id=${user.id} OR ${staff})`;
  if(!rows.length)throw new HttpError(404,'Support request not found.');
  // Fresh password confirmation for every privileged write; not a substitute for MFA.
  if(staff&&!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password for staff actions.');
  const message=String(input.message||'').trim(),visibility=input.visibility==='internal'?'internal':'public';
  if(input.action==='reply'&&(message.length<1||message.length>4000))throw new HttpError(400,'Use a message of 1–4,000 characters.');
  const next=input.action==='status'?input.status:staff?(visibility==='internal'?rows[0].status:'waiting'):'open';
  if(!['open','in_progress','waiting','resolved','closed'].includes(next))throw new HttpError(400,'Invalid support status.');
  const note=input.action==='reply', noteId=randomUUID(),eventId=randomUUID();
  const changed=await sql`WITH changed AS (
   UPDATE support_requests SET status=${next},revision=revision+1,updated_at=now()
   WHERE id=${id} AND revision=${input.revision} AND (user_id=${user.id} OR ${staff}) RETURNING id,revision,status
  ), posted AS (
   INSERT INTO support_messages(id,request_id,actor_id,actor_role,visibility,message)
   SELECT ${noteId},id,${user.id},${staff?'staff':'customer'},${visibility},${message} FROM changed WHERE ${note} RETURNING id
  ), logged AS (
   INSERT INTO security_events(id,user_id,action) SELECT ${eventId},${user.id},${note?'support.reply':'support.status'} FROM changed
  ) SELECT * FROM changed`;
  if(!changed.length)throw new HttpError(409,'This request changed on another device. Reload before replying.');
  return res.status(200).json({ticket:changed[0]});
 }catch(error){return fail(res,error);}
}
