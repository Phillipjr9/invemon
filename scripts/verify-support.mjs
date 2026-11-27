import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',err=>errors.push(err.message));
 const id='11111111-1111-4111-8111-111111111111';
 const account={serverUserId:'customer',name:'Taylor',email:'taylor@example.com',plan:'Free',risk:'Balanced',country:'United States'};
 const ticket={id,subject:'Workspace question',message:'How can I load my saved workspace?',status:'open',revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
 const messages=[];let staff=false,conflict=false,submissions=[];
 await page.route('**/api/account',route=>route.fulfill({json:{account}}));
 await page.route('**/api/support*',async route=>{
  const req=route.request();
  if(req.method()==='GET')return route.fulfill({json:req.url().includes('?id=')?{staff,ticket,messages}:{staff,tickets:[{...ticket,...(staff?{customer_email:account.email}:{})}]}});
  const input=req.postDataJSON();submissions.push(input);
  if(conflict)return route.fulfill({status:409,json:{error:'This request changed on another device. Reload before replying.'}});
  ticket.revision++;
  if(input.action==='status')ticket.status=input.status;
  else messages.push({id:`note-${ticket.revision}`,actor_role:staff?'staff':'customer',message:input.message,visibility:input.visibility,created_at:new Date().toISOString()});
  return route.fulfill({json:{ticket}});
 });
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5187';
 await page.goto(`${base}/#support`);
 await page.getByRole('button',{name:/Workspace question/}).click();
 await page.getByText('How can I load my saved workspace?',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Visibility',{exact:true}).count(),0);
 await page.getByLabel('Reply',{exact:true}).fill('<img src=x onerror="window.__xss=true"> Can you help?');
 await page.getByRole('button',{name:'Send reply',exact:true}).click();
 await page.getByText('<img src=x onerror="window.__xss=true"> Can you help?',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.equal(await page.locator('.support-message img').count(),0);
 conflict=true;
 await page.getByLabel('Reply',{exact:true}).fill('A second reply.');
 await page.getByRole('button',{name:'Send reply',exact:true}).click();
 await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Reply',{exact:true}).inputValue(),'A second reply.');
 assert.equal(submissions.at(-1).revision,ticket.revision);
 conflict=false;staff=true;
 await page.reload();await page.getByRole('heading',{name:'Support desk.'}).waitFor();
 await page.getByRole('button',{name:/Workspace question/}).click();
 await page.getByLabel('Visibility',{exact:true}).selectOption('internal');
 await page.getByLabel('Internal note',{exact:true}).fill('Private staff diagnostic');
 await page.getByLabel('Confirm staff password',{exact:true}).fill('example long password');
 await page.getByRole('button',{name:'Save internal note'}).click();
 await page.getByText('Private staff diagnostic',{exact:true}).waitFor();
 assert.equal(submissions.at(-1).visibility,'internal');assert.equal(await page.getByLabel('Confirm staff password',{exact:true}).inputValue(),'');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Support overflow ${theme} ${width}`);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: customer/staff support UI, plain-text replies, conflict retains draft, internal notes, password clearing, light/dark 320–1440px. HTTP mocked; access isolation tested at API layer.');
}finally{await browser.close();}
