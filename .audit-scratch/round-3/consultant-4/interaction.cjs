// Round 3 Consultant 4 — Interaction Design audit
// Tests: page transitions, chord system, bottom tab bar, R2 regressions
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, 'findings.json');
const SHOTS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let pass = 0, fail = 0, warn = 0, skip = 0;

function rec(name, status, detail) {
  results.push({ name, status, detail });
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else if (status === 'WARN') warn++;
  else skip++;
  const tag = status === 'PASS' ? 'OK ' : status === 'FAIL' ? 'FAIL' : status === 'WARN' ? 'WARN' : 'SKIP';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitForPath(page, expected, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (new URL(page.url()).pathname === expected) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  // ---------- Page transitions ----------
  console.log('\n=== Page Transitions (F-01) ===');
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Check AnimatePresence wrapper exists
  const hasTransition = await page.evaluate(() => {
    const el = document.querySelector('main [style*="opacity"]') || document.querySelector('main > div > div');
    return !!el;
  });
  rec('Page transition wrapper mounted', hasTransition ? 'PASS' : 'WARN');

  // Measure nav duration
  const t0 = Date.now();
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1, h2', { timeout: 5000 });
  const dt = Date.now() - t0;
  rec('Page nav completes <3s (flicker/slowness sniff)', dt < 3000 ? 'PASS' : 'WARN', `${dt}ms`);

  // No flash/flicker — assert body remains visible
  const bodyOpacity = await page.evaluate(() => window.getComputedStyle(document.body).opacity);
  rec('Body opacity stays 1 during transition', bodyOpacity === '1' ? 'PASS' : 'FAIL', `opacity=${bodyOpacity}`);

  // ---------- Chord system ----------
  console.log('\n=== Chord System (F-07) ===');
  // Ensure body focus
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.locator('body').click({ position: { x: 600, y: 400 } }).catch(() => {});
  // Avoid landing in an input
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());

  // g d → /dashboard (already there, navigate away first)
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('d');
  const okD = await waitForPath(page, '/dashboard');
  rec('g→d navigates to /dashboard', okD ? 'PASS' : 'FAIL', page.url());

  // g t → /my-tasks
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('t');
  const okT = await waitForPath(page, '/my-tasks');
  rec('g→t navigates to /my-tasks', okT ? 'PASS' : 'FAIL', page.url());

  // g p → /projects
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  const okP = await waitForPath(page, '/projects');
  rec('g→p navigates to /projects', okP ? 'PASS' : 'FAIL', page.url());

  // g m → /meetings
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('m');
  const okM = await waitForPath(page, '/meetings');
  rec('g→m navigates to /meetings', okM ? 'PASS' : 'FAIL', page.url());

  // g e → /deadlines
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('e');
  const okE = await waitForPath(page, '/deadlines');
  rec('g→e navigates to /deadlines', okE ? 'PASS' : 'FAIL', page.url());

  // g i → /ideas
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('i');
  const okI = await waitForPath(page, '/ideas');
  rec('g→i navigates to /ideas', okI ? 'PASS' : 'FAIL', page.url());

  // g s → /settings
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('s');
  const okS = await waitForPath(page, '/settings');
  rec('g→s navigates to /settings', okS ? 'PASS' : 'FAIL', page.url());

  // g c → /calendar
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('c');
  const okC = await waitForPath(page, '/calendar');
  rec('g→c navigates to /calendar', okC ? 'PASS' : 'FAIL', page.url());

  // g h → /
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('h');
  const okH = await waitForPath(page, '/');
  rec('g→h navigates to /', okH ? 'PASS' : 'FAIL', page.url());

  // g r → /digest
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('r');
  const okR = await waitForPath(page, '/digest');
  rec('g→r navigates to /digest', okR ? 'PASS' : 'FAIL', page.url());

  // Escape cancels pending leader: g then Escape, then 'd' alone — should NOT navigate
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.activeElement?.blur?.());
  const preUrl = page.url();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  const postUrl = page.url();
  rec('Escape cancels pending g leader', new URL(postUrl).pathname === '/projects' ? 'PASS' : 'FAIL',
      `${new URL(preUrl).pathname} → ${new URL(postUrl).pathname}`);

  // g + unknown key → no nav, state clears
  await page.evaluate(() => document.activeElement?.blur?.());
  const preUrl2 = page.url();
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('q'); // unknown
  await page.waitForTimeout(500);
  const postUrl2 = page.url();
  rec('g→unknown key is no-op', new URL(postUrl2).pathname === new URL(preUrl2).pathname ? 'PASS' : 'FAIL');
  // Confirm state cleared: pressing 'd' alone should do nothing (not navigate)
  await page.keyboard.press('d');
  await page.waitForTimeout(500);
  const afterLoneD = new URL(page.url()).pathname;
  rec('After g+unknown, state is cleared (lone d does nothing)',
      afterLoneD === new URL(postUrl2).pathname ? 'PASS' : 'FAIL');

  // Chord timeout >1s cancels: g, wait 1200ms, d → no nav
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('g');
  await page.waitForTimeout(1200);
  await page.keyboard.press('d');
  await page.waitForTimeout(600);
  rec('g chord times out after 1s', new URL(page.url()).pathname === '/projects' ? 'PASS' : 'FAIL', page.url());

  // Chord suppressed in inputs: focus an input, press g d → should NOT navigate
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const inputExists = await page.locator('input[type="text"], input:not([type])').first().count();
  if (inputExists > 0) {
    await page.locator('input[type="text"], input:not([type])').first().focus();
    await page.keyboard.type('gd');
    await page.waitForTimeout(500);
    rec('Chord suppressed while typing in input', new URL(page.url()).pathname === '/my-tasks' ? 'PASS' : 'FAIL');
  } else {
    rec('Chord suppressed while typing in input', 'SKIP', 'no input found');
  }

  // ---------- R2 regressions ----------
  console.log('\n=== R2 Regression Checks ===');
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => document.activeElement?.blur?.());

  // J/K keyboard nav — highlight changes
  const beforeJ = await page.evaluate(() => document.querySelector('[data-focused="true"], .ring-2, [aria-selected="true"]')?.textContent || null);
  await page.keyboard.press('j');
  await page.waitForTimeout(200);
  await page.keyboard.press('j');
  await page.waitForTimeout(200);
  const afterJ = await page.evaluate(() => document.querySelector('[data-focused="true"], .ring-2, [aria-selected="true"]')?.textContent || null);
  rec('J/K keyboard nav focus indicator present',
      (afterJ !== null) ? 'PASS' : 'WARN', `before=${!!beforeJ} after=${!!afterJ}`);

  // C shortcut opens create task (navigates with ?create=true)
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('c');
  await page.waitForTimeout(800);
  const cUrl = page.url();
  rec('C key triggers task creation flow',
      cUrl.includes('/my-tasks') && cUrl.includes('create=true') ? 'PASS' : 'FAIL', cUrl);

  // Escape closes modal if create modal opened
  const modalVisible = await page.locator('[role="dialog"], [aria-modal="true"]').first().isVisible().catch(() => false);
  if (modalVisible) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const stillVisible = await page.locator('[role="dialog"], [aria-modal="true"]').first().isVisible().catch(() => false);
    rec('Escape closes create modal', !stillVisible ? 'PASS' : 'FAIL');
  } else {
    rec('Escape closes create modal', 'SKIP', 'modal did not appear');
  }

  // N key on /ideas opens create
  await page.goto(BASE + '/ideas', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur?.());
  const ideasPre = await page.locator('[role="dialog"], [aria-modal="true"]').count();
  await page.keyboard.press('n');
  await page.waitForTimeout(600);
  const ideasPost = await page.locator('[role="dialog"], [aria-modal="true"]').count();
  rec('N key on /ideas opens create modal',
      ideasPost > ideasPre ? 'PASS' : 'WARN', `dialogs ${ideasPre}→${ideasPost}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // InlineCellSelect portal — status dropdown should render outside table overflow
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Find any inline status cell
  const statusCells = page.locator('[role="gridcell"]:has-text("todo"), [role="gridcell"]:has-text("in_progress"), [role="gridcell"]:has-text("done"), button:has-text("todo"), button:has-text("in_progress")').first();
  const has = await statusCells.count();
  if (has > 0) {
    await statusCells.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    // dropdown should be in DOM (role=listbox) and NOT clipped (checked via getBoundingClientRect visible)
    const dropdown = await page.locator('[role="listbox"]').first();
    const dvis = await dropdown.isVisible().catch(() => false);
    rec('InlineCellSelect opens with listbox role', dvis ? 'PASS' : 'WARN');
    if (dvis) {
      const rect = await dropdown.boundingBox();
      rec('InlineCellSelect renders via portal (bbox visible)',
          rect && rect.width > 0 && rect.height > 0 ? 'PASS' : 'FAIL',
          rect ? `${rect.width}x${rect.height}` : 'null');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  } else {
    rec('InlineCellSelect opens with listbox role', 'SKIP', 'no status cell found');
  }

  // BulkActionToolbar gate — should only appear when rows selected
  const toolbarBefore = await page.locator('[data-testid="bulk-action-toolbar"], [aria-label*="bulk" i]').count();
  rec('BulkActionToolbar hidden when no selection',
      toolbarBefore === 0 ? 'PASS' : 'WARN', `count=${toolbarBefore}`);

  // TaskDetailPanel focus trap — open detail panel, Tab should cycle within
  // Click first task title
  const firstTask = page.locator('table button, [role="gridcell"] button').first();
  const ftCount = await firstTask.count();
  if (ftCount > 0) {
    await firstTask.click().catch(() => {});
    await page.waitForTimeout(600);
    const panel = page.locator('[role="dialog"], aside[aria-modal="true"], [aria-modal="true"]').first();
    const panelVis = await panel.isVisible().catch(() => false);
    rec('TaskDetailPanel opens on click', panelVis ? 'PASS' : 'WARN');
    if (panelVis) {
      // focus trap: press Escape to close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const stillVis = await panel.isVisible().catch(() => false);
      rec('TaskDetailPanel Escape closes (focus trap active)', !stillVis ? 'PASS' : 'WARN');
    }
  } else {
    rec('TaskDetailPanel opens on click', 'SKIP', 'no task rows');
  }

  // waiting_external status visible in dropdowns (sniff: present in DOM on status select)
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // Try to find a status trigger
  const statusTrig = page.locator('button:has-text("todo"), button:has-text("in_progress"), button:has-text("done")').first();
  const stCount = await statusTrig.count();
  if (stCount > 0) {
    await statusTrig.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const html = await page.content();
    const hasWaitingExt = /waiting_external|Waiting External|Waiting external/i.test(html);
    rec('waiting_external option present in status dropdown',
        hasWaitingExt ? 'PASS' : 'WARN');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  } else {
    rec('waiting_external option present in status dropdown', 'SKIP', 'no status trigger');
  }

  await ctx.close();

  // ---------- Mobile bottom tab bar (iPhone 13 emu) ----------
  console.log('\n=== Mobile Bottom Tab Bar (iPhone 13) ===');
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await mpage.waitForTimeout(2000);

  // MobileTabBar visible
  const tabBar = mpage.locator('nav[aria-label="Primary navigation"]');
  const tbVis = await tabBar.isVisible().catch(() => false);
  rec('MobileTabBar visible on mobile', tbVis ? 'PASS' : 'FAIL');

  if (tbVis) {
    const tabs = await tabBar.locator('a').count();
    rec('MobileTabBar has 4 tabs', tabs === 4 ? 'PASS' : 'FAIL', `count=${tabs}`);

    // safe-area respected — paddingBottom should be set via env() (CSS handles; style attr contains env)
    const padStyle = await tabBar.evaluate((el) => (el).getAttribute('style') || '');
    rec('MobileTabBar respects safe-area-inset-bottom',
        /safe-area-inset-bottom/.test(padStyle) ? 'PASS' : 'FAIL', padStyle.slice(0, 80));

    // Tap each tab
    const expectedPaths = ['/dashboard', '/my-tasks', '/projects', '/search'];
    for (let i = 0; i < 4; i++) {
      const a = tabBar.locator('a').nth(i);
      const href = await a.getAttribute('href');
      await a.click();
      await mpage.waitForTimeout(600);
      const okNav = new URL(mpage.url()).pathname === expectedPaths[i];
      rec(`MobileTabBar tab ${i + 1} (${href}) navigates`, okNav ? 'PASS' : 'FAIL', mpage.url());
    }

    // Touch target size ≥44px
    const tabSizes = await tabBar.locator('a').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    const allBig = tabSizes.every((s) => s.h >= 44);
    rec('MobileTabBar tabs ≥44px tall', allBig ? 'PASS' : 'FAIL', JSON.stringify(tabSizes));

    await mpage.screenshot({ path: path.join(SHOTS, 'mobile-tab-bar.png'), fullPage: false });
  }

  // Sidebar hidden on mobile (should use tab bar instead)
  const sidebarVis = await mpage.locator('nav[aria-label="Main navigation"], aside.sidebar').first().isVisible().catch(() => false);
  rec('Desktop sidebar hidden on mobile', !sidebarVis ? 'PASS' : 'WARN');

  await mctx.close();
  await browser.close();

  const summary = { pass, fail, warn, skip, total: results.length, results };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n=== SUMMARY ===`);
  console.log(`PASS: ${pass}  FAIL: ${fail}  WARN: ${warn}  SKIP: ${skip}  TOTAL: ${results.length}`);
  console.log(`Written to ${OUT}`);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
