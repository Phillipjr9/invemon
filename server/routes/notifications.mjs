import { db, body, guard, headers, session, rateLimit, HttpError, fail } from '../core.mjs';
import { DEFAULT_EMAIL_PREFERENCES, getPreferences, emailConfigured, notificationInsert, notificationBucket, attemptUserNotifications } from '../notifications.mjs';
export default async function handler(req,res) {
 headers(res);
 try {
  guard(req,['GET','POST']);const user=await session(req);
  if(req.method==='GET') {
   const history=await db()`SELECT id,type,status,attempts,created_at,accepted_at FROM email_outbox WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 20`;
   return res.status(200).json({preferences:await getPreferences(user.id),configured:emailConfigured(),history});
  }
  await rateLimit(req,'notifications',30);const input=body(req);
  if(input.action==='preferences') {
   const prefs=input.preferences;
   if(!prefs || Object.keys(DEFAULT_EMAIL_PREFERENCES).some(key=>typeof prefs[key]!=='boolean'))throw new HttpError(400,'Provide a boolean for each email preference.');
   await db()`INSERT INTO email_preferences(user_id,sign_in,support_received,workspace_saved) VALUES (${user.id},${prefs.sign_in},${prefs.support_received},${prefs.workspace_saved}) ON CONFLICT(user_id) DO UPDATE SET sign_in=EXCLUDED.sign_in,support_received=EXCLUDED.support_received,workspace_saved=EXCLUDED.workspace_saved,updated_at=now()`;
   return res.status(200).json({preferences:await getPreferences(user.id)});
  }
  if(input.action==='preview') {
   if(!emailConfigured())throw new HttpError(503,'Email delivery is not configured. You can still view the templates in Email studio.');
   // No recipient or template body is ever accepted from the browser.
   const inserted=await notificationInsert(db(),user.id,'preview',{name:user.profile.name},notificationBucket('preview',user.id));
   if(!inserted.length)throw new HttpError(429,'One preview is allowed per 15-minute window.');
   await attemptUserNotifications(user.id);
   const status=await db()`SELECT status FROM email_outbox WHERE id=${inserted[0].id}`;
   return res.status(202).json({id:inserted[0].id,status:status[0]?.status || 'pending'});
  }
  throw new HttpError(400,'Unsupported notification action.');
 }catch(error){return fail(res,error);}
}
