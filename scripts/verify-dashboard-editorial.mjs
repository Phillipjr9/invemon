import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#dashboard`);
  await page.getByRole('button', { name: 'Explore guest portfolio' }).click();
  await page.getByRole('region', { name: 'Portfolio summary', exact: true }).waitFor();
  assert.match(await page.locator('.db-sample-notice').innerText(), /No real money/);
  const balance = await page.locator('.db-portfolio-balance>strong').innerText();
  await page.getByRole('button', { name: 'Hide account values' }).click();
  assert.match(await page.locator('.db-portfolio-balance>strong').innerText(), /•/);
  assert.match(await page.locator('.db-cash-card-balance>strong').innerText(), /•/);
  await page.getByRole('button', { name: 'Show account values' }).click();
  assert.equal(await page.locator('.db-portfolio-balance>strong').innerText(), balance);
  await page.getByRole('button', { name: '1Y', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '1Y', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.locator('.db-chart-plot').focus();
  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('.db-chart-meta').innerText(), /Portfolio value/);
  await page.getByRole('tab', { name: 'Contributions vs Growth' }).click();
  await page.locator('.db-bar-columns').waitFor();
  await page.getByRole('tab', { name: 'Performance', exact: true }).click();
  const cash = await page.locator('.db-cash-card-balance>strong').innerText();
  await page.getByRole('button', { name: 'Add money', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Amount (USD)').fill('100');
  await modal.getByRole('button', { name: 'Review deposit', exact: true }).click();
  await modal.getByRole('button', { name: 'Confirm deposit', exact: true }).click();
  await modal.getByRole('button', { name: 'Done', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  const newCash = await page.locator('.db-cash-card-balance>strong').innerText();
  assert.equal(Number(newCash.replace(/[^\d.]/g, '')) - Number(cash.replace(/[^\d.]/g, '')), 100);
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Amount (USD)').fill('10000');
  await modal.getByRole('button', { name: 'Review withdrawal', exact: true }).click();
  assert.match(await modal.getByRole('alert').innerText(), /exceeds/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search holdings' }).fill('MSFT');
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'MSFT Microsoft Corp.' }) });
  assert.equal(await row.count(), 1);
  await row.getByRole('button', { name: 'Buy', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Amount (USD)').fill('25');
  await modal.getByRole('button', { name: 'Review investment', exact: true }).click();
  await modal.getByRole('button', { name: 'Confirm investment', exact: true }).click();
  await modal.getByRole('button', { name: 'Done', exact: true }).click();
  await modal.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: /Notifications/ }).click();
  await page.getByRole('region', { name: 'Investment notifications' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search holdings, markets, and quick commands' }).click();
  await page.getByRole('searchbox', { name: 'Command search' }).fill('Apple');
  await page.locator('.db-cmd-results button').first().waitFor();
  await page.keyboard.press('Escape');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overview overflow at ${width}`);
  }
  await page.getByRole('button', { name: 'More dashboard sections' }).click();
  await page.getByRole('group', { name: 'More dashboard sections' }).getByRole('button', { name: 'Goals', exact: true }).click();
  await page.getByRole('heading', { level: 1, name: 'Goals' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Goals mobile overflow');
  assert.deepEqual(errors, []);
  console.log('PASS: demo launch, disclosures, privacy, chart ranges and keyboard interaction, deposits, withdrawal validation, buy flow, search, notifications, desktop/tablet/mobile layouts, and bottom navigation.');
} finally {
  await browser.close();
}
