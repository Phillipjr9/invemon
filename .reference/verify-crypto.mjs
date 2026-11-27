import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const allCoins = JSON.parse(await readFile('/tmp/paprika-coins.json', 'utf8'));
const allTickers = JSON.parse(await readFile('/tmp/paprika-tickers.json', 'utf8'));
const firstCoins = allCoins.filter(coin => coin.is_active && coin.rank > 0).slice(0, 85);
const uncommon = allCoins.find(coin => coin.id === 'hair-hairdao-token');
const inactive = allCoins.find(coin => !coin.is_active && coin.name && coin.symbol);
const duplicate = { id: 'btc-test-wrapped', name: 'Wrapped Bitcoin Test', symbol: 'BTC', rank: 10001, is_active: true, type: 'token' };
const coins = [...firstCoins.filter(coin => coin.id !== uncommon.id), uncommon, inactive, duplicate];
const ids = new Set(firstCoins.map(coin => coin.id));
const tickers = allTickers.filter(ticker => ids.has(ticker.id) && ticker.id !== uncommon.id);
const specialTicker = {
  id: uncommon.id,
  name: uncommon.name,
  symbol: uncommon.symbol,
  rank: uncommon.rank,
  total_supply: 12345,
  last_updated: new Date().toISOString(),
  quotes: { USD: { price: 0.000023456, percent_change_24h: 1.25, percent_change_7d: -2.5, market_cap: 45000, volume_24h: 1200, ath_price: 0.02 } },
};
const history = Array.from({ length: 8 }, (_, index) => ({ timestamp: new Date(Date.now() - (7 - index) * 86400000).toISOString(), price: 50 + index }));

const browser = await chromium.launch();
const errors = [];
const report = message => console.log(`PASS: ${message}`);

async function makePage(mode = { fail: false, failPrices: false }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://api.coinpaprika.com/v1/**', async route => {
    const url = new URL(route.request().url());
    if (mode.fail || (mode.failPrices && url.pathname === '/v1/tickers')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    if (url.pathname === '/v1/coins') return route.fulfill({ json: coins });
    if (url.pathname === '/v1/tickers') return route.fulfill({ json: tickers });
    if (url.pathname.endsWith('/historical')) return route.fulfill({ json: history });
    if (url.pathname === `/v1/tickers/${uncommon.id}`) return route.fulfill({ json: specialTicker });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
  await page.locator('.header-actions').getByRole('button', { name: 'Sign Up' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Crypto Investor');
  await page.getByLabel('Email address', { exact: true }).fill('crypto@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Country', { exact: true }).fill('United States');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('button', { name: 'Crypto', exact: true }).click();
  return { page, context };
}

const { page, context } = await makePage();
await page.locator('.crypto-table').waitFor();
assert.equal(await page.locator('.crypto-table tbody tr').count(), 20);
assert.ok((await page.locator('.crypto-directory-top').innerText()).includes('active assets'));
assert.ok(await page.getByRole('button', { name: 'View Bitcoin details' }).isVisible());
assert.match(await page.locator('.crypto-table tbody').innerText(), /\$[\d,.]+/);
await page.getByRole('button', { name: 'Next cryptocurrency page' }).click();
assert.match(await page.locator('.crypto-pagination').innerText(), /Page 2/);
await page.getByRole('button', { name: 'Previous cryptocurrency page' }).click();
assert.match(await page.locator('.crypto-pagination').innerText(), /Page 1/);
report('Provider catalog, market quotes, and pagination');

await page.getByLabel('Search cryptocurrencies').fill('btc');
await page.getByRole('button', { name: 'View Wrapped Bitcoin Test details' }).waitFor();
await page.getByRole('button', { name: 'Add Bitcoin to watchlist', exact: true }).click();
await page.getByRole('button', { name: 'Add Wrapped Bitcoin Test to watchlist', exact: true }).click();
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('invemon-crypto-watchlist:crypto@example.com')));
assert.deepEqual(new Set(stored), new Set(['btc-bitcoin', 'btc-test-wrapped']));
await page.getByRole('button', { name: /Watchlist 2/ }).click();
assert.equal(await page.locator('.crypto-table tbody tr').count(), 2);
await page.getByLabel('Search cryptocurrencies').fill('');
await page.getByRole('button', { name: 'Overview', exact: true }).click();
await page.getByRole('button', { name: /Crypto watchlist \(2\)/ }).click();
await page.locator('.crypto-table').waitFor();
assert.equal(await page.locator('.crypto-table tbody tr').count(), 2);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.header-actions').getByRole('button', { name: 'My account' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Open dashboard' }).click();
await page.getByRole('button', { name: /Crypto watchlist \(2\)/ }).click();
await page.locator('.crypto-table').waitFor();
assert.equal(await page.locator('.crypto-table tbody tr').count(), 2);
report('Per-user watchlist survives navigation and reload, distinguishing duplicate symbols by ID');

