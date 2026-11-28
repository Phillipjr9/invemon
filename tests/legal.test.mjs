import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const pg=new PGlite();after(()=>pg.close());
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
function query(text,values=[]){return{text,values,then(resolve,reject){return pg.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
const sql=(parts,...values)=>query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);
sql.transaction=statements=>pg.transaction(async tx=>{const rows=[];for(const s of statements)rows.push((await tx.query(s.text,s.values)).rows);return rows;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const {default:handler}=await import('../server/routes/account.mjs');
const {POLICY_VERSION,POLICY_DIGEST}=await import('../server/legal.mjs');
const valid={action:'register',name:'Policy Owner',email:'legal@example.com',password:'Only for legal unit tests!',policyVersion:POLICY_VERSION,termsAccepted:true,privacyAcknowledged:true,riskAcknowledged:true,adultConfirmed:true};
let calls=0,cookie,userId;
async function call(data,cookieValue=cookie){let status=200,result,headers={};await handler({method:'POST',body:data,headers:{origin:process.env.APP_ORIGIN,cookie:cookieValue,'content-type':'application/json','x-forwarded-for':`192.0.2.${++calls}`}},{setHeader(k,v){headers[k]=v;},status(s){status=s;return this;},json(v){result=v;return this;}});return{status,result,headers};}
test('signup rejects missing/stale policy version and each missing, false or string checkbox without creating records',async()=>{
 for(const policyVersion of [undefined,'old'])assert.equal((await call({...valid,policyVersion})).status,409);
 for(const key of ['termsAccepted','privacyAcknowledged','riskAcknowledged','adultConfirmed'])for(const value of [undefined,false,'true',1])assert.equal((await call({...valid,[key]:value})).status,400);
 assert.equal((await pg.query('SELECT count(*) FROM app_users')).rows[0].count,0);assert.equal((await pg.query('SELECT count(*) FROM email_outbox')).rows[0].count,0);
});
test('signup atomically stores server-selected content digest, version, timestamp and acknowledgments',async()=>{
 const created=await call({...valid,policyDigest:'forged',acceptedAt:'1900-01-01'});assert.equal(created.status,201);cookie=created.headers['Set-Cookie'].split(';')[0];userId=created.result.account.serverUserId;
 const row=(await pg.query('SELECT * FROM account_legal_acceptances WHERE user_id=$1',[userId])).rows[0];assert.equal(row.policy_version,POLICY_VERSION);assert.equal(row.policy_digest,POLICY_DIGEST);assert.equal(row.source,'signup');assert.ok(new Date(row.accepted_at).getFullYear()>2020);
 const bundle=(await pg.query('SELECT documents FROM legal_policy_bundles')).rows[0].documents;assert.equal(bundle.documents.length,4);assert.ok(bundle.documents.every(d=>d.sections.length>=5));
 const exported=await call({action:'export'});assert.equal(exported.result.legalAcceptance.policy_digest,POLICY_DIGEST);
});
test('acceptance does not change on profile edits; evidence rejects mutation; existing users get no fabricated acceptance',async()=>{
 const result=await call({action:'profile',name:'Updated Owner',country:'United States',risk:'Balanced',termsAccepted:false,policyVersion:'forged'});assert.equal(result.status,200);
 assert.equal((await pg.query('SELECT policy_version FROM account_legal_acceptances')).rows[0].policy_version,POLICY_VERSION);
 for(const statement of ["UPDATE account_legal_acceptances SET source='signup'",'TRUNCATE account_legal_acceptances','DELETE FROM legal_policy_bundles'])await assert.rejects(pg.exec(statement),/immutable/);
 await pg.exec("INSERT INTO app_users VALUES('11111111-1111-4111-8111-111111111111','legacy@example.com','unused','{}',NULL,now())");assert.equal((await pg.query('SELECT count(*) FROM account_legal_acceptances')).rows[0].count,1);
});
test('legal evidence failure rolls back account, welcome email and session creation',async()=>{
 await pg.exec("CREATE FUNCTION reject_legal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test legal failure'; END; $$;CREATE TRIGGER reject_legal BEFORE INSERT ON account_legal_acceptances FOR EACH ROW EXECUTE FUNCTION reject_legal()");
 const result=await call({...valid,email:'rollback@example.com'});assert.equal(result.status,500);assert.equal(result.headers['Set-Cookie'],undefined);
 assert.equal((await pg.query("SELECT count(*) FROM app_users WHERE email='rollback@example.com'")).rows[0].count,0);assert.equal((await pg.query('SELECT count(*) FROM email_outbox')).rows[0].count,1);
 await pg.exec('DROP TRIGGER reject_legal ON account_legal_acceptances');
});
