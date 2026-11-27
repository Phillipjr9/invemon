// UI contract only. Provider and database behavior are tested separately.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('.playwright',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';let signed=false;
 const account={serverUserId:'test-funding',email:'test@example.com',name:'Funding Tester',country:'United States',risk:'Balanced',plan:'Free'};
 await page.route('**/api/account',r=>r.fulfill({json:{account:signed?account:null}}));
 await page.route('**/api/workspace',r=>r.fulfill({json:{workspace:null}}));
 await page.route('**/api/mfa',r=>r.fulfill({json:{configured:false,enabled:false,recoveryCodesRemaining:0}}));
 await page.route('**/api/notifications',r=>r.fulfill({json:{configured:false,history:[],preferences:{}}}));
 await page.route('**/api/funding',r=>r.fulfill({json:{configured:true,environment:'production',liveEnabled:false,requests:[]}}));
 await page.goto(`${base}/#funding`);await page.getByRole('heading',{name:'Sign in to view your funding requests'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Open sandbox checkout'}).count(),0);
 signed=true;await page.reload();await page.getByText('No production funding requests recorded. No balance is inferred from browser storage.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Live deposits unavailable'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Open sandbox checkout'}).count(),0);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'.playwright/funding-page.png',fullPage:true});
 await page.goto(`${base}/#dashboard`);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Account & security'}).waitFor();
 assert.equal(await page.getByText('Funding setup · sandbox only',{exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Open sandbox checkout'}).count(),0);
 // Header deposit action now navigates to dedicated page, never the simulated receipt.
 const deposit=page.getByRole('link',{name:/Deposit/}).first();await deposit.click();
 await page.waitForURL('**/#funding');assert.equal(await page.getByText('SAMPLE TRANSACTION COMPLETE',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: funding auth UI, held-payment history, live disabled, isolated Settings, dedicated deposit navigation, 320–1440px layout. HTTP mocked.');
}finally{await browser.close();}
