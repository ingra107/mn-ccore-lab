const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, 'screenshots');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const log = [];
  const iPhone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();

  const step = async (name, fn) => {
    try {
      await fn();
      log.push(`PASS ${name}`);
      console.log(`PASS ${name}`);
    } catch (e) {
      log.push(`FAIL ${name}: ${e.message.slice(0,160)}`);
      console.log(`FAIL ${name}: ${e.message.slice(0,160)}`);
    }
  };

  // 1. dashboard load
  await step('load /dashboard', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-01-dashboard.png'), fullPage: false });
  });

  // 2. hamburger menu
  await step('find+tap hamburger', async () => {
    const ham = await page.$('[aria-label*="menu" i], button[aria-label*="Menu" i], button[aria-label*="nav" i], button:has(svg.lucide-menu)');
    if (!ham) {
      // try any button in top-left
      const btns = await page.$$('button');
      let found = null;
      for (const b of btns) {
        const box = await b.boundingBox();
        if (box && box.y < 60 && box.x < 80) { found = b; break; }
      }
      if (!found) throw new Error('no hamburger found');
      await found.tap();
    } else {
      await ham.tap();
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-02-menu-open.png'), fullPage: false });
  });

  // 3. navigate to my-tasks via menu
  await step('nav to /my-tasks via menu', async () => {
    const link = await page.$('a[href="/my-tasks"]');
    if (!link) throw new Error('no my-tasks link in menu');
    await link.tap();
    await page.waitForURL('**/my-tasks', { timeout: 8000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-03-my-tasks.png'), fullPage: false });
  });

  // 4. tap a task
  await step('tap first task row', async () => {
    // task titles are usually in table rows
    const rows = await page.$$('[role="row"], tr, [data-testid*="task"]');
    let tapped = false;
    for (const r of rows) {
      const text = (await r.innerText().catch(()=>''))?.trim();
      if (text && text.length > 5) {
        await r.tap();
        tapped = true;
        break;
      }
    }
    if (!tapped) throw new Error('no task row found');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-04-task-detail.png'), fullPage: false });
  });

  // 5. detail panel fit check
  await step('detail panel fits viewport', async () => {
    const panel = await page.$('[role="dialog"], [data-testid*="detail"], aside');
    if (!panel) throw new Error('no detail panel');
    const box = await panel.boundingBox();
    const vw = page.viewportSize().width;
    if (box && box.width > vw + 2) throw new Error(`panel w=${box.width} > viewport ${vw}`);
  });

  // 6. close panel and navigate meetings
  await step('nav to /meetings', async () => {
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(300);
    await page.goto(BASE + '/meetings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-05-meetings.png'), fullPage: false });
  });

  // 7. personal
  await step('nav to /personal', async () => {
    await page.goto(BASE + '/personal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-06-personal.png'), fullPage: false });
  });

  // 8. try command palette
  await step('open command palette (Ctrl+K)', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Meta+K').catch(()=>{});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUTDIR, 'journey-07-cmdk.png'), fullPage: false });
  });

  fs.writeFileSync(path.join(__dirname, 'journey.log'), log.join('\n'));
  console.log('\n--- done ---');
  await browser.close();
})();
