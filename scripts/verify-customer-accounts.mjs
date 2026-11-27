import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let account=null,balanceFails=false,cryptoFails=false;
 await page.route('**/api/balances',r=>r.fulfill(balanceFails?{status:503,json:{error:'Balance service unavailable'}}:{json:{balances:[],source:'ledger',liveEnabled:false}}));
 await page.route('https://api.coinpaprika.com/**',r=>r.fulfill(cryptoFails?{status:503,json:{error:'Test provider outage'}}:{json:r.request().url().includes('/coins')?[{id:'btc-bitcoin',name:'Bitcoin',symbol:'BTC',rank:1,is_active:true,type:'coin'}]:[{id:'btc-bitcoin',name:'Bitcoin',symbol:'BTC',rank:1,quotes:{USD:{price:100,percent_change_24h:0}}}]}));
 await page.addInitScript(()=>{localStorage.setItem('invemon-account',JSON.stringify({name:'Spoofed User',email:'spoof@example.com'}));localStorage.setItem('invemon-dashboard:test@example.com',JSON.stringify({cash:999999,holdings:[{symbol:'BTC',units:100}],activity:[{title:'Fake deposit'}]}));});
 await page.route('**/api/account',async route=>{
  const input=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(input.action==='register')account={name:input.name,email:input.email,serverUserId:'customer',emailVerified:false,country:'United States'};
  if(input.action==='profile')account={...account,name:input.name};
  await route.fulfill({json:{account}});
 });
 await page.route('**/api/mfa',r=>r.fulfill({json:{configured:false,enabled:false}}));
 await page.route('**/api/notifications',r=>r.fulfill({json:{configured:false,history:[],preferences:{}}}));
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
 await page.getByLabel('Find an asset',{exact:true}).fill('Apple');await page.locator('.asset-directory strong').filter({hasText:/^AAPL$/}).waitFor();assert.equal(await page.getByText('MSFT',{exact:true}).count(),0);
 await page.getByLabel('Find an asset',{exact:true}).fill('');await page.getByLabel('Asset class',{exact:true}).selectOption('Bond ETFs');await page.locator('.asset-directory strong').filter({hasText:/^BND$/}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Crypto',exact:true}).click();await page.getByRole('button',{name:'View Bitcoin details',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add Bitcoin to watchlist'}).click();assert.equal(await page.getByRole('button',{name:'Remove Bitcoin from watchlist'}).count(),1);
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:1440,height:1000});await sidebar.getByRole('button',{name:'Overview',exact:true}).click();
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.waitForTimeout(300);await page.screenshot({path:'.playwright/customer-account.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForTimeout(300);await page.screenshot({path:'.playwright/customer-account-dark.png',fullPage:true});
 balanceFails=true;await page.reload();await page.getByText('Balance unavailable. Please reload to retry.',{exact:true}).waitFor();assert.equal(await page.getByText('$0.00',{exact:true}).count(),0);

 assert.deepEqual(errors,[]);console.log('PASS: server registration/profile, ignored browser money, no simulated holdings/actions, clean Settings and 320px layout. HTTP mocked.');
}finally{await browser.close();}
