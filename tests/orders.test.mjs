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
const {default:handler}=await import('../server/routes/orders.mjs');const {hashPassword}=await import('../server/core.mjs');
const user=randomUUID(),other=randomUUID(),account=randomUUID(),custody=randomUUID(),token='a'.repeat(64),otherToken='b'.repeat(64),password='Test orders password only!';
await pg.query("INSERT INTO app_users(id,email,password_hash,email_verified_at,mfa_secret) VALUES($1,'orders@example.com',$2,now(),'test-only'),($3,'other-orders@example.com',$2,now(),'test-only')",[user,await hashPassword(password),other]);
for(const [u,t]of [[user,token],[other,otherToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),u]);
await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2)");await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','custody',NULL)",[account,user,custody]);
await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'orders-test-credit','test-evidence',JSON.stringify([{accountId:account,asset:'USD:BANK',units:'-10000'},{accountId:custody,asset:'USD:BANK',units:'10000'}])]);
let calls=0;
async function call(data,auth=token,origin='https://invemon.example'){let status=200,body;await handler({method:data?'POST':'GET',body:data,headers:{cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
async function quote({owner=user,units='2500',fee='25',expired=false,operation='stock_buy'}={}){
 const id=randomUUID();await pg.query("INSERT INTO execution_quotes(id,user_id,operation,source_account_id,source_asset,source_units,target_symbol,target_units,target_decimals,fee_units,provider,provider_quote_ref,expires_at,created_at) VALUES($1,$2,$3,$4,'USD:BANK',$5,'TEST-NOT-A-REAL-SECURITY',100,2,$6,'test-only',$7,now()+$8::interval,now()-interval '1 hour')",[id,owner,operation,account,units,fee,randomUUID(),expired?'-1 minute':'1 hour']);return id;
}
const accept=(id,key=randomUUID(),owner=user)=>pg.query('SELECT accept_execution_quote($1,$2,$3,$4) AS id',[randomUUID(),owner,id,key]).then(r=>r.rows[0].id);
const balance=()=>pg.query('SELECT available_units,reserved_units,total_units FROM ledger_spendable_balances WHERE id=$1',[account]).then(r=>r.rows[0]);
let order;
test('public API remains closed to invented quotes/fills and requires authentication/origin',async()=>{
 assert.equal((await call(undefined,'')).status,401);assert.equal((await call({action:'accept'},token,'https://evil.example')).status,403);
 assert.equal((await call()).body.executionEnabled,false);assert.deepEqual((await call()).body.orders,[]);
 for(const operation of ['crypto_buy','crypto_sell','crypto_swap','stock_buy'])assert.equal((await call({action:'quote',operation,sourceAsset:'USD:BANK',targetSymbol:'TEST',amount:'25'})).status,503);
 process.env.TRADING_ENABLED='true';assert.equal((await call({action:'accept',quoteId:randomUUID(),filled:true})).status,503);assert.equal((await call({action:'fill'})).status,400);
});
test('internal quote acceptance reserves source plus fee once without posting a trade',async()=>{
 const id=await quote(),key=randomUUID();order=await accept(id,key);assert.equal(await accept(id,key),order);
 await assert.rejects(accept(id),/already accepted/);await assert.rejects(accept(await quote(),key),/different quote/);
 assert.deepEqual(await balance(),{available_units:'7475',reserved_units:'2525',total_units:'10000'});
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
 const data=(await call()).body;assert.equal(data.orders[0].state,'queued');assert.equal(data.orders[0].source_units,'2500');assert.equal(data.orders[0].fee_units,'25');assert.equal(JSON.stringify(data).includes('provider_quote_ref'),false);
 assert.deepEqual((await call(undefined,otherToken)).body.orders,[]);
});
test('expired, foreign, mismatched-owner and insufficient-funds quotes fail atomically',async()=>{
 await assert.rejects(accept(await quote({expired:true})),/expired/);
 await assert.rejects(accept(await quote(),randomUUID(),other),/not found/);
 await assert.rejects(accept(await quote({owner:other}),randomUUID(),other),/belong/);
 await assert.rejects(accept(await quote({units:'10000'})),/Insufficient/);
 assert.equal((await pg.query('SELECT count(*) FROM execution_orders')).rows[0].count,1);assert.equal((await balance()).reserved_units,'2525');
});
test('cancellation requires password and ownership, is idempotent and releases exact hold',async()=>{
 assert.equal((await call({action:'cancel',id:order,currentPassword:password},otherToken)).status,404);
 assert.equal((await call({action:'cancel',id:order,currentPassword:'wrong'})).status,401);
 assert.equal((await call({action:'cancel',id:order,currentPassword:password})).status,200);assert.equal((await call({action:'cancel',id:order,currentPassword:password})).status,200);
 assert.equal((await balance()).available_units,'10000');assert.equal((await call()).body.orders[0].state,'cancelled');
 assert.equal((await pg.query("SELECT count(*) FROM security_events WHERE action='order.cancelled'")).rows[0].count,1);
});
test('quotes/orders/history are immutable and no filled state can be inserted',async()=>{
 for(const table of ['execution_quotes','execution_orders','execution_order_events'])await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);
 await assert.rejects(pg.query("INSERT INTO execution_order_events(order_id,sequence,state) VALUES($1,2,'filled')",[order]));
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
});
const {dispatchOrder,reconcileOrderDispatch}=await import('../server/order-dispatch.mjs');
test('durable dispatch uses stable order key, submits once and never posts a fill',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));let submits=0;
 const adapter={name:'test-only',submit:async input=>{submits++;assert.equal(input.executionKey,id);assert.equal(input.source_units,'100');return {providerOrderRef:'test-order-ack'};}};
 assert.deepEqual(await dispatchOrder(id,adapter),{state:'submitted',filled:false});assert.equal((await dispatchOrder(id,adapter)).state,'already_claimed');assert.equal(submits,1);
 assert.equal((await call()).body.orders.find(o=>o.id===id).state,'submitted');assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
 assert.equal((await call({action:'cancel',id,currentPassword:password})).status,409);
});
test('timeout leaves funds held; retries never resubmit and lookup can reconcile',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));let submits=0;
 const adapter={name:'test-only',submit:async()=>{submits++;throw new Error('PRIVATE-PROVIDER-SECRET');},lookup:async({executionKey})=>{assert.equal(executionKey,id);return null;}};
 const before=await balance();assert.deepEqual(await dispatchOrder(id,adapter),{state:'uncertain',retrySubmission:false});assert.equal((await dispatchOrder(id,adapter)).state,'already_claimed');assert.equal(submits,1);assert.deepEqual(await balance(),before);
 assert.equal((await reconcileOrderDispatch(id,adapter)).state,'unresolved');assert.equal((await call()).body.orders.find(o=>o.id===id).state,'uncertain');
 adapter.lookup=async()=>({providerOrderRef:'reconciled-test-order'});assert.deepEqual(await reconcileOrderDispatch(id,adapter),{state:'submitted',filled:false});assert.equal((await call()).body.orders.find(o=>o.id===id).state,'submitted');
 assert.equal((await call({action:'cancel',id,currentPassword:password})).status,409);
});
test('crash after claim stays pending and cannot be blindly resubmitted or cancelled',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));await pg.query('SELECT claim_execution_dispatch($1,$2)',[id,'test-only']);
 const result=await dispatchOrder(id,{name:'test-only',submit:()=>assert.fail('must not submit again')});assert.equal(result.state,'already_claimed');assert.equal((await call()).body.orders.find(o=>o.id===id).state,'dispatch_pending');
 assert.equal((await call({action:'cancel',id,currentPassword:password})).status,409);
});
test('cancellation before dispatch blocks external submission; wrong adapter cannot claim',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));
 await assert.rejects(dispatchOrder(id,{name:'wrong-provider',submit:()=>assert.fail()}),/mismatch/);
 await pg.query('SELECT cancel_execution_order($1,$2)',[id,user]);
 await assert.rejects(dispatchOrder(id,{name:'test-only',submit:()=>assert.fail()}),/no longer dispatchable/);
});
test('conflicting acknowledgements fail, uncertain events cannot regress a submitted state',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));await dispatchOrder(id,{name:'test-only',submit:async()=>({providerOrderRef:'immutable-ack'})});
 await pg.query('SELECT record_execution_dispatch($1,$2,$3,$4,$5)',[randomUUID(),id,'test-only','uncertain',null]);
 assert.equal((await call()).body.orders.find(o=>o.id===id).state,'submitted');
 await assert.rejects(pg.query('SELECT record_execution_dispatch($1,$2,$3,$4,$5)',[randomUUID(),id,'test-only','submitted','conflicting-ack']),/Conflicting/);
 await assert.rejects(reconcileOrderDispatch(id,{name:'wrong-provider',lookup:async()=>({providerOrderRef:'fake'})}),/not found/);
});
test('dispatch records are append-only and public endpoints cannot dispatch or forge acks',async()=>{
 for(const table of ['execution_dispatches','execution_dispatch_events'])await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);
 for(const action of ['dispatch','acknowledge','reconcile'])assert.equal((await call({action})).status,400);
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
});
const {runOrderWorker}=await import('../server/order-worker.mjs');
const {default:workerHandler}=await import('../server/routes/order-worker.mjs');
test('worker is disabled with empty registry and enforces bounded batches',async()=>{
 assert.deepEqual(await runOrderWorker(),{enabled:false,processed:0,results:[]});
 for(const limit of [0,11,-1,1.5])await assert.rejects(runOrderWorker({limit}),/Invalid/);
 await assert.rejects(runOrderWorker({mode:'fill'}),/Invalid/);
});
test('dispatch worker uses only registered provider adapters and cannot submit twice',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));let submits=0;
 const adapters={'test-only':{name:'test-only',submit:async input=>{submits++;return {providerOrderRef:`worker-ack-${input.id}`};}}};
 const result=await runOrderWorker({mode:'dispatch',limit:1,adapters});assert.equal(result.processed,1);assert.equal(result.results[0].id,id);assert.equal(result.results[0].state,'submitted');
 await runOrderWorker({mode:'dispatch',limit:1,adapters});assert.equal(submits,1);
});
test('reconciliation worker performs lookup without resubmit and keeps unresolved holds',async()=>{
 const id=await accept(await quote({units:'100',fee:'1'}));await pg.query("INSERT INTO execution_dispatches(order_id,provider,execution_key,claimed_at) VALUES($1,'test-only',$1,now()-interval '1 minute')",[id]);
 const before=await balance();let lookups=0;
 const result=await runOrderWorker({mode:'reconcile',adapters:{'test-only':{name:'test-only',lookup:async()=>{lookups++;return null;},submit:()=>assert.fail('lookup must not submit')}}});
 assert.ok(result.results.some(r=>r.id===id&&r.state==='unresolved'));assert.ok(lookups>0);assert.deepEqual(await balance(),before);
});
test('operations worker endpoint requires bearer auth and rejects request-configured adapters',async()=>{
 process.env.OPS_SECRET='s'.repeat(40);
 async function ops(data,authorization,method='POST'){let status=200,result;await workerHandler({method,body:data,headers:{authorization,'content-type':'application/json'}},{setHeader(){},status(n){status=n;return this;},json(v){result=v;return this;}});return{status,result};}
 assert.equal((await ops({mode:'dispatch',limit:1})).status,401);assert.equal((await ops({},`Bearer ${process.env.OPS_SECRET}`,'GET')).status,405);
 assert.equal((await ops({mode:'dispatch',limit:1,adapters:{evil:'https://evil.example'}},`Bearer ${process.env.OPS_SECRET}`)).status,400);
 const result=await ops({mode:'reconcile',limit:1},`Bearer ${process.env.OPS_SECRET}`);assert.equal(result.status,200);assert.equal(result.result.enabled,false);
});
test('finance admin recovery queue is restricted and exposes states without private quote references',async()=>{
 const {default:adminHandler}=await import('../server/routes/admin.mjs');
 async function queue(){let status=200,result;await adminHandler({method:'GET',query:{view:'orders'},headers:{cookie:`__Host-invemon-session=${token}`}},{setHeader(){},status(n){status=n;return this;},json(v){result=v;return this;}});return{status,result};}
 assert.equal((await queue()).status,403);process.env.FUNDING_ADMIN_IDS=user;
 const response=await queue();assert.equal(response.status,200);assert.equal(response.result.manualFillEnabled,false);assert.ok(response.result.orders.some(o=>o.state==='dispatch_pending'));assert.equal(JSON.stringify(response.result).includes('provider_quote_ref'),false);assert.equal(JSON.stringify(response.result).includes('password_hash'),false);
});
