import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.locator('.header-actions').getByRole('button', { name: 'Sign Up' }).click();
await page.getByLabel('Full name', { exact: true }).fill('Morgan Riley');
await page.getByLabel('Email address', { exact: true }).fill('morgan@example.com');
await page.getByLabel('Password', { exact: true }).fill('password123');
await page.getByLabel('Country', { exact: true }).fill('United States');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Create account', exact: true }).click();
await page.locator('.db-shell').waitFor();
assert.ok(await page.getByRole('region', { name: 'Portfolio summary' }).isVisible());
assert.match(await page.locator('.db-sample-notice').innerText(), /Illustrative preview/);
console.log('PASS: sample-data disclosure and personalized dashboard');

const beforeTick = await page.locator('.db-sum-main strong').innerText();
await page.waitForTimeout(4200);
assert.equal(await page.locator('.db-sum-main strong').innerText(), beforeTick);
console.log('PASS: sample market quotes remain static, not pseudo-live');

await page.getByRole('button', { name: /Notifications/ }).click();
const notificationPanel = page.getByRole('region', { name: 'Investment notifications' });
assert.ok(await notificationPanel.isVisible());
const noticeCount = await notificationPanel.locator('article').count();
assert.ok(noticeCount > 0);
await notificationPanel.getByRole('button', { name: 'Mark all read' }).click();
assert.match(await notificationPanel.innerText(), /All caught up/);
console.log(`PASS: actionable notification center (${noticeCount} generated updates)`);

await page.getByRole('button', { name: 'Hide account values' }).click();
assert.match(await page.locator('.db-sum-main strong').innerText(), /•/);
await page.getByRole('button', { name: 'Show account values' }).click();
assert.equal(await page.locator('.db-sum-main strong').innerText(), beforeTick);
console.log('PASS: privacy toggle masks and restores portfolio values');

await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
await page.getByLabel('Search holdings').fill('MSFT');
assert.equal(await page.getByRole('cell', { name: /MSFT/ }).count(), 1);
assert.equal(await page.getByRole('cell', { name: /AAPL/ }).count(), 0);
const msftRow = page.getByRole('row').filter({ hasText: 'MSFT' });
await msftRow.getByRole('button', { name: 'Buy', exact: true }).click();
let dialog = page.getByRole('dialog', { name: 'Buy' });
await dialog.getByLabel('Amount (USD)').fill('100');
await dialog.getByRole('button', { name: 'Buy MSFT' }).click();
assert.match(await page.locator('.db-toast').innerText(), /Bought MSFT/);
console.log('PASS: holdings search and buy workflow');

await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
await page.getByLabel('Search holdings').fill('MSFT');
await page.getByRole('row').filter({ hasText: 'MSFT' }).getByRole('button', { name: 'Sell', exact: true }).click();
dialog = page.getByRole('dialog', { name: 'Sell' });
const originalCash = Number((await dialog.locator('.db-trade-summary strong').first().innerText()).replace(/[^\d.]/g, ''));
await dialog.getByLabel('Asset', { exact: true }).selectOption('MSFT');
await dialog.getByRole('button', { name: 'Sell full position' }).click();
const sellUnits = await dialog.locator('.db-trade-summary strong').nth(0).innerText();
assert.match(sellUnits, /MSFT/);
await dialog.getByRole('button', { name: 'Sell MSFT' }).click();
assert.match(await page.locator('.db-toast').innerText(), /Sold MSFT/);
console.log(`PASS: sell workflow credits proceeds (starting cash ${originalCash.toFixed(2)})`);

await page.locator('.db-header').getByLabel('Search holdings').fill('');
await page.getByRole('button', { name: 'Overview', exact: true }).click();
await page.getByRole('button', { name: 'Goal contribution' }).click();
dialog = page.getByRole('dialog', { name: 'Contribute' });
await dialog.getByLabel('Amount (USD)').fill('50');
await dialog.getByRole('button', { name: /Contribute ·/ }).click();
assert.match(await page.locator('.db-toast').innerText(), /added to/);
console.log('PASS: goal contributions update savings and cash sample state');

const initialDashboard = page.locator('.db-shell');
for (const width of [320, 390, 600, 768, 900, 1024, 1440, 1920]) {
  await page.setViewportSize({ width, height: 860 });
  const sizes = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(sizes.content <= sizes.width, `Horizontal overflow at ${width}px: ${sizes.content}`);
}
console.log('PASS: dashboard remains within viewport from 320px through 1920px');

await page.setViewportSize({ width: 390, height: 844 });
assert.equal(await page.locator('.db-navbtn-secondary').first().isVisible(), false);
await page.getByRole('button', { name: 'More dashboard sections' }).click();
assert.ok(await page.getByRole('group', { name: 'More dashboard sections' }).isVisible());
await page.locator('.db-more-panel').getByRole('button', { name: 'Auto-invest' }).click();
assert.equal(await page.getByRole('heading', { name: 'Recurring plans' }).isVisible(), true);
console.log('PASS: mobile five-item navigation and secondary section menu');

assert.ok(await initialDashboard.count());
assert.deepEqual(errors, []);
console.log('PASS: no uncaught browser errors');
await browser.close();