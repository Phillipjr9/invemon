// Browser contract test with mocked HTTP; SQL/API isolation is tested separately.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let signedIn=false,workspace=null;
 const account={serverUserId:'test-account',name:'Taylor Investor',email:'taylor@example.com',plan:'Free',risk:'Growth',country:'United States',emailVerified:false};
 await page.addInitScript(()=>localStorage.setItem('invemon-account',JSON.stringify({name:'Spoofed session',email:'spoof@example.com'})));
 await page.route('**/api/account',async route=>{
  const req=route.request(), input=req.method()==='GET'?null:req.postDataJSON();let status=200,result={account:signedIn?account:null};
  if(input?.action==='login'){if(input.password==='invalid'){status=401;result={error:'Email or password not recognized.'};}else{signedIn=true;result={account};}}
  if(input?.action==='register'){signedIn=true;result={account};}
  if(input?.action==='profile'){account.name=input.name;account.risk=input.risk;result={account};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.route('**/api/workspace',async route=>{const req=route.request();if(req.method()==='PUT'){const input=req.postDataJSON();workspace={revision:(workspace?.revision||0)+1,snapshot:input.snapshot};await route.fulfill({json:{revision:workspace.revision}});}else await route.fulfill({json:{workspace}});});
 const base=process.env.SERVER_TEST_BASE_URL||'http://localhost:5174';
 await page.goto(`${base}/#login`);await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill('invalid');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/not recognized/);
 await page.getByRole('button',{name:'New to Invemon? Create an account'}).click();
 await page.getByLabel('Full name',{exact:true}).fill(account.name);await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill('a long unique password!');await page.getByRole('checkbox').check();
 await page.screenshot({path:'.playwright/server-signup.png'});
 await page.getByRole('button',{name:'Create account',exact:true}).click();await page.locator('.db-overview-stage').waitFor();assert.equal(await page.getByText('Spoofed session',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'Account & security'}).waitFor();
 await page.getByRole('button',{name:'Save demo to cloud'}).click();await page.getByText('Demo workspace saved to your account.',{exact:true}).waitFor();assert.ok(workspace.snapshot.holdings.length>0);
 await page.getByLabel('Full name',{exact:true}).fill('Taylor Updated');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByText('Profile saved. Your allocation policy now follows this risk profile.',{exact:true}).waitFor();
 await page.screenshot({path:'.playwright/server-settings.png'});
 await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Taylor Updated');
 await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'.playwright/server-settings-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: server-mode registration/login contract, error states, spoofed local account ignored, profile, cloud save, session restoration and 320px layout. HTTP mocked; API tested separately against PGlite.');
}finally{await browser.close();}
