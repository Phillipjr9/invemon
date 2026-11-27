import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let account=null;
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
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.playwright/customer-account.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: server registration/profile, ignored browser money, no simulated holdings/actions, clean Settings and 320px layout. HTTP mocked.');
}finally{await browser.close();}
