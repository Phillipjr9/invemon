import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:5173'}/#dashboard`);
  await page.getByRole('button', { name: 'Explore guest portfolio' }).click();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('invemon-dashboard:alex.morgan@invemon.com')));
  const near = (a, b, note) => assert.ok(Math.abs(a - b) < 0.000001, `${note}: ${a} != ${b}`);
  const total = state => state.cash + state.holdings.reduce((sum, h) => sum + h.price * h.units, 0);
  const dialog = page.getByRole('dialog');
  const open = async name => { await page.getByRole('button', { name, exact: true }).click(); await dialog.waitFor(); };
  const confirm = async label => {
    await dialog.getByRole('button', { name: `Review ${label}`, exact: true }).click();
    await dialog.getByRole('button', { name: `Confirm ${label}`, exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.locator('.tx-phase-processing').waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Close', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.locator('.tx-phase-processing').waitFor();
    await dialog.getByRole('button', { name: 'Done', exact: true }).waitFor();
  };
  let before = await saved();
  await open('Add money');
  await dialog.getByLabel('Amount (USD)').fill('0');
  await dialog.getByRole('button', { name: 'Review deposit', exact: true }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /at least/);
  await dialog.getByLabel('Amount (USD)').fill('100.001');
  await dialog.getByRole('button', { name: 'Review deposit', exact: true }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /two decimal/);
  await dialog.getByLabel('Amount (USD)').fill('100');
  await dialog.getByRole('button', { name: 'Review deposit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit details', exact: true }).click();
  near((await saved()).cash, before.cash, 'Review/edit does not mutate cash');
  await confirm('deposit');
  let after = await saved();
  near(after.cash, before.cash + 100, 'Deposit applied once');
  assert.equal(after.activity.length, before.activity.length + 1);
  assert.match(await page.locator('.tx-reference').innerText(), /DEMO-/);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  before = await saved();
  await open('Withdraw');
  await dialog.getByLabel('Amount (USD)').fill('10000');
  await dialog.getByRole('button', { name: 'Review withdrawal', exact: true }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /exceeds/);
  await dialog.getByLabel('Amount (USD)').fill('50');
  await confirm('withdrawal');
  after = await saved();
  near(after.cash, before.cash - 50, 'Withdrawal applied once');
  assert.equal(after.activity.length, before.activity.length + 1);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  before = await saved();
  await open('Swap');
  await dialog.getByLabel('From asset', { exact: true }).selectOption('VTI');
  await dialog.getByLabel('To asset', { exact: true }).selectOption('VTI');
  await dialog.getByRole('button', { name: 'Review swap', exact: true }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /different/);
  await dialog.getByLabel('To asset', { exact: true }).selectOption('AAPL');
  await dialog.getByRole('button', { name: 'Reverse swap assets' }).click();
  assert.equal(await dialog.getByLabel('From asset', { exact: true }).inputValue(), 'AAPL');
  await dialog.getByLabel('From asset', { exact: true }).selectOption('VTI');
  await dialog.getByLabel('To asset', { exact: true }).selectOption('NVDA');
  assert.equal(await dialog.getByRole('button', { name: 'Reverse swap assets' }).isDisabled(), true);
  await dialog.getByLabel('Amount (USD)').fill('99999');
  await dialog.getByRole('button', { name: 'Review swap', exact: true }).click();
  assert.match(await dialog.getByRole('alert').innerText(), /exceeds/);
  await dialog.getByLabel('Amount (USD)').fill('100');
  await confirm('swap');
  after = await saved();
  near(after.cash, before.cash, 'Swap conserves cash');
  near(total(after), total(before), 'Swap conserves sample portfolio value');
  assert.equal(after.activity.length, before.activity.length + 1, 'Swap is one atomic ledger entry');
  assert.equal(after.activity[0].kind, 'swap');
  near(after.holdings.find(h => h.symbol === 'VTI').units, before.holdings.find(h => h.symbol === 'VTI').units - 100 / 272.4, 'Source units reduced');
  assert.ok(after.holdings.some(h => h.symbol === 'NVDA' && h.units > 0), 'Destination holding created');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  before = await saved();
  await open('Sell');
  await dialog.getByLabel('Asset', { exact: true }).selectOption('AAPL');
  await dialog.getByLabel('Amount (USD)').fill('25');
  await confirm('sale');
  after = await saved();
  near(after.cash, before.cash + 25, 'Sale credits cash');
  near(total(after), total(before), 'Sale conserves sample value');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  // All small-screen phases remain within the viewport. Reduced motion preserves
  // transaction semantics while removing decorative movement.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await open('Swap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const animation = await page.locator('.tx-sheet').evaluate(e => getComputedStyle(e).animationName);
    assert.equal(animation, 'none');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  }
  await page.reload();
  await page.locator('.db-overview-stage').waitFor();
  near((await saved()).cash, after.cash, 'Completed transactions persist');
  assert.deepEqual(errors, []);
  console.log('PASS: transaction review, input validation, processing safeguards, duplicate protection, receipts, deposits, withdrawals, atomic swap, sell, persistence, responsive layout, and reduced motion.');
} finally { await browser.close(); }
