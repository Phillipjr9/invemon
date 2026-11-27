import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});let traded=false;
 await page.route('**/api/account',r=>r.fulfill({json:{account:{serverUserId:'test-inventory',name:'Inventory Owner',email:'inventory@example.com',plan:'Free',country:'United States',risk:'Balanced'}}}));
 await page.route('**/api/activity**',r=>r.fulfill({json:{entries:[],nextCursor:null,unreadCount:'0'}}));
 await page.route('**/api/balances**',r=>r.fulfill({json:{balances:[],entries:[],nextCursor:null}}));
 const quote={id:'test-quote',source_asset:'USD:BANK',target_asset:'BTC:BITCOIN',source_units:'1000',fee_units:'10',target_units:'100',source_decimals:2,target_decimals:8,expires_at:new Date(Date.now()+30000).toISOString()};
 await page.route('**/api/inventory-trading',r=>{
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();if(input.action==='quote'){assert.equal(input.amount,'10.00');return r.fulfill({status:201,json:{quote}});}
   assert.equal(input.quoteId,'test-quote');assert.equal(input.currentPassword,'test password');traded=true;return r.fulfill({json:{settled:true,externalTransfer:false,journalId:'test-journal'}});
  }
  return r.fulfill({json:{enabled:true,pairs:[{id:'pair',source_asset:'USD:BANK',target_asset:'BTC:BITCOIN',fee_bps:100,source_decimals:2}],trades:traded?[{...quote,created_at:new Date().toISOString(),journal_id:'test-journal'}]:[]}});
 });
 await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5187'}/#dashboard?section=portfolio`);await page.getByLabel('Internal trading pair',{exact:true}).selectOption('pair');await page.getByLabel('Source amount',{exact:true}).fill('10.00');await page.getByRole('button',{name:'Get internal quote',exact:true}).click();await page.getByRole('heading',{name:'Review your quote'}).waitFor();await page.getByText('Total debit: 10.1 USD:BANK',{exact:true}).waitFor();await page.getByLabel('Password to confirm internal trade',{exact:true}).fill('test password');await page.getByRole('button',{name:'Confirm internal trade',exact:true}).click();await page.getByText('Internal crypto trade settled. No external transfer was sent.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Password to confirm internal trade').count(),0);
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 console.log('PASS: internal inventory quote disclosure/confirmation/history/password clearing and responsive themes. HTTP mocked.');
}finally{await browser.close();}
