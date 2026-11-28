import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import policies from '../shared/legal-policies.json' with {type:'json'};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let posts=0,payload;
 await context.route('**/api/account',r=>{
  if(r.request().method()==='POST'){posts++;payload=r.request().postDataJSON();return r.fulfill({status:409,json:{error:'Test response: policy version changed. Reload signup.'}});}
  return r.fulfill({json:{account:null}});
 });
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';
 await page.goto(`${base}/#signup`);await page.getByLabel('Full name',{exact:true}).fill('Policy Reader');await page.getByLabel('Email address',{exact:true}).fill('reader@example.com');await page.getByLabel('Password',{exact:true}).fill('long testing password!');
 const boxes=page.locator('.signup-legal input[type=checkbox]');assert.equal(await boxes.count(),4);assert.equal(await boxes.evaluateAll(els=>els.some(e=>e.checked)),false);
 await page.getByRole('button',{name:'Create account',exact:true}).click();assert.equal(posts,0);
 const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'Terms of Service',exact:true}).click();const popup=await popupPromise;await popup.getByRole('heading',{name:'Terms of Service',exact:true}).waitFor();assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Policy Reader');await popup.close();
 for(let i=0;i<3;i++)await boxes.nth(i).check();await page.getByRole('button',{name:'Create account',exact:true}).click();assert.equal(posts,0);await boxes.nth(3).check();await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(posts,1);for(const key of ['termsAccepted','privacyAcknowledged','riskAcknowledged','adultConfirmed'])assert.equal(payload[key],true);assert.equal(payload.policyVersion,policies.version);
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 for(const document of policies.documents){await page.goto(`${base}/#${document.id}`);await page.getByRole('heading',{name:document.title,exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:document.title,exact:true}).evaluate(el=>el===window.document.activeElement),true);assert.equal(await page.locator('article>section').count(),document.sections.length);for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>window.document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>window.document.documentElement.scrollWidth>innerWidth),false);}}
 assert.deepEqual(errors,[]);console.log('PASS: public legal pages, new-tab policy links preserve signup, unchecked required acknowledgments, explicit boolean/version payload, focus and responsive themes. HTTP mocked.');
}finally{await browser.close();}
