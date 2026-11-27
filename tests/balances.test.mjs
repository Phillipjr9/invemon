import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
let failQuery=false;
const sql=(parts,...values)=>{const text=parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),'');if(failQuery&&text.includes('ledger_account_balances'))throw new Error('Database unavailable');return pg.query(text,values).then(r=>r.rows);};
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test';process.env.NODE_ENV='production';
const {default:handler}=await import('../api/balances.mjs');
const user=randomUUID(),other=randomUUID(),token='a'.repeat(64);
await pg.query("INSERT INTO app_users(id,email,password_hash) VALUES($1,'balance@example.com','not-a-login'),($2,'other-balance@example.com','not-a-login')",[user,other]);
await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at,mfa_verified) VALUES($1,$2,now()+interval '1 hour',true)",[createHash('sha256').update(token).digest('hex'),user]);
async function call({cookie=`__Host-invemon-session=${token}`,method='GET'}={}){let status=200,body;await handler({method,headers:{cookie}},{setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}});return{status,body};}
test('balances require a session and are read-only',async()=>{assert.equal((await call({cookie:''})).status,401);assert.equal((await call({method:'POST'})).status,405);});
test('confirmed empty ledger returns an empty balance array, not fabricated assets',async()=>{assert.deepEqual((await call()).body,{balances:[],source:'ledger',liveEnabled:false});});
test('ledger balances are exact, credit-normal and restricted to the session owner',async()=>{
 const custody=randomUUID(),customer=randomUUID(),stranger=randomUUID();
 await pg.exec("INSERT INTO ledger_assets VALUES('USD:BANK',2)");
 await pg.query("INSERT INTO ledger_accounts VALUES($1,'USD:BANK','custody',NULL),($2,'USD:BANK','customer_liability',$3),($4,'USD:BANK','customer_liability',$5)",[custody,customer,user,stranger,other]);
 await pg.query('SELECT ledger_post($1,$2,$3,$4::jsonb,NULL)',[randomUUID(),'test-balance','test-evidence',JSON.stringify([{accountId:custody,asset:'USD:BANK',units:'900719925474099312346'},{accountId:customer,asset:'USD:BANK',units:'-900719925474099312345'},{accountId:stranger,asset:'USD:BANK',units:'-1'}])]);
 const result=await call();assert.equal(result.status,200);assert.deepEqual(result.body.balances,[{asset:'USD:BANK',units:'900719925474099312345',decimals:2}]);
});
test('database failures cannot masquerade as empty or zero balances',async()=>{failQuery=true;try{const result=await call();assert.equal(result.status,500);assert.equal(result.body.balances,undefined);}finally{failQuery=false;}});
