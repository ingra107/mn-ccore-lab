// Round 1 audit — Consultant 7 (PCCM Fellow)
// Desktop + iPhone 13 walkthrough of mn-ccore-lab.pages.dev
// Verifies Round 0 hard blockers and Phase 31.5 mobile fixes.

const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://mn-ccore-lab.pages.dev';

function log(...args) {
  const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  console.log(line);
  fs.appendFileSync(path.join(OUT, 'audit.log'), line + '\n');
}

async function measureTouchTargets(page, label) {
  const data = await page.evaluate(() => {
    const sel = 'button, a, [role="button"], input, select, [role="checkbox"], [role="tab"], [role="link"]';
    const els = Array.from(document.querySelectorAll(sel));
    const visible = els.filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const small = [];
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        small.push({
          tag: el.tagName,
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return { total: visible.length, small: small.slice(0, 40), smallCount: small.length };
  });
  log(`[touch:${label}] visible=${data.total} below44=${data.smallCount}`);
  for (const s of data.small.slice(0, 12)) {
    log(`  - ${s.tag} ${s.w}x${s.h} "${s.label}"`);
  }
  return data;
}

async function checkOverflow(page, label) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
  }));
  const overflow = o.sw - o.cw;
  log(`[overflow:${label}] scrollWidth=${o.sw} clientWidth=${o.cw} bodyScrollWidth=${o.bw} overflow=${overflow}`);
  return overflow;
}

async function runDesktop(browser) {
  log('===== DESKTOP 1440x900 =====');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') log('  console.error:', m.text().slice(0, 120)); });

  // Landing
  await page.goto(BASE, { waitUntil: 'networkidle' }).catch(e => log('goto err', e.message));
  await page.screenshot({ path: path.join(OUT, 'd01-landing.png'), fullPage: false });
  const ctas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button')).filter(el => {
      const t = (el.textContent || '').trim();
      return /open hub|explore research|our research|dashboard/i.test(t);
    }).map(el => ({ text: el.textContent.trim().slice(0, 40), href: el.getAttribute('href') }));
  });
  log('Landing CTAs:', JSON.stringify(ctas));

  // Click "Open Hub" if present
  const openHub = page.locator('a:has-text("Open Hub")').first();
  if (await openHub.count()) {
    await openHub.click();
    await page.waitForLoadState('networkidle').catch(()=>{});
    log('After Open Hub URL:', page.url());
  } else {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  }
  await page.screenshot({ path: path.join(OUT, 'd02-dashboard.png'), fullPage: false });

  // Sign-in banner check
  const banner = await page.evaluate(() => {
    const b = document.querySelector('[class*="signin"], [class*="sign-in"]') ||
              Array.from(document.querySelectorAll('div')).find(d => /sign in/i.test(d.textContent||'') && d.children.length < 8);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { h: Math.round(r.height), text: (b.textContent||'').trim().slice(0,80) };
  });
  log('Desktop sign-in banner:', JSON.stringify(banner));

  // MyTasks
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'd03-mytasks.png'), fullPage: false });
  const myTasksRows = await page.locator('[role="row"]').count();
  log('My tasks rows:', myTasksRows);

  // Tasks
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'd04-tasks.png'), fullPage: false });
  const taskRows = await page.locator('[role="row"]').count();
  log('Tasks rows:', taskRows);

  // Open task detail
  const firstTitle = page.locator('[data-testid^="task-title-"]').first();
  if (await firstTitle.count()) {
    await firstTitle.click();
    await page.waitForTimeout(500);
    const dialogs = await page.locator('[role="dialog"], [aria-modal="true"]').count();
    log('Desktop tap task title — dialogs after click:', dialogs);
    await page.screenshot({ path: path.join(OUT, 'd05-task-detail.png'), fullPage: false });
    // close
    await page.keyboard.press('Escape');
  }

  // Meetings
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'd06-meetings.png'), fullPage: false });

  // Mentee milestones
  await page.goto(BASE + '/mentee-milestones', { waitUntil: 'networkidle' }).catch(e => log('mentee err', e.message));
  await page.screenshot({ path: path.join(OUT, 'd07-mentee.png'), fullPage: false });

  await ctx.close();
}

