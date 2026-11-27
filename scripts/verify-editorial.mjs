import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Run against `npm run dev`. An externally installed Chromium can be supplied
// through CHROMIUM_EXECUTABLE_PATH when Playwright browsers are unavailable.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
  args: process.env.CHROMIUM_EXECUTABLE_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TEST_BASE_URL || 'http://localhost:5173');
  await page.getByRole('heading', { level: 1, name: /Build wealth/ }).waitFor();
  assert.equal(await page.locator('.iv-hero-art img').count(), 1, 'Hero uses only the phone image');
  assert.equal(await page.locator('.iv-home img[src="/assets/new-york-flatiron.jpg"]').count(), 0, 'No city photo on the homepage');
  const restoredAssets = [
    'Phone-Mockup-2-B2GNQEM.png', 'Phone-Mockup-B2GNQEM.png',
    'currency-YCG8AHH.jpg', 'part-of-9ES8348.jpg', 'moder-HL9BTHH.jpg',
    'volatilit-KEUW82N.jpg', 'with-m-9C22FUP.jpg', 'wins-FHYGRXJ.jpg',
    'successf-46DXS95.jpeg', '4-people-having-a-v-3628WWS.png',
    '2-people-having-a-v-3628WWS.png', '5-people-having-a-v-3628WWS.png',
    'iOasis.png', 'Logo.png', 'Stratifi.png', 'Vector.png', 'Altura.png',
  ];
  for (const image of restoredAssets) {
    assert.equal(await page.locator(`.iv-home img[src="/assets/${image}"]`).count(), 1, `Missing original asset: ${image}`);
  }
  const brokenImages = await page.locator('.iv-home img').evaluateAll(async images => {
    await Promise.all(images.map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
    return images.filter(image => !image.naturalWidth).map(image => image.src);
  });
  assert.deepEqual(brokenImages, [], 'All restored images must load successfully');
  await page.getByRole('tab', { name: /Europe/ }).click();
  await page.getByRole('button', { name: /ASML Holding/ }).waitFor();
  await page.getByRole('tab', { name: /Asia Pacific/ }).click();
  await page.getByRole('button', { name: /Toyota Motor/ }).waitFor();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.locator('#login-email').waitFor();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  assert.match(await page.getByRole('alert').innerText(), /valid email/);
  await page.locator('#login-password').fill('sample-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'text');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Back to website', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Global markets', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation' }).waitFor();
  await page.getByRole('button', { name: 'Can I try it before creating an account?' }).click();
  await page.getByText('Yes. Choose “Explore the platform”', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Start your journey' }).click();
  await page.getByLabel('Country of residence').waitFor();
  await page.goBack();
  await page.getByRole('button', { name: 'Explore the platform', exact: true }).click();
  await page.waitForURL('**/#dashboard');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: original imagery restored and loaded, regional tabs, login validation, password visibility, mobile navigation, FAQs, signup, demo navigation, and no runtime errors.');
} finally {
  await browser.close();
}
