import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await page.goto('https://templates.studioniskala.com/invemon/template-kit/home/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: '.reference/original-top.png' });
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 650) {
    window.scrollTo(0, y);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
});
await page.waitForTimeout(2000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: '.reference/original-full.png', fullPage: true });
const info = await page.evaluate(() => {
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const style = el => {
    const s = getComputedStyle(el);
    return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','backgroundImage','padding','gap','borderRadius','maxWidth'].map(k => [k,s[k]]));
  };
  return {
    text: document.body.innerText,
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(el => el.href),
    images: [...document.images].map(el => ({ src: el.src, alt: el.alt, ...rect(el) })),
    headings: [...document.querySelectorAll('h1,h2,h3,h4')].map(el => ({ tag: el.tagName, text: el.innerText, ...rect(el), ...style(el) })),
    buttons: [...document.querySelectorAll('a.elementor-button,.elementskit-navbar-nav > li > a')].map(el => ({ text: el.innerText, href: el.href, ...rect(el), ...style(el) })),
    sections: [...document.querySelectorAll('[data-elementor-type="wp-post"] > .elementor-element')].map(el => ({ id: el.dataset.id, ...rect(el), ...style(el) })),
  };
});
await fs.writeFile('.reference/original-info.json', JSON.stringify(info, null, 2));
await fs.writeFile('.reference/original.html', await page.content());
console.log(JSON.stringify(info, null, 2));
await browser.close();