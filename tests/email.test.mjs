import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { EMAIL_TYPES, EMAIL_TEMPLATE_TYPES, renderEmail } from '../server/email-templates.mjs';
const pg=new PGlite();
for(const file of fs.readdirSync(new URL('../db/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync(new URL(`../db/${file}`,import.meta.url),'utf8'));
function query(text,values=[]){return {text,values,then(resolve,reject){return pg.query(text,values).then(result=>result.rows).then(resolve,reject);}};}
function sql(parts,...values){return query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),''),values);}
sql.transaction=statements=>pg.transaction(async tx=>{const rows=[];for(const s of statements)rows.push((await tx.query(s.text,s.values)).rows);return rows;});
mock.module('@neondatabase/serverless',{namedExports:{neon:()=>sql}});
process.env.DATABASE_URL='postgresql://test-only';process.env.APP_ORIGIN='https://invemon.example';process.env.NODE_ENV='production';
const notifications=await import('../server/notifications.mjs');
const {sha}=await import('../server/core.mjs');
const {default:api}=await import('../server/routes/notifications.mjs');
const {default:worker}=await import('../server/routes/email-dispatch.mjs');
const owner=randomUUID(),other=randomUUID(),token='a'.repeat(64);
await pg.query('INSERT INTO app_users(id,email,password_hash,profile) VALUES ($1,$2,$3,$4),($5,$6,$3,$4)',[owner,'owner@example.com','unused',JSON.stringify({name:'Alex'}),other,'other@example.com']);
await pg.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')",[sha(token),owner]);
const cookie=`__Host-invemon-session=${token}`;
const originalFetch=globalThis.fetch;const calls=[];let providerStatus=200;
globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(providerStatus===200?{id:'provider-id'}:{message:'sensitive provider error should not be stored'}),{status:providerStatus});};
after(async()=>{globalThis.fetch=originalFetch;await pg.close();});
async function call(handler,{method='POST',data,cookieValue=cookie,authorization,origin='https://invemon.example'}={}){let status=200,result;await handler({method,body:data,headers:{origin,cookie:cookieValue,authorization,'content-type':'application/json','x-forwarded-for':'10.0.0.1'}},{setHeader(){},status(s){status=s;return this;},json(v){result=v;}});return {status,result};}
async function enqueue(type='welcome',userId=owner,key=randomUUID()){return notifications.notificationInsert(sql,userId,type,{name:'Alex',reference:'SAMPLE'},key);}
async function clear(){await pg.query('DELETE FROM email_outbox');calls.length=0;providerStatus=200;}
test('every branded HTML/plain-text template has supported art and safe links',()=>{
 const images=new Set();
 for(const type of EMAIL_TEMPLATE_TYPES){
  const email=renderEmail(type,{name:'<script>alert("x")</script>',reference:'<img src=x>',occurredAt:'not-a-date',token:'a'.repeat(64)});
  assert.ok(email.subject);assert.ok(email.text.includes('Never share'));assert.ok(email.html.length<45000);
  assert.equal(email.html.includes('<script>'),false);assert.equal(email.html.includes('<img src=x>'),false);
  assert.match(email.html,/role="presentation"/);assert.match(email.html,/invemon-icon.png/);
  const art=type==='trade_settled'?'workspace_saved':type.startsWith('withdrawal_')?'support_received':type;
  assert.ok(email.html.includes(`/assets/email/${art}.png`));images.add(type);
  assert.ok(fs.existsSync(new URL(`../public/assets/email/${art}.png`,import.meta.url)));
  assert.ok(email.html.includes(['verify','reset'].includes(type)?`/#${type}?token=${'a'.repeat(64)}`:'/#dashboard'));
 }
 assert.equal(images.size,14);
 assert.throws(()=>renderEmail('unknown'));
 assert.throws(()=>renderEmail('welcome',{},'javascript:alert(1)'));
});
test('configuration missing never performs a send; outbox event deduplicates',async()=>{
 delete process.env.RESEND_API_KEY;await clear();const key=randomUUID();await enqueue('welcome',owner,key);await enqueue('welcome',owner,key);assert.equal((await pg.query('SELECT * FROM email_outbox')).rows.length,1);assert.equal((await notifications.dispatchNotifications()).configured,false);assert.equal(calls.length,0);
 process.env.RESEND_API_KEY='test-provider-key';process.env.EMAIL_FROM='Invemon <notifications@example.com>';
});
test('delivery is owner-scoped, uses stored recipient and stable provider idempotency key',async()=>{
 await clear();const [row]=await enqueue();await enqueue('welcome',other);const result=await notifications.dispatchNotifications({userId:owner});assert.equal(result.accepted,1);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.deepEqual(JSON.parse(calls[0].options.body).to,['owner@example.com']);assert.equal(calls[0].options.headers['Idempotency-Key'],`invemon-${row.id}`);
 const status=(await pg.query('SELECT status FROM email_outbox WHERE id=$1',[row.id])).rows[0].status;assert.equal(status,'accepted');await notifications.dispatchNotifications({userId:owner});assert.equal(calls.length,1);
});
test('optional email preferences are enforced both at enqueue and after opt-out',async()=>{
 await clear();assert.equal((await enqueue('workspace_saved')).length,0);
 await pg.query('INSERT INTO email_preferences(user_id,support_received) VALUES ($1,true) ON CONFLICT(user_id) DO UPDATE SET support_received=true',[owner]);const [row]=await enqueue('support_received');await pg.query('UPDATE email_preferences SET support_received=false WHERE user_id=$1',[owner]);await notifications.dispatchNotifications({userId:owner});assert.equal(calls.length,0);assert.equal((await pg.query('SELECT status FROM email_outbox WHERE id=$1',[row.id])).rows[0].status,'skipped');
});
test('transient errors retry with the same key; permanent errors stop; expired messages do not send',async()=>{
 await clear();providerStatus=503;const [row]=await enqueue();await notifications.dispatchNotifications({userId:owner});let status=(await pg.query('SELECT * FROM email_outbox WHERE id=$1',[row.id])).rows[0];assert.equal(status.status,'pending');assert.equal(status.attempts,1);assert.equal(status.last_error,'provider_http_503');await pg.query('UPDATE email_outbox SET next_attempt_at=now() WHERE id=$1',[row.id]);providerStatus=200;await notifications.dispatchNotifications({userId:owner});assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);assert.equal((await pg.query('SELECT status FROM email_outbox WHERE id=$1',[row.id])).rows[0].status,'accepted');
 await clear();providerStatus=422;const [bad]=await enqueue();await notifications.dispatchNotifications({userId:owner});assert.equal((await pg.query('SELECT status FROM email_outbox WHERE id=$1',[bad.id])).rows[0].status,'failed');
 await clear();const [old]=await enqueue();await pg.query("UPDATE email_outbox SET created_at=now()-interval '24 hours' WHERE id=$1",[old.id]);await notifications.dispatchNotifications({userId:owner});assert.equal(calls.length,0);assert.equal((await pg.query('SELECT status FROM email_outbox WHERE id=$1',[old.id])).rows[0].status,'expired');
});
test('concurrent workers claim each pending event only once',async()=>{
 await clear();await enqueue();await Promise.all([notifications.dispatchNotifications({userId:owner}),notifications.dispatchNotifications({userId:owner})]);assert.equal(calls.length,1);
});
test('notification API auth, owner history, preference validation and self-only preview cooldown',async()=>{
 await clear();assert.equal((await call(api,{method:'GET',cookieValue:''})).status,401);assert.equal((await call(api,{data:{action:'preferences'},origin:'https://evil.example'})).status,403);
 assert.equal((await call(api,{data:{action:'preferences',preferences:{sign_in:'true'}}})).status,400);
 let result=await call(api,{data:{action:'preferences',preferences:{sign_in:true,support_received:true,workspace_saved:true}}});assert.equal(result.status,200);
 await enqueue('welcome',other);result=await call(api,{method:'GET'});assert.equal(result.result.history.length,0);
 result=await call(api,{data:{action:'preview',to:'attacker@example.com',html:'<script>bad</script>'}});assert.equal(result.status,202);assert.equal(result.result.status,'accepted');assert.deepEqual(JSON.parse(calls[0].options.body).to,['owner@example.com']);assert.equal((await call(api,{data:{action:'preview'}})).status,429);
 const history=await call(api,{method:'GET'});assert.equal(history.result.history.length,1);assert.equal(history.result.history[0].payload,undefined);assert.equal(history.result.history[0].provider_id,undefined);
});
test('transactional emails deliver despite optional opt-outs and use stored recipient only',async()=>{
 await clear();await pg.query('UPDATE email_preferences SET sign_in=false,support_received=false,workspace_saved=false WHERE user_id=$1',[owner]);
 await enqueue('trade_settled');await enqueue('withdrawal_approved');
 const sent=await notifications.dispatchNotifications({userId:owner});assert.equal(sent.accepted,2);
 assert.ok(calls.every(c=>JSON.parse(c.options.body).to[0]==='owner@example.com'));
 assert.ok(calls.some(c=>JSON.parse(c.options.body).text.includes('Approval is not payment')));
});

test('retry endpoint requires a strong bearer secret; account deletion cascades email data',async()=>{
 delete process.env.CRON_SECRET;assert.equal((await call(worker,{method:'GET'})).status,503);process.env.CRON_SECRET='x'.repeat(48);assert.equal((await call(worker,{method:'GET',authorization:'Bearer wrong'})).status,401);assert.equal((await call(worker,{method:'GET',authorization:`Bearer ${process.env.CRON_SECRET}`})).status,200);
 await pg.query('DELETE FROM app_users WHERE id=$1',[owner]);assert.equal((await pg.query('SELECT * FROM email_outbox WHERE user_id=$1',[owner])).rows.length,0);assert.equal((await pg.query('SELECT * FROM email_preferences WHERE user_id=$1',[owner])).rows.length,0);
});
