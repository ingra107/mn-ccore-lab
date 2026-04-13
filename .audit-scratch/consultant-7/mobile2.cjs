const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const LOG = [];
const log = (...a) => { const s = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '); LOG.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();

  try {
    // HAMBURGER TEST on dashboard
    log('=== HAMBURGER VALIDATION ===');
    await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const navBtn = page.locator('button[aria-label*="navigation" i]').first();
    log('navigation button count:', await navBtn.count());
    const navBox = await navBtn.boundingBox();
    log('navigation button box:', JSON.stringify(navBox));
    await navBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'x01-hamburger-open.png'), fullPage: false });
    // count visible nav links
    const visible = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const vis = links.filter(a => {
        const r = a.getBoundingClientRect();
        const cs = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      return vis.length;
    });
    log('Visible links after open:', visible);
    // Close with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'x02-hamburger-closed.png') });

    // PERSONAL OVERFLOW DIAGNOSIS
    log('=== /personal overflow diagnosis ===');
    await page.goto('https://mn-ccore-lab.pages.dev/personal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const offenders = await page.evaluate(() => {
      const vw = window.innerWidth;
      const all = Array.from(document.querySelectorAll('*'));
      const bad = [];
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.width > vw + 1) {
          bad.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), w: Math.round(r.width), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) });
        }
        if (bad.length > 25) break;
      }
      return { vw, offenders: bad };
    });
    log('Personal overflow offenders:', JSON.stringify(offenders));
    await page.screenshot({ path: path.join(OUT, 'x03-personal-full.png'), fullPage: true });

    // TASK TAP on mobile using data-testid or text
    log('=== /tasks — try tapping a task title ===');
    await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const rowCount = await page.locator('[role="row"]').count();
    log('role=row count on mobile /tasks:', rowCount);
    const gridCell = await page.locator('[role="gridcell"]').count();
    log('role=gridcell count:', gridCell);
    // try data-testid
    const tids = await page.locator('[data-testid]').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('data-testid')))].slice(0, 40));
    log('data-testids present:', JSON.stringify(tids));
    // Take full-page screenshot of tasks
    await page.screenshot({ path: path.join(OUT, 'x04-tasks-full.png'), fullPage: true });

    // measure row heights if any
    const rowHeights = await page.evaluate(() => Array.from(document.querySelectorAll('[role="row"]')).slice(0, 10).map(r => { const b = r.getBoundingClientRect(); return { w: Math.round(b.w || b.width), h: Math.round(b.height) }; }));
    log('row heights:', JSON.stringify(rowHeights));

    // look for filter pill "Mine"
    const mineBtn = page.getByRole('button', { name: /^mine$/i }).first();
    if (await mineBtn.count()) {
      const mb = await mineBtn.boundingBox();
      log('Mine pill box:', JSON.stringify(mb));
      await mineBtn.tap();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'x05-tasks-mine-filter.png'), fullPage: true });
      const rowsAfter = await page.locator('[role="row"]').count();
      log('Rows after Mine filter:', rowsAfter);
    }

    // Try finding task title text and tapping
    const anyRow = await page.locator('[role="row"]').nth(1); // skip header
    const count2 = await page.locator('[role="row"]').count();
    if (count2 > 1) {
      try {
        const box = await anyRow.boundingBox();
        log('second row box:', JSON.stringify(box));
        if (box) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, 'x06-task-tapped.png'), fullPage: false });
          // detail panel visible?
          const panel = await page.locator('[role="dialog"], [aria-modal="true"]').count();
          log('Modal/dialog after tap:', panel);
        }
      } catch (e) { log('tap err:', e.message.slice(0, 100)); }
    }

    // MOBILE CREATE TASK MODAL TEST
    log('=== Create task modal on mobile ===');
    const newTaskBtn = page.getByRole('button', { name: /new task/i }).first();
    if (await newTaskBtn.count()) {
      await newTaskBtn.tap();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, 'x07-create-modal.png'), fullPage: false });
      const modalBox = await page.locator('[role="dialog"], [aria-modal="true"]').first().boundingBox().catch(() => null);
      log('Modal box:', JSON.stringify(modalBox));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'mobile2.log'), LOG.join('\n'));
    await browser.close();
  }
})();
