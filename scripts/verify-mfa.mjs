import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});let signed=false;const calls=[];
 const account={serverUserId:'mfa-test',name:'Security Tester',email:'mfa@example.com',plan:'Free',risk:'Balanced',country:'United States',emailVerified:true,mfaEnabled:false};
 await page.route('**/api/account',async route=>{const input=route.request().method==='GET'?null:route.request().postDataJSON();if(input)calls.push(input);if(input?.action==='security-overview'){await route.fulfill({json:{sessions:[],sessionCount:0,events:[]}});return;}if(input?.action==='login'&&input.code==='123456')signed=true;await route.fulfill({json:input?.action==='login'&&!signed?{mfaRequired:true}:{account:signed?account:null}});});
 await page.route('**/api/workspace',route=>route.fulfill({json:{workspace:null}}));
 await page.route('**/api/mfa',async route=>{const input=route.request().postDataJSON();calls.push(input);let result={enabled:false,configured:true,recoveryCodesRemaining:0};if(input.action==='setup')result={secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/Invemon:test?secret=JBSWY3DPEHPK3PXP&issuer=Invemon'};if(input.action==='confirm')result={enabled:true,recoveryCodes:['01234567-89abcdef-01234567-89abcdef']};await route.fulfill({json:result});});
 await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5187'}/#login`);
 await page.getByLabel('Email address',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill('long test password!');await page.getByRole('button',{name:'Log in',exact:true}).click();
 await page.getByLabel('Authenticator or recovery code').fill('123456');assert.equal(signed,false);
 await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'No recorded holdings'}).waitFor();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Security',exact:true}).click();await page.getByText('Authenticator & recovery codes',{exact:true}).click();
 await page.getByLabel('Confirm password',{exact:true}).fill('long test password!');await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();
 await page.getByAltText('Authenticator enrollment QR code containing your private setup key').waitFor();
 await page.getByLabel('Confirm password',{exact:true}).fill('long test password!');await page.getByLabel('Current authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Confirm authenticator',exact:true}).click();
 await page.getByRole('heading',{name:'Save these recovery codes now'}).waitFor();assert.equal(calls.at(-1).action,'confirm');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'I have saved my recovery codes'}).click();await page.getByRole('button',{name:'Replace recovery codes'}).waitFor();
 console.log('PASS: MFA login challenge, local QR enrollment, recovery acknowledgement, and mobile layout (HTTP mocked).');
}finally{await browser.close();}
