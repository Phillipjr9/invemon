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
await pg.exec(fs.readFileSync(new URL('../db/019_legal_acceptance.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/020_production_funding.sql',import.meta.url),'utf8'));
function query(text, values=[]) {
 return { text, values, then(resolve,reject) { return pg.query(text,values).then(result=>result.rows).then(resolve,reject); } };
}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=async statements=>pg.transaction(async tx=>{const results=[];for(const s of statements)results.push((await tx.query(s.text,s.values)).rows);return results;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:auth}=await import('../server/routes/account.mjs');
const {default:funding}=await import('../server/routes/funding.mjs');
const {default:ipn}=await import('../server/routes/funding-ipn.mjs');
async function call(handler,{method='POST',data,cookie,origin='https://invemon.example',ip='1.2.3.4',signature}={}){
 const headers={};let status=200,value;
 await handler({method,body:data,headers:{'x-nowpayments-sig':signature,origin,cookie,'content-type':'application/json','x-forwarded-for':ip}},{setHeader(k,v){headers[k.toLowerCase()]=v;},status(s){status=s;return this;},json(v){value=v;return this;}});
 return {status,value,headers,cookie:headers['set-cookie']?.split(';')[0]};
}
const {createHmac,randomUUID}=await import('node:crypto');
const {usdAmount,canonical,verifyIpn,providerInvoiceUrl,createSandboxInvoice,validateProductionSettlement}=await import('../server/funding.mjs');
let owner,other,uid;
const password='a long secure test password!';
test('decimal input, sandbox host allowlist, and recursive callback signature validation',()=>{
 assert.equal(usdAmount('10.5'),'10.50');for(const value of ['1e2','-1','0','1.001',1,'10001'])assert.throws(()=>usdAmount(value));
 assert.throws(()=>providerInvoiceUrl('https://nowpayments.io/payment/real'));assert.throws(()=>providerInvoiceUrl('https://sandbox.nowpayments.io.evil.com/'));
 const payload={z:1,a:{b:2,a:3}},secret='secret';const signature=createHmac('sha512',secret).update(JSON.stringify(canonical(payload))).digest('hex');
 assert.equal(verifyIpn(payload,signature,secret),true);assert.equal(verifyIpn({...payload,z:2},signature,secret),false);assert.equal(verifyIpn(payload,'bad',secret),false);
});
test('funding requires owner session; sandbox disabled by default, sign-in still required',async()=>{
 assert.equal((await call(funding,{method:'GET'})).status,401);
 owner=await call(auth,{data:{action:'register',policyVersion:'2026-11-27.2',termsAccepted:true,privacyAcknowledged:true,riskAcknowledged:true,adultConfirmed:true,name:'Funding Owner',email:'funding@example.com',password}});uid=owner.value.account.serverUserId;
 other=await call(auth,{data:{action:'register',policyVersion:'2026-11-27.2',termsAccepted:true,privacyAcknowledged:true,riskAcknowledged:true,adultConfirmed:true,name:'Other Owner',email:'other-funding@example.com',password}});
 assert.equal((await call(funding,{data:{action:'create-invoice',amount:'10'}})).status,401);
 assert.equal((await call(funding,{cookie:owner.cookie,origin:'https://evil.example',data:{action:'create-invoice',amount:'10'}})).status,403);
 assert.equal((await call(funding,{cookie:owner.cookie,data:{action:'create-invoice',amount:'10'}})).status,503);
 assert.equal((await call(funding,{method:'GET',cookie:owner.cookie})).value.liveEnabled,false);
});
test('legacy sandbox fixture stays isolated from production customer records',async()=>{
 process.env.NOWPAYMENTS_SANDBOX_ENABLED='true';process.env.NOWPAYMENTS_SANDBOX_API_KEY='test';process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET='test-ipn-secret';
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api-sandbox.nowpayments.io/v1/invoice');const value=JSON.parse(options.body);assert.equal(value.price_amount,12.34);assert.equal(value.ipn_callback_url,'https://invemon.example/api/funding-ipn');return new Response(JSON.stringify({id:'123',invoice_url:'https://sandbox.nowpayments.io/payment/?iid=123'}));};
 try{const result=await createSandboxInvoice({id:uid},'12.34');assert.equal(result.credited,false);}
 finally{globalThis.fetch=original;}
 assert.equal((await call(funding,{method:'GET',cookie:owner.cookie})).value.requests.length,0);
 assert.equal((await call(funding,{method:'GET',cookie:other.cookie})).value.requests.length,0);
});
test('forged, unmatched and replayed callbacks cannot credit balances; events deduplicate',async()=>{
 const row=(await pg.query('SELECT * FROM funding_requests')).rows[0];
 const payload={order_id:row.id,invoice_id:123,payment_id:456,payment_status:'finished'};
 const sign=value=>createHmac('sha512',process.env.NOWPAYMENTS_SANDBOX_IPN_SECRET).update(JSON.stringify(canonical(value))).digest('hex');
 assert.equal((await call(ipn,{data:payload,signature:'0'.repeat(128)})).status,401);
 const wrong={...payload,invoice_id:999};assert.equal((await call(ipn,{data:wrong,signature:sign(wrong)})).status,409);
 for(let i=0;i<2;i++){const r=await call(ipn,{data:payload,signature:sign(payload)});assert.equal(r.status,200);assert.equal(r.value.credited,false);}
 assert.equal((await pg.query('SELECT * FROM funding_events')).rows.length,1);
 assert.equal((await pg.query('SELECT status FROM funding_requests')).rows[0].status,'needs_review');
 assert.equal((await pg.query('SELECT * FROM demo_workspaces')).rows.length,0);
});
test('bank drafts require independent allowlist MFA and password; stale revisions fail and customers cannot read',async()=>{
 assert.equal((await call(funding,{cookie:owner.cookie,data:{action:'bank-status'}})).status,403);process.env.FUNDING_ADMIN_IDS=uid;
 assert.equal((await call(funding,{cookie:owner.cookie,data:{action:'bank-status'}})).status,403);
 await pg.query("UPDATE app_users SET email_verified_at=now(),mfa_secret='test-secret' WHERE id=$1",[uid]);await pg.query('UPDATE app_sessions SET mfa_verified=true WHERE user_id=$1',[uid]);
 const instructions={beneficiary:'TEST ONLY',bankName:'Fictional Bank',accountNumber:'TEST-123',routingOrSwift:'TEST',currency:'USD',referenceInstructions:'Draft test'};
 assert.equal((await call(funding,{cookie:owner.cookie,data:{action:'bank-update',revision:0,instructions,currentPassword:'wrong'}})).status,401);
 const result=await call(funding,{cookie:owner.cookie,data:{action:'bank-update',revision:0,instructions,currentPassword:password}});assert.equal(result.status,200);assert.equal(result.value.published,false);
 assert.equal((await call(funding,{cookie:owner.cookie,data:{action:'bank-update',revision:0,instructions,currentPassword:password}})).status,409);
 assert.equal((await call(funding,{cookie:other.cookie,data:{action:'bank-status'}})).status,403);
 assert.equal((await pg.query('SELECT * FROM bank_instruction_versions')).rows.length,1);
});

test('production credentials never enable a customer invoice or expose a key by themselves',async()=>{
 process.env.NOWPAYMENTS_API_KEY='production-test-key';process.env.NOWPAYMENTS_IPN_SECRET='production-test-secret';
 const result=await call(funding,{cookie:owner.cookie,data:{action:'create-invoice',amount:'10'}});
 assert.equal(result.status,503);
 const status=await call(funding,{method:'GET',cookie:owner.cookie});
 assert.equal(status.value.configured,true);assert.equal(status.value.liveEnabled,false);assert.equal(status.value.environment,'production');assert.deepEqual(status.value.requests,[]);
 assert.equal(JSON.stringify(status.value).includes('production-test-key'),false);
});
const {readProductionPayment}=await import('../server/nowpayments-production.mjs');
test('production payment lookup uses fixed authenticated host, rejects identity mismatch and never credits',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.nowpayments.io/v1/payment/123');assert.equal(options.headers['x-api-key'],'production-test-key');return new Response(JSON.stringify({payment_id:123,payment_status:'finished'}));};
  assert.equal((await readProductionPayment('123')).payment_status,'finished');
  await assert.rejects(()=>readProductionPayment('../payout'),/Invalid/);
  globalThis.fetch=async()=>new Response(JSON.stringify({payment_id:999}));await assert.rejects(()=>readProductionPayment('123'),/mismatch/);
  globalThis.fetch=async()=>new Response('secret response',{status:403});await assert.rejects(()=>readProductionPayment('123'),/HTTP 403/);
 }finally{globalThis.fetch=original;}
});
test('production deposit replay posts exactly once to the request owner in exact USD cents',async()=>{const productionUser=randomUUID(),productionRequest=randomUUID();await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'production-funding@example.invalid','test')",[productionUser]);await pg.query("INSERT INTO funding_requests(id,user_id,amount_usd,environment,provider_id,status) VALUES($1,$2,10.25,'production','123456','waiting')",[productionRequest,productionUser]);const payment='456789',evidence='provider-status:456789';const first=await pg.query('SELECT reconcile_production_deposit($1,$2,$3,'+"'finished'"+',$4::numeric,$5) AS id',[productionRequest,payment,'123456','10.25',evidence]);const second=await pg.query('SELECT reconcile_production_deposit($1,$2,$3,'+"'finished'"+',$4::numeric,$5) AS id',[productionRequest,payment,'123456','10.25',evidence]);assert.equal(first.rows[0].id,second.rows[0].id);assert.equal((await pg.query('SELECT count(*)::int n FROM ledger_journals WHERE posting_key=$1',['nowpayments-deposit:'+payment])).rows[0].n,1);assert.equal((await pg.query('SELECT count(*)::int n FROM ledger_entries e JOIN ledger_journals j ON j.id=e.journal_id WHERE j.posting_key=$1',['nowpayments-deposit:'+payment])).rows[0].n,2);assert.deepEqual((await pg.query('SELECT units::text FROM ledger_entries e JOIN ledger_journals j ON j.id=e.journal_id WHERE j.posting_key=$1 ORDER BY line',['nowpayments-deposit:'+payment])).rows.map(r=>r.units),['1025','-1025']);assert.equal((await pg.query('SELECT credited_journal_id FROM funding_requests WHERE id=$1',[productionRequest])).rows[0].credited_journal_id,first.rows[0].id);});
test('concurrent duplicate production reconciliation cannot double-credit',async()=>{const user=randomUUID(),request=randomUUID();await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'concurrent@example.invalid','test')",[user]);await pg.query("INSERT INTO funding_requests(id,user_id,amount_usd,environment,provider_id,status) VALUES($1,$2,25.00,'production','777','waiting')",[request,user]);const payment='888',evidence='provider-status:888';const concurrent=await Promise.all([pg.query('SELECT reconcile_production_deposit($1,$2,$3,'+"'finished'"+',$4::numeric,$5) AS id',[request,payment,'777','25.00',evidence]),pg.query('SELECT reconcile_production_deposit($1,$2,$3,'+"'finished'"+',$4::numeric,$5) AS id',[request,payment,'777','25.00',evidence]),pg.query('SELECT reconcile_production_deposit($1,$2,$3,'+"'finished'"+',$4::numeric,$5) AS id',[request,payment,'777','25.00',evidence])]);assert.equal(concurrent[0].rows[0].id,concurrent[1].rows[0].id);assert.equal(concurrent[0].rows[0].id,concurrent[2].rows[0].id);assert.equal((await pg.query('SELECT count(*)::int n FROM ledger_journals WHERE posting_key=$1',['nowpayments-deposit:'+payment])).rows[0].n,1);assert.equal((await pg.query('SELECT count(*)::int n FROM ledger_entries e JOIN ledger_journals j ON j.id=e.journal_id WHERE j.posting_key=$1',['nowpayments-deposit:'+payment])).rows[0].n,2);assert.deepEqual((await pg.query('SELECT units::text FROM ledger_entries e JOIN ledger_journals j ON j.id=e.journal_id WHERE j.posting_key=$1 ORDER BY line',['nowpayments-deposit:'+payment])).rows.map(r=>r.units),['2500','-2500']);});
test('production settlement rejects pending, partial, failed, expired and refunded states and mismatches',()=>{for(const status of ['waiting','confirming','partially_paid','failed','expired','refunded'])assert.throws(()=>validateProductionSettlement({requestAmount:10,callbackStatus:status,providerStatus:status,callbackOrder:'order',callbackInvoice:'invoice',callbackPayment:'payment',providerOrder:'order',providerInvoice:'invoice',providerPayment:'payment',priceAmount:10,priceCurrency:'usd',purchaseAmount:10,purchaseCurrency:'usd',payCurrency:'usdt',payNetwork:'tron'}),/final settled|identity|amount|currency|asset|network/);for(const patch of [{priceAmount:9},{priceCurrency:'eur'},{payCurrency:''},{payNetwork:''},{providerOrder:'wrong'}, {providerInvoice:'wrong'}, {providerPayment:'wrong'}])assert.throws(()=>validateProductionSettlement({requestAmount:10,callbackStatus:'finished',providerStatus:'finished',callbackOrder:'order',callbackInvoice:'invoice',callbackPayment:'payment',providerOrder:'order',providerInvoice:'invoice',providerPayment:'payment',priceAmount:10,priceCurrency:'usd',purchaseAmount:10,purchaseCurrency:'usd',payCurrency:'usdt',payNetwork:'tron',...patch}),/final settled|identity|amount|currency|asset|network/);assert.deepEqual(validateProductionSettlement({requestAmount:10,callbackStatus:'finished',providerStatus:'finished',callbackOrder:'order',callbackInvoice:'invoice',callbackPayment:'payment',providerOrder:'order',providerInvoice:'invoice',providerPayment:'payment',priceAmount:10,priceCurrency:'usd',purchaseAmount:10,purchaseCurrency:'usd',payCurrency:'USDT',payNetwork:'Tron'}),{settledAmount:10,payCurrency:'usdt',payNetwork:'tron'});});

const {verifyProductionSettlement}=await import('../server/production-settlement.mjs');
test('strict production evidence rejects missing fields, mismatches and underpayment without rounding',()=>{
 const request={id:randomUUID(),provider_id:'123',amount_usd:'10.25'};
 const evidence={order_id:request.id,invoice_id:'123',payment_id:'456',payment_status:'finished',price_currency:'usd',price_amount:'10.25',pay_currency:'usdt',network:'eth',pay_amount:'10.25',actually_paid:'10.25'};
 assert.equal(verifyProductionSettlement(request,evidence,evidence).amount,'10.25');
 for(const field of ['order_id','invoice_id','payment_id','price_currency','price_amount','pay_currency','network','pay_amount','actually_paid']){
  const missing={...evidence};delete missing[field];assert.throws(()=>verifyProductionSettlement(request,evidence,missing),undefined,field);
 }
 for(const patch of [{order_id:randomUUID()},{invoice_id:'999'},{payment_id:'999'},{price_currency:'eur'},{price_amount:'10.2500001'},{pay_currency:'btc'},{network:'bsc'},{actually_paid:'10.249999999999999999'},{payment_status:'refunded'}])assert.throws(()=>verifyProductionSettlement(request,evidence,{...evidence,...patch}));
 assert.throws(()=>verifyProductionSettlement({...request,requested_network:'bsc'},evidence,evidence));
 assert.throws(()=>verifyProductionSettlement({...request,provider_payment_id:'999'},evidence,evidence));
});
test('real callback route applies strict provider validation before a ledger credit',async()=>{
 process.env.NOWPAYMENTS_LIVE_DEPOSITS_ENABLED='true';
 const id=randomUUID();
 await pg.query("INSERT INTO funding_requests(id,user_id,amount_usd,environment,provider_id,status) VALUES($1,$2,10.25,'production','987','waiting')",[id,uid]);
 const payload={order_id:id,invoice_id:'987',payment_id:'654',payment_status:'finished',price_currency:'usd',price_amount:'10.25',pay_currency:'usdt',network:'eth',pay_amount:'10.25',actually_paid:'10.25'};
 const signature=createHmac('sha512',process.env.NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(canonical(payload))).digest('hex');
 const original=globalThis.fetch;
 try{
  for(const patch of [{order_id:undefined},{price_currency:undefined},{network:'bsc'},{actually_paid:'10.24'}]){
   globalThis.fetch=async()=>new Response(JSON.stringify({...payload,...patch}));
   assert.equal((await call(ipn,{data:payload,signature})).status,409);
  }
  assert.equal((await pg.query('SELECT credited_journal_id FROM funding_requests WHERE id=$1',[id])).rows[0].credited_journal_id,null);
  globalThis.fetch=async()=>new Response(JSON.stringify(payload));
  const first=await call(ipn,{data:payload,signature});assert.equal(first.status,200);assert.equal(first.value.credited,true);
  const replay=await call(ipn,{data:payload,signature});assert.equal(replay.status,200);assert.equal(replay.value.journalId,first.value.journalId);
 }finally{globalThis.fetch=original;delete process.env.NOWPAYMENTS_LIVE_DEPOSITS_ENABLED;}
});
