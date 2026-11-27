import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createApiRouter} from '../server/api-router.mjs';
import deployed from '../api/[...path].mjs';
async function call(handler,req){let status=200,body;const headers={};await handler(req,{setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(value){body=value;return this;}});return{status,body,headers};}
test('catch-all is the only deployed function and all existing API modules are allowlisted',()=>{
 assert.deepEqual(fs.readdirSync(new URL('../api/',import.meta.url)),['[...path].mjs']);
 const source=fs.readFileSync(new URL('../api/[...path].mjs',import.meta.url),'utf8');
 for(const file of fs.readdirSync(new URL('../server/routes/',import.meta.url)))assert.ok(source.includes(`../server/routes/${file}`));
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url)));assert.equal(config.functions['api/*.mjs'].maxDuration,30);
});
test('router preserves method/body/cookies/signature/origin and original URL; query cannot select another route',async()=>{
 let received;
 const router=createApiRouter({funding:async(req,res)=>{received=req;return res.status(202).json({ok:true});},admin:()=>assert.fail('query cannot dispatch to admin')});
 const body={payment_id:'123',nested:{test:true}},headers={cookie:'session=test','x-nowpayments-sig':'signature',origin:'https://invemon.example'};
 const request={url:'/api/funding?path=admin&view=history&id=one&id=two',method:'POST',body,headers,query:{path:['funding']}};
 const result=await call(router,request);assert.equal(result.status,202);assert.equal(received.body,body);assert.equal(received.headers,headers);assert.equal(received.method,'POST');assert.equal(received.url,request.url);assert.equal(received.query.path,'admin');assert.deepEqual(received.query.id,['one','two']);assert.equal(received.query.view,'history');
});
test('unknown, nested, encoded and inherited property paths return JSON 404 with no-store',async()=>{
 const router=createApiRouter({account:()=>assert.fail('must not dispatch')});
 for(const url of ['/api/no-such-route','/api/account/nested','/api/%61ccount','/api/__proto__','/api/constructor','//api/account','https://example.com/api/account']){
  const result=await call(router,{url});assert.equal(result.status,404,url);assert.equal(result.headers['Cache-Control'],'no-store');
 }
});
test('real consolidated entrypoint retains auth and method denial for all protected routes',async()=>{
 for(const name of ['account','admin','balances','goals','mfa','notifications','support','withdrawals','workspace','funding']){
  const result=await call(deployed,{url:`/api/${name}`,method:'GET',headers:{}});
  assert.equal(result.status,name==='account'?200:name==='mfa'?405:401,name);
 }
 assert.equal((await call(deployed,{url:'/api/funding-ipn',method:'GET',headers:{}})).status,405);
 assert.equal((await call(deployed,{url:'/api/balances',method:'POST',headers:{}})).status,405);
});
