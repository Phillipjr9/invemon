import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.goto(`${process.env.TEST_BASE_URL||'http://localhost:5173'}/#dashboard`);await page.getByRole('button',{name:'Explore guest portfolio'}).click();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('invemon-dashboard:alex.morgan@invemon.com')));
 const total=s=>s.cash+s.holdings.reduce((a,h)=>a+h.price*h.units,0);const before=await saved();
 await page.getByRole('button',{name:'Goals',exact:true}).click();
 await page.locator('.db-card').filter({has:page.getByRole('heading',{name:'Long-term growth',exact:true})}).getByRole('button',{name:'Contribute',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Amount (USD)').fill('100');await dialog.getByRole('button',{name:'Review contribution',exact:true}).click();await dialog.getByRole('button',{name:'Confirm contribution',exact:true}).click();await dialog.getByRole('button',{name:'Done',exact:true}).waitFor();
 let after=await saved();assert.equal(after.cash,before.cash);assert.equal(total(after),total(before));assert.equal(after.goals[0].saved,before.goals[0].saved+100);await dialog.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Auto-invest',exact:true}).click();await page.getByRole('button',{name:'New DCA plan'}).click();await page.getByLabel('Plan name',{exact:true}).fill('Weekly accounting test');await page.locator('.db-inline-creator select').nth(1).selectOption('Weekly');await page.getByLabel('Amount (USD)',{exact:true}).fill('100');await page.getByRole('button',{name:'Save plan',exact:true}).click();
 const sum=before.plans.filter(p=>p.active).reduce((s,p)=>s+p.amount*(p.frequency==='Weekly'?52/12:p.frequency==='Bi-weekly'?26/12:1),0)+100*52/12;
 const summary=page.locator('.db-card').filter({has:page.getByText('Monthly-equivalent scheduled DCA',{exact:true})});assert.match(await summary.innerText(),new RegExp(sum.toLocaleString('en-US',{style:'currency',currency:'USD'}).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 console.log('PASS: goal earmarks conserve cash and wealth, progress increases once, and weekly schedules display annualized monthly equivalents.');
}finally{await browser.close();}
