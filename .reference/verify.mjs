import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
const missingAssets = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (response.url().includes('localhost') && response.status() >= 400) missingAssets.push(`${response.status()} ${response.url()}`);
});
const report = message => console.log(`PASS: ${message}`);
const close = async () => {
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
};

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle' });
assert.match(await page.title(), /Invemon/);
assert.equal(await page.locator('h1').innerText(), 'INVESTMENT');
await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
await page.screenshot({ path: '.reference/final-desktop.png' });
report('Homepage loads with the correct branding and title');

await page.getByRole('button', { name: 'Page', exact: true }).click();
await page.locator('#page-menu').getByRole('link', { name: 'Pricing Plans' }).click();
assert.ok(page.url().endsWith('#pricing'));
assert.equal(await page.locator('#page-menu').count(), 0);
report('Desktop dropdown and in-page navigation');

await page.getByRole('button', { name: '02. Start with Just $1', exact: true }).click();
assert.equal(await page.getByRole('button', { name: '02. Start with Just $1', exact: true }).getAttribute('aria-expanded'), 'true');
assert.equal(await page.getByRole('button', { name: '01. AI-Powered Insights', exact: true }).getAttribute('aria-expanded'), 'false');
await page.getByRole('button', { name: '04. Bank-Grade Security', exact: true }).click();
assert.equal(await page.getByRole('button', { name: '04. Bank-Grade Security', exact: true }).getAttribute('aria-expanded'), 'true');
report('Investment accordion expands and collapses');

await page.locator('.hero-copy').getByRole('button', { name: 'Start Trading', exact: true }).click();
let dialog = page.getByRole('dialog');
await dialog.getByLabel('Full name', { exact: true }).fill('Jordan Taylor');
await dialog.getByLabel('Email address', { exact: true }).fill('jordan@example.com');
await dialog.getByRole('button', { name: 'Create preview account' }).click();
assert.match(await dialog.innerText(), /Your future starts here/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('invemon-preview-account')).name), 'Jordan Taylor');
assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('dialog').count(), 0);
assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
await page.locator('.header-actions').getByRole('button', { name: 'My account' }).click();
assert.match(await page.getByRole('dialog').innerText(), /Jordan Taylor/);
await page.getByRole('button', { name: 'Sign out', exact: true }).click();
assert.equal(await page.evaluate(() => localStorage.getItem('invemon-preview-account')), null);
report('Preview signup, local persistence, account view, and sign-out');

await page.locator('.price-plan').nth(2).getByRole('button', { name: 'Get Started' }).click();
assert.match(await page.getByRole('dialog').innerText(), /Premium Plan/);
await close();
report('Pricing buttons retain the selected plan');

await page.locator('.header-actions').getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('dialog').getByLabel('Email address').fill('jordan@example.com');
await page.getByRole('button', { name: 'Continue to preview' }).click();
await page.getByRole('button', { name: 'Explore demo portfolio' }).click();
dialog = page.getByRole('dialog');
assert.match(await dialog.innerText(), /10,000.00/);
await dialog.getByLabel('Amount in USD').fill('100');
await dialog.getByRole('button', { name: 'Buy AAPL', exact: true }).click();
assert.match(await dialog.locator('.trade-message').innerText(), /Bought/);
assert.equal(await dialog.locator('.demo-summary strong').nth(1).innerText(), '$9,900.00');
await dialog.getByRole('button', { name: 'Sell', exact: true }).click();
await dialog.getByLabel('Amount in USD').fill('50');
await dialog.getByRole('button', { name: 'Sell AAPL', exact: true }).click();
assert.equal(await dialog.locator('.demo-summary strong').nth(1).innerText(), '$9,950.00');
await dialog.getByLabel('Amount in USD').fill('100000');
await dialog.getByRole('button', { name: 'Sell AAPL', exact: true }).click();
assert.match(await dialog.locator('.trade-message').innerText(), /not have enough/);
await dialog.getByRole('button', { name: 'BTC', exact: true }).click();
await dialog.getByRole('button', { name: '1M', exact: true }).click();
assert.equal(await dialog.getByRole('button', { name: '1M', exact: true }).getAttribute('aria-pressed'), 'true');
await dialog.getByRole('button', { name: 'Close dialog' }).focus();
await page.keyboard.press('Shift+Tab');
assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), true);
await close();
report('Demo sign-in, buy/sell trades, balance updates, validation, market selection, and focus trap');

await page.locator('.header-actions').getByRole('button', { name: 'Download', exact: true }).click();
dialog = page.getByRole('dialog');
await dialog.getByRole('button', { name: /Android/ }).click();
await dialog.getByLabel('Email address').fill('mobile@example.com');
await dialog.getByRole('button', { name: 'Notify me', exact: true }).click();
assert.match(await dialog.innerText(), /You're on the list/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('invemon-app-reminder')).platform), 'Android');
await close();
report('Device selection and local app reminders');

await page.locator('.footer-links').getByRole('button', { name: "FAQ's" }).click();
await page.getByRole('dialog').locator('summary').first().click();
assert.equal(await page.getByRole('dialog').locator('details').first().getAttribute('open'), '');
await close();
await page.locator('.footer-links').getByRole('button', { name: 'Jobs', exact: true }).click();
assert.match(await page.getByRole('dialog').innerText(), /No open roles/);
await close();
report('Help center FAQ and careers dialog');

await page.getByLabel('Your email address').fill('not-an-email');
assert.equal(await page.getByLabel('Your email address').evaluate(input => input.validity.valid), false);
await page.getByLabel('Your email address').fill('newsletter@example.com');
await page.getByRole('button', { name: 'Notify Me', exact: true }).click();
assert.match(await page.locator('.newsletter-status').innerText(), /You're on the list/);
assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('invemon-newsletter')).includes('newsletter@example.com')));
report('Newsletter validation, confirmation, and local persistence');

const firstReview = await page.locator('.review-person > div').first().innerText();
await page.getByRole('button', { name: 'See more investor reviews' }).click();
assert.notEqual(await page.locator('.review-person > div').first().innerText(), firstReview);
await page.getByRole('button', { name: 'Watch video', exact: true }).click();
assert.match(await page.getByRole('dialog').locator('iframe').getAttribute('src'), /VhBl3dHT5SY/);
await close();
report('Testimonial navigation and original video dialog');

await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 60)); }
});
await page.waitForTimeout(300);
assert.deepEqual(await page.evaluate(() => [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src)), []);
report('All homepage images load successfully');

for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width, `Horizontal overflow at ${width}px: ${dimensions.scroll}`);
  if (width === 390) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.reference/final-mobile.png' });
    await page.getByRole('button', { name: 'Open menu' }).click();
    assert.equal(await page.locator('.main-nav').isVisible(), true);
    await page.locator('.main-nav').getByRole('button', { name: 'Page', exact: true }).click();
    await page.locator('#page-menu').getByRole('link', { name: 'Our Product' }).click();
    assert.equal(await page.locator('.main-nav').isVisible(), false);
    assert.ok(page.url().endsWith('#product'));
    await page.locator('.hero-copy').getByRole('button', { name: 'Demo Trading' }).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    await close();
    report('Mobile menu, dropdown, anchor navigation, and demo dialog');
  }
  report(`Responsive layout without horizontal overflow at ${width}px`);
}

assert.deepEqual(errors, []);
assert.deepEqual(missingAssets, []);
report('No runtime errors or missing local assets');
await browser.close();
console.log('\nAll homepage interaction and responsive checks passed.');