import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
await pg.exec(fs.readFileSync(new URL('../db/001_accounts.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/002_email_notifications.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/003_account_tokens.sql',import.meta.url),'utf8'));
function query(text, values=[]) {
 return { text, values, then(resolve,reject) { return pg.query(text,values).then(result=>result.rows).then(resolve,reject); } };
}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=async statements=>pg.transaction(async tx=>{const results=[];for(const s of statements)results.push((await tx.query(s.text,s.values)).rows);return results;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:auth}=await import('../api/account.mjs');

async function call(handler,{method='POST',data,cookie,origin='https://invemon.example',ip='1.2.3.4'}={}){
 const headers={};let status=200,value;
 await handler({method,body:data,headers:{origin,cookie,'content-type':'application/json','x-forwarded-for':ip}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){status=s;return this;},json(v){value=v;return this;}});
 return {status,value,headers,cookie:headers['set-cookie']?.split(';')[0]};
}
const {sha,checkPassword}=await import('../server/core.mjs');
const registration={action:'register',email:'links@example.com',password:'original long password!',name:'Link Owner'};
let owner, sent=[], deliveryStatus=200;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{ sent.push({url,body:JSON.parse(options.body)});return {ok:deliveryStatus===200,json:async()=>({id:'test-email'})}; };
function lastToken(){return sent.at(-1).body.text.match(/token=([a-f0-9]{64})/)[1];}
test('link requests fail closed when email is not configured',async()=>{
 delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;
 owner=await call(auth,{data:registration});assert.equal(owner.status,201);
 assert.equal((await call(auth,{data:{action:'request-reset',email:registration.email}})).status,503);
 process.env.RESEND_API_KEY='test-only';process.env.EMAIL_FROM='Invemon <no-reply@example.com>';
});
test('reset response is generic, origin protected; only hashes stored; new links supersede old',async()=>{
 assert.equal((await call(auth,{origin:'https://evil.example',data:{action:'request-reset',email:registration.email}})).status,403);
 const known=await call(auth,{ip:'2',data:{action:'request-reset',email:registration.email}});const old=lastToken();
 const count=sent.length;
 const unknown=await call(auth,{ip:'3',data:{action:'request-reset',email:'unknown@example.com'}});
 assert.deepEqual(known.value,unknown.value);assert.equal(sent.length,count);
 const row=(await pg.query("SELECT * FROM account_action_tokens WHERE purpose='reset'")).rows[0];
 assert.equal(row.token_hash,sha(old));assert.equal(JSON.stringify(row).includes(old),false);
 await call(auth,{ip:'4',data:{action:'request-reset',email:registration.email}});
 assert.notEqual(lastToken(),old);
 assert.equal((await call(auth,{data:{action:'reset-password',token:old,password:'replacement long password!'}})).status,400);
});
test('reset is atomic and single use, revokes sessions, does not verify ownership',async()=>{
 const raw=lastToken();
 const attempts=await Promise.all([1,2].map(i=>call(auth,{ip:`reset${i}`,data:{action:'reset-password',token:raw,password:'replacement long password!'}})));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,400]);
 assert.equal((await pg.query('SELECT * FROM app_sessions WHERE user_id=$1',[owner.value.account.serverUserId])).rows.length,0);
 const user=(await pg.query('SELECT * FROM app_users WHERE email=$1',[registration.email])).rows[0];
 assert.equal(await checkPassword('replacement long password!',user.password_hash),true);assert.equal(user.email_verified_at,null);
 owner=await call(auth,{ip:'login-new',data:{action:'login',email:registration.email,password:'replacement long password!'}});assert.equal(owner.status,200);
});
test('verification requires a session and deliberate one-time POST; wrong purpose rejected',async()=>{
 assert.equal((await call(auth,{ip:'verify-no-session',data:{action:'request-verification'}})).status,401);
 await call(auth,{cookie:owner.cookie,ip:'verify',data:{action:'request-verification'}});const raw=lastToken();
 assert.equal((await call(auth,{data:{action:'reset-password',token:raw,password:'another long password!'}})).status,400);
 assert.equal((await call(auth,{data:{action:'verify-email',token:raw}})).status,200);
 assert.equal((await call(auth,{data:{action:'verify-email',token:raw}})).status,400);
 assert.equal((await call(auth,{method:'GET',cookie:owner.cookie})).value.account.emailVerified,true);
});
test('expired tokens and failed delivery cannot reset; email-scoped throttle enforced',async()=>{
 const id=owner.value.account.serverUserId,raw='b'.repeat(64);
 await pg.query("INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at) VALUES ($1,'reset',$2,now()-interval '1 minute')",[id,sha(raw)]);
 assert.equal((await call(auth,{data:{action:'reset-password',token:raw,password:'expired long password!'}})).status,400);
 deliveryStatus=500;
 const response=await call(auth,{ip:'failure',data:{action:'request-reset',email:registration.email}});assert.equal(response.status,200);
 assert.equal((await pg.query("SELECT * FROM account_action_tokens WHERE user_id=$1 AND purpose='reset'",[id])).rows.length,0);
 assert.equal((await call(auth,{ip:'fourth-ip',data:{action:'request-reset',email:registration.email}})).status,429);
 globalThis.fetch=originalFetch;
});
