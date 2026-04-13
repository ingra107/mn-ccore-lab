// Re-verify chord timeout behavior specifically
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const BASE = 'https://mn-ccore-lab.pages.dev';

  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur?.());

  console.log('Test 1: g, wait 1500ms, d — should NOT navigate');
  await page.keyboard.press('g');
  await page.waitForTimeout(1500);
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  console.log('  URL:', new URL(page.url()).pathname);

  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur?.());

  console.log('Test 2: g, wait 2000ms, d');
  await page.keyboard.press('g');
  await page.waitForTimeout(2000);
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  console.log('  URL:', new URL(page.url()).pathname);

  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur?.());

  console.log('Test 3: g, wait 900ms (within window), d — should navigate');
  await page.keyboard.press('g');
  await page.waitForTimeout(900);
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  console.log('  URL:', new URL(page.url()).pathname);

  await browser.close();
})();
