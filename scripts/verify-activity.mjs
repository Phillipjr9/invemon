import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let read=false,failRead=false;
 const entry={id:'review:11111111-1111-4111-8111-111111111111',reference:'request-id',created_at:'2026-11-27T10:00:00Z',kind:'withdrawal_approved',title:'Withdrawal approved',description:'Funds remain reserved. Approval is not payment.',destination:'withdrawals',amounts:[]};
 await page.route('**/api/account',r=>r.fulfill({json:{account:{serverUserId:'activity-user',name:'Account Owner',email:'activity@example.com',plan:'Free',country:'United States',risk:'Balanced'}}}));
 await page.route('**/api/balances**',r=>r.fulfill({json:{balances:[],entries:[],nextCursor:null}}));
 await page.route('**/api/activity**',r=>{
  if(r.request().method()==='POST'){read=true;return r.fulfill({json:{ok:true}});}
  if(failRead)return r.fulfill({status:503,json:{error:'Activity temporarily unavailable'}});
  return r.fulfill({json:{entries:[{...entry,read}],nextCursor:null,unreadCount:read?'0':'1'}});
 });
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';await page.goto(`${base}/#dashboard?section=activity`);const timeline=page.getByRole('region',{name:'Unified account timeline'}); // section uses aria-label, hence region
 await timeline.getByText('Withdrawal approved',{exact:true}).waitFor();await timeline.getByText('Funds remain reserved. Approval is not payment.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Notifications, 1 unread',exact:true}).click();await page.getByRole('button',{name:'View activity',exact:true}).click();await page.getByRole('button',{name:'Notifications',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'Notifications',exact:true}).waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 failRead=true;await timeline.getByRole('button',{name:'Refresh timeline'}).click();await timeline.getByRole('alert').waitFor();failRead=false;await timeline.getByRole('button',{name:'Refresh timeline'}).click();await timeline.getByText('Withdrawal approved',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: unified timeline, approval-not-payment, persistent header reads, error/retry and light/dark 320–1440px. HTTP mocked.');
}finally{await browser.close();}
