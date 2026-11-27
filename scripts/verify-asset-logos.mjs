import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
try {
 const page = await browser.newPage();
 const base = process.env.TEST_BASE_URL || 'http://localhost:5175';
 await page.goto(base);
 const paths = ['asset-logos', 'crypto-logos'].flatMap(dir => fs.readdirSync(`public/assets/${dir}`).filter(n => n.endsWith('.png')).map(n => `/assets/${dir}/${n}`));
 const failed = await page.evaluate(async paths => {
  const failures = [];
  for (let i = 0; i < paths.length; i += 24) await Promise.all(paths.slice(i,i+24).map(src => new Promise(resolve => {
   const img = new Image(); img.onload = () => { if (!img.naturalWidth) failures.push(src); resolve(); }; img.onerror = () => { failures.push(src); resolve(); }; img.src = src;
  })));
  return failures;
 }, paths);
 assert.deepEqual(failed, []);
 // A successfully decoded white-on-transparent image can still be invisible.
 const lowContrast = await page.evaluate(async paths => {
  const invisible = [];
  for (const src of paths.filter(p => p.includes('/asset-logos/'))) {
   const img = new Image(); img.src = src; await img.decode();
   const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
   const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
   const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
   let visible = 0, ink = 0;
   for (let i = 0; i < pixels.length; i += 4) if (pixels[i+3] > 128) {
    visible++; if (Math.min(pixels[i],pixels[i+1],pixels[i+2]) < 200) ink++;
   }
   if (!visible || ink / visible < .05) invisible.push(src);
  }
  return invisible;
 }, paths);
 assert.deepEqual(lowContrast, [], 'Stock marks must be visible against white badges');
 await page.locator('.asset-logo img').first().waitFor();
 await page.waitForFunction(() => [...document.querySelectorAll('.asset-logo img')].every(img => img.complete && img.naturalWidth > 0));
 await page.route('**/assets/asset-logos/AAPL.png', route => route.abort());
 await page.reload();
 await page.waitForFunction(() => [...document.querySelectorAll('.asset-logo-fallback')].some(el => el.textContent === 'AAPL' && getComputedStyle(el).visibility === 'visible'));
 assert.equal(await page.locator('.asset-logo img[src$="AAPL.png"]').count(), 0);

 await page.unrouteAll();
 await page.goto(`${base}/#dashboard`);
 await page.getByRole('button', { name: 'Explore guest portfolio' }).click();
 await page.getByRole('region', { name: 'Portfolio summary', exact: true }).waitFor();
 const checkLogos = async selector => {
  const result = await page.locator(selector).evaluateAll(async rows => {
   const failed = [];
   for (const row of rows) {
    const img = row.querySelector('.asset-logo img');
    if (!img) { failed.push(row.textContent); continue; }
    try { await img.decode(); } catch { failed.push(row.textContent); continue; }
    const rect = img.getBoundingClientRect();
    if (!img.naturalWidth || rect.width < 10 || rect.height < 10 || getComputedStyle(img).opacity !== '1') failed.push(row.textContent);
   }
   return { count: rows.length, failed };
  });
  assert.ok(result.count > 0, `No rows for ${selector}`);
  assert.deepEqual(result.failed, [], `Missing visible logo: ${selector}`);
 };
 // Check both overview cards, not just the logo file endpoint.
 await checkLogos('.db-list .db-asset-link');
 await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
 await checkLogos('.db-table .db-asset-link');
 await page.getByRole('button', { name: 'Markets', exact: true }).click();
 await checkLogos('.db-table .db-asset-link');
 await page.setViewportSize({ width: 390, height: 844 });
 await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
 await checkLogos('.db-table .db-asset-link');
 console.log('PASS: overview holdings/watchlist, portfolio and market rows all have visible images, including mobile dark mode.');
 console.log(`PASS: ${paths.length} PNGs decoded; real logos render; failed image falls back without a broken glyph.`);
} finally { await browser.close(); }
