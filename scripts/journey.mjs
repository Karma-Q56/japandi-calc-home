// Scripted end-to-end journeys for the visual verification pass.
// Usage: node scripts/journey.mjs owner|guest|staff|operator
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:3000';
const which = process.argv[2] ?? 'owner';
const browser = await chromium.launch({
  executablePath: '/workspace/homes/b8bfff140b08360ec8ca4786/.agent-browser/browsers/chrome-155.0.8059.84/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: '/workspace/homes/b8bfff140b08360ec8ca4786/.agent-browser/browsers/chrome-155.0.8059.84:/tmp/chromelibs/usr/lib/x86_64-linux-gnu',
    FONTCONFIG_PATH: '/tmp/fontconf',
  },
});
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(6000);
await page.setViewportSize({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', error => errors.push(String(error.message).slice(0, 200)));

const log = [];
async function step(label, action) {
  try {
    const result = action ? await action() : null;
    const text = await page.evaluate(() => document.body.innerText);
    log.push({ label, url: page.url().replace(base, ''), textLength: text.length, result });
  } catch (error) {
    log.push({ label, url: page.url().replace(base, ''), error: String(error).slice(0, 200) });
  }
}
async function shot(name) {
  await page.screenshot({ path: `.shots/${name}.png`, fullPage: true });
  return name;
}
async function click(text) {
  await page.getByText(text, { exact: false }).first().click();
  await page.waitForTimeout(900);
}

// Start from a clean demo store so the journey begins on the hub.
await page.goto(`${base}/demo`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}/demo`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

if (which === 'owner') {
  await step('hub', () => shot('j-owner-hub'));
  await step('open owner dashboard', async () => { await click('Owner dashboard'); await shot('j-owner-overview'); });
  await step('customers', async () => { await click('Customers'); await shot('j-owner-customers'); });
  await step('loyalty', async () => { await click('Loyalty'); await shot('j-owner-loyalty'); });
  await step('campaigns', async () => { await click('Campaigns'); await shot('j-owner-campaigns'); });
  await step('new campaign', async () => { await click('New campaign'); await shot('j-owner-compose'); });
  await step('fill campaign', async () => {
    await page.getByLabel(/Campaign name/).fill('Verification offer');
    await page.getByLabel(/Offer code/).fill('VERIFY');
    await page.getByLabel(/Message body/).fill('Hi {first_name}, pop in for a treat. Code VERIFY. Reply STOP to opt out.');
    await page.waitForTimeout(400);
    await shot('j-owner-compose-filled');
  });
  await step('compose submit', async () => { await page.getByRole('button', { name: /Compose campaign/ }).click(); await page.waitForTimeout(1200); await shot('j-owner-after-compose'); });
  await step('run dispatcher', async () => { await page.getByRole('button', { name: /Run dispatcher/ }).first().click(); await page.waitForTimeout(800); await shot('j-owner-dispatched'); });
  await step('settle', async () => { await page.getByRole('button', { name: /Settle/ }).first().click(); await page.waitForTimeout(800); await shot('j-owner-settled'); });
  await step('credit', async () => { await click('Credit'); await shot('j-owner-credit'); });
  await step('team', async () => { await click('Team'); await shot('j-owner-team'); });
  await step('menu', async () => { await click('Menu'); await shot('j-owner-menu'); });
  await step('qr', async () => { await click('QR'); await shot('j-owner-qr'); });
  await step('audit', async () => { await click('Audit'); await shot('j-owner-audit'); });
  await step('settings', async () => { await click('Settings'); await shot('j-owner-settings'); });
} else if (which === 'guest') {
  await step('hub', () => shot('j-guest-hub'));
  await step('open join', async () => { await click('Join as a new guest'); await shot('j-guest-join-start'); });
  await step('join cta', async () => { await page.getByRole('button', { name: /^Join$/ }).click(); await page.waitForTimeout(600); await shot('j-guest-details'); });
  await step('details', async () => {
    await page.getByLabel(/First name/).fill('Naledi');
    await page.getByLabel(/Mobile number/).fill('+27 82 555 0199');
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.waitForTimeout(600);
    await shot('j-guest-consent');
  });
  await step('consent', async () => {
    const boxes = page.locator('.guest-consent input[type=checkbox]');
    await boxes.nth(0).check();
    await page.getByRole('button', { name: /Continue/ }).click();
    await page.waitForTimeout(600);
    await shot('j-guest-verification');
  });
  await step('verify', async () => {
    const button = page.getByRole('button', { name: /Continue|Verify|Send code|Finish/ }).last();
    await button.click();
    await page.waitForTimeout(1200);
    await shot('j-guest-after-verify');
  });
  await step('card', async () => {
    if (!page.url().includes('/card')) { await page.goto(`${base}/r/daily-grind/card`, { waitUntil: 'load' }); await page.waitForTimeout(1200); }
    await shot('j-guest-card');
  });
  await step('my cards', async () => { await page.goto(`${base}/me`, { waitUntil: 'load' }); await page.waitForTimeout(1200); await shot('j-guest-me'); });
} else if (which === 'staff') {
  let pin = '';
  await step('hub', () => shot('j-staff-hub'));
  await step('reset pin as owner', async () => {
    await page.goto(`${base}/demo`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await click('Owner dashboard');
    await click('Team');
    await page.getByRole('button', { name: /Reset PIN/ }).first().click();
    await page.waitForTimeout(800);
    pin = await page.locator('.team-pin code').last().innerText();
    pin = pin.trim();
    await shot('j-staff-team-pin');
    return pin;
  });
  await step('open till', async () => {
    await page.goto(`${base}/demo`, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    await click('Staff till');
    await shot('j-staff-till');
  });
  await step('pin sign in', async () => {
    await page.getByRole('button', { name: /Mia/ }).click();
    await page.waitForTimeout(400);
    for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
    await page.getByRole('button', { name: 'Enter' }).click();
    await page.waitForTimeout(900);
    await shot('j-staff-signed-in');
  });
  await step('lookup member', async () => {
    await page.getByPlaceholder(/member code/).fill('demo-token-0001');
    await page.getByRole('button', { name: 'Look up' }).click();
    await page.waitForTimeout(900);
    await shot('j-staff-lookup');
  });
  await step('stamp loop', async () => {
    let added = 0;
    for (let i = 0; i < 9; i += 1) {
      const add = page.getByRole('button', { name: 'Add stamp' });
      if (!(await add.count())) break;
      await add.click();
      await page.waitForTimeout(500);
      const toast = await page.locator('[data-sonner-toast]').last().innerText().catch(() => '');
      if (/Too soon/i.test(toast)) {
        await page.getByRole('button', { name: /Demo · / }).click();
        await page.getByRole('button', { name: '+4 hours' }).click();
        await page.getByRole('button', { name: /Demo · / }).click();
        await page.waitForTimeout(300);
        continue;
      }
      added += 1;
    }
    await shot('j-staff-stamped');
    return `added ${added} stamps`;
  });
  await step('redeem reward', async () => {
    const redeem = page.getByRole('button', { name: 'Redeem reward' });
    if (await redeem.count()) { await redeem.click(); await page.waitForTimeout(700); }
    await shot('j-staff-redeemed');
  });
  await step('redeem offer code', async () => {
    await page.getByRole('button', { name: 'Redeem', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByPlaceholder(/Offer code/).fill('TUESDAY');
    await page.getByRole('button', { name: 'Redeem code' }).click();
    await page.waitForTimeout(700);
    await shot('j-staff-offer');
  });
} else {
  await step('hub', () => shot('j-ops-hub'));
  await step('operator console', async () => { await click('Operator console'); await shot('j-ops-console'); });
  await step('restaurants', async () => { await click('Restaurants'); await shot('j-ops-restaurants'); });
  await step('new restaurant', async () => { await click('Add a restaurant'); await shot('j-ops-new'); });
}

console.log(JSON.stringify({ which, log, errors }, null, 1));
await browser.close();
