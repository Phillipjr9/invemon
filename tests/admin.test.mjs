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
const {hashPassword}=await import('../server/core.mjs');const {default:handler}=await import('../server/routes/admin.mjs');
const admin=randomUUID(),customer=randomUUID(),account=randomUUID(),custody=randomUUID(),password='Admin test password only!',token='a'.repeat(64),customerToken='b'.repeat(64);
await pg.query("INSERT INTO app_users(id,email,password_hash,email_verified_at,mfa_secret) VALUES($1,'admin@example.com',$2,now(),'test-secret'),($3,'customer@example.com',$2,now(),NULL)",[admin,await hashPassword(password),customer]);
for(const [id,t]of [[admin,token],[customer,customerToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),id]);
let calls=0;
async function call({method='GET',query={},data,auth=token,origin='https://invemon.example'}={}){let status=200,body;await handler({method,query,body:data,headers:{'x-forwarded-for':`192.0.2.${++calls}`,cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json'}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
let reservation;
test('admin is deny-by-default and requires configured ID, verified email and MFA',async()=>{
 assert.equal((await call({auth:''})).status,401);assert.equal((await call()).status,403);
 process.env.FUNDING_ADMIN_IDS=admin;process.env.SUPER_ADMIN_IDS=admin;assert.equal((await call({auth:customerToken})).status,403);
 await pg.query('UPDATE app_sessions SET mfa_verified=false WHERE user_id=$1',[admin]);assert.equal((await call()).status,401);
 await pg.query('UPDATE app_sessions SET mfa_verified=true WHERE user_id=$1',[admin]);
 await pg.query('UPDATE app_users SET email_verified_at=NULL WHERE id=$1',[admin]);assert.equal((await call()).status,403);
 await pg.query('UPDATE app_users SET email_verified_at=now() WHERE id=$1',[admin]);assert.deepEqual((await call()).body.requests,[]);
});
test('queue and customer views return exact balances without authentication secrets',async()=>{
 await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2)");await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','custody',NULL)",[account,customer,custody]);
 await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'test-credit','test-only',JSON.stringify([{accountId:account,asset:'USD:BANK',units:'-10000'},{accountId:custody,asset:'USD:BANK',units:'10000'}])]);
 reservation=randomUUID();await pg.query('SELECT reserve_customer_funds($1,$2,$3,$4,$5,$6,$7)',[reservation,customer,account,'USD:BANK','2500','withdrawal','admin-test']);
 const result=await call();assert.equal(result.status,200);assert.equal(result.body.requests[0].units,'2500');assert.equal(result.body.requests[0].revision,0);
 const found=await call({query:{view:'customers',search:'customer@'}});assert.equal(found.body.customers[0].id,customer);
 for(const key of ['password_hash','mfa_secret','token_hash'])assert.equal(JSON.stringify(found.body).includes(key),false);
 const detail=await call({query:{view:'account',id:customer}});assert.equal(detail.status,200);assert.equal(detail.body.balances[0].available_units,'7500');
 assert.equal((await call({query:{view:'account',id:randomUUID()}})).status,404);
 assert.equal((await call({query:{view:'customers',search:'%'}})).status,400);
});
const review=(revision,decision,extra={})=>call({method:'POST',data:{action:'review',id:reservation,revision,decision,note:'Reviewed test-only reservation',currentPassword:password,...extra}});
test('writes enforce origin, fresh password, validation and no customer role escalation',async()=>{
 assert.equal((await call({method:'POST',origin:'https://evil.example',data:{}})).status,403);
 assert.equal((await review(0,'approved',{currentPassword:'wrong'})).status,401);
 assert.equal((await review(0,'paid')).status,400);assert.equal((await review(0,'approved',{note:''})).status,400);
 assert.equal((await call({method:'POST',auth:customerToken,data:{action:'review',role:'admin'}})).status,403);
 assert.equal((await call()).body.requests[0].revision,0);
});
test('approval keeps funds held and creates only an immutable review and audit event',async()=>{
 assert.equal((await review(0,'reviewing')).status,200);const approved=await review(1,'approved');assert.equal(approved.status,200);assert.equal(approved.body.payoutInitiated,false);
 const balance=(await pg.query('SELECT * FROM ledger_spendable_balances WHERE id=$1',[account])).rows[0];assert.equal(balance.reserved_units,'2500');assert.equal(balance.total_units,'10000');
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
 assert.equal((await review(1,'rejected')).status,409);
 const history=await call({query:{view:'history',id:reservation}});assert.equal(history.body.events.length,2);assert.equal(history.body.events[0].decision,'approved');
});
test('rejection atomically releases funds; stale retries and terminal transitions fail',async()=>{
 const result=await review(2,'rejected');assert.equal(result.status,200);
 const balance=(await pg.query('SELECT * FROM ledger_spendable_balances WHERE id=$1',[account])).rows[0];assert.equal(balance.reserved_units,'0');assert.equal(balance.total_units,'10000');
 assert.equal((await review(2,'rejected')).status,409);assert.equal((await review(3,'approved')).status,409);
 assert.equal((await pg.query('SELECT count(*) FROM admin_review_events')).rows[0].count,3);
 assert.equal((await pg.query("SELECT count(*) FROM security_events WHERE action LIKE 'admin.withdrawal.%'")).rows[0].count,3);
 for(const command of ['DELETE FROM admin_review_events','UPDATE admin_review_events SET note=\'rewrite\'','TRUNCATE admin_review_events'])await assert.rejects(pg.exec(command),/immutable/);
});
test('missing requests cannot be reviewed and unsupported admin operations are rejected',async()=>{
 assert.equal((await review(0,'approved',{id:randomUUID()})).status,404);
 assert.equal((await call({method:'POST',data:{action:'set-balance'}})).status,400);
 assert.equal((await call({query:{view:'secrets'}})).status,400);
});
test('failed audit insertion rolls back the rejection and fund release together',async()=>{
 const id=randomUUID();await pg.query('SELECT reserve_customer_funds($1,$2,$3,$4,$5,$6,$7)',[id,customer,account,'USD:BANK','1000','withdrawal','atomic-reject']);
 await assert.rejects(pg.query('SELECT admin_review_withdrawal($1,$2,$3,0,$4,$5)',[randomUUID(),id,randomUUID(),'rejected','Invalid actor must roll back release']));
 const state=(await pg.query('SELECT state FROM fund_reservation_states WHERE id=$1',[id])).rows[0].state;assert.equal(state,'held');
 assert.equal((await pg.query('SELECT count(*) FROM admin_review_events WHERE reservation_id=$1',[id])).rows[0].count,0);
});
test('order holds and already-released withdrawals cannot be reviewed',async()=>{
 const order=randomUUID(),released=randomUUID();
 for(const [id,purpose,key]of [[order,'order','not-withdrawal'],[released,'withdrawal','already-released']])await pg.query('SELECT reserve_customer_funds($1,$2,$3,$4,$5,$6,$7)',[id,customer,account,'USD:BANK','100',purpose,key]);
 await pg.query('SELECT release_customer_funds($1,$2,$3)',[customer,released,'Customer cancelled']);
 assert.equal((await review(0,'approved',{id:order})).status,404);assert.equal((await review(0,'approved',{id:released})).status,409);
});

