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
const {default:handler}=await import('../server/routes/activity.mjs');
const user=randomUUID(),other=randomUUID(),account=randomUUID(),custody=randomUUID(),destination=randomUUID(),withdrawal=randomUUID(),token='a'.repeat(64),otherToken='b'.repeat(64);
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'activity@example.com','not-a-login'),($2,'other@example.com','not-a-login')",[user,other]);
for(const [u,t]of [[user,token],[other,otherToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),u]);
let calls=0;
async function call({data,auth=token,url='/api/activity',origin='https://invemon.example'}={}){let status=200,body;await handler({url,method:data?'POST':'GET',body:data,headers:{cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
test('feed requires authentication and validates query selectors/cursors',async()=>{
 assert.equal((await call({auth:''})).status,401);assert.deepEqual((await call()).body.entries,[]);assert.equal((await call({url:'/api/activity?before=invalid'})).status,400);assert.equal((await call({url:'/api/activity?view=secrets'})).status,400);
});
test('unifies durable journal/request/review events without internal notes or fake payments',async()=>{
 await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2)");await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','custody',NULL)",[account,user,custody]);
 await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'PRIVATE-POSTING-KEY','PRIVATE-EVIDENCE',JSON.stringify([{accountId:account,asset:'USD:BANK',units:'-900719925474099312'},{accountId:custody,asset:'USD:BANK',units:'900719925474099312'}])]);
 await pg.query("INSERT INTO withdrawal_destinations(id,user_id,kind,asset,label,masked,encrypted_details) VALUES($1,$2,'ach','USD:BANK','PRIVATE-LABEL','PRIVATE-MASK','PRIVATE-CIPHERTEXT')",[destination,user]);
 await pg.query('SELECT request_customer_withdrawal($1,$2,$3,$4,$5,$6)',[withdrawal,user,account,destination,'1000','timeline-test']);
 await pg.query('SELECT admin_review_withdrawal($1,$2,$3,0,$4,$5)',[randomUUID(),withdrawal,other,'approved','PRIVATE-NOTE']);
 const data=(await call({url:'/api/activity?view=inbox'})).body;assert.equal(data.entries.length,3);assert.equal(data.unreadCount,'3');assert.equal(data.entries.find(e=>e.kind==='accounting').amounts[0].units,'900719925474099312');
 assert.equal(data.entries.find(e=>e.kind==='withdrawal_approved').description,'Funds remain reserved. Approval is not payment.');
 for(const secret of ['PRIVATE-','actor_id','account_id','password_hash'])assert.equal(JSON.stringify(data).includes(secret),false);
 assert.deepEqual((await call({auth:otherToken})).body.entries,[]);
});
test('read state is owner-only and persistent; read-all does not read future events',async()=>{
 const id=`withdrawal:${withdrawal}`;
 assert.equal((await call({auth:otherToken,data:{action:'read',id}})).status,404);
 assert.equal((await call({data:{action:'read',id},origin:'https://evil.example'})).status,403);
 assert.equal((await call({data:{action:'read',id}})).status,200);assert.equal((await call({data:{action:'read',id}})).status,200);
 assert.equal((await call({url:'/api/activity?view=inbox'})).body.unreadCount,'2');
 await call({data:{action:'read-all'}});assert.equal((await call({url:'/api/activity?view=inbox'})).body.unreadCount,'0');
 await pg.query('SELECT admin_review_withdrawal($1,$2,$3,1,$4,$5)',[randomUUID(),withdrawal,other,'rejected','PRIVATE-NOTE']);
 const data=(await call({url:'/api/activity?view=inbox'})).body;assert.equal(data.unreadCount,'1');assert.equal(data.entries.find(e=>e.kind==='withdrawal_rejected').read,false);
});
test('cancellation has one distinct event and is never reported as a payment',async()=>{
 const id=randomUUID();await pg.query('SELECT request_customer_withdrawal($1,$2,$3,$4,$5,$6)',[id,user,account,destination,'100','cancel-test']);await pg.query('SELECT cancel_customer_withdrawal($1,$2)',[id,user]);
 const entries=(await call()).body.entries;assert.equal(entries.filter(e=>e.kind==='withdrawal_cancelled').length,1);assert.equal(entries.some(e=>e.kind==='paid'),false);
});
test('stable cursor pagination is owner-scoped with no duplicate events',async()=>{
 for(let i=0;i<35;i++)await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),`page-${i}`,`PRIVATE-EVIDENCE-${i}`,JSON.stringify([{accountId:account,asset:'USD:BANK',units:'-1'},{accountId:custody,asset:'USD:BANK',units:'1'}])]);
 const first=(await call()).body;assert.equal(first.entries.length,30);assert.ok(first.nextCursor);
 const second=(await call({url:`/api/activity?before=${encodeURIComponent(first.nextCursor)}`})).body;assert.ok(second.entries.length>0);const ids=[...first.entries,...second.entries].map(e=>e.id);assert.equal(ids.length,new Set(ids).size);
 assert.deepEqual((await call({auth:otherToken,url:`/api/activity?before=${first.nextCursor}`})).body.entries,[]);
 assert.deepEqual((await call({url:`/api/activity?before=journal:${randomUUID()}`})).body.entries,[]);
});
