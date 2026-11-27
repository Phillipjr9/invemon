import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_BASE_URL || 'http://localhost:5173');
 const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
 assert.equal(await theme(),'dark');
 const toggle=page.getByRole('button',{name:'Dark mode',exact:true});
 assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 await page.screenshot({path:'.playwright/theme-home.png'});
 await toggle.click();assert.equal(await theme(),'light');
 await page.reload();assert.equal(await theme(),'light');
 await page.emulateMedia({colorScheme:'dark'});assert.equal(await theme(),'light');
 await toggle.click();await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#login`);
 assert.equal(await theme(),'dark');await page.screenshot({path:'.playwright/theme-login.png'});
 await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#signup`);assert.equal(await theme(),'dark');await page.screenshot({path:'.playwright/theme-signup.png'});
 await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#dashboard`);
 await page.getByRole('button',{name:'Explore guest portfolio'}).click();
 await page.screenshot({path:'.playwright/theme-dashboard.png'});
 await page.getByRole('button',{name:'Add money',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.tx-sheet')).opacity==='1');
 await page.screenshot({path:'.playwright/theme-funding.png'});
 await dialog.getByRole('button',{name:'Review deposit',exact:true}).click();
 await dialog.getByRole('button',{name:'Confirm deposit',exact:true}).click();
 await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();
 assert.equal(await theme(),'dark');
 await dialog.getByRole('button',{name:'Done',exact:true}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`.playwright/theme-${width}.png`});}
 await page.evaluate(()=>localStorage.removeItem('invemon-theme'));await page.reload();assert.equal(await theme(),'dark');
 await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 assert.deepEqual(errors,[]);
 console.log('PASS: system preference, toggle, persisted preference, system changes, all routes, funding modal, mobile layout, no runtime errors.');
}finally{await browser.close();}
