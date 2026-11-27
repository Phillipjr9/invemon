import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { db,sha,HttpError,checkPassword,rateLimit,issueSession,randomUUID } from './core.mjs';

export const mfaConfigured=()=>/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY||'');
function key(){if(!mfaConfigured())throw new HttpError(503,'Authenticator security is not configured. Contact support.');return Buffer.from(process.env.MFA_ENCRYPTION_KEY,'hex');}
export function encryptSecret(secret,userId){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(`invemon-mfa:${userId}`));
 const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(part=>part.toString('base64url')).join('.');
}
export function decryptSecret(value,userId){
 const encryptionKey=key();
 try{
  const [iv,tag,ciphertext]=String(value).split('.').map(part=>Buffer.from(part,'base64url'));
  const cipher=createDecipheriv('aes-256-gcm',encryptionKey,iv);cipher.setAAD(Buffer.from(`invemon-mfa:${userId}`));cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext),cipher.final()]).toString('utf8');
 }catch{throw new HttpError(503,'Authenticator security is unavailable. Contact support.');}
}
export function authenticator(secret,label='Invemon'){
 return new OTPAuth.TOTP({issuer:'Invemon',label,algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)});
}
export function validStep(secret,code,timestamp=Date.now()){
 if(!/^\d{6}$/.test(String(code)))return null;
 const delta=authenticator(secret).validate({token:String(code),window:1,timestamp});
 return delta===null?null:Math.floor(timestamp/30000)+delta;
}
function recoveryCodes(){
 const codes=Array.from({length:10},()=>randomBytes(16).toString('hex').match(/.{8}/g).join('-'));
 return {codes,hashes:codes.map(code=>sha(code.replace(/-/g,'')))};
}
export async function consumeSecondFactor(user,input,{allowRecovery=true}={}){
 const code=String(input||'').trim().replace(/[ -]/g,'').toLowerCase(),sql=db();
 if(!user.mfa_secret)throw new HttpError(400,'Authenticator is not enabled.');
 await rateLimit({headers:{'x-forwarded-for':'account-factor'}},`mfa-${user.id}`,10);
 // A missing encryption key never silently downgrades an enabled account.
 const secret=decryptSecret(user.mfa_secret,user.id);
 if(allowRecovery&&/^[a-f0-9]{32}$/.test(code)){
  const digest=sha(code);
  const rows=await sql`UPDATE app_users SET mfa_recovery_hashes=COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements_text(mfa_recovery_hashes) value WHERE value<>${digest}),'[]'::jsonb)
   WHERE id=${user.id} AND mfa_secret=${user.mfa_secret} AND mfa_recovery_hashes @> ${JSON.stringify([digest])}::jsonb RETURNING id`;
  if(rows.length)return 'recovery';
 }else{
  const step=validStep(secret,code);
  if(step!==null){
   const rows=await sql`UPDATE app_users SET mfa_last_step=${step} WHERE id=${user.id} AND mfa_secret=${user.mfa_secret} AND mfa_last_step<${step} RETURNING id`;
   if(rows.length)return 'authenticator';
  }
 }
 throw new HttpError(401,'Authenticator or recovery code is invalid, expired, or already used. Wait for a new code if necessary.');
}
export async function manageMfa(req,res,user,input){
 const sql=db();await rateLimit(req,'mfa-management',15);
 if(input.action==='status')return {enabled:Boolean(user.mfa_secret),configured:mfaConfigured(),recoveryCodesRemaining:Array.isArray(user.mfa_recovery_hashes)?user.mfa_recovery_hashes.length:0};
 if(!['setup','confirm','disable','regenerate'].includes(input.action))throw new HttpError(400,'Unsupported authenticator action.');
 if(!await checkPassword(input.currentPassword,user.password_hash))throw new HttpError(401,'Confirm your current password.');
 if(input.action==='setup'){
  if(!user.email_verified_at)throw new HttpError(403,'Verify your email before enabling an authenticator.');
  if(user.mfa_secret)throw new HttpError(409,'Authenticator is already enabled.');
  const secret=new OTPAuth.Secret({size:20}).base32,cipher=encryptSecret(secret,user.id);
  const rows=await sql`UPDATE app_users SET mfa_pending_secret=${cipher},mfa_pending_expires=now()+interval '10 minutes' WHERE id=${user.id} AND mfa_secret IS NULL RETURNING id`;
  if(!rows.length)throw new HttpError(409,'Security settings changed. Reload and try again.');
  return {secret,uri:authenticator(secret,user.email).toString(),expiresInSeconds:600};
 }
 if(input.action==='confirm'){
  if(user.mfa_secret||!user.mfa_pending_secret||!user.mfa_pending_expires||new Date(user.mfa_pending_expires).getTime()<=Date.now())throw new HttpError(400,'Setup expired or is unavailable. Start again.');
  if(!user.email_verified_at)throw new HttpError(403,'Verify your email before enabling an authenticator.');
  const step=validStep(decryptSecret(user.mfa_pending_secret,user.id),String(input.code||'').trim());
  if(step===null)throw new HttpError(401,'Authenticator code not recognized.');
  const {codes,hashes}=recoveryCodes();
  const rows=await sql`WITH changed AS (UPDATE app_users SET mfa_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_pending_expires=NULL,mfa_last_step=${step},mfa_recovery_hashes=${JSON.stringify(hashes)}::jsonb
   WHERE id=${user.id} AND mfa_secret IS NULL AND mfa_pending_secret=${user.mfa_pending_secret} AND mfa_pending_expires>now() RETURNING id),
   revoked AS (DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM changed)),
   logged AS (INSERT INTO security_events(id,user_id,action) SELECT ${randomUUID()},id,'mfa.enabled' FROM changed)
   SELECT id FROM changed`;
  if(!rows.length)throw new HttpError(409,'Setup changed or expired. Start again.');
  await issueSession(res,user.id,true);
  return {enabled:true,recoveryCodes:codes};
 }
 if(!user.mfa_secret)throw new HttpError(400,'Authenticator is not enabled.');
 await consumeSecondFactor(user,input.code,{allowRecovery:false});
 const {codes,hashes}=recoveryCodes();
 const disable=input.action==='disable';
 const rows=disable
  ?await sql`WITH changed AS (UPDATE app_users SET mfa_secret=NULL,mfa_pending_secret=NULL,mfa_pending_expires=NULL,mfa_recovery_hashes='[]'::jsonb,mfa_last_step=-1 WHERE id=${user.id} AND mfa_secret=${user.mfa_secret} RETURNING id),
   revoked AS (DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM changed)),logged AS (INSERT INTO security_events(id,user_id,action) SELECT ${randomUUID()},id,'mfa.disabled' FROM changed) SELECT id FROM changed`
  :await sql`WITH changed AS (UPDATE app_users SET mfa_recovery_hashes=${JSON.stringify(hashes)}::jsonb WHERE id=${user.id} AND mfa_secret=${user.mfa_secret} RETURNING id),
   revoked AS (DELETE FROM app_sessions WHERE user_id IN (SELECT id FROM changed)),logged AS (INSERT INTO security_events(id,user_id,action) SELECT ${randomUUID()},id,'mfa.recovery_rotated' FROM changed) SELECT id FROM changed`;
 if(!rows.length)throw new HttpError(409,'Security settings changed. Reload and try again.');
 await issueSession(res,user.id,!disable);
 return {enabled:!disable,...(!disable?{recoveryCodes:codes}:{})};
}
