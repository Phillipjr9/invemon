import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});process.env.DATABASE_URL='postgresql://test';
const {recordVerifiedFill,settleVerifiedCryptoExecution}=await import('../server/order-settlement.mjs');
const user=randomUUID(),other=randomUUID(),source=randomUUID(),target=randomUUID(),sourceCustody=randomUUID(),targetCustody=randomUUID(),fee=randomUUID(),foreignTarget=randomUUID();
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'settle@example.com','test-only'),($2,'other-settle@example.com','test-only')",[user,other]);
await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2),('BTC:BITCOIN',8)");
await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'BTC:BITCOIN','customer_liability',$2),($4,'USD:BANK','custody',NULL),($5,'BTC:BITCOIN','custody',NULL),($6,'USD:BANK','fee',NULL),($7,'BTC:BITCOIN','customer_liability',$8)",[source,user,target,sourceCustody,targetCustody,fee,foreignTarget,other]);
await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'settlement-initial-credit','test-only:funds',JSON.stringify([{accountId:source,asset:'USD:BANK',units:'-100000'},{accountId:sourceCustody,asset:'USD:BANK',units:'100000'}])]);
async function order(operation='crypto_buy'){
 const q=randomUUID(),id=randomUUID();await pg.query("INSERT INTO execution_quotes VALUES($1,$2,$3,$4,'USD:BANK',1000,'BTC:BITCOIN',100,8,10,'test-only',$5,now()+interval '1 hour',now())",[q,user,operation,source,randomUUID()]);
 await pg.query('SELECT accept_execution_quote($1,$2,$3,$4)',[id,user,q,randomUUID()]);await pg.query('SELECT claim_execution_dispatch($1,$2)',[id,'test-only']);await pg.query('SELECT record_execution_dispatch($1,$2,$3,$4,$5)',[randomUUID(),id,'test-only','submitted',randomUUID()]);return id;
}
const fill=(id,ref,sourceUnits='500',targetUnits='50',feeUnits='5')=>recordVerifiedFill({orderId:id,provider:'test-only',fillRef:ref,sourceUnits,feeUnits,targetUnits,evidenceRef:`test-fill:${ref}`});
const settle=(id,outcome='filled',extra={})=>settleVerifiedCryptoExecution({orderId:id,outcome,targetAccountId:target,sourceCustodyId:sourceCustody,targetCustodyId:targetCustody,feeAccountId:fee,evidenceRef:`test-settle:${id}`,...extra});
const balances=async()=> (await pg.query('SELECT id,total_units,reserved_units,available_units FROM ledger_spendable_balances ORDER BY id')).rows;
let id;
test('partial fills are exact/idempotent staging records, not spendable holdings',async()=>{
 id=await order();const before=await balances(),ref=randomUUID();const first=await fill(id,ref);assert.equal(await fill(id,ref),first);assert.deepEqual(await balances(),before);
 await assert.rejects(fill(id,ref,'501'),/Conflicting/);await assert.rejects(fill(id,randomUUID(),'600'),/exceeds/);
 assert.equal((await pg.query('SELECT count(*) FROM execution_fills')).rows[0].count,1);
});
test('full settlement requires minimum receiving quantity and correct owned asset accounts',async()=>{
 await assert.rejects(settle(id),/below quote/);await assert.rejects(settle(id,'filled',{targetAccountId:foreignTarget}),/mismatch/);
 await assert.rejects(settle(id,'filled',{sourceCustodyId:targetCustody}),/Invalid business/);
 await fill(id,randomUUID(),'490','50','4');
 const journal=await settle(id);assert.equal(await settle(id),journal);
 const rows=await balances();const s=rows.find(r=>r.id===source),t=rows.find(r=>r.id===target);
 assert.equal(s.total_units,'99001');assert.equal(s.reserved_units,'0');assert.equal(t.total_units,'100');
 assert.equal((await pg.query('SELECT debit_units FROM ledger_account_balances WHERE id=$1',[fee])).rows[0].debit_units,'-9');
 const sums=(await pg.query('SELECT asset,sum(units)::text AS total FROM ledger_entries WHERE journal_id=$1 GROUP BY asset',[journal])).rows;assert.ok(sums.every(s=>s.total==='0'));
 assert.equal((await pg.query('SELECT count(*) FROM execution_settlements')).rows[0].count,1);
});
test('settled fills cannot grow and conflicting settlement/evidence replays fail',async()=>{
 await assert.rejects(fill(id,randomUUID(),'1','1','0'),/closed/);
 await assert.rejects(settle(id,'cancelled_partial'),/Conflicting/);await assert.rejects(settle(id,'filled',{evidenceRef:'different-evidence'}),/Conflicting/);
});
test('partial cancellation settles actual execution and releases only unspent hold',async()=>{
 const partial=await order();await fill(partial,randomUUID(),'200','20','0');const before=(await balances()).find(r=>r.id===source);assert.equal(before.reserved_units,'1010');
 await settle(partial,'cancelled_partial');const after=(await balances()).find(r=>r.id===source);assert.equal(after.total_units,(BigInt(before.total_units)-200n).toString());assert.equal(after.reserved_units,'0');
});
test('empty fills, securities custody and unacknowledged provider evidence are blocked',async()=>{
 const empty=await order();await assert.rejects(settle(empty),/fills required/);
 const stock=await order('stock_buy');await fill(stock,randomUUID(),'1000','100','10');await assert.rejects(settle(stock),/Securities custody/);
 await assert.rejects(recordVerifiedFill({orderId:empty,provider:'wrong-provider',fillRef:'x',sourceUnits:'1',feeUnits:'0',targetUnits:'1',evidenceRef:'test-wrong'}),/matching dispatch/);
 await assert.rejects(recordVerifiedFill({orderId:empty,provider:'test-only',fillRef:'x',sourceUnits:1,feeUnits:'0',targetUnits:'1',evidenceRef:'test-wrong'}),/strings/);
});
test('settlement rollback preserves balances/holds when evidence is reused',async()=>{
 const rollback=await order();await fill(rollback,randomUUID(),'1000','100','10');const before=await balances();
 await assert.rejects(settle(rollback,'filled',{evidenceRef:`test-settle:${id}`}));assert.deepEqual(await balances(),before);assert.equal((await pg.query('SELECT count(*) FROM execution_settlements WHERE order_id=$1',[rollback])).rows[0].count,0);
});
test('fill and settlement histories cannot be rewritten or deleted',async()=>{
 for(const table of ['execution_fills','execution_settlements']){
  await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);await assert.rejects(pg.exec(`TRUNCATE ${table} CASCADE`),/immutable/);
 }
});
