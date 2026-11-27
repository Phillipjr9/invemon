import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
const sql=(parts,...values)=>pg.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values).then(r=>r.rows);
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';process.env.WITHDRAWAL_ENCRYPTION_KEY='d'.repeat(64);
const {hashPassword}=await import('../server/core.mjs');const {default:handler}=await import('../server/routes/withdrawals.mjs');
const {decryptDestination,encryptDestination,validateDestination,atomicWithdrawalAmount}=await import('../server/withdrawals.mjs');
const user=randomUUID(),other=randomUUID(),account=randomUUID(),custody=randomUUID(),password='Withdrawal test password!',token='a'.repeat(64),otherToken='b'.repeat(64);
await pg.query("INSERT INTO app_users(id,email,password_hash,email_verified_at,mfa_secret) VALUES($1,'withdraw@example.com',$2,now(),'test-secret'),($3,'other@example.com',$2,now(),'test-secret')",[user,await hashPassword(password),other]);
for(const [id,t]of [[user,token],[other,otherToken]])await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(t).digest('hex'),id]);
await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2),('BTC:BITCOIN',8)");await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','customer_liability',$2),($3,'USD:BANK','custody',NULL)",[account,user,custody]);
await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'initial-credit','test-only',JSON.stringify([{accountId:account,asset:'USD:BANK',units:'-10000'},{accountId:custody,asset:'USD:BANK',units:'10000'}])]);
let calls=0,destination,requestId;
async function call(data,auth=token,origin='https://invemon.example'){let status=200,body;await handler({method:data?'POST':'GET',body:data,headers:{cookie:auth?`__Host-invemon-session=${auth}`:'',origin,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
const bank={action:'save-destination',kind:'ach',asset:'USD:BANK',label:'Test bank only',holder:'Test Customer',bankName:'Test bank',routing:'021000021',account:'123456789',accountType:'checking',currentPassword:password};
const request=(key,extra={})=>call({action:'request',id:destination,amount:'25.00',requestKey:key,currentPassword:password,...extra});
test('owner session, verified email, MFA, origin and current password protect changes',async()=>{
 assert.equal((await call(undefined,'')).status,401);assert.deepEqual((await call()).body.requests,[]);
 assert.equal((await call(bank,token,'https://evil.example')).status,403);assert.equal((await call({...bank,currentPassword:'wrong'})).status,401);
 await pg.query('UPDATE app_users SET email_verified_at=NULL WHERE id=$1',[user]);assert.equal((await call(bank)).status,403);await pg.query('UPDATE app_users SET email_verified_at=now() WHERE id=$1',[user]);
 await pg.query('UPDATE app_sessions SET mfa_verified=false WHERE user_id=$1',[user]);assert.equal((await call(bank)).status,401);await pg.query('UPDATE app_sessions SET mfa_verified=true WHERE user_id=$1',[user]);
});
test('bank destinations are encrypted with owner/version binding and masked on every read',async()=>{
 const saved=await call(bank);assert.equal(saved.status,201);destination=saved.body.id;
 const row=(await pg.query('SELECT * FROM withdrawal_destinations WHERE id=$1',[destination])).rows[0];assert.equal(row.encrypted_details.includes(bank.account),false);
 assert.equal(decryptDestination(row.encrypted_details,user,destination).account,bank.account);
 assert.throws(()=>decryptDestination(row.encrypted_details,other,destination));assert.throws(()=>decryptDestination(row.encrypted_details,user,randomUUID()));
 const result=await call();assert.equal(result.body.destinations[0].masked,'ACH · …6789');assert.equal(JSON.stringify(result.body).includes('encrypted_details'),false);assert.equal(JSON.stringify(result.body).includes('021000021'),false);
 assert.deepEqual((await call(undefined,otherToken)).body.destinations,[]);
 for(const command of ['DELETE FROM withdrawal_destinations','UPDATE withdrawal_destinations SET label=\'changed\'','TRUNCATE withdrawal_destinations CASCADE'])await assert.rejects(pg.exec(command),/immutable/);
});
test('validation rejects invalid bank details and amounts without rounding; wallet memo encrypts',()=>{
 assert.throws(()=>validateDestination({...bank,routing:'021000022'}));assert.throws(()=>validateDestination({...bank,asset:'BTC:BITCOIN'}));
 const crypto=validateDestination({kind:'crypto',asset:'BTC:BITCOIN',label:'Test wallet',address:'bc1qtestaddressonly',memo:'123'});assert.equal(decryptDestination(encryptDestination(crypto.details,user,destination),user,destination).memo,'123');
 assert.equal(atomicWithdrawalAmount('9007199254740993.12',2),'900719925474099312');for(const amount of ['0','-1','1e3','1.001','NaN'])assert.throws(()=>atomicWithdrawalAmount(amount,2));
});
test('submission is disabled by default and cannot select another owner destination',async()=>{
 assert.equal((await request(randomUUID())).status,503);process.env.WITHDRAWALS_ENABLED='true';
 const result=await call({action:'request',id:destination,amount:'1',requestKey:randomUUID(),currentPassword:password},otherToken);assert.equal(result.status,400);
});
const stableKey=randomUUID();
test('request atomically reserves exact funds; retries cannot create another reservation',async()=>{
 const result=await request(stableKey);assert.equal(result.status,201);requestId=result.body.id;
 assert.equal((await request(stableKey)).body.id,requestId);
 assert.equal((await request(stableKey,{amount:'30'})).status,409);
 assert.equal((await request(randomUUID(),{amount:'1000'})).status,409);
 const data=(await call()).body;assert.equal(data.accounts[0].available_units,'7500');assert.equal(data.requests[0].state,'held');assert.equal(data.requests[0].decision,'pending');
 assert.equal((await pg.query('SELECT count(*) FROM ledger_journals')).rows[0].count,1);assert.equal((await pg.query('SELECT count(*) FROM withdrawal_requests')).rows[0].count,1);
 assert.deepEqual((await call(undefined,otherToken)).body.requests,[]);
});
test('customer cancellation is owner-scoped, idempotent and releases without debit',async()=>{
 assert.equal((await call({action:'cancel',id:requestId,currentPassword:password},otherToken)).status,404);
 assert.equal((await call({action:'cancel',id:requestId,currentPassword:password})).status,200);assert.equal((await call({action:'cancel',id:requestId,currentPassword:password})).status,200);
 assert.equal((await call()).body.accounts[0].available_units,'10000');
 assert.equal((await pg.query("SELECT count(*) FROM security_events WHERE action='withdrawal.cancelled'")).rows[0].count,1);
 await assert.rejects(pg.query('SELECT admin_review_withdrawal($1,$2,$3,0,$4,$5)',[randomUUID(),requestId,user,'approved','Late approval']),/no longer held/);
});
test('approved requests cannot be cancelled; rejection is visible without private admin note',async()=>{
 const id=(await request(randomUUID())).body.id;
 await pg.query('SELECT admin_review_withdrawal($1,$2,$3,0,$4,$5)',[randomUUID(),id,user,'approved','PRIVATE ADMIN NOTE']);
 assert.equal((await call({action:'cancel',id,currentPassword:password})).status,409);
 await pg.query('SELECT admin_review_withdrawal($1,$2,$3,1,$4,$5)',[randomUUID(),id,user,'rejected','PRIVATE ADMIN NOTE']);
 const data=(await call()).body;assert.equal(data.requests.find(r=>r.id===id).decision,'rejected');assert.equal(JSON.stringify(data).includes('PRIVATE ADMIN NOTE'),false);assert.equal(data.accounts[0].available_units,'10000');
});
test('request identity includes destination and immutable requests preserve snapshots',async()=>{
 const second=(await call({...bank,label:'Second bank'})).body.id;assert.equal((await request(stableKey,{id:second})).status,409);
 await assert.rejects(pg.exec('DELETE FROM withdrawal_requests'),/immutable/);
 const foreign=randomUUID();await assert.rejects(pg.query('SELECT request_customer_withdrawal($1,$2,$3,$4,$5,$6)',[randomUUID(),other,account,destination,'1','foreign']),/not found/);
 delete process.env.WITHDRAWAL_ENCRYPTION_KEY;assert.equal((await call(bank)).status,503);assert.equal((await call()).body.submissionEnabled,false);
});
