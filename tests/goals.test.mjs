import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:handler}=await import('../server/routes/goals.mjs');
const user=randomUUID(),other=randomUUID(),token='a'.repeat(64),otherToken='b'.repeat(64),id=randomUUID();
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'goal@example.com','not-a-login'),($2,'other-goal@example.com','not-a-login')",[user,other]);
for(const [u,t]of [[user,token],[other,otherToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),u]);
let calls=0;
async function call(data,auth=token,origin='https://invemon.example'){let status=200,body;await handler({method:data?'POST':'GET',body:data,headers:{cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
const create={action:'create',id,name:'A real plan',target:'9007199254740993.12',monthly:'250.00',targetDate:'2099-12-31'};
test('goals require session and origin; empty records do not invent progress',async()=>{
 assert.equal((await call(undefined,'')).status,401);assert.equal((await call(create,token,'https://evil.example')).status,403);assert.deepEqual((await call()).body,{goals:[],limit:100,progressAvailable:false});
});
test('create is exact, owner-bound and idempotent, ignoring client savings and owner claims',async()=>{
 const result=await call({...create,userId:other,saved:'999999',progress:100});assert.equal(result.status,201);assert.equal((await call(create)).status,200);
 const data=(await call()).body;assert.equal(data.goals[0].target_cents,'900719925474099312');assert.equal(data.goals[0].monthly_cents,'25000');assert.equal(data.goals[0].target_date,'2099-12-31');assert.equal('saved' in data.goals[0],false);assert.deepEqual((await call(undefined,otherToken)).body.goals,[]);
 assert.equal((await call({...create,name:'different'})).status,409);assert.equal((await call(create,otherToken)).status,409);
 assert.equal((await pg.query('SELECT count(*) FROM customer_goal_events')).rows[0].count,1);
});
test('invalid amounts, dates and names fail without changing a goal',async()=>{
 for(const patch of [{target:'0'},{target:'-1'},{monthly:'1e3'},{target:'1.001'},{targetDate:'2099-02-30'},{targetDate:'2000-01-01'},{targetDate:'2200-01-01'},{name:' '},{name:'x'.repeat(101)}])assert.equal((await call({...create,id:randomUUID(),...patch})).status,400);
});
test('updates use optimistic owner-scoped revisions and do not overwrite concurrent changes',async()=>{
 const patch={...create,action:'update',revision:1,name:'Updated plan',target:'12500.25'};
 assert.equal((await call(patch,otherToken)).status,409);assert.equal((await call(patch)).status,200);assert.equal((await call({...patch,name:'stale overwrite'})).status,409);
 const goal=(await call()).body.goals[0];assert.equal(goal.revision,2);assert.equal(goal.name,'Updated plan');assert.equal(goal.target_cents,'1250025');
});
test('archive and restore preserve targets and reject stale/foreign revisions',async()=>{
 assert.equal((await call({action:'archive',id,revision:2},otherToken)).status,409);
 assert.equal((await call({action:'archive',id,revision:2})).status,200);assert.equal((await call()).body.goals[0].archived,true);
 assert.equal((await call({...create,action:'update',revision:3})).status,409);
 assert.equal((await call({action:'restore',id,revision:3})).status,200);const goal=(await call()).body.goals[0];assert.equal(goal.archived,false);assert.equal(goal.revision,4);assert.equal(goal.target_cents,'1250025');
});
test('planning writes never create ledger entries/holds and history is append-only',async()=>{
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,0);assert.equal((await pg.query('SELECT count(*) FROM fund_reservations')).rows[0].count,0);
 assert.deepEqual((await pg.query('SELECT action FROM customer_goal_events ORDER BY revision')).rows.map(r=>r.action),['created','updated','archived','restored']);
 for(const command of ['DELETE FROM customer_goal_events','UPDATE customer_goal_events SET action=\'archived\'','TRUNCATE customer_goal_events'])await assert.rejects(pg.exec(command),/immutable/);
});
