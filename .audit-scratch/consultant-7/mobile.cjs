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

  page.on('pageerror', e => log('PAGE ERROR:', e.message.slice(0, 200)));

  const overflowCheck = async (label) => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vw: window.innerWidth }));
    log(`[overflow ${label}]`, JSON.stringify(r), r.sw > r.cw ? 'HORIZ-SCROLL' : 'ok');
    return r;
  };

  try {
    log('=== MOBILE 390x844 iPhone 13 ===');
    await page.goto('https://mn-ccore-lab.pages.dev/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('landing');
    await page.screenshot({ path: path.join(OUT, 'm01-landing.png'), fullPage: false });

    log('--- /dashboard ---');
    await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await overflowCheck('dashboard');
    await page.screenshot({ path: path.join(OUT, 'm02-dashboard.png'), fullPage: true });

    // Hamburger menu check
    const hamburgerSelectors = [
      'button[aria-label*="menu" i]',
      'button[aria-label*="navigation" i]',
      'button:has(svg.lucide-menu)',
      '[data-testid="mobile-menu-toggle"]',
      'header button',
    ];
    let hamburgerFound = false;
    for (const sel of hamburgerSelectors) {
      const c = await page.locator(sel).count();
      if (c > 0) { log(`Hamburger selector matched: ${sel} (${c})`); hamburgerFound = true; }
    }
    // Try clicking first likely hamburger
    try {
      const btn = page.locator('button').filter({ has: page.locator('svg') }).first();
      const before = await page.locator('aside a, nav a').count();
      log('Nav links before hamburger click:', before);
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(800);
      const after = await page.locator('aside a, nav a').count();
      log('Nav links after hamburger click:', after);
      await page.screenshot({ path: path.join(OUT, 'm03-hamburger-open.png') });
      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (e) { log('Hamburger click error:', e.message.slice(0, 100)); }

    log('--- /personal mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/personal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('personal');
    await page.screenshot({ path: path.join(OUT, 'm04-personal.png'), fullPage: true });

    log('--- /tasks mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await overflowCheck('tasks');
    await page.screenshot({ path: path.join(OUT, 'm05-tasks.png'), fullPage: true });

    // Measure touch target sizes on tasks page
    const touchTargets = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, input[type="checkbox"], select'));
      const sizes = btns.slice(0, 60).map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) };
      }).filter(s => s.w > 0 && s.h > 0);
      const under44 = sizes.filter(s => s.w < 44 || s.h < 44);
      return { total: sizes.length, under44count: under44.length, under44sample: under44.slice(0, 15), sampleAll: sizes.slice(0, 10) };
    });
    log('Touch targets /tasks:', JSON.stringify(touchTargets));

    // Try tapping a task
    try {
      const firstRow = page.locator('[role="row"], tbody tr, [data-testid*="task-row"]').first();
      if (await firstRow.count()) {
        const box = await firstRow.boundingBox();
        log('First task row box:', JSON.stringify(box));
        await firstRow.tap();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'm06-task-tap.png'), fullPage: false });
      }
    } catch (e) { log('Task tap error:', e.message.slice(0, 100)); }

    log('--- /my-tasks mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await overflowCheck('my-tasks');
    await page.screenshot({ path: path.join(OUT, 'm07-my-tasks.png'), fullPage: true });

    log('--- /projects mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('projects');
    await page.screenshot({ path: path.join(OUT, 'm08-projects.png'), fullPage: true });

    log('--- /manuscripts mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/manuscripts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('manuscripts');
    await page.screenshot({ path: path.join(OUT, 'm09-manuscripts.png'), fullPage: true });

    log('--- /deadlines mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/deadlines', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('deadlines');
    await page.screenshot({ path: path.join(OUT, 'm10-deadlines.png'), fullPage: true });

    log('--- /meetings mobile ---');
    await page.goto('https://mn-ccore-lab.pages.dev/meetings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await overflowCheck('meetings');
    await page.screenshot({ path: path.join(OUT, 'm11-meetings.png'), fullPage: true });

    // Open command palette via button if accessible
    log('--- search/command palette test ---');
    try {
      await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      // try Ctrl+K trigger
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'm12-cmdk.png') });
    } catch (e) { log('cmdk:', e.message.slice(0, 80)); }

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'mobile.log'), LOG.join('\n'));
    await browser.close();
  }
})();
