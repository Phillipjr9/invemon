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
await pg.exec(fs.readFileSync(new URL('../db/006_funding_sandbox.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/007_production_ledger.sql',import.meta.url),'utf8'));
function query(text, values=[]) {
 return { text, values, then(resolve,reject) { return pg.query(text,values).then(result=>result.rows).then(resolve,reject); } };
}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=async statements=>pg.transaction(async tx=>{const results=[];for(const s of statements)results.push((await tx.query(s.text,s.values)).rows);return results;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:auth}=await import('../api/account.mjs');
const {default:workspace}=await import('../api/workspace.mjs');
async function call(handler,{method='POST',data,cookie,origin='https://invemon.example',ip='1.2.3.4'}={}){
 const headers={};let status=200,value;
 await handler({method,body:data,headers:{origin,cookie,'content-type':'application/json','x-forwarded-for':ip}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){status=s;return this;},json(v){value=v;return this;}});
 return {status,value,headers,cookie:headers['set-cookie']?.split(';')[0]};
}
const registration={action:'register',email:'owner@example.com',password:'a long unique password!',name:'Owner',country:'United States',risk:'Growth'};
let owner,other;
test('same-origin guard and unauthenticated workspace access',async()=>{
 assert.equal((await call(auth,{data:registration,origin:'https://attacker.example'})).status,403);
 assert.equal((await call(workspace,{method:'GET'})).status,401);
 assert.equal((await call(auth,{method:'DELETE'})).status,405);
});
test('registration derives password and issues secure opaque session; session never exposes hashes',async()=>{
 owner=await call(auth,{data:registration});assert.equal(owner.status,201);assert.equal((await pg.query("SELECT * FROM email_outbox WHERE type='welcome'")).rows.length,1);assert.match(owner.headers['set-cookie'],/__Host-invemon-session=.*HttpOnly; SameSite=Lax; Path=.*Secure/);
 const stored=(await pg.query('SELECT * FROM app_users')).rows[0];assert.match(stored.password_hash,/^scrypt:/);assert.notEqual(stored.password_hash,registration.password);
 assert.equal(owner.value.account.emailVerified,false);assert.equal('passwordHash' in owner.value.account,false);
 const session=await call(auth,{method:'GET',cookie:owner.cookie});assert.equal(session.value.account.email,registration.email);assert.equal(session.headers['cache-control'],'no-store');
 assert.equal((await call(auth,{data:{action:'login',email:registration.email,password:'wrong'}})).status,401);
 assert.equal((await call(auth,{data:{action:'login',email:'unknown@example.com',password:'wrong'}})).status,401);
 other=await call(auth,{data:{...registration,email:'other@example.com'}});assert.equal(other.status,201);
});
const snapshot={schemaVersion:3,cash:123,holdings:[],goals:[],plans:[],activity:[],prefs:{}};
test('workspace persistence, ownership isolation, optimistic locking, invalid input',async()=>{
 let result=await call(workspace,{method:'PUT',cookie:owner.cookie,data:{snapshot,revision:0,userId:other.value.account.serverUserId}});assert.equal(result.status,200);assert.equal(result.value.revision,1);
 assert.equal((await call(workspace,{method:'GET',cookie:other.cookie})).value.workspace,null);
 result=await call(workspace,{method:'GET',cookie:owner.cookie});assert.equal(result.value.workspace.snapshot.cash,123);
 assert.equal((await call(workspace,{method:'PUT',cookie:owner.cookie,data:{snapshot,revision:0}})).status,409);
 assert.equal((await call(workspace,{method:'PUT',cookie:owner.cookie,data:{snapshot:{...snapshot,cash:-1},revision:1}})).status,400);
 result=await call(workspace,{method:'PUT',cookie:owner.cookie,data:{snapshot:{...snapshot,cash:100},revision:1}});assert.equal(result.value.revision,2);
});
test('profile allowlist prevents privilege injection, support and data export',async()=>{
 const updated=await call(auth,{cookie:owner.cookie,data:{action:'profile',name:'Updated Owner',risk:'Aggressive',role:'ADMIN',email:'hacker@example.com',emailVerified:true}});assert.equal(updated.value.account.email,registration.email);assert.equal(updated.value.account.risk,'Aggressive');assert.equal(updated.value.account.role,undefined);assert.equal(updated.value.account.emailVerified,false);
 const support=await call(auth,{cookie:owner.cookie,data:{action:'support',subject:'Test support',message:'Please help with this simulation.'}});assert.equal(support.status,201);
 const exported=await call(auth,{cookie:owner.cookie,data:{action:'export'}});assert.equal(exported.value.workspace.snapshot.cash,100);assert.equal(exported.value.tickets.length,1);assert.equal(JSON.stringify(exported.value).includes('scrypt:'),false);
 assert.equal((await call(auth,{cookie:owner.cookie,data:{action:'send-money'}})).status,400);
});
test('security overview is owner-scoped and never exposes session tokens',async()=>{
 assert.equal((await call(auth,{data:{action:'security-overview'}})).status,401);
 const result=await call(auth,{cookie:owner.cookie,data:{action:'security-overview',userId:other.value.account.serverUserId}});
 assert.equal(result.status,200);assert.equal(result.value.sessionCount,1);assert.equal(result.value.sessions.length,1);assert.equal(result.value.sessions[0].current,true);
 assert.ok(result.value.events.some(entry=>entry.action==='profile.updated'));
 assert.equal(JSON.stringify(result.value).includes('token_hash'),false);assert.equal(JSON.stringify(result.value).includes(owner.cookie.split('=')[1]),false);
 const isolated=await call(auth,{cookie:other.cookie,data:{action:'security-overview'}});assert.equal(isolated.value.events.some(entry=>entry.action==='profile.updated'),false);
});
test('retained ledger records prevent automatic deletion with a useful error and preserve session',async()=>{
 await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2)");
 await pg.query("INSERT INTO ledger_accounts(id,asset,kind,user_id) VALUES($1,'USD:BANK','customer_liability',$2)",[crypto.randomUUID(),other.value.account.serverUserId]);
 const result=await call(auth,{cookie:other.cookie,data:{action:'delete',currentPassword:registration.password}});
 assert.equal(result.status,409);assert.match(result.value.error,/retained/);
 assert.equal((await call(auth,{method:'GET',cookie:other.cookie})).value.account.serverUserId,other.value.account.serverUserId);
});
test('password change requires old password and revokes every session',async()=>{
 assert.equal((await call(auth,{cookie:owner.cookie,data:{action:'password',currentPassword:'wrong',password:'new long password!'}})).status,401);
 assert.equal((await call(auth,{cookie:owner.cookie,data:{action:'password',currentPassword:registration.password,password:'new long password!'}})).status,200);
 assert.equal((await call(workspace,{method:'GET',cookie:owner.cookie})).status,401);
 assert.equal((await call(auth,{data:{action:'login',email:registration.email,password:registration.password}})).status,401);
 owner=await call(auth,{data:{action:'login',email:registration.email,password:'new long password!'}});assert.equal(owner.status,200);
});
test('account deletion cascades data and revokes access; auth rate limiting',async()=>{
 assert.equal((await call(auth,{cookie:owner.cookie,data:{action:'delete',currentPassword:'new long password!'}})).status,200);
 assert.equal((await call(workspace,{method:'GET',cookie:owner.cookie})).status,401);
 assert.equal((await pg.query('SELECT * FROM demo_workspaces')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM support_requests')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM email_outbox WHERE user_id=$1',[owner.value.account.serverUserId])).rows.length,0);
 await pg.query("INSERT INTO app_rate_limits(key,hits,expires_at) SELECT key,100,expires_at FROM app_rate_limits LIMIT 1 ON CONFLICT(key) DO UPDATE SET hits=100");
 // Isolated IP, exhaust exactly the configured auth budget.
 for(let i=0;i<15;i++)await call(auth,{data:{action:'login',email:'x',password:''},ip:'9.9.9.9'});
 assert.equal((await call(auth,{data:{action:'login',email:'x',password:''},ip:'9.9.9.9'})).status,429);
 await pg.close();
});
