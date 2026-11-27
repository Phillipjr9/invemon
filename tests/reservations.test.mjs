import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});process.env.DATABASE_URL='postgresql://test';
const {reserveFunds,releaseFunds,finalizeReservedDebit}=await import('../server/reservations.mjs');
const {postJournal}=await import('../server/ledger.mjs');
const user=randomUUID(),other=randomUUID(),account=randomUUID(),foreign=randomUUID(),custody=randomUUID();
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'holds@example.com','not-a-login'),($2,'other-holds@example.com','not-a-login')",[user,other]);
await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2),('BTC:BITCOIN',8)");
await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','customer_liability',$4),($5,'USD:BANK','custody',NULL)",[account,user,foreign,other,custody]);
const change=(key,units)=>postJournal({postingKey:key,evidenceRef:`test-only:${key}`,lines:[{accountId:account,asset:'USD:BANK',units:String(-BigInt(units))},{accountId:custody,asset:'USD:BANK',units:String(BigInt(units))}]});
await change('initial-test-credit','10000');
const balances=async()=> (await pg.query('SELECT total_units,reserved_units,available_units FROM ledger_spendable_balances WHERE id=$1',[account])).rows[0];
const reserve=(key,units,extra={})=>reserveFunds({userId:user,accountId:account,asset:'USD:BANK',units,purpose:'withdrawal',requestKey:key,...extra});
let held;
test('hold reserves exact funds without changing the total or creating a debit journal',async()=>{
 held=await reserve('withdrawal-1','6000');
 assert.deepEqual(await balances(),{total_units:'10000',reserved_units:'6000',available_units:'4000'});
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
 assert.equal(await reserve('withdrawal-1','6000'),held);
 await assert.rejects(reserve('withdrawal-1','6001'),/different contents/);
});
test('over-reservation, wrong owner, asset mismatch and invalid units fail atomically',async()=>{
 await assert.rejects(reserve('too-much','5000'),/Insufficient/);
 await assert.rejects(reserve('foreign','1',{accountId:foreign}),/belong/);
 await assert.rejects(reserve('network-mismatch','1',{asset:'BTC:BITCOIN'}),/belong/);
 for(const units of ['0','-1','0.1','1e3',100])await assert.rejects(reserve('invalid',units),/integer/);
 assert.equal((await pg.query('SELECT count(*) FROM fund_reservations')).rows[0].count,1);
 assert.deepEqual(await balances(),{total_units:'10000',reserved_units:'6000',available_units:'4000'});
});
test('direct ledger spending cannot bypass held funds or overdraw the customer account',async()=>{
 await assert.rejects(change('spend-held','-5000'),/Insufficient/);
 await assert.rejects(change('overdraw','-10001'),/Insufficient/);
 assert.deepEqual(await balances(),{total_units:'10000',reserved_units:'6000',available_units:'4000'});
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);
});
test('release is owner-scoped and idempotent and does not create money',async()=>{
 await assert.rejects(releaseFunds({userId:other,reservationId:held,reason:'Cancelled'}));
 const args={userId:user,reservationId:held,reason:'Customer cancelled'};
 assert.equal(await releaseFunds(args),held);assert.equal(await releaseFunds(args),held);
 assert.deepEqual(await balances(),{total_units:'10000',reserved_units:'0',available_units:'10000'});
 await assert.rejects(releaseFunds({...args,reason:'Different reason'}),/differently/);
 await assert.rejects(finalizeReservedDebit({userId:user,reservationId:held,postingKey:'bad',evidenceRef:'test-only',counterpartId:custody}),/Released/);
});
let consumed,journal;
test('verified internal finalization atomically consumes hold and posts a single exact debit',async()=>{
 consumed=await reserve('withdrawal-2','4000');
 const args={userId:user,reservationId:consumed,postingKey:'payout-2',evidenceRef:'test-only:payment-2',counterpartId:custody};
 await assert.rejects(finalizeReservedDebit({...args,counterpartId:foreign}),/Counterpart/);
 journal=await finalizeReservedDebit(args);assert.equal(await finalizeReservedDebit(args),journal);
 assert.deepEqual(await balances(),{total_units:'6000',reserved_units:'0',available_units:'6000'});
 await assert.rejects(finalizeReservedDebit({...args,postingKey:'duplicate-new-key',evidenceRef:'test-only:duplicate'}),/another journal/);
 await assert.rejects(releaseFunds({userId:user,reservationId:consumed,reason:'Release after consumption'}),/differently/);
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,2);
 assert.deepEqual(await balances(),{total_units:'6000',reserved_units:'0',available_units:'6000'});
});
test('historical debit cannot be reused to consume a new hold',async()=>{
 const id=await reserve('historical-proof','4000');
 await assert.rejects(pg.query("INSERT INTO fund_reservation_events VALUES($1,2,'consumed',$2,'Invalid historical proof',now())",[id,journal]),/atomically/);
 await releaseFunds({userId:user,reservationId:id,reason:'Test cleanup'});
});
test('reservations and event history cannot be edited, deleted or truncated',async()=>{
 for(const table of ['fund_reservations','fund_reservation_events']){
  await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);
  await assert.rejects(pg.exec(`TRUNCATE ${table} CASCADE`));
 }
 await assert.rejects(pg.query('UPDATE fund_reservations SET units=1 WHERE id=$1',[consumed]),/immutable/);
 await assert.rejects(pg.query("INSERT INTO fund_reservations(id,user_id,account_id,asset,units,purpose,request_key) VALUES($1,$2,$3,'USD:BANK',1,'order','orphan')",[randomUUID(),user,account]),/initial held/);
});
test('fund mutations fail closed under an unsupported transaction isolation level',async()=>{
 await assert.rejects(pg.transaction(async tx=>{
  await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await tx.query('SELECT reserve_customer_funds($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),user,account,'USD:BANK','1','order','wrong-isolation']);
 }),/READ COMMITTED/);
});
