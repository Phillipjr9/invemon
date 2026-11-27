import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let account=null,balanceFails=false,cryptoFails=false,passwordCalls=0,securityFails=false,hasLedgerRecords=false;
 await page.route('**/api/balances**',r=>r.fulfill(r.request().url().includes('view=activity')?{json:{entries:hasLedgerRecords?[{id:'11111111-1111-4111-8111-111111111111',created_at:'2026-11-27T10:00:00Z',reversal:false,changes:[{asset:'USD:BANK',units:'12345',decimals:2}]}]:[],nextCursor:null,notice:'Accounting entries only'}}:balanceFails?{status:503,json:{error:'Balance service unavailable'}}:{json:{balances:hasLedgerRecords?[{asset:'USD:BANK',units:'12345',reservedUnits:'2345',unreservedUnits:'10000',decimals:2},{asset:'BTC:BITCOIN',units:'123456789012345678',decimals:8}]:[],source:'ledger',liveEnabled:false}}));
 await page.route('https://s3.tradingview.com/**',r=>r.abort());
 await page.route('https://api.coinpaprika.com/**',r=>r.fulfill(cryptoFails?{status:503,json:{error:'Test provider outage'}}:{json:r.request().url().includes('/coins')?[{id:'btc-bitcoin',name:'Bitcoin',symbol:'BTC',rank:1,is_active:true,type:'coin'}]:[{id:'btc-bitcoin',name:'Bitcoin',symbol:'BTC',rank:1,quotes:{USD:{price:100,percent_change_24h:0}}}]}));
 await page.addInitScript(()=>{localStorage.setItem('invemon-account',JSON.stringify({name:'Spoofed User',email:'spoof@example.com'}));localStorage.setItem('invemon-dashboard:test@example.com',JSON.stringify({cash:999999,holdings:[{symbol:'BTC',units:100}],activity:[{title:'Fake deposit'}]}));});
 await page.route('**/api/account',async route=>{
  const input=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(input.action==='register')account={name:input.name,email:input.email,serverUserId:'customer',emailVerified:false,country:'United States',risk:'Balanced'};
  if(input.action==='password')passwordCalls++;
  if(input.action==='profile')account={...account,name:input.name,country:input.country,risk:input.risk};
  if(input.action==='delete'){await route.fulfill({status:409,json:{error:'This account has records that must be retained. Contact support.'}});return;}
  if(input.action==='security-overview'&&securityFails){await route.fulfill({status:503,json:{error:'Security overview unavailable'}});return;}
  if(input.action==='security-overview'){await route.fulfill({json:{sessions:[{id:'a'.repeat(64),created_at:'2026-11-27T10:00:00Z',expires_at:'2026-12-01T10:00:00Z',current:true}],sessionCount:1,events:[{action:'profile.updated',created_at:'2026-11-27T10:00:00Z'}]}});return;}
  await route.fulfill({json:{account}});
 });
 await page.route('**/api/mfa',r=>r.fulfill({json:{configured:false,enabled:false}}));
 let preferences={sign_in:false,support_received:true,workspace_saved:false};
 await page.route('**/api/notifications',r=>{if(r.request().method()==='POST')preferences=r.request().postDataJSON().preferences;return r.fulfill({json:{configured:false,history:[],preferences}});});
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';
 await page.goto(`${base}/#dashboard`);await page.getByRole('heading',{name:'Your next chapter.'}).waitFor();
 assert.equal(await page.getByText('Spoofed User',{exact:true}).count(),0);
 await page.goto(`${base}/#signup`);await page.getByLabel('Full name',{exact:true}).fill('Account Owner');await page.getByLabel('Email address',{exact:true}).fill('test@example.com');await page.getByLabel('Password',{exact:true}).fill('long account password!');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('heading',{name:'No recorded holdings'}).waitFor();
 await page.getByRole('region',{name:'Available cash'}).getByText('$0.00',{exact:true}).waitFor();
 await page.getByRole('contentinfo',{name:'Invemon platform footer'}).waitFor();
 for(const text of ['Fake deposit','999,999','Sample Portfolio','DEMO WORKSPACE'])assert.equal((await page.locator('body').innerText()).includes(text),false);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Account & security'}).waitFor();
 for(const name of ['Save demo to cloud','Load cloud demo','Restore sample portfolio','Open sandbox checkout'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 await page.getByLabel('Full name',{exact:true}).fill('Updated Owner');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved. This does not place orders or change an investment allocation.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Send email verification link'}).click();await page.getByRole('status').filter({hasText:'Verification link requested'}).waitFor();
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);await page.screenshot({path:'.playwright/settings-profile.png',fullPage:true});
 await page.getByLabel('Full name',{exact:true}).fill('Unsaved Owner');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Security',exact:true}).click();assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Unsaved Owner');await page.getByLabel('Full name',{exact:true}).fill('Updated Owner');
 for(const settingsSection of ['Security','Notifications','Appearance','Data & privacy','Personal profile']){
  await page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:settingsSection,exact:true}).click();
  if(settingsSection==='Security'){
   await page.getByText('This session',{exact:true}).waitFor();securityFails=true;await page.getByRole('button',{name:'Refresh sessions'}).click();await page.getByRole('alert').filter({hasText:'Security overview unavailable'}).waitFor();securityFails=false;await page.getByRole('button',{name:'Retry security overview'}).click();await page.getByText('This session',{exact:true}).waitFor();await page.getByText('Change password',{exact:true}).click();
   await page.getByLabel('Current password',{exact:true}).fill('a long secure password!');await page.getByLabel('New password',{exact:true}).fill('a different secure password!');await page.getByLabel('Confirm new password',{exact:true}).fill('a mismatched secure password!');
   await page.getByRole('button',{name:'Change password & sign out',exact:true}).click();await page.getByRole('alert').filter({hasText:'New passwords do not match.'}).waitFor();assert.equal(passwordCalls,0);
   await page.getByText('Change password',{exact:true}).click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(150);await page.screenshot({path:'.playwright/settings-security.png',fullPage:true});
  }
  if(settingsSection==='Notifications'){
   await page.getByRole('checkbox',{name:/New sign-ins/}).check();await page.getByRole('button',{name:'Save email preferences'}).click();await page.getByText('Email preferences saved.',{exact:true}).waitFor();assert.equal(preferences.sign_in,true);
  }
  if(settingsSection==='Appearance'){
   await page.getByRole('radio',{name:/Dark mode/}).check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
   await page.getByRole('radio',{name:/Light mode/}).check();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
   await page.getByRole('checkbox',{name:/Hide account balances/}).check();assert.equal(await page.evaluate(()=>localStorage.getItem('invemon-hide-balances:customer')),'true');await page.getByRole('checkbox',{name:/Hide account balances/}).uncheck();
  }
  if(settingsSection==='Data & privacy'){
   await page.getByText('Review account deletion',{exact:true}).click();await page.getByLabel('Confirm account email',{exact:true}).fill('wrong@example.com');assert.equal(await page.getByRole('button',{name:'Delete eligible account data'}).isDisabled(),true);
   await page.getByLabel('Confirm account email',{exact:true}).fill('test@example.com');await page.getByLabel('Confirm current password',{exact:true}).fill('not-a-real-password');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete eligible account data'}).click();await page.getByRole('alert').filter({hasText:'records that must be retained'}).waitFor();assert.equal(await page.getByLabel('Confirm current password',{exact:true}).inputValue(),'');
  }
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${settingsSection} settings overflow at ${width} ${theme}`);
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.getByRole('complementary',{name:'Dashboard workspace navigation'}).getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByRole('region',{name:'Portfolio summary'}).waitFor();
 await page.getByRole('tab',{name:'Passive Income',exact:true}).click();await page.getByRole('heading',{name:'No income recorded'}).waitFor();
 await page.getByRole('tab',{name:'Performance',exact:true}).click();
 for(const name of ['Withdraw','Invest','Swap','Sell'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} overview overflows at ${width}`);
 }
 await page.getByRole('button',{name:'More dashboard sections'}).click();await page.getByRole('group',{name:'More dashboard sections'}).getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Account & security'}).waitFor();
 await page.getByRole('complementary',{name:'Dashboard workspace navigation'}).getByRole('button',{name:'Overview',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 const sidebar=page.getByRole('complementary',{name:'Dashboard workspace navigation'});
 await sidebar.getByRole('button',{name:'Markets',exact:true}).click();await page.getByRole('heading',{name:'Explore assets'}).waitFor();
 await page.getByLabel('Find an asset',{exact:true}).fill('Apple');await page.locator('.asset-directory strong').filter({hasText:/^AAPL$/}).waitFor();await page.getByRole('button',{name:'View AAPL market chart'}).click();await page.getByRole('button',{name:'Load market chart'}).click();await page.getByRole('button',{name:'Retry chart'}).waitFor();await page.getByRole('button',{name:'Close asset chart'}).click();assert.equal(await page.getByText('MSFT',{exact:true}).count(),0);
 await page.getByLabel('Find an asset',{exact:true}).fill('');await page.getByLabel('Asset class',{exact:true}).selectOption('Bond ETFs');await page.locator('.asset-directory strong').filter({hasText:/^BND$/}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Portfolio',exact:true}).click();await page.getByRole('heading',{name:'Recorded asset balances',exact:true}).waitFor();await page.waitForURL('**/#dashboard?section=portfolio');hasLedgerRecords=true;await page.getByRole('button',{name:'Refresh balances'}).click();await page.getByText('1,234,567,890.12345678',{exact:true}).waitFor();await page.getByText('Reserved 23.45',{exact:true}).waitFor();await page.getByText('Unreserved 100',{exact:true}).waitFor();for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.setViewportSize({width:1440,height:1000});
 await sidebar.getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('heading',{name:'Account activity',exact:true}).waitFor();await page.getByText('+123.45',{exact:true}).waitFor();for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.setViewportSize({width:1440,height:1000});const exportEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export loaded activity'}).click();assert.equal((await exportEvent).suggestedFilename(),'invemon-loaded-ledger-activity.json');await page.waitForURL('**/#dashboard?section=activity');await page.reload();await page.getByRole('heading',{name:'Account activity',exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'Recorded asset balances',exact:true}).waitFor();hasLedgerRecords=false;await page.getByRole('button',{name:'Refresh balances'}).click();await page.getByRole('heading',{name:'No asset balances recorded'}).waitFor();
 await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Crypto',exact:true}).click();await page.getByRole('button',{name:'View Bitcoin details',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add Bitcoin to watchlist'}).click();assert.equal(await page.getByRole('button',{name:'Remove Bitcoin from watchlist'}).count(),1);
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Overview',exact:true}).click();
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.waitForTimeout(300);await page.screenshot({path:'.playwright/customer-account.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForTimeout(300);await page.screenshot({path:'.playwright/customer-account-dark.png',fullPage:true});
 balanceFails=true;await page.reload();await page.getByText('Balance unavailable. Please reload to retry.',{exact:true}).waitFor();assert.equal(await page.getByText('$0.00',{exact:true}).count(),0);balanceFails=false;await page.getByRole('button',{name:'Retry balance'}).click();await page.getByRole('region',{name:'Available cash'}).getByText('$0.00',{exact:true}).waitFor();

 // Audit every remaining workspace section through navigation and reload.
 for(const [id,label,heading] of [['yield','Yield & Income','Your income, in view'],['autoinvest','Auto-invest','Build a lasting habit'],['insights','Insights','The bigger picture']]){
  await sidebar.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  assert.equal(await page.locator('.planning-metrics .db-card').count(),4);assert.equal(await page.locator('.planning-panels .planning-panel').count(),3);
  if(id==='yield'){await page.getByRole('button',{name:'3M',exact:true}).click();await page.getByText('Income history · 3M',{exact:true}).waitFor();}
  if(id==='goals')assert.equal(await page.getByRole('button',{name:'Create goal · unavailable',exact:true}).isDisabled(),true);
  if(id==='autoinvest')assert.equal(await page.getByRole('button',{name:'New DCA plan · unavailable',exact:true}).isDisabled(),true);
  assert.equal(new URL(page.url()).hash,`#dashboard?section=${id}`);await page.reload();await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  for(const theme of ['light','dark'])for(const width of [1440,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}await page.setViewportSize({width:1440,height:1000});
 }
 await page.goto(`${base}/`);await page.getByRole('button',{name:/Contact & support/}).click();await page.waitForURL('**/#support');
 assert.equal(await page.getByRole('dialog',{name:'Account services'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: server registration/profile, ignored browser money, no simulated holdings/actions, clean Settings and 320px layout. HTTP mocked.');
}finally{await browser.close();}
