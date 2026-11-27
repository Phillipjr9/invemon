import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {sqlStatements} from '../server/sql-statements.mjs';
const pg=new PGlite();after(()=>pg.close());
await pg.exec(fs.readFileSync(new URL('../db/001_accounts.sql',import.meta.url),'utf8'));
await pg.exec(fs.readFileSync(new URL('../db/007_production_ledger.sql',import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});process.env.DATABASE_URL='postgresql://test';
const {postJournal,decimalToUnits}=await import('../server/ledger.mjs');
const user=randomUUID(),custody=randomUUID(),customer=randomUUID(),other=randomUUID();
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'ledger@example.com','not-a-login')",[user]);
await pg.exec("INSERT INTO ledger_assets VALUES('BTC:BITCOIN',8),('USD:BANK',2)");
await pg.query("INSERT INTO ledger_accounts VALUES($1,'BTC:BITCOIN','custody',NULL),($2,'BTC:BITCOIN','customer_liability',$3),($4,'USD:BANK','clearing',NULL)",[custody,customer,user,other]);
const lines=[{accountId:custody,asset:'BTC:BITCOIN',units:'900719925474099312345'},{accountId:customer,asset:'BTC:BITCOIN',units:'-900719925474099312345'}];
const post=(key,ls=lines,extra={})=>postJournal({postingKey:key,evidenceRef:`test-only:${key}`,lines:ls,...extra});
const direct=(ls)=>pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),randomUUID(),'test-only',JSON.stringify(ls)]);
test('exact decimal conversion rejects rounding, exponents and JS numbers',()=>{
 assert.equal(decimalToUnits('9007199254740993.12345678',8),'900719925474099312345678');
 assert.equal(decimalToUnits('0.00000001',8),'1');assert.equal(decimalToUnits('10',2),'1000');
 for(const v of [0.1,'1e2','-1','01','0.000000001'])assert.throws(()=>decimalToUnits(v,8));
});
let original;
test('balanced posting stores exact balances; retry returns same journal and rejects conflicts',async()=>{
 original=await post('settlement:test:1');assert.equal(await post('settlement:test:1'),original);
 await assert.rejects(post('settlement:test:1',lines,{evidenceRef:'different'}),/reused/);
 const balances=(await pg.query('SELECT * FROM ledger_account_balances WHERE id=$1',[customer])).rows;
 assert.equal(balances[0].debit_units,lines[1].units);
 await assert.rejects(post('different-key-same-event',lines,{evidenceRef:'test-only:settlement:test:1'}),/unique/);
 assert.equal((await pg.query('SELECT * FROM ledger_journals')).rows.length,1);
});
test('database rejects unbalanced, empty, fractional, numeric JSON and wrong-asset lines atomically',async()=>{
 const before=(await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count;
 for(const ls of [[{accountId:custody,asset:'BTC:BITCOIN',units:'1'},{accountId:other,asset:'USD:BANK',units:'-1'}],[],[lines[0]], [lines[0],{...lines[1],units:'-1'}],[lines[0],{...lines[1],asset:'USD:BANK'}],[lines[0],{...lines[1],units:'-0.1'}],[lines[0],{...lines[1],units:-1}],[lines[0],{...lines[1],accountId:randomUUID()}]])await assert.rejects(direct(ls));
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,before);
});
test('committed journals cannot be edited, deleted, truncated or extended',async()=>{
 for(const table of ['ledger_assets','ledger_accounts','ledger_entries','ledger_journals']){
  await assert.rejects(pg.exec(`DELETE FROM ${table}`),/immutable/);
  await assert.rejects(pg.exec(`TRUNCATE ${table} CASCADE`));
 }
 await assert.rejects(pg.query('UPDATE ledger_entries SET units=1 WHERE journal_id=$1',[original]),/immutable/);
 await assert.rejects(pg.query('INSERT INTO ledger_entries VALUES($1,99,$2,$3,1)',[original,custody,'BTC:BITCOIN']),/append/);
 await assert.rejects(pg.query('INSERT INTO ledger_journals(id,posting_key,evidence_ref,payload) VALUES($1,$2,$3,$4)',[randomUUID(),'empty','test','{}']),/envelope|balance/);
});
test('reversal is append-only, exactly offsets original, and can happen only once',async()=>{
 await assert.rejects(post('bad-reversal',lines,{reverses:original}),/negate/);
 const reverse=lines.map(l=>({...l,units:(-BigInt(l.units)).toString()}));
 await post('reversal:test:1',reverse,{reverses:original});
 await assert.rejects(post('reversal:test:2',reverse,{reverses:original}),/unique/);
 assert.equal((await pg.query('SELECT debit_units FROM ledger_account_balances WHERE id=$1',[customer])).rows[0].debit_units,'0');
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,2);
});
test('migration splitter preserves quoted semicolons, comments and dollar bodies',()=>{
 assert.equal(sqlStatements("SELECT ';'; -- ;\n SELECT 2; /* ; */ SELECT $$a;b$$;").length,3);
 assert.throws(()=>sqlStatements('SELECT $body$unterminated'));
});