let dealerInventory,cryptoInventory,policy;
const dealerCall=(operation,config,extra={})=>call({method:'POST',data:{action:'inventory',operation,config,note:'Reviewed internal policy test only',currentPassword:password,...extra}});
test('inventory controls require finance authorization, origin and password; default view is honest empty',async()=>{
 const view=await call({query:{view:'inventory'}});assert.equal(view.status,200);assert.deepEqual(view.body.inventories,[]);assert.equal(view.body.fundingEnabled,false);
 assert.equal((await call({query:{view:'inventory'},auth:customerToken})).status,403);
 assert.equal((await dealerCall('inventory.register',{asset:'USD:BANK'},{currentPassword:'wrong'})).status,401);
 assert.equal((await call({method:'POST',origin:'https://evil.example',data:{action:'inventory'}})).status,403);
 assert.equal((await dealerCall('set-balance',{})).status,400);
});
test('registering approved inventory and recording evidence never credits money',async()=>{
 await pg.exec("INSERT INTO ledger_assets VALUES('BTC:BITCOIN',8);INSERT INTO dealer_assets VALUES('USD:BANK','cash'),('BTC:BITCOIN','crypto')");
 const before=(await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count;
 assert.equal((await dealerCall('inventory.register',{asset:'STOCK:FAKE'})).status,409);
 const usd=await dealerCall('inventory.register',{asset:'USD:BANK'});assert.equal(usd.status,200);dealerInventory=usd.body.id;
 const btc=await dealerCall('inventory.register',{asset:'BTC:BITCOIN'});assert.equal(btc.status,200);cryptoInventory=btc.body.id;
 assert.equal((await dealerCall('inventory.evidence',{reference:'internal-reconciliation-ticket-001'},{id:cryptoInventory})).status,200);
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,before);
 const view=(await call({query:{view:'inventory'}})).body;assert.ok(view.inventories.every(i=>i.units==='0'));assert.equal(view.events[0].after_state.verified,false);assert.equal(view.events[0].after_state.creditPosted,false);
});
const policyConfig=()=>({sourceAsset:'USD:BANK',targetAsset:'BTC:BITCOIN',sourceInventory:dealerInventory,targetInventory:cryptoInventory,numerator:'1',denominator:'10',feeBps:100,minUnits:'1',maxUnits:'10000',validUntil:new Date(Date.now()+3600000).toISOString(),enabled:true});
test('pricing changes audit before/after, reject stale revisions and preserve mappings',async()=>{
 policy=randomUUID();const config=policyConfig();
 assert.equal((await dealerCall('pair.save',config,{id:policy,revision:0})).status,200);
 assert.equal((await dealerCall('pair.save',{...config,enabled:false},{id:policy,revision:1})).status,200);
 assert.equal((await dealerCall('pair.save',config,{id:policy,revision:1})).status,409);
 assert.equal((await dealerCall('pair.save',{...config,sourceInventory:cryptoInventory},{id:policy,revision:2})).status,409);
 const view=(await call({query:{view:'inventory'}})).body;assert.equal(view.pairs[0].revision,2);assert.equal(view.pairs[0].enabled,false);assert.equal(view.events[0].before_state.enabled,true);assert.equal(view.events[0].after_state.enabled,false);
});
test('invalid rates, fees, limits, expiries, missing audit notes and existing pairs are rejected',async()=>{
 const config=policyConfig();
 for(const patch of [{numerator:'0'},{numerator:'1.1'},{feeBps:1001},{minUnits:'10001'},{validUntil:'not-a-date'}])assert.equal((await dealerCall('pair.save',{...config,...patch},{id:policy,revision:2})).status,400);
 assert.equal((await dealerCall('pair.save',{...config,validUntil:new Date(Date.now()+8*86400000).toISOString()},{id:policy,revision:2})).status,409);
 assert.equal((await dealerCall('pair.save',config,{id:policy,revision:2,note:' '})).status,400);
 assert.equal((await dealerCall('pair.save',config,{id:randomUUID(),revision:0})).status,409);
 assert.equal((await dealerCall('inventory.evidence',{reference:''},{id:cryptoInventory})).status,400);
 for(const stmt of ['DELETE FROM dealer_admin_events','TRUNCATE dealer_admin_events',"UPDATE dealer_admin_events SET note='rewrite'"])await assert.rejects(pg.exec(stmt),/immutable/);
});
test('audit failure rolls back inventory configuration',async()=>{
 await pg.exec("CREATE FUNCTION fail_dealer_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$;CREATE TRIGGER test_dealer_audit BEFORE INSERT ON dealer_admin_events FOR EACH ROW EXECUTE FUNCTION fail_dealer_audit()");
 assert.equal((await dealerCall('pair.save',{...policyConfig(),feeBps:300},{id:policy,revision:2})).status,500);
 await pg.exec('DROP TRIGGER test_dealer_audit ON dealer_admin_events');
 const row=(await pg.query('SELECT revision,fee_bps FROM dealer_pairs WHERE id=$1',[policy])).rows[0];assert.equal(row.revision,2);assert.equal(row.fee_bps,100);
});
test('admin pair pause blocks acceptance of a previously issued customer quote',async()=>{
 const config=policyConfig();
 assert.equal((await dealerCall('pair.save',config,{id:policy,revision:2})).status,200);
 const quoteId=randomUUID();await pg.query('SELECT create_dealer_quote($1,$2,$3,$4)',[quoteId,customer,policy,'100']);
 assert.equal((await dealerCall('pair.save',{...config,enabled:false},{id:policy,revision:3})).status,200);
 await assert.rejects(pg.query('SELECT accept_dealer_quote($1,$2)',[quoteId,customer]),/expired or pair disabled/);
 assert.equal((await pg.query('SELECT count(*) FROM dealer_trades')).rows[0].count,0);
});

test('ordinary admin can read but cannot change inventory or self-escalate',async()=>{
 const saved=process.env.SUPER_ADMIN_IDS;delete process.env.SUPER_ADMIN_IDS;
 try{
  const queue=await call();assert.equal(queue.status,200);assert.equal(queue.body.role,'admin');
  assert.equal((await call({method:'POST',data:{action:'inventory',operation:'inventory.register',role:'super_admin'}})).status,403);
 }finally{process.env.SUPER_ADMIN_IDS=saved;}
});