async function runMobile(browser) {
  log('===== MOBILE iPhone 13 =====');
  const iphone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iphone });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') log('  m.console.error:', m.text().slice(0, 120)); });

  // Landing
  await page.goto(BASE, { waitUntil: 'networkidle' }).catch(()=>{});
  await page.screenshot({ path: path.join(OUT, 'm01-landing.png'), fullPage: false });
  await checkOverflow(page, 'landing');

  // Open hub
  const openHub = page.locator('a:has-text("Open Hub")').first();
  if (await openHub.count()) {
    await openHub.click();
    await page.waitForLoadState('networkidle').catch(()=>{});
  } else {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'm02-dashboard.png'), fullPage: false });
  await checkOverflow(page, 'dashboard');

  // Hamburger
  const hamburger = page.locator('[aria-label*="navigation" i], [aria-label*="menu" i]').first();
  if (await hamburger.count()) {
    const box = await hamburger.boundingBox();
    log('Hamburger box:', JSON.stringify(box));
    await hamburger.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'm03-menu-open.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  } else {
    log('No hamburger button found');
  }

  // Personal page — CRITICAL: Round 0 had 222px overflow
  await page.goto(BASE + '/personal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'm04-personal.png'), fullPage: true });
  const personalOverflow = await checkOverflow(page, 'personal');
  log('PERSONAL OVERFLOW (Round 0 had 222):', personalOverflow);

  // My Tasks mobile
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'm05-mytasks.png'), fullPage: false });
  await checkOverflow(page, 'my-tasks');

  // Tasks mobile — touch targets
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'm06-tasks.png'), fullPage: false });
  await checkOverflow(page, 'tasks');
  await measureTouchTargets(page, 'tasks-mobile');

  // CRITICAL C-09: tap a task row, does detail panel open?
  const beforeDialogs = await page.locator('[role="dialog"], [aria-modal="true"]').count();
  log('Before tap dialogs:', beforeDialogs);

  const firstTitleMobile = page.locator('[data-testid^="task-title-"]').first();
  const titleCount = await firstTitleMobile.count();
  log('Task title elements found:', titleCount);
  if (titleCount > 0) {
    const box = await firstTitleMobile.boundingBox();
    log('First task title box:', JSON.stringify(box));
    // Use tap (touch event) since mobile context has hasTouch: true
    await firstTitleMobile.tap().catch(async e => {
      log('tap failed, trying click:', e.message);
      await firstTitleMobile.click();
    });
    await page.waitForTimeout(700);
    const afterDialogs = await page.locator('[role="dialog"], [aria-modal="true"]').count();
    const slideOver = await page.locator('[class*="slide-over"], [class*="detail-panel"], aside').count();
    log('AFTER TAP dialogs:', afterDialogs, 'slideovers/aside:', slideOver);
    await page.screenshot({ path: path.join(OUT, 'm07-task-after-tap.png'), fullPage: false });
    log('C-09 STATUS: ' + (afterDialogs > beforeDialogs ? 'FIXED — detail panel opens on touch' : 'STILL BROKEN — no panel after tap'));
  }

  // Try alternative: tap task row directly
  const firstRow = page.locator('[data-testid^="task-row-"]').first();
  if (await firstRow.count()) {
    const beforeD = await page.locator('[role="dialog"], [aria-modal="true"]').count();
    await firstRow.tap().catch(()=>{});
    await page.waitForTimeout(500);
    const afterD = await page.locator('[role="dialog"], [aria-modal="true"]').count();
    log(`Tap on task ROW: before=${beforeD} after=${afterD}`);
  }

  // CreateTaskModal — template chip horizontal scroll
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // Click create task button if present
  const createBtn = page.locator('button:has-text("Create"), button:has-text("New Task"), button[aria-label*="create" i]').first();
  if (await createBtn.count()) {
    await createBtn.tap().catch(()=>{});
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'm08-create-modal.png'), fullPage: false });
  }
  await page.keyboard.press('Escape');

  // Meetings mobile — back button check
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'm09-meetings-list.png'), fullPage: false });
  await checkOverflow(page, 'meetings');

  // Try opening a meeting
  const meetingItem = page.locator('[role="row"], a[href*="/meetings/"]').first();
  if (await meetingItem.count()) {
    await meetingItem.tap().catch(()=>{});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'm10-meeting-detail.png'), fullPage: false });
    const backBtn = await page.locator('button:has-text("Back"), [aria-label*="back" i]').count();
    log('Mobile meeting detail back button count:', backBtn);
  }

  // Mentee milestones
  await page.goto(BASE + '/mentee-milestones', { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'm11-mentee.png'), fullPage: false });
  await checkOverflow(page, 'mentee');

  // Final cross-page overflow sweep
  for (const p of ['/projects', '/manuscripts', '/deadlines', '/ideas']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(()=>{});
    await page.waitForTimeout(400);
    await checkOverflow(page, p.slice(1));
  }

  await ctx.close();
}

(async () => {
  fs.writeFileSync(path.join(OUT, 'audit.log'), '');
  const browser = await chromium.launch();
  try {
    await runDesktop(browser);
    await runMobile(browser);
  } catch (e) {
    log('FATAL', e.message, e.stack);
  } finally {
    await browser.close();
  }
  log('DONE');
})();
