import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let goals=[],failRead=false,conflict=false;
 await page.route('**/api/orders',r=>r.fulfill({json:{orders:[],accounts:[],executionEnabled:false,quoteEnabled:false}}));
 await page.route('**/api/activity**',r=>r.fulfill({json:{entries:[],nextCursor:null,unreadCount:'0'}}));
 await page.route('**/api/account',r=>r.fulfill({json:{account:{serverUserId:'goals-user',name:'Goal Owner',email:'goals@example.com',country:'United States',risk:'Balanced',plan:'Free'}}}));
 await page.route('**/api/balances**',r=>r.fulfill({json:{balances:[],entries:[],nextCursor:null}}));
 await page.route('**/api/goals',r=>{
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();if(conflict)return r.fulfill({status:409,json:{error:'Goal changed. Refresh before editing.'}});
   if(input.action==='create')goals=[{id:input.id,name:input.name,target_cents:'1250025',monthly_cents:'25000',target_date:input.targetDate,revision:1,archived:false}];
   else goals=goals.map(g=>({...g,revision:g.revision+1,...(input.action==='update'?{name:input.name}: {archived:input.action==='archive'})}));
   return r.fulfill({json:{goal:{id:input.id,revision:goals[0].revision}}});
  }
  return r.fulfill(failRead?{status:503,json:{error:'Goals service unavailable'}}:{json:{goals,limit:100,progressAvailable:false}});
 });
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';await page.goto(`${base}/#dashboard?section=goals`);await page.getByText('No goals yet',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Create goal',exact:true}).click();await page.getByLabel('Goal name',{exact:true}).fill('My home');await page.getByLabel('Target amount (USD)',{exact:true}).fill('12500.25');await page.getByLabel('Planned monthly amount (USD)',{exact:true}).fill('250.00');await page.getByLabel('Target date',{exact:true}).fill('2099-12-31');await page.getByRole('button',{name:'Save goal',exact:true}).click();await page.getByRole('heading',{name:'My home',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'My home',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit My home',exact:true}).click();await page.getByLabel('Goal name',{exact:true}).fill('My future home');conflict=true;await page.getByRole('button',{name:'Save goal',exact:true}).click();await page.getByRole('alert').filter({hasText:'Goal changed'}).waitFor();assert.equal(await page.getByLabel('Goal name',{exact:true}).inputValue(),'My future home');
 conflict=false;await page.getByRole('button',{name:'Save goal',exact:true}).click();await page.getByRole('heading',{name:'My future home',exact:true}).waitFor();page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Archive My future home',exact:true}).click();await page.getByText('No goals yet',{exact:true}).waitFor();await page.getByRole('button',{name:'Show archived goals'}).click();await page.getByRole('button',{name:'Restore My future home'}).click();await page.getByRole('button',{name:'Show active goals'}).click();await page.getByRole('heading',{name:'My future home',exact:true}).waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 failRead=true;await page.getByRole('button',{name:'Refresh goals'}).click();await page.getByRole('alert').filter({hasText:'Goals service unavailable'}).waitFor();assert.equal(await page.getByRole('heading',{name:'My future home',exact:true}).count(),0);failRead=false;await page.getByRole('button',{name:'Refresh goals'}).click();await page.getByRole('heading',{name:'My future home',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: server-backed goals UI create/edit/conflict/archive/restore/reload/error and light/dark 320–1440px. HTTP mocked.');
}finally{await browser.close();}
