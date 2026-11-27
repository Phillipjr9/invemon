import { tryNotify, notificationBucket, attemptUserNotifications } from '../server/notifications.mjs';
import {db,headers,guard,session,body,HttpError,fail,rateLimit} from '../server/core.mjs';
export default async function handler(req,res){
 headers(res);
 try {
  guard(req,['GET','PUT']);const user=await session(req);
  if(req.method==='GET'){
   const rows=await db()`SELECT revision,snapshot,updated_at FROM demo_workspaces WHERE user_id=${user.id}`;
   return res.status(200).json({workspace:rows[0]||null,simulation:true});
  }
  await rateLimit(req,'workspace',120);
  const input=body(req,256000), snapshot=input.snapshot;
  if(!Number.isInteger(input.revision)||input.revision<0 || !snapshot || typeof snapshot!=='object' || Array.isArray(snapshot))throw new HttpError(400,'Invalid workspace revision or snapshot.');
  if(snapshot.schemaVersion!==3||!Number.isFinite(snapshot.cash)||snapshot.cash<0||!Array.isArray(snapshot.holdings)||!Array.isArray(snapshot.goals)||!Array.isArray(snapshot.plans)||!Array.isArray(snapshot.activity)||!snapshot.prefs)throw new HttpError(400,'Invalid demo workspace.');
  if(snapshot.holdings.some(h=>!h||!Number.isFinite(h.units)||h.units<0||!Number.isFinite(h.price)||h.price<=0)||snapshot.goals.some(g=>!g||!Number.isFinite(g.saved)||g.saved<0))throw new HttpError(400,'Invalid demo holdings or goals.');
  // Owner identity always comes from the session; never from input. This is
  // deliberately an untrusted simulation snapshot, not a financial balance.
  const rows=input.revision===0
   ? await db()`INSERT INTO demo_workspaces(user_id,snapshot) VALUES (${user.id},${JSON.stringify(snapshot)}::jsonb) ON CONFLICT(user_id) DO NOTHING RETURNING revision,updated_at`
   : await db()`UPDATE demo_workspaces SET snapshot=${JSON.stringify(snapshot)}::jsonb,revision=revision+1,updated_at=now() WHERE user_id=${user.id} AND revision=${input.revision} RETURNING revision,updated_at`;
  if(!rows[0])throw new HttpError(409,'A newer cloud version exists. Load it before saving again; export local data first if needed.');
  await tryNotify(user.id,'workspace_saved',{name:user.profile.name,reference:`Demo revision ${rows[0].revision}`},notificationBucket('workspace_saved',user.id,60));
  await attemptUserNotifications(user.id);
  return res.status(200).json({...rows[0],simulation:true});
 }catch(error){return fail(res,error);}
}
