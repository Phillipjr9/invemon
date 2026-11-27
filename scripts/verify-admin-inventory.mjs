import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());let posts=0,conflict=false;
 const pair={id:'11111111-1111-4111-8111-111111111111',revision:1,source_asset:'USD:BANK',target_asset:'BTC:BITCOIN',source_inventory:'usd-pool',target_inventory:'btc-pool',rate_numerator:'1',rate_denominator:'10',fee_bps:100,min_units:'1',max_units:'10000',valid_until:new Date(Date.now()+3600000).toISOString(),enabled:true};
 await page.route('**/api/account',r=>r.fulfill({json:{account:null}}));
 await page.route('**/api/admin**',r=>{
  const view=new URL(r.request().url()).searchParams.get('view');
  if(r.request().method()==='POST'){
   const input=r.request().postDataJSON();posts++;assert.equal(input.currentPassword,'test password');assert.equal(input.action,'inventory');
   if(conflict)return r.fulfill({status:409,json:{error:'This pair changed. Reload and review the latest revision before saving.'}});
   assert.equal(input.config.enabled,false);assert.equal(input.revision,1);pair.enabled=false;pair.revision++;return r.fulfill({json:{saved:true,creditPosted:false,id:pair.id}});
  }
  if(view==='inventory')return r.fulfill({json:{assets:[{code:'USD:BANK',decimals:2,kind:'cash'},{code:'BTC:BITCOIN',decimals:8,kind:'crypto'}],inventories:[{id:'usd-pool',asset:'USD:BANK',units:'0',decimals:2},{id:'btc-pool',asset:'BTC:BITCOIN',units:'1000',decimals:8}],pairs:[pair],events:[],tradingEnabled:false}});
  if(view==='orders')return r.fulfill({json:{orders:[]}});
  return r.fulfill({json:{requests:[]}});
 });
 await page.goto(`${process.env.SERVER_TEST_BASE_URL||'http://localhost:5187'}/#admin`);
 const region=page.getByRole('region',{name:'Internal trading administration'});
 await region.getByRole('button',{name:'Edit USD:BANK to BTC:BITCOIN'}).click();assert.equal(await region.getByLabel('Source asset',{exact:true}).isDisabled(),true);
 await region.getByText('1 USD:BANK → 0.0000001 BTC:BITCOIN before source fee (rounded down).',{exact:true}).waitFor();
 await region.getByLabel('Enable this directed pair').uncheck();await region.getByLabel('Inventory audit note').fill('Pause test pricing');await region.getByLabel('Password for inventory change').fill('test password');await region.getByRole('button',{name:'Save inventory operation'}).click();await region.getByText('Inventory operation recorded. No funds credited or external transfer sent.',{exact:true}).waitFor();assert.equal(posts,1);assert.equal(await region.getByLabel('Password for inventory change').inputValue(),'');
 await region.getByRole('button',{name:'Edit USD:BANK to BTC:BITCOIN'}).click();conflict=true;await region.getByLabel('Inventory audit note').fill('Retain this draft');await region.getByLabel('Password for inventory change').fill('test password');await region.getByRole('button',{name:'Save inventory operation'}).click();await region.getByRole('alert').waitFor();assert.equal(await region.getByLabel('Password for inventory change').inputValue(),'');assert.equal(await region.getByLabel('Inventory audit note').inputValue(),'Retain this draft');
 await region.getByLabel('Inventory audit note').fill('');await region.getByLabel('Inventory operation',{exact:true}).selectOption('inventory.evidence');await region.getByText('Reference only—not verified, not reserve attestation, and not a credit instruction. Use an internal reconciliation ticket, not secrets or identity documents.',{exact:true}).waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.setViewportSize({width,height:1050});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('PASS: inventory admin policy disable, rate preview, immutable mapping, stale conflict/draft/password, evidence disclaimer and responsive themes. HTTP mocked.');
}finally{await browser.close();}
