import { emailConfigured, notificationInsert, notificationBucket, tryNotify, attemptUserNotifications } from '../server/notifications.mjs';
import { db, body, guard, headers, session, account, profile, hashPassword, checkPassword, issueSession, clearSession, rateLimit, audit, randomUUID, HttpError, fail } from '../server/core.mjs';
export default async function handler(req,res) {
 headers(res);
 try {
  guard(req,['GET','POST']);
  if(req.method==='GET') { const user=await session(req,false);return res.status(200).json({account:user?account(user):null,capabilities:{liveMoney:false,emailDelivery:emailConfigured(),mfa:false}}); }
  const input=body(req);const action=input.action;
  await rateLimit(req,action==='login'||action==='register'?'auth':'account',action==='login'||action==='register'?15:60);
  if(action==='register') {
   const email=String(input.email || '').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new HttpError(400,'Enter a valid email address.');
   const data=profile(input), passwordHash=await hashPassword(input.password), id=randomUUID();
   try { const sql=db(); await sql.transaction([sql`INSERT INTO app_users(id,email,password_hash,profile) VALUES (${id},${email},${passwordHash},${JSON.stringify(data)}::jsonb)`,notificationInsert(sql,id,'welcome',{name:data.name},`welcome:${id}`)]);} catch(error){if(error.code==='23505')throw new HttpError(409,'Unable to create this account. Try signing in instead.');throw error;}
   await issueSession(res,id);await audit(id,'account.created');await attemptUserNotifications(id);
   return res.status(201).json({account:{...data,email,serverUserId:id,emailVerified:false}});
  }
  if(action==='login') {
   const email=String(input.email || '').trim().toLowerCase();
   const users=await db()`SELECT * FROM app_users WHERE email=${email}`;
   // Equivalent expensive derivation for unknown users prevents a timing shortcut.
   const valid=await checkPassword(input.password,users[0]?.password_hash || `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
   if(!users[0]||!valid)throw new HttpError(401,'Email or password not recognized.');
   await issueSession(res,users[0].id);await audit(users[0].id,'session.created');
   await tryNotify(users[0].id,'sign_in',{name:users[0].profile.name},notificationBucket('sign_in',users[0].id));await attemptUserNotifications(users[0].id);
   return res.status(200).json({account:account(users[0])});
  }
  if(action==='logout') { const current=await session(req,false); if(current) await db()`DELETE FROM app_sessions WHERE token_hash=${current.token_hash}`; clearSession(res); return res.status(200).json({ok:true}); }
  const user=await session(req);
  if(action==='logout-all') {await db()`DELETE FROM app_sessions WHERE user_id=${user.id}`;clearSession(res);return res.status(200).json({ok:true});}
  if(action==='profile') {const data=profile(input);await db()`UPDATE app_users SET profile=${JSON.stringify(data)}::jsonb WHERE id=${user.id}`;await audit(user.id,'profile.updated');return res.status(200).json({account:account({...user,profile:data})});}
  if(action==='password' || action==='delete') {
   if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Current password not recognized.');
   if(action==='delete') {await db()`DELETE FROM app_users WHERE id=${user.id}`;clearSession(res);return res.status(200).json({ok:true});}
   const hash=await hashPassword(input.password);const sql=db();
   await sql.transaction([sql`UPDATE app_users SET password_hash=${hash} WHERE id=${user.id}`,sql`DELETE FROM app_sessions WHERE user_id=${user.id}`,notificationInsert(sql,user.id,'password_changed',{name:user.profile.name})]);
   await attemptUserNotifications(user.id);
   clearSession(res);return res.status(200).json({ok:true});
  }
  if(action==='support') {
   const subject=String(input.subject||'').trim(), message=String(input.message||'').trim();
   if(subject.length<3||subject.length>120||message.length<10||message.length>4000)throw new HttpError(400,'Use a subject of 3–120 characters and a message of 10–4,000 characters.');
   const id=randomUUID(),sql=db();await sql.transaction([sql`INSERT INTO support_requests(id,user_id,subject,message) VALUES (${id},${user.id},${subject},${message})`,notificationInsert(sql,user.id,'support_received',{name:user.profile.name,reference:id},notificationBucket('support_received',user.id))]);
   await attemptUserNotifications(user.id);
   return res.status(201).json({id,status:'open',emailStatus:'Check Email notifications for the acknowledgment status; delivery depends on your preferences and provider configuration.'});
  }
  if(action==='export') {
   const workspace=await db()`SELECT revision,snapshot,updated_at FROM demo_workspaces WHERE user_id=${user.id}`;
   const events=await db()`SELECT action,created_at FROM security_events WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 1000`;
   const tickets=await db()`SELECT id,subject,message,status,created_at FROM support_requests WHERE user_id=${user.id}`;
   const emails=await db()`SELECT type,status,created_at,accepted_at FROM email_outbox WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 1000`;
   const preferences=await db()`SELECT sign_in,support_received,workspace_saved FROM email_preferences WHERE user_id=${user.id}`;
   return res.status(200).json({emailHistory:emails,emailPreferences:preferences[0]||null,account:account(user),workspace:workspace[0]||null,events,tickets,notice:'Simulation data only. Not an investment statement or tax document.'});
  }
  throw new HttpError(400,'Unsupported action. Live transfers, trading, recovery email, and MFA are not enabled.');
 } catch(error){return fail(res,error);}
}