await page.getByRole('button', { name: 'All crypto', exact: true }).click();
await page.getByLabel('Search cryptocurrencies').fill(uncommon.id);
await page.getByRole('button', { name: `View ${uncommon.name} details` }).waitFor();
assert.ok(await page.getByRole('button', { name: 'View quote' }).isVisible());
await page.getByRole('button', { name: `View ${uncommon.name} details` }).click();
const dialog = page.getByRole('dialog', { name: uncommon.name });
await dialog.waitFor();
await dialog.getByText('$0.000023456', { exact: true }).waitFor();
await dialog.locator('.crypto-history-plot svg').waitFor();
assert.match(await dialog.innerText(), /Data by CoinPaprika/);
await dialog.getByRole('button', { name: '1M', exact: true }).click();
assert.equal(await dialog.getByRole('button', { name: '1M', exact: true }).getAttribute('aria-pressed'), 'true');
await dialog.getByRole('button', { name: 'Add to watchlist', exact: true }).click();
assert.ok(await dialog.getByRole('button', { name: 'Remove from watchlist', exact: true }).isVisible());
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('dialog').count(), 0);
report('On-demand quote, small-price precision, history, details, watchlist, and Escape');

await page.getByLabel('Search cryptocurrencies').fill(inactive.id);
await page.getByLabel('Filter cryptocurrency status').selectOption('all');
await page.getByRole('button', { name: `View ${inactive.name} details` }).waitFor();
await page.getByRole('button', { name: `View ${inactive.name} details` }).click();
assert.match(await page.getByRole('dialog').innerText(), /marked inactive/);
assert.match(await page.getByRole('dialog').innerText(), /No price history/);
await page.getByRole('button', { name: 'Close cryptocurrency details' }).click();
await page.getByLabel('Search cryptocurrencies').fill('not-a-real-cryptocurrency');
await page.getByText('No cryptocurrencies found').waitFor();
await page.getByRole('button', { name: 'Clear filters' }).click();
await page.getByLabel('Sort cryptocurrencies').selectOption('gainers');
assert.equal(await page.getByLabel('Sort cryptocurrencies').inputValue(), 'gainers');
report('Inactive listings, empty search, clear filters, and market sorting');

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  await page.setViewportSize({ width, height: 900 });
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scroll <= dimensions.width, `Horizontal overflow at ${width}: ${dimensions.scroll}`);
  if (width === 390) {
    await page.getByLabel('Search cryptocurrencies').fill('bitcoin');
    await page.getByRole('button', { name: 'View Bitcoin details', exact: true }).click();
    const mobileDialog = page.getByRole('dialog', { name: 'Bitcoin' });
    assert.ok(await mobileDialog.isVisible());
    assert.ok((await mobileDialog.boundingBox()).width <= width);
    await page.getByRole('button', { name: 'Close cryptocurrency details' }).click();
    await page.getByLabel('Search cryptocurrencies').fill('');
  }
}
report('Responsive layouts and mobile detail dialog, 320px through 1920px');
await context.close();

const mode = { fail: true, failPrices: false };
const failure = await makePage(mode);
await failure.page.getByText('Market data is unavailable').waitFor();
mode.fail = false;
await failure.page.getByRole('button', { name: 'Try again', exact: true }).click();
await failure.page.locator('.crypto-table').waitFor();
report('Provider outage is shown clearly and retry recovers');
await failure.context.close();

const partial = await makePage({ fail: false, failPrices: true });
await partial.page.locator('.crypto-provider-warning').waitFor();
await partial.page.getByLabel('Search cryptocurrencies').fill(uncommon.id);
await partial.page.getByRole('button', { name: `View ${uncommon.name} details` }).click();
await partial.page.getByRole('dialog').getByText('$0.000023456', { exact: true }).waitFor();
report('Individual quotes work when the bulk feed fails');
await partial.context.close();

assert.deepEqual(errors, []);
report('No uncaught browser errors');
await browser.close();
console.log('\nAll crypto directory checks passed.');