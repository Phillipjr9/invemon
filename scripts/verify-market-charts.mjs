import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}), configs=[];
 let requests=0,fail=false;
 // Test lifecycle deterministically; this does NOT verify TradingView data or licensing.
 await page.route('https://s3.tradingview.com/**',async route=>{
  requests++;
  if(fail) return route.abort();
  await route.fulfill({contentType:'application/javascript',body:`(()=>{const s=document.currentScript;window.__chartConfig=JSON.parse(s.textContent);const f=document.createElement('iframe');f.src='about:blank';s.parentElement.append(f)})()`});
 });
 await page.goto(`${process.env.TEST_BASE_URL||'http://localhost:5175'}/#dashboard`);
 await page.getByRole('button',{name:'Explore guest portfolio'}).click();
 await page.getByRole('button',{name:'Portfolio',exact:true}).click();
 await page.locator('.db-asset-link').filter({hasText:'Apple Inc.'}).click();
 const dialog=page.getByRole('dialog');
 assert.equal(requests,0,'No third-party request before chart consent');
 assert.equal(await dialog.locator('.db-inspector-chart').count(),0,'No synthetic chart in real-chart panel');
 await dialog.getByRole('button',{name:'Load market chart'}).click();
 await dialog.locator('iframe[title="AAPL market price chart by TradingView"]').waitFor();
 configs.push(await page.evaluate(()=>window.__chartConfig));
 assert.equal(configs[0].symbol,'NASDAQ:AAPL');
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.waitForFunction(()=>window.__chartConfig?.theme==='dark');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await dialog.getByRole('button',{name:'Close asset details'}).click();
 assert.equal(await page.locator('.market-chart iframe').count(),0);
 fail=true;
 await page.locator('.db-asset-link').filter({hasText:'Apple Inc.'}).click();
 await page.getByRole('button',{name:'Load market chart'}).click();
 await page.getByRole('button',{name:'Retry chart'}).waitFor();
 assert.match(await page.locator('.market-chart').innerText(),/No sample chart is shown/);
 console.log('PASS: consent, exact symbol, theme rebuild, responsive layout, cleanup, and script failure. External data unverified.');
}finally{await browser.close();}
