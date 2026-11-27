import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);
let mode='normal',created=false,deleted=0,posts=0,password='',snapshot=null,revision=0;
const id='11111111-1111-4111-8111-111111111111';
const server=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const data=raw?JSON.parse(raw):{};
 if(req.method==='POST'||req.method==='PUT')posts++;
 const signed=req.headers.cookie?.includes('session=yes')&&created;
 const send=(status,value,cookie)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');if(cookie)res.setHeader('Set-Cookie',cookie);res.end(JSON.stringify(value));};
 if(mode==='protected'){res.statusCode=307;res.setHeader('Location','/login');res.end();return;}
 if(req.url==='/api/health')return send(503,{error:'not configured'});
 if(req.url==='/api/account'){
  if(req.method==='GET')return send(200,{account:signed?{email:'owned@example.com'}:null,capabilities:{liveMoney:false}});
  if(data.action==='register'){created=true;password=data.password;return send(201,{account:{serverUserId:id}},'session=yes; Path=/; HttpOnly');}
  if(data.action==='login')return send(200,{account:{serverUserId:id}},'session=yes; Path=/; HttpOnly');
  if(data.action==='logout')return send(200,{ok:true},'session=; Path=/; Max-Age=0');
  if(data.action==='delete'){created=false;deleted++;return send(200,{ok:true},'session=; Path=/; Max-Age=0');}
  if(data.action==='export')return send(200,{supportMessages:[]});
  if(data.action==='support')return send(201,{id});
 }
 if(req.url==='/api/workspace'){
  if(!signed)return send(401,{error:'sign in'});
  if(req.method==='GET')return send(200,{workspace:{snapshot,revision}});
  if(mode==='write-failure')return send(500,{error:'provider unavailable'});
  if(revision)return send(409,{error:'conflict'});snapshot=data.snapshot;revision=1;return send(200,{revision});
 }
 if(req.url.startsWith('/api/support')){
  if(!signed)return send(401,{error:'sign in'});
  if(req.method==='GET')return send(200,{staff:false,ticket:{revision:1}});
  return send(200,{ticket:{revision:2}});
 }
 send(404,{error:'missing'});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));after(()=>new Promise(resolve=>server.close(resolve)));
const origin=`http://127.0.0.1:${server.address().port}`;
async function run(extra={}){
 try{const result=await exec(process.execPath,['scripts/smoke-deployment.mjs'],{env:{...process.env,SMOKE_ORIGIN:origin,OPS_SECRET:'',VERCEL_AUTOMATION_BYPASS_SECRET:'',SMOKE_WRITE_TESTS:'false',SMOKE_TEST_EMAIL:'',SMOKE_CONFIRM_ORIGIN:'',...extra}});return {code:0,...result};}
 catch(error){return {code:error.code,stdout:error.stdout,stderr:error.stderr};}
}
test('smoke script defaults to read-only and rejects protected HTML redirects',async()=>{
 let result=await run();assert.equal(result.code,0);assert.equal(posts,0);assert.match(result.stdout,/SKIP write smoke tests/);
 mode='protected';result=await run();assert.equal(result.code,1);assert.match(result.stderr,/deployment protection/);mode='normal';
});
test('write smoke tests require exact origin confirmation and an owned email',async()=>{
 const result=await run({SMOKE_WRITE_TESTS:'true'});assert.equal(result.code,1);assert.equal(posts,0);assert.equal(created,false);
});
test('explicit write suite restores sessions, checks cloud/support/export and deletes its account without logging secrets',async()=>{
 const result=await run({SMOKE_WRITE_TESTS:'true',SMOKE_CONFIRM_ORIGIN:origin,SMOKE_TEST_EMAIL:'owned@example.com'});
 assert.equal(result.code,0,result.stderr);assert.equal(deleted,1);assert.equal(created,false);assert.match(result.stdout,/PASS delete temporary account/);assert.equal((result.stdout+result.stderr).includes(password),false);
});
test('failed cloud check still cleans up temporary account and exits unsuccessfully',async()=>{
 mode='write-failure';snapshot=null;revision=0;
 const result=await run({SMOKE_WRITE_TESTS:'true',SMOKE_CONFIRM_ORIGIN:origin,SMOKE_TEST_EMAIL:'owned@example.com'});
 assert.equal(result.code,1);assert.equal(created,false);assert.equal(deleted,2);assert.match(result.stderr,/FAIL cloud/);assert.match(result.stdout,/PASS delete temporary account/);
});
