import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const pg = new PGlite();
await pg.exec(fs.readFileSync(new URL('../db/001_accounts.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/002_email_notifications.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/003_account_tokens.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/004_support_threads.sql',import.meta.url),'utf8'));
function query(text, values=[]) {
 return { text, values, then(resolve,reject) { return pg.query(text,values).then(result=>result.rows).then(resolve,reject); } };
}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=async statements=>pg.transaction(async tx=>{const results=[];for(const s of statements)results.push((await tx.query(s.text,s.values)).rows);return results;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:auth}=await import('../api/account.mjs');
const {default:support}=await import('../api/support.mjs');
const {default:health}=await import('../api/health.mjs');
const {default:maintenance}=await import('../api/maintenance.mjs');
async function call(handler,{method='POST',data,cookie,origin='https://invemon.example',ip='1.2.3.4',query={},authorization}={}){
 const headers={};let status=200,value;
 await handler({method,body:data,query,headers:{origin,cookie,authorization,'content-type':'application/json','x-forwarded-for':ip}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){status=s;return this;},json(v){value=v;return this;}});
 return {status,value,headers,cookie:headers['set-cookie']?.split(';')[0]};
}
let owner,other,agent,id,revision;
const password='a long unique password!';
test('support requires sessions, isolates owners and ignores client role claims',async()=>{
 owner=await call(auth,{data:{action:'register',name:'Owner',email:'owner@example.com',password}});
 other=await call(auth,{data:{action:'register',name:'Other',email:'other@example.com',password}});
 agent=await call(auth,{data:{action:'register',name:'Agent',email:'agent@example.com',password}});
 const created=await call(auth,{cookie:owner.cookie,data:{action:'support',subject:'Cannot save workspace',message:'My sample workspace save failed.'}});id=created.value.id;
 assert.equal((await call(support,{method:'GET'})).status,401);
 assert.equal((await call(support,{method:'GET',cookie:other.cookie,query:{id}})).status,404);
 assert.deepEqual((await call(support,{method:'GET',cookie:other.cookie})).value.tickets,[]);
 const mine=await call(support,{method:'GET',cookie:owner.cookie,query:{id}});revision=mine.value.ticket.revision;
 assert.equal(mine.value.staff,false);assert.equal(revision,1);
 assert.equal((await call(support,{cookie:owner.cookie,data:{action:'status',id,revision,status:'closed',role:'staff'}})).status,403);
 assert.equal((await call(support,{method:'GET',cookie:owner.cookie,query:{id:"x' OR 1=1"}})).status,400);
 assert.equal((await call(support,{cookie:owner.cookie,origin:'https://evil.example',data:{action:'reply',id,revision,message:'hi'}})).status,403);
});
test('staff access is an explicit UUID allowlist plus verified account, never email/profile',async()=>{
 process.env.SUPPORT_AGENT_IDS='owner@example.com,*,not-a-uuid';
 assert.equal((await call(support,{method:'GET',cookie:agent.cookie})).value.staff,false);
 process.env.SUPPORT_AGENT_IDS=agent.value.account.serverUserId;
 assert.equal((await call(support,{method:'GET',cookie:agent.cookie})).value.staff,false);
 await pg.query('UPDATE app_users SET email_verified_at=now() WHERE id=$1',[agent.value.account.serverUserId]);
 const list=await call(support,{method:'GET',cookie:agent.cookie});assert.equal(list.value.staff,true);assert.equal(list.value.tickets.length,1);assert.equal(list.value.tickets[0].customer_email,'owner@example.com');
});
test('staff writes require password; internal notes are hidden from customers and exports',async()=>{
 const note={action:'reply',id,revision,message:'Internal diagnostic: never expose',visibility:'internal'};
 assert.equal((await call(support,{cookie:agent.cookie,data:note})).status,401);
 const written=await call(support,{cookie:agent.cookie,data:{...note,currentPassword:password}});assert.equal(written.status,200);revision=written.value.ticket.revision;
 const internal=await call(support,{method:'GET',cookie:agent.cookie,query:{id}});assert.equal(internal.value.messages.length,1);
 const customer=await call(support,{method:'GET',cookie:owner.cookie,query:{id}});assert.deepEqual(customer.value.messages,[]);
 const exported=await call(auth,{cookie:owner.cookie,data:{action:'export'}});assert.equal(JSON.stringify(exported.value).includes('Internal diagnostic'),false);
 assert.equal((await call(support,{cookie:owner.cookie,data:{...note,revision}})).status,403);
 assert.equal((await call(support,{cookie:other.cookie,data:{...note,visibility:'public',revision}})).status,404);
});
test('ticket writes are atomic, revision checked and status constrained',async()=>{
 const stale=await call(support,{cookie:agent.cookie,data:{action:'reply',id,revision:1,message:'Stale note',currentPassword:password}});assert.equal(stale.status,409);
 assert.equal((await pg.query('SELECT * FROM support_messages')).rows.length,1);
 assert.equal((await call(support,{cookie:agent.cookie,data:{action:'status',id,revision,status:'invented',currentPassword:password}})).status,400);
 const publicReply=await call(support,{cookie:agent.cookie,data:{action:'reply',id,revision,message:'Please try again. <script>not executable</script>',currentPassword:password}});assert.equal(publicReply.status,200);assert.equal(publicReply.value.ticket.status,'waiting');revision=publicReply.value.ticket.revision;
 let result=await call(support,{cookie:agent.cookie,data:{action:'status',id,revision,status:'closed',currentPassword:password}});assert.equal(result.status,200);revision=result.value.ticket.revision;
 result=await call(support,{cookie:owner.cookie,data:{action:'reply',id,revision,message:'Still having trouble.'}});assert.equal(result.status,200);assert.equal(result.value.ticket.status,'open');revision=result.value.ticket.revision;
 assert.equal((await call(support,{method:'GET',cookie:owner.cookie,query:{id}})).value.messages.length,2);
 const events=(await pg.query("SELECT * FROM security_events WHERE action LIKE 'support.%'")).rows;assert.equal(events.length,4);
 delete process.env.SUPPORT_AGENT_IDS;
 assert.equal((await call(support,{method:'GET',cookie:agent.cookie,query:{id}})).status,404);
});
test('protected readiness reports schema and configuration, not credentials',async()=>{
 delete process.env.OPS_SECRET;
 assert.equal((await call(health,{method:'GET'})).status,503);
 process.env.OPS_SECRET='operations-secret-at-least-32-characters';
 assert.equal((await call(health,{method:'GET'})).status,401);
 assert.equal((await call(health,{method:'GET',authorization:'Bearer wrong'})).status,401);
 const authorization=`Bearer ${process.env.OPS_SECRET}`;
 const ready=await call(health,{method:'GET',authorization});assert.equal(ready.status,200);assert.equal(ready.value.databaseReachable,true);assert.equal(ready.value.liveMoney,false);assert.equal(JSON.stringify(ready.value).includes(process.env.OPS_SECRET),false);
 assert.equal((await call(health,{authorization})).status,405);
 await pg.exec('ALTER TABLE support_messages RENAME TO support_messages_hidden');
 const missing=await call(health,{method:'GET',authorization});assert.equal(missing.status,503);assert.deepEqual(missing.value.schema.missingTables,['support_messages']);
 await pg.exec('ALTER TABLE support_messages_hidden RENAME TO support_messages');
});
test('cleanup defaults to dry-run, requires explicit enablement, only removes expired transient records',async()=>{
 const authorization=`Bearer ${process.env.OPS_SECRET}`,uid=owner.value.account.serverUserId;
 await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES ('expired-session',$1,now()-interval '1 minute')",[uid]);
 await pg.query("INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at) VALUES ($1,'reset','expired-token',now()-interval '1 minute')",[uid]);
 await pg.query("INSERT INTO app_rate_limits(key,hits,expires_at) SELECT 'expired-'||i,1,now()-interval '1 minute' FROM generate_series(1,1005) i");
 assert.equal((await call(maintenance,{method:'GET'})).status,401);
 const dry=await call(maintenance,{method:'GET',authorization});assert.equal(dry.value.dryRun,true);assert.deepEqual(dry.value.counts,{sessions:1,rate_limits:1000,action_tokens:1});
 assert.equal((await pg.query("SELECT * FROM app_sessions WHERE token_hash='expired-session'")).rows.length,1);
 assert.equal((await call(maintenance,{authorization,data:{execute:true}})).status,403);
 process.env.MAINTENANCE_WRITES_ENABLED='true';
 const cleaned=await call(maintenance,{authorization,data:{execute:true}});assert.equal(cleaned.status,200);assert.equal(cleaned.value.dryRun,false);assert.equal(cleaned.value.counts.rate_limits,1000);
 assert.equal((await pg.query("SELECT * FROM app_rate_limits WHERE key LIKE 'expired-%'")).rows.length,5);
 assert.equal((await call(auth,{method:'GET',cookie:owner.cookie})).value.account.email,'owner@example.com');
 assert.equal((await pg.query('SELECT * FROM support_messages')).rows.length,3);assert.equal((await pg.query('SELECT * FROM app_users')).rows.length,3);
 const defaultPost=await call(maintenance,{authorization,data:{}});assert.equal(defaultPost.value.dryRun,true);
});
test('deleting owner removes ticket threads, including internal notes',async()=>{
 assert.equal((await call(auth,{cookie:owner.cookie,data:{action:'delete',currentPassword:password}})).status,200);
 assert.equal((await pg.query('SELECT * FROM support_requests')).rows.length,0);
 assert.equal((await pg.query('SELECT * FROM support_messages')).rows.length,0);
});
