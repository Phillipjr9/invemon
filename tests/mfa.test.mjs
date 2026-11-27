import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
await pg.exec(fs.readFileSync(new URL('../db/001_accounts.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/002_email_notifications.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/003_account_tokens.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/004_support_threads.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/005_authenticator_mfa.sql',import.meta.url),'utf8'));
function query(text, values=[]) {
 return { text, values, then(resolve,reject) { return pg.query(text,values).then(result=>result.rows).then(resolve,reject); } };
}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=async statements=>pg.transaction(async tx=>{const results=[];for(const s of statements)results.push((await tx.query(s.text,s.values)).rows);return results;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:auth}=await import('../api/account.mjs');
const {default:mfa}=await import('../api/mfa.mjs');
async function call(handler,{method='POST',data,cookie,origin='https://invemon.example',ip='1.2.3.4'}={}){
 const headers={};let status=200,value;
 await handler({method,body:data,headers:{origin,cookie,'content-type':'application/json','x-forwarded-for':ip}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){status=s;return this;},json(v){value=v;return this;}});
 return {status,value,headers,cookie:headers['set-cookie']?.split(';')[0]};
}
const {authenticator,validStep,encryptSecret,decryptSecret}=await import('../server/mfa.mjs');
const {sha}=await import('../server/core.mjs');
const password='a long unique password!';
let owner,oldCookie,secret,recovery,uid,enrollmentCode;
const getUser=async()=> (await pg.query('SELECT * FROM app_users WHERE id=$1',[uid])).rows[0];
test('TOTP matches RFC 6238 and rejects malformed or expired values',()=>{
 const standard='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(authenticator(standard).generate({timestamp:59000}),'287082');
 assert.equal(validStep(standard,'287082',59000),1);
 assert.equal(validStep(standard,'287082',300000),null);
 assert.equal(validStep(standard,'not a code',59000),null);
});
test('authenticated encryption binds secret to user and requires the configured key',()=>{
 process.env.MFA_ENCRYPTION_KEY='c'.repeat(64);
 const value=encryptSecret('PRIVATE-SECRET','user-a');
 assert.equal(value.includes('PRIVATE'),false);assert.equal(decryptSecret(value,'user-a'),'PRIVATE-SECRET');
 assert.throws(()=>decryptSecret(value,'user-b'),/unavailable/);
 process.env.MFA_ENCRYPTION_KEY='d'.repeat(64);assert.throws(()=>decryptSecret(value,'user-a'),/unavailable/);
 delete process.env.MFA_ENCRYPTION_KEY;assert.throws(()=>decryptSecret(value,'user-a'),/not configured/);
 process.env.MFA_ENCRYPTION_KEY='c'.repeat(64);
});
test('setup requires session, password, verified email and server key; only encrypted pending secret stored',async()=>{
 owner=await call(auth,{data:{action:'register',email:'mfa@example.com',name:'MFA Owner',password}});uid=owner.value.account.serverUserId;oldCookie=owner.cookie;
 assert.equal((await call(mfa,{data:{action:'setup',currentPassword:password}})).status,401);
 assert.equal((await call(mfa,{cookie:owner.cookie,data:{action:'setup',currentPassword:'wrong'}})).status,401);
 assert.equal((await call(mfa,{cookie:owner.cookie,data:{action:'setup',currentPassword:password}})).status,403);
 await pg.query('UPDATE app_users SET email_verified_at=now() WHERE id=$1',[uid]);
 delete process.env.MFA_ENCRYPTION_KEY;
 assert.equal((await call(mfa,{cookie:owner.cookie,data:{action:'setup',currentPassword:password}})).status,503);
 process.env.MFA_ENCRYPTION_KEY='c'.repeat(64);
 const result=await call(mfa,{cookie:owner.cookie,data:{action:'setup',currentPassword:password}});assert.equal(result.status,200);secret=result.value.secret;
 assert.ok(result.value.uri.startsWith('otpauth://totp/'));assert.equal((await getUser()).mfa_pending_secret.includes(secret),false);assert.equal((await getUser()).mfa_secret,null);
 assert.equal((await call(auth,{method:'GET',cookie:owner.cookie})).value.account.mfaEnabled,false);
});
test('confirmation checks expiry/code, enables MFA and revokes all pre-enrollment sessions',async()=>{
 const invalid=await call(mfa,{cookie:owner.cookie,data:{action:'confirm',currentPassword:password,code:'wrong'}});assert.equal(invalid.status,401);
 await pg.query("UPDATE app_users SET mfa_pending_expires=now()-interval '1 minute' WHERE id=$1",[uid]);
 assert.equal((await call(mfa,{cookie:owner.cookie,data:{action:'confirm',currentPassword:password,code:authenticator(secret).generate()}})).status,400);
 await pg.query("UPDATE app_users SET mfa_pending_expires=now()+interval '10 minutes' WHERE id=$1",[uid]);
 enrollmentCode=authenticator(secret).generate();
 const confirmed=await call(mfa,{cookie:owner.cookie,data:{action:'confirm',currentPassword:password,code:enrollmentCode}});assert.equal(confirmed.status,200);
 recovery=confirmed.value.recoveryCodes;assert.equal(recovery.length,10);owner.cookie=confirmed.cookie;
 const stored=await getUser();assert.equal(stored.mfa_pending_secret,null);assert.equal(stored.mfa_recovery_hashes.length,10);assert.equal(JSON.stringify(stored).includes(recovery[0]),false);
 assert.equal((await call(auth,{method:'GET',cookie:oldCookie})).value.account,null);
 assert.equal((await call(auth,{method:'GET',cookie:owner.cookie})).value.account.mfaEnabled,true);
 const required=await call(auth,{data:{action:'login',email:'mfa@example.com',password}});assert.equal(required.value.mfaRequired,true);assert.equal(required.cookie,undefined);
});
test('MFA login rejects reused TOTP and consumes a recovery code at most once concurrently',async()=>{
 const login={action:'login',email:'mfa@example.com',password};
 assert.equal((await call(auth,{data:{...login,code:'000invalid'}})).status,401);
 // Replay the actual consumed code, not a newly generated code if the clock crossed a 30s boundary.
 assert.equal((await call(auth,{data:{...login,code:enrollmentCode}})).status,401);
 const result=await Promise.all([1,2].map(i=>call(auth,{ip:`recovery-${i}`,data:{...login,code:recovery[0]}})));
 assert.deepEqual(result.map(r=>r.status).sort(),[200,401]);
 assert.equal((await getUser()).mfa_recovery_hashes.length,9);
 const success=result.find(r=>r.status===200);assert.ok(success.cookie);
 assert.equal((await call(auth,{method:'GET',cookie:success.cookie})).value.account.mfaEnabled,true);
 // A password-only session inserted by another flow cannot access an enabled account.
 await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES ($1,$2,now()+interval '1 day',false)",[sha('e'.repeat(64)),uid]);
 assert.equal((await call(auth,{method:'GET',cookie:`__Host-invemon-session=${'e'.repeat(64)}`})).value.account,null);
});
test('password-reset links do not remove MFA or issue a password-only session',async()=>{
 await pg.query("INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at) VALUES ($1,'reset',$2,now()+interval '30 minutes')",[uid,sha('f'.repeat(64))]);
 assert.equal((await call(auth,{data:{action:'reset-password',token:'f'.repeat(64),password:'replacement long password!'}})).status,200);
 const login=await call(auth,{data:{action:'login',email:'mfa@example.com',password:'replacement long password!'}});assert.equal(login.value.mfaRequired,true);assert.equal(login.cookie,undefined);
 const recovered=await call(auth,{data:{action:'login',email:'mfa@example.com',password:'replacement long password!',code:recovery[1]}});assert.equal(recovered.status,200);owner.cookie=recovered.cookie;
});
test('rotation and disable need password plus fresh authenticator code, not a recovery code',async()=>{
 const pwd='replacement long password!';
 assert.equal((await call(mfa,{ip:'rotate',cookie:owner.cookie,data:{action:'regenerate',currentPassword:pwd,code:recovery[2]}})).status,401);
 // Simulate a new code window without delaying the suite for 30 seconds.
 await pg.query('UPDATE app_users SET mfa_last_step=-1 WHERE id=$1',[uid]);
 const rotated=await call(mfa,{ip:'rotate',cookie:owner.cookie,data:{action:'regenerate',currentPassword:pwd,code:authenticator(secret).generate()}});assert.equal(rotated.status,200);owner.cookie=rotated.cookie;
 assert.equal(rotated.value.recoveryCodes.length,10);assert.equal((await getUser()).mfa_recovery_hashes.includes(sha(recovery[2].replace(/-/g,''))),false);
 delete process.env.MFA_ENCRYPTION_KEY;
 assert.equal((await call(auth,{ip:'missing-key',data:{action:'login',email:'mfa@example.com',password:pwd,code:rotated.value.recoveryCodes[0]}})).status,503);
 process.env.MFA_ENCRYPTION_KEY='c'.repeat(64);
 await pg.query('UPDATE app_users SET mfa_last_step=-1 WHERE id=$1',[uid]);
 const disabled=await call(mfa,{ip:'disable',cookie:owner.cookie,data:{action:'disable',currentPassword:pwd,code:authenticator(secret).generate()}});assert.equal(disabled.status,200);assert.equal(disabled.value.enabled,false);owner.cookie=disabled.cookie;
 const user=await getUser();assert.equal(user.mfa_secret,null);assert.deepEqual(user.mfa_recovery_hashes,[]);
 assert.equal((await call(auth,{data:{action:'login',email:'mfa@example.com',password:pwd}})).status,200);
});
