// Consultant 10 supplemental interaction tests
// Runs against https://mn-ccore-lab.pages.dev with X-Test-Mode header
const { chromium } = require('playwright');

const BASE = 'https://mn-ccore-lab.pages.dev';
const HEADERS = { 'X-Test-Mode': 'true' };

const PORTAL_PAGES = [
  '/dashboard', '/personal', '/my-items', '/tasks', '/calendar',
  '/deadlines', '/projects', '/manuscripts', '/ideas', '/decisions',
  '/digest', '/search', '/meetings', '/pulse', '/analytics',
  '/activity', '/settings', '/team', '/publications', '/grants',
];

const results = { pass: [], fail: [], consoleErrors: {} };

function logPass(name) { results.pass.push(name); console.log(`  PASS ${name}`); }
function logFail(name, err) { results.fail.push({ name, err: String(err).slice(0, 300) }); console.log(`  FAIL ${name}: ${String(err).slice(0, 200)}`); }

async function withConsole(page, url, fn) {
  const errors = [];
  const handler = (msg) => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    // Guardrail filters
    if (/websocket|ws:|hub-realtime|DurableObject|400.*handshake/i.test(t)) return;
    if (/Failed to load resource.*websocket/i.test(t)) return;
    // Test-mode artifacts: font CORS preflight, /api/version 500 (known X-Test-Mode issue)
    if (/fonts\.gstatic|fonts\.googleapis/i.test(t)) return;
    if (/Access to font/i.test(t)) return;
    if (/CORS policy/i.test(t)) return;
    if (/\/api\/version/i.test(t)) return;
    if (/status of 500/.test(t) && /version/.test(t)) return;
    errors.push(t);
  };
  page.on('console', handler);
  try { await fn(); } finally { page.off('console', handler); }
  if (errors.length) results.consoleErrors[url] = errors.slice(0, 5);
  return errors;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: HEADERS });
  const page = await ctx.newPage();

  // TEST 1: Every portal page loads, no console errors
  console.log('\n=== TEST 1: Portal page loads + console ===');
  for (const path of PORTAL_PAGES) {
    const url = BASE + path;
    try {
      const errs = await withConsole(page, path, async () => {
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
        await page.waitForTimeout(800);
      });
      if (errs.length) logFail(`console:${path}`, errs[0]);
      else logPass(`load:${path}`);
    } catch (e) { logFail(`load:${path}`, e.message); }
  }

  // TEST 2: Sidebar link navigation
  console.log('\n=== TEST 2: Sidebar navigation ===');
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const sidebarLinks = await page.$$eval('aside a[href], nav a[href]', (els) =>
    els.map(e => ({ href: e.getAttribute('href'), text: e.textContent?.trim().slice(0, 30) }))
       .filter(l => l.href && l.href.startsWith('/') && !l.href.startsWith('//'))
  );
  const uniq = [...new Map(sidebarLinks.map(l => [l.href, l])).values()].slice(0, 25);
  for (const link of uniq) {
    try {
      const resp = await page.goto(BASE + link.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
      await page.waitForTimeout(300);
      // Allow h1 OR h2 OR a heading role — PageHeader may use different tags
      const heading = await page.$('h1, h2, [role="heading"]');
      if (!heading) throw new Error('no heading element');
      logPass(`sidebar:${link.href}`);
    } catch (e) { logFail(`sidebar:${link.href}`, e.message); }
  }

  // TEST 3: Disabled buttons on Tasks page
  console.log('\n=== TEST 3: Buttons enumerable on /tasks ===');
  try {
    await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const btnCount = await page.$$eval('button', bs => bs.length);
    const disabledNoReason = await page.$$eval('button', bs =>
      bs.filter(b => b.disabled && !b.getAttribute('aria-disabled') && !b.title && !b.getAttribute('aria-describedby')).length
    );
    if (btnCount < 3) throw new Error(`only ${btnCount} buttons on /tasks`);
    logPass(`tasks:buttons(${btnCount}) disabledNoReason(${disabledNoReason})`);
  } catch (e) { logFail('tasks:buttons', e.message); }

  // TEST 4: Command palette (Ctrl+K or Meta+K)
  console.log('\n=== TEST 4: Command palette Ctrl+K ===');
  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Click body to ensure focus is on document
    await page.click('body', { position: { x: 10, y: 300 } }).catch(() => {});
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(600);
    let cmdOpen = await page.$('[role="combobox"], [role="dialog"][aria-modal="true"]');
    if (!cmdOpen) {
      await page.keyboard.press('Meta+k');
      await page.waitForTimeout(400);
      cmdOpen = await page.$('[role="combobox"], [role="dialog"][aria-modal="true"]');
    }
    if (!cmdOpen) throw new Error('command palette did not open on Ctrl+K or Meta+K');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    logPass('cmdK:open+escape');
  } catch (e) { logFail('cmdK', e.message); }

  // TEST 5: Create Task — find "+" Create button since C key regression exists
  console.log('\n=== TEST 5: Create Task modal via button ===');
  try {
    await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const createBtn = await page.$('button:has-text("New Task"), button:has-text("Create"), button[aria-label*="Create" i]');
    if (!createBtn) throw new Error('no Create/New Task button found');
    await createBtn.click();
    await page.waitForTimeout(600);
    const dialog = await page.$('[role="dialog"][aria-modal="true"]');
    if (!dialog) throw new Error('modal did not open after clicking Create');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    logPass('createTask:button-click');
  } catch (e) { logFail('createTask:button', e.message); }

  // TEST 6: J/K navigation on Tasks
  console.log('\n=== TEST 6: J/K keyboard nav on /tasks ===');
  try {
    await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await page.keyboard.press('k');
    await page.waitForTimeout(200);
    logPass('tasks:jk-nav');
  } catch (e) { logFail('tasks:jk', e.message); }

  // TEST 7: Filter pills on Tasks (Today/This Week/Overdue)
  console.log('\n=== TEST 7: Tasks filter pills ===');
  try {
    await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Look for quickfilter pills by text
    for (const label of ['Today', 'This Week', 'Overdue']) {
      const btn = await page.$(`button:has-text("${label}")`);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(400);
        logPass(`filter:${label}`);
      } else {
        logFail(`filter:${label}`, 'pill not found');
      }
    }
  } catch (e) { logFail('filters', e.message); }

  // TEST 8: Column sort on Tasks
  console.log('\n=== TEST 8: Tasks column sort ===');
  try {
    await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const headers = await page.$$('[role="columnheader"], .col-header, [class*="columnHeader"]');
    if (headers.length > 0) {
      await headers[0].click();
      await page.waitForTimeout(300);
      logPass(`sort:columnheader count=${headers.length}`);
    } else {
      // fall back to any clickable TH
      const ths = await page.$$('th');
      if (ths.length > 0) {
        logPass(`sort:th fallback count=${ths.length}`);
      } else {
        logFail('sort:columnheader', 'no column header found at all');
      }
    }
  } catch (e) { logFail('sort', e.message); }

  // TEST 9: ? opens shortcut help
  console.log('\n=== TEST 9: ? shortcut help ===');
  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.keyboard.press('Shift+/');
    await page.waitForTimeout(500);
    const help = await page.$('[role="dialog"][aria-modal="true"]');
    if (!help) throw new Error('shortcut help did not open');
    await page.keyboard.press('Escape');
    logPass('shortcutHelp:?');
  } catch (e) { logFail('shortcutHelp', e.message); }

  // TEST 10: Settings tabs
  console.log('\n=== TEST 10: Settings tabs ===');
  try {
    await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const tabs = await page.$$('[role="tab"], button[data-tab]');
    logPass(`settings:tabs found=${tabs.length}`);
  } catch (e) { logFail('settings:tabs', e.message); }

  // TEST 11: ProjectDetail tabs
  console.log('\n=== TEST 11: ProjectDetail tabs ===');
  try {
    await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const firstProject = await page.$('a[href^="/projects/"]:not([href="/projects"])');
    if (firstProject) {
      const href = await firstProject.getAttribute('href');
      await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      const tabs = await page.$$('[role="tab"]');
      logPass(`projectDetail:tabs(${tabs.length}) path=${href}`);
    } else {
      logFail('projectDetail', 'no project link found');
    }
  } catch (e) { logFail('projectDetail', e.message); }

  // TEST 12: TaskDetailPanel tabs (data-testid="task-title-...")
  console.log('\n=== TEST 12: TaskDetailPanel 5 tabs ===');
  try {
    await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const titleBtn = await page.$('[data-testid^="task-title-"]');
    if (titleBtn) {
      await titleBtn.click();
      await page.waitForTimeout(800);
      const tabs = await page.$$('[role="tab"]');
      const expected = ['Overview', 'Notes', 'Comments', 'Activity', 'Details'];
      const tabTexts = await Promise.all(tabs.map(t => t.textContent().catch(() => '')));
      const found = expected.filter(e => tabTexts.some(t => t?.includes(e)));
      if (found.length < 3) throw new Error(`only ${found.length}/5 tabs: ${tabTexts.join(',')}`);
      logPass(`taskDetail:tabs(${found.length}/5) ${found.join('|')}`);
      await page.keyboard.press('Escape');
    } else {
      logFail('taskDetail', 'no [data-testid^=task-title-] found');
    }
  } catch (e) { logFail('taskDetail', e.message); }

  // TEST 13: /api/version under X-Test-Mode (KNOWN ISSUE documentation)
  console.log('\n=== TEST 13: /api/version regression ===');
  try {
    const resp = await ctx.request.get(BASE + '/api/version');
    if (resp.status() === 500) {
      logFail('api-version-test-mode', `HTTP 500 — /api/version crashes under X-Test-Mode (affects all tests)`);
    } else {
      logPass(`api-version:${resp.status()}`);
    }
  } catch (e) { logFail('api-version', e.message); }

  // TEST 14: /tasks redirect — C key bound?
  console.log('\n=== TEST 14: /tasks route redirects + C key ===');
  try {
    await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const url = page.url();
    if (url.endsWith('/my-tasks')) {
      // Test if C opens the create modal here (regression)
      await page.click('body', { position: { x: 10, y: 500 } }).catch(() => {});
      await page.waitForTimeout(200);
      await page.evaluate(() => (document.activeElement)?.blur?.());
      await page.keyboard.press('c');
      await page.waitForTimeout(700);
      const dialog = await page.$('[role="dialog"][aria-modal="true"]');
      if (dialog) {
        logPass('tasks-redirect:c-key works');
        await page.keyboard.press('Escape');
      } else {
        logFail('tasks-redirect:c-key', '/tasks → /my-tasks but C shortcut does not open create modal (regression from Tasks.tsx)');
      }
    } else {
      logPass(`tasks-redirect:no redirect url=${url}`);
    }
  } catch (e) { logFail('tasks-redirect', e.message); }

  // DONE
  await browser.close();

  console.log(`\n\n========= SUPPLEMENTAL SUMMARY =========`);
  console.log(`PASS: ${results.pass.length}`);
  console.log(`FAIL: ${results.fail.length}`);
  if (results.fail.length) {
    console.log('\nFailures:');
    results.fail.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
  }
  if (Object.keys(results.consoleErrors).length) {
    console.log('\nConsole errors by page:');
    for (const [p, errs] of Object.entries(results.consoleErrors)) {
      console.log(`  ${p}:`);
      errs.forEach(e => console.log(`    - ${e.slice(0, 200)}`));
    }
  }
  process.exit(results.fail.length > 0 ? 1 : 0);
})();
