import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.TEST_BASE_URL||'http://localhost:5173'}/#emails`);
 const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'A little more perspective.'}).waitFor();
 await frame.locator('img.email-illustration').evaluate(img=>img.decode());
 await page.screenshot({path:'.playwright/email-studio-desktop.png',fullPage:true});
 for(const label of ['Verify email','Password reset','New sign-in','Password changed','Support received','Demo saved','Test notification','Welcome']){
  await page.getByRole('button',{name:new RegExp(label)}).click();await frame.locator('h1').waitFor();assert.ok((await frame.locator('h1').innerText()).length>5);assert.equal(await frame.locator('script').count(),0);
 }
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await frame.locator('img.email-illustration').evaluate(e=>getComputedStyle(e).display),'block');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`.playwright/email-studio-${width}.png`,fullPage:true});}
 await page.getByRole('button',{name:'Dark mode',exact:true}).click();await page.screenshot({path:'.playwright/email-studio-dark.png',fullPage:true});
 // Separate server-mode contract: HTTP is mocked, delivery/SQL behavior is in test:emails.
 const account={serverUserId:'email-test',name:'Alex Morgan',email:'alex@example.com',plan:'Free',country:'United States',risk:'Balanced'};
 let preferences={sign_in:false,support_received:true,workspace_saved:false};let history=[];
 await page.route('**/api/account',route=>route.fulfill({json:{account}}));
 await page.route('**/api/workspace',route=>route.fulfill({json:{workspace:null}}));
 await page.route('**/api/notifications',async route=>{
  if(route.request().method()==='POST'){
   const data=route.request().postDataJSON();assert.equal(data.to,undefined);
   if(data.action==='preferences'){preferences=data.preferences;await route.fulfill({json:{preferences}});return;}
   history=[{id:'preview-1',type:'preview',status:'accepted',created_at:new Date().toISOString()}];await route.fulfill({status:202,json:{status:'accepted'}});return;
  }
  await route.fulfill({json:{configured:true,preferences,history}});
 });
 await page.setViewportSize({width:1440,height:1000});await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5174'}/#dashboard`);await page.getByRole('button',{name:'Settings',exact:true}).click();
 const panel=page.locator('.db-card').filter({has:page.getByRole('heading',{name:'Email notifications',exact:true})});
 await panel.getByRole('checkbox',{name:/New sign-ins/}).check();await panel.getByRole('button',{name:'Save email preferences',exact:true}).click();await panel.getByText('Email preferences saved.',{exact:true}).waitFor();assert.equal(preferences.sign_in,true);
 await panel.getByRole('button',{name:'Email me a preview'}).click();await panel.getByText('Preview accepted by the email provider. Inbox delivery is not yet confirmed.',{exact:true}).waitFor();await panel.locator('summary').click();await panel.getByText('Accepted by provider',{exact:true}).waitFor();
 await panel.screenshot({path:'.playwright/email-settings.png'});
 assert.deepEqual(errors,[]);console.log('PASS: eight email specimens, loaded 3D art, no scripts, motion-free illustrations, 320/390px layouts, dark studio, notification preferences and self-preview contract. Provider HTTP mocked; no emails sent.');
}finally{await browser.close();}
