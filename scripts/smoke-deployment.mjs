// Read-only by default. Never prints credentials, cookies, email bodies or tokens.
import { randomBytes } from 'node:crypto';
const raw=process.env.SMOKE_ORIGIN;
let origin;
try{
 const url=new URL(raw);
 if(url.username||url.password||url.origin!==raw||url.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw new Error();
 origin=url.origin;
}catch{console.error('Set SMOKE_ORIGIN to an exact HTTPS origin, with no trailing slash or path. Local HTTP is allowed only on localhost/127.0.0.1.');process.exit(1);}
const jar=new Map(),write=process.env.SMOKE_WRITE_TESTS==='true',email=process.env.SMOKE_TEST_EMAIL;
if(write&&(process.env.SMOKE_CONFIRM_ORIGIN!==origin||!/^\S+@\S+\.\S+$/.test(email||''))){console.error('Writes require SMOKE_CONFIRM_ORIGIN equal to SMOKE_ORIGIN and an owned, unused SMOKE_TEST_EMAIL. This can send email and creates/deletes a test account.');process.exit(1);}
const password=randomBytes(32).toString('base64url');let created=false,failures=0;
async function request(path,{method='GET',data,anonymous=false,ops=false}={}){
 const headers={Accept:'application/json'};
 if(!anonymous&&jar.size)headers.Cookie=[...jar].map(([key,value])=>`${key}=${value}`).join('; ');
 if(data!==undefined){headers['Content-Type']='application/json';headers.Origin=origin;}
 if(ops)headers.Authorization=`Bearer ${process.env.OPS_SECRET}`;
 if(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)headers['x-vercel-protection-bypass']=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
 const response=await fetch(`${origin}/api/${path}`,{method,headers,body:data===undefined?undefined:JSON.stringify(data),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(response.status>=300&&response.status<400)throw new Error('Redirect received; deployment protection or an alias may be blocking the API.');
 if(!String(response.headers.get('content-type')).includes('application/json'))throw new Error('API did not return JSON. Check deployment protection and whether server routes are deployed.');
 const value=await response.json();
 if(!anonymous)for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
 return {status:response.status,value};
}
function expect(condition,message){if(!condition)throw new Error(message);}
async function check(name,work){try{await work();console.log(`PASS ${name}`);return true;}catch(error){failures++;console.error(`FAIL ${name}: ${error.message}`);return false;}}
const accountReady=await check('account API JSON contract',async()=>{const r=await request('account',{anonymous:true});expect(r.status===200&&r.value.account===null&&r.value.capabilities?.liveMoney===false,'Expected signed-out server-account response with liveMoney=false.');});
if(accountReady){
 await check('workspace rejects anonymous access',async()=>expect((await request('workspace',{anonymous:true})).status===401,'Expected HTTP 401.'));
 await check('support rejects anonymous access',async()=>expect((await request('support',{anonymous:true})).status===401,'Expected HTTP 401.'));
 await check('operations rejects anonymous access',async()=>expect([401,503].includes((await request('health',{anonymous:true})).status),'Expected disabled or protected operations endpoint.'));
 if(process.env.OPS_SECRET)await check('protected database/schema readiness',async()=>{const r=await request('health',{ops:true,anonymous:true});expect(r.status===200&&r.value.ready===true&&r.value.databaseReachable===true,'Readiness failed. Review schema/configuration in a protected operator session.');});
 else console.log('SKIP database/schema readiness: OPS_SECRET not supplied.');
 if(write){
  console.log('WRITE TESTS ENABLED: may send transactional email to the owned test address; temporary account will be deleted.');
  try{
   const registration=await request('account',{method:'POST',data:{action:'register',policyVersion:'2026-11-27.2',termsAccepted:true,privacyAcknowledged:true,riskAcknowledged:true,adultConfirmed:true,email,password,name:'Deployment smoke test',country:'United States',risk:'Balanced'}});
   expect(registration.status===201&&registration.value.account?.serverUserId,'Test registration failed. Use an unused owned email; no existing account will be deleted.');created=true;
   await check('session restoration',async()=>{const r=await request('account');expect(r.status===200&&r.value.account?.email===email.toLowerCase(),'Session did not restore.');});
   let revision;
   await check('cloud save/load and conflict rejection',async()=>{
    const snapshot={schemaVersion:3,cash:100,holdings:[],goals:[],plans:[],activity:[],prefs:{}};
    let r=await request('workspace',{method:'PUT',data:{revision:0,snapshot}});expect(r.status===200,'Initial cloud save failed.');revision=r.value.revision;
    r=await request('workspace');expect(r.status===200&&r.value.workspace?.snapshot.cash===100,'Cloud load failed.');
    r=await request('workspace',{method:'PUT',data:{revision:0,snapshot}});expect(r.status===409,'Stale write was not rejected.');
   });
   await check('support ticket and owner reply',async()=>{
    let r=await request('account',{method:'POST',data:{action:'support',subject:'Deployment smoke test',message:'Temporary automated test request; account cleanup removes this conversation.'}});expect(r.status===201,'Support creation failed.');const id=r.value.id;
    r=await request(`support?id=${encodeURIComponent(id)}`);expect(r.status===200&&r.value.staff===false,'Owner could not read ordinary customer ticket.');
    r=await request('support',{method:'POST',data:{action:'reply',id,revision:r.value.ticket.revision,message:'Automated test reply.'}});expect(r.status===200,'Customer reply failed.');
   });
   await check('account export',async()=>{const r=await request('account',{method:'POST',data:{action:'export'}});expect(r.status===200&&Array.isArray(r.value.supportMessages),'Export failed.');expect(!JSON.stringify(r.value).includes(password),'Unexpected credential in export.');});
   await check('logout and login',async()=>{
    expect((await request('account',{method:'POST',data:{action:'logout'}})).status===200,'Logout failed.');
    expect((await request('account')).value.account===null,'Session survived logout.');
    const r=await request('account',{method:'POST',data:{action:'login',email,password}});expect(r.status===200&&r.value.account?.serverUserId,'Login failed.');
   });
  }catch(error){failures++;console.error(`FAIL write smoke test: ${error.message}`);}
  finally{
   if(created)await check('delete temporary account and revoke session',async()=>{
    // Reauthenticate only this newly-created account if a prior step signed it out.
    const r=await request('account',{method:'POST',data:{action:'login',email,password}});expect(r.status===200&&r.value.account?.serverUserId,'Cleanup login failed. Manual deletion of the test account is required.');
    expect((await request('account',{method:'POST',data:{action:'delete',currentPassword:password}})).status===200,'Cleanup deletion failed. Manual deletion is required.');
    expect((await request('account')).value.account===null,'Session remained after account deletion.');created=false;
   });
  }
 }else console.log('SKIP write smoke tests: read-only mode. No account created and no email requested.');
}
console.log('MANUAL: actual inbox delivery, verification/reset links, authenticator enrollment, TradingView data/delays, and backup restoration still require operator checks.');
process.exitCode=failures?1:0;
