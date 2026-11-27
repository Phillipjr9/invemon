import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});process.env.DATABASE_URL='postgresql://test';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:handler}=await import('../server/routes/inventory-trading.mjs');const {hashPassword}=await import('../server/core.mjs');
const user=randomUUID(),other=randomUUID(),source=randomUUID(),sourcePool=randomUUID(),targetPool=randomUUID(),custody=randomUUID(),targetCustody=randomUUID(),pair=randomUUID(),reversePair=randomUUID(),token='a'.repeat(64),otherToken='b'.repeat(64),password='Internal trading test only!';
await pg.query("INSERT INTO app_users(id,email,password_hash,email_verified_at,mfa_secret) VALUES($1,'inventory@example.com',$2,now(),'test-only'),($3,'other-inventory@example.com',$2,now(),'test-only')",[user,await hashPassword(password),other]);
for(const [id,t]of [[user,token],[other,otherToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),id]);
await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2),('BTC:BITCOIN',8)");
await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','clearing',NULL),($4,'BTC:BITCOIN','clearing',NULL),($5,'USD:BANK','custody',NULL),($6,'BTC:BITCOIN','custody',NULL)",[source,user,sourcePool,targetPool,custody,targetCustody]);
await pg.query('INSERT INTO dealer_inventory_accounts VALUES($1),($2)',[sourcePool,targetPool]);
await pg.exec("INSERT INTO dealer_assets VALUES('USD:BANK','cash'),('BTC:BITCOIN','crypto')");
async function journal(key,lines){return pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),key,`test-only:${key}`,JSON.stringify(lines)]);}
await journal('customer-credit',[{accountId:source,asset:'USD:BANK',units:'-10000'},{accountId:custody,asset:'USD:BANK',units:'10000'}]);
await pg.query("INSERT INTO dealer_pairs VALUES($1,'USD:BANK','BTC:BITCOIN',$2,$3,1,10,100,1,10000,now()+interval '1 hour',true),($4,'BTC:BITCOIN','USD:BANK',$3,$2,10,1,0,1,10000,now()+interval '1 hour',true)",[pair,sourcePool,targetPool,reversePair]);
let calls=0;
async function call(data,auth=token,origin='https://invemon.example'){let status=200,body;await handler({method:data?'POST':'GET',body:data,headers:{cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
const getQuote=(amount='10.00',pairId=pair)=>call({action:'quote',pairId,amount});
const accept=(quoteId,auth=token)=>call({action:'accept',quoteId,currentPassword:password},auth);
const pool=async id=>(await pg.query('SELECT debit_units FROM ledger_account_balances WHERE id=$1',[id])).rows[0].debit_units;
let quote;
test('no default enablement, unknown actions and stock transactions are blocked',async()=>{
 assert.equal((await call(undefined,'')).status,401);assert.equal((await getQuote()).status,503);assert.equal((await call({action:'stock_buy'})).status,400);assert.equal((await call()).body.enabled,false);
 process.env.INTERNAL_TRADING_ENABLED='true';assert.equal((await call({action:'quote',pairId:pair,amount:'10'},token,'https://evil.example')).status,403);
});
test('quotes disclose deterministic exact amounts and fees but create no money',async()=>{
 const result=await getQuote();assert.equal(result.status,201);quote=result.body.quote;
 assert.equal(quote.source_units,'1000');assert.equal(quote.fee_units,'10');assert.equal(quote.target_units,'100');assert.equal(await pool(targetPool),'0');assert.equal((await accept(quote.id)).status,409);
 assert.equal((await pg.query('SELECT count(*) FROM dealer_trades')).rows[0].count,0);
});
test('funded inventory trades atomically without network calls; duplicate quote acceptance is safe',async()=>{
 await journal('business-inventory',[{accountId:targetPool,asset:'BTC:BITCOIN',units:'-1000'},{accountId:targetCustody,asset:'BTC:BITCOIN',units:'1000'}]);
 assert.equal((await accept(quote.id,otherToken)).status,404);
 const first=await accept(quote.id);assert.equal(first.status,200);assert.equal(first.body.externalTransfer,false);assert.deepEqual((await accept(quote.id)).body,first.body);
 assert.equal(await pool(targetPool),'-900');assert.equal(await pool(sourcePool),'-1010');
 const balances=(await pg.query('SELECT asset,total_units FROM ledger_spendable_balances WHERE user_id=$1 ORDER BY asset',[user])).rows;assert.deepEqual(balances,[{asset:'BTC:BITCOIN',total_units:'100'},{asset:'USD:BANK',total_units:'8990'}]);
 const sums=(await pg.query('SELECT asset,sum(units)::text AS total FROM ledger_entries WHERE journal_id=$1 GROUP BY asset',[first.body.journalId])).rows;assert.ok(sums.every(r=>r.total==='0'));
 assert.equal((await call(undefined,otherToken)).body.trades.length,0);assert.equal((await call()).body.trades.length,1);
});
test('sell uses reverse inventory pair and does not infer USD conversion',async()=>{
 const q=(await getQuote('0.00000020',reversePair)).body.quote;assert.equal(q.target_units,'200');assert.equal((await accept(q.id)).status,200);assert.equal(await pool(sourcePool),'-810');assert.equal(await pool(targetPool),'-920');
});
test('existing holds protect customer funds, and direct ledger debits cannot overdraw dealer inventory',async()=>{
 await pg.query('SELECT reserve_customer_funds($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),user,source,'USD:BANK','9000','withdrawal','test-hold']);
 const q=(await getQuote('5.00')).body.quote;assert.equal((await accept(q.id)).status,409);
 const before=await pool(targetPool);
 await assert.rejects(journal('bypass-inventory',[{accountId:targetPool,asset:'BTC:BITCOIN',units:'10000'},{accountId:targetCustody,asset:'BTC:BITCOIN',units:'-10000'}]),/Insufficient dealer/);assert.equal(await pool(targetPool),before);
});
test('fee rounding, precision, disabled pairs, MFA and passwords are enforced',async()=>{
 const q=(await getQuote('0.11')).body.quote;assert.equal(q.fee_units,'1');assert.equal(q.target_units,'1');
 assert.equal((await call({action:'accept',quoteId:q.id,currentPassword:'wrong'})).status,401);
 await pg.query('UPDATE app_users SET email_verified_at=NULL WHERE id=$1',[user]);assert.equal((await accept(q.id)).status,403);await pg.query('UPDATE app_users SET email_verified_at=now() WHERE id=$1',[user]);
 await pg.query('UPDATE dealer_pairs SET enabled=false WHERE id=$1',[pair]);assert.equal((await accept(q.id)).status,409);await pg.query('UPDATE dealer_pairs SET enabled=true WHERE id=$1',[pair]);
 assert.equal((await getQuote('1.001')).status,400);assert.equal((await getQuote('0')).status,409);
});
test('immutable quotes/trades and business account registration reject tampering',async()=>{
 for(const table of ['dealer_quotes','dealer_trades','dealer_inventory_accounts'])await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);
 await assert.rejects(pg.query('INSERT INTO dealer_inventory_accounts VALUES($1)',[source]),/clearing/);
});
test('crypto-to-crypto swap uses funded inventory without converting through USD',async()=>{
 const ethPool=randomUUID(),ethCustody=randomUUID(),swapPair=randomUUID();
 await pg.exec("INSERT INTO ledger_assets VALUES('ETH:ETHEREUM',18);INSERT INTO dealer_assets VALUES('ETH:ETHEREUM','crypto')");
 await pg.query("INSERT INTO ledger_accounts VALUES($1,'ETH:ETHEREUM','clearing',NULL),($2,'ETH:ETHEREUM','custody',NULL)",[ethPool,ethCustody]);await pg.query('INSERT INTO dealer_inventory_accounts VALUES($1)',[ethPool]);
 await journal('eth-test-inventory',[{accountId:ethPool,asset:'ETH:ETHEREUM',units:'-1000000'},{accountId:ethCustody,asset:'ETH:ETHEREUM',units:'1000000'}]);
 await pg.query("INSERT INTO dealer_pairs VALUES($1,'BTC:BITCOIN','ETH:ETHEREUM',$2,$3,100,1,0,1,1000,now()+interval '1 hour',true)",[swapPair,targetPool,ethPool]);
 const q=(await getQuote('0.00000010',swapPair)).body.quote;assert.equal(q.target_units,'1000');assert.equal((await accept(q.id)).status,200);assert.equal(await pool(ethPool),'-999000');
});
test('expired quote cannot debit funds even if the pair remains enabled',async()=>{
 const expired=randomUUID();await pg.query("INSERT INTO dealer_quotes SELECT $1,user_id,pair_id,source_account,target_account,source_inventory,target_inventory,source_asset,target_asset,source_units,fee_units,target_units,now()-interval '1 second',created_at FROM dealer_quotes WHERE id=$2",[expired,quote.id]);
 assert.equal((await accept(expired)).status,409);
});
test('completed trades enqueue exactly one private transactional email; replay and failed quotes do not duplicate',async()=>{
 const trades=(await pg.query('SELECT quote_id,user_id FROM dealer_trades')).rows;
 const emails=(await pg.query("SELECT user_id,event_key,type,payload FROM email_outbox WHERE type='trade_settled'")).rows;
 assert.equal(emails.length,trades.length);assert.equal(new Set(emails.map(e=>e.event_key)).size,trades.length);
 assert.ok(emails.every(e=>e.user_id===user&&Object.keys(e.payload).sort().join(',')==='occurredAt,reference'));
 assert.equal((await accept(quote.id)).status,200);assert.equal((await pg.query("SELECT count(*) FROM email_outbox WHERE type='trade_settled'")).rows[0].count,trades.length);
});
test('notification insertion failure rolls back trade, journal and inventory together',async()=>{
 const q=(await getQuote('0.00000010',reversePair)).body.quote;
 const before=await pool(targetPool),trades=(await pg.query('SELECT count(*) FROM dealer_trades')).rows[0].count;
 await pg.exec("CREATE FUNCTION fail_transaction_mail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test mail failure'; END; $$;CREATE TRIGGER fail_transaction_mail BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION fail_transaction_mail()");
 assert.equal((await accept(q.id)).status,500);
 await pg.exec('DROP TRIGGER fail_transaction_mail ON email_outbox');assert.equal(await pool(targetPool),before);assert.equal((await pg.query('SELECT count(*) FROM dealer_trades')).rows[0].count,trades);
});
