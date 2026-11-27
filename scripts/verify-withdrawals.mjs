import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let enabled=false,saved=false,requested=false,cancelled=false,failRequest=true;const keys=[];
 const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
 await page.route('**/api/account',r=>r.fulfill({json:{account:null}}));
 await page.route('**/api/withdrawals',r=>{
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();
   if(input.action==='save-destination'){assert.equal(input.account,'123456789');saved=true;return r.fulfill({status:201,json:{id}});}
   if(input.action==='request'){keys.push(input.requestKey);assert.equal(input.amount,'25.00');if(failRequest){failRequest=false;return r.fulfill({status:503,json:{error:'Uncertain response'}});}requested=true;return r.fulfill({status:201,json:{id:requestId}});}
   if(input.action==='cancel'){cancelled=true;return r.fulfill({json:{cancelled:true}});}
  }
  return r.fulfill({json:{submissionEnabled:enabled,destinationStorageEnabled:true,accounts:[{id:'account',asset:'USD:BANK',available_units:requested&&!cancelled?'7500':'10000',reserved_units:requested&&!cancelled?'2500':'0',decimals:2}],destinations:saved?[{id,label:'My bank',asset:'USD:BANK',kind:'ach',masked:'ACH · …6789'}]:[],requests:requested?[{id:requestId,asset:'USD:BANK',units:'2500',decimals:2,state:cancelled?'released':'held',decision:'pending',label:'My bank',masked:'ACH · …6789',created_at:'2026-11-27T10:00:00Z'}]:[]}});
 });
 await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5187'}/#withdrawals`);await page.getByRole('heading',{name:'Saved destinations'}).waitFor();assert.equal(await page.getByRole('button',{name:'Submit withdrawal request'}).isDisabled(),true);
 await page.getByText('Add a destination',{exact:true}).click();await page.getByLabel('Destination label').fill('My bank');await page.getByLabel('Destination method',{exact:true}).selectOption('ach');await page.getByLabel('Destination asset',{exact:true}).selectOption('USD:BANK');
 for(const [name,value]of [['Account holder','Test Customer'],['Bank name','Test bank'],['US routing number','021000021'],['Bank account number','123456789'],['Confirm password to save destination','test password']])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Save destination',exact:true}).click();await page.getByText('Destination saved. No payment was sent.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Confirm password to save destination').inputValue(),'');assert.equal(await page.getByLabel('Bank account number',{exact:true}).inputValue(),'');
 enabled=true;await page.getByRole('button',{name:'Refresh withdrawals'}).click();await page.getByRole('button',{name:'Submit withdrawal request'}).waitFor();await page.getByLabel('Payout destination',{exact:true}).selectOption(id);await page.getByLabel('Withdrawal amount',{exact:true}).fill('25.00');await page.getByLabel('Confirm password for withdrawal').fill('test password');page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Submit withdrawal request'}).click();await page.getByRole('alert').filter({hasText:'Uncertain response'}).waitFor();assert.equal(await page.getByLabel('Withdrawal amount',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Confirm password for withdrawal').inputValue(),'');await page.getByLabel('Confirm password for withdrawal').fill('test password');await page.getByRole('button',{name:'Retry same withdrawal request'}).click();await page.getByText('Pending review',{exact:true}).waitFor();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 await page.getByRole('button',{name:'Cancel request',exact:true}).click();await page.getByLabel('Password to cancel withdrawal').fill('test password');await page.getByRole('button',{name:'Confirm cancellation',exact:true}).click();await page.getByText('Cancelled',{exact:true}).waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('PASS: withdrawal disabled gate, destination save/field clearing, stable-key retry, cancellation and light/dark 320–1440px. HTTP mocked.');
}finally{await browser.close();}
