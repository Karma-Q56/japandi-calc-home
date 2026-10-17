// Screenshot and smoke-check helper for the visual verification pass.
// Usage: node scripts/shot.mjs <url> <name> [width] [height]
import { chromium } from 'playwright';

const CHROME = '/workspace/homes/b8bfff140b08360ec8ca4786/.agent-browser/browsers/chrome-155.0.8059.84/chrome';
const [url, name, width = '1280', height = '900'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: '/workspace/homes/b8bfff140b08360ec8ca4786/.agent-browser/browsers/chrome-155.0.8059.84:/tmp/chromelibs/usr/lib/x86_64-linux-gnu',
    FONTCONFIG_PATH: '/tmp/fontconf',
  },
});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message).slice(0, 300)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const text = await page.evaluate(() => document.body.innerText);
await page.screenshot({ path: `.shots/${name}.png`, fullPage: true });
console.log(JSON.stringify({ name, url: page.url(), textLength: text.length, errors, head: text.slice(0, 160).replace(/\n/g, ' | ') }, null, 1));
await browser.close();
