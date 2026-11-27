import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('.playwright',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto(`${process.env.TEST_BASE_URL||'http://localhost:5186'}/#emails`);
 const frame=page.frameLocator('iframe'),sources=new Set();
 for(const label of ['Welcome','New sign-in','Password changed','Support received','Demo saved','Test notification','Verify email','Password reset']){
  await page.getByRole('button',{name:new RegExp(label)}).click();await frame.locator('h1').waitFor();
  for(const img of await frame.locator('img').all())await img.evaluate(e=>e.decode());
  assert.equal(await frame.locator('img').count(),2);
  sources.add(await frame.locator('.email-illustration').getAttribute('src'));
  await page.setViewportSize({width:320,height:844});
  assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.setViewportSize({width:1440,height:1100});
 }
 assert.equal(sources.size,8);
 await page.getByRole('button',{name:/Welcome/}).click();await frame.locator('h1').waitFor();
 await page.screenshot({path:'.playwright/branded-email-preview.png',fullPage:true});
 console.log('PASS: eight rendered templates, homepage logo/art decode, unique images, and 320px email layouts.');
}finally{await browser.close();}
