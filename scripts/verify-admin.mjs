import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let allowed=false,revision=0,decision='pending',conflict=false,posts=0;
 const id='11111111-1111-4111-8111-111111111111',customer='22222222-2222-4222-8222-222222222222';
 await page.route('**/api/orders',r=>r.fulfill({json:{orders:[],accounts:[],executionEnabled:false,quoteEnabled:false}}));
 await page.route('**/api/activity**',r=>r.fulfill({json:{entries:[],nextCursor:null,unreadCount:'0'}}));
 await page.route('**/api/account',r=>r.fulfill({json:{account:null}}));
 await page.route('**/api/admin**',r=>{
  if(!allowed)return r.fulfill({status:403,json:{error:'Funding administration requires authorized staff with verified email and MFA.'}});
  const url=new URL(r.request().url()),view=url.searchParams.get('view');
  if(r.request().method()==='POST'){
   posts++;const input=r.request().postDataJSON();assert.equal(input.currentPassword,'test password');
   if(conflict)return r.fulfill({status:409,json:{error:'This request changed. Reload before reviewing.'}});
   revision++;decision=input.decision;return r.fulfill({json:{revision,payoutInitiated:false}});
  }
  if(view==='orders')return r.fulfill({json:{orders:[{id:'execution-test',email:'customer@example.com',operation:'stock_buy',provider:'test-provider',source_asset:'USD:BANK',source_units:'2500',fee_units:'25',decimals:2,target_symbol:'TEST',state:'uncertain',funds_state:'held',created_at:'2026-11-27T10:00:00Z',claimed_at:null}]}});
  if(view==='history')return r.fulfill({json:{events:revision?[{id:'event',revision,actor_id:'staff-id',decision,note:'Reviewed test reservation',created_at:'2026-11-27T10:00:00Z'}]:[]}});
  if(view==='customers')return r.fulfill({json:{customers:[{id:customer,email:'customer@example.com',email_verified_at:'2026-11-27',created_at:'2026-11-27'}]}});
  if(view==='account')return r.fulfill({json:{customer:{id:customer,email:'customer@example.com',email_verified_at:'2026-11-27'},balances:[{asset:'USD:BANK',total_units:'10000',reserved_units:'2500',available_units:'7500',decimals:2}]}});
  return r.fulfill({json:{requests:[{id,user_id:customer,email:'customer@example.com',asset:'USD:BANK',units:'2500',decimals:2,state:decision==='rejected'?'released':'held',revision,decision,created_at:'2026-11-27T10:00:00Z'}],payoutsEnabled:false}});
 });
 await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5187'}/#admin`);await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:'Customer lookup'}).count(),0);
 allowed=true;await page.getByRole('button',{name:'Refresh admin workspace'}).click();await page.getByRole('heading',{name:'Withdrawal reviews'}).waitFor();await page.getByRole('heading',{name:'Execution recovery',exact:true}).waitFor();await page.getByText('State: uncertain · Funds: held',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Review 11111111'}).click();await page.getByText('No reviews recorded.',{exact:true}).waitFor();
 await page.getByLabel('Decision',{exact:true}).selectOption('approved');await page.getByLabel('Internal review note').fill('Reviewed test reservation');await page.getByLabel('Current password',{exact:true}).fill('test password');page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Record decision',exact:true}).click();await page.getByText('Review recorded. No payout was initiated.',{exact:true}).waitFor();assert.equal(posts,1);
 await page.getByRole('button',{name:'Review 11111111'}).click();await page.getByText('approved · revision 1',{exact:true}).waitFor();
 conflict=true;await page.getByLabel('Internal review note').fill('Keep my draft');await page.getByLabel('Current password',{exact:true}).fill('test password');await page.getByRole('button',{name:'Record decision',exact:true}).click();await page.getByRole('alert').filter({hasText:'This request changed'}).waitFor();assert.equal(await page.getByLabel('Current password',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Internal review note').inputValue(),'Keep my draft');
 await page.getByLabel('Find customer').fill('customer@');await page.getByRole('button',{name:'Search customers'}).click();await page.getByRole('button',{name:'customer@example.com',exact:true}).click();await page.getByText('Total 100 · Reserved 25 · Unreserved 75',{exact:true}).waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.getByLabel('Internal review note').fill('');await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'.playwright/admin-workspace.png',fullPage:true});
 allowed=false;await page.getByRole('button',{name:'Refresh admin workspace'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByText('customer@example.com',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: restricted admin UI, approval without payment, conflict retains note/clears password, lookup and light/dark 320–1440px. HTTP mocked.');
}finally{await browser.close();}
