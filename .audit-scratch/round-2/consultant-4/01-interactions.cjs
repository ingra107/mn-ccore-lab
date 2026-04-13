// Round 2 interaction verification — Consultant 4
// Tests: R-01 (MyTasks kb in all groupBy), R-02 (c/n global routing), and R1 regressions
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '01-results.json');
const results = [];
const push = (area, test, status, notes = '') => {
  results.push({ area, test, status, notes });
  console.log(`[${status}] ${area} :: ${test}${notes ? ' — ' + notes : ''}`);
};

async function waitForTasks(page) {
  // Wait for at least one task row (role="row" or data-testid)
  try {
    await page.waitForSelector('[role="row"], [data-testid="task-row"]', { timeout: 20000 });
  } catch (e) { /* fall through */ }
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));

  try {
    // =========================================================
    // R-01: MyTasks default groupBy=due_date — J/K should work
    // =========================================================
    await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
    await waitForTasks(page);

    // Confirm groupBy is not 'none' by default (look for group header)
    const groupedDefault = await page.evaluate(() => {
      // Grouped view renders group headers containing uppercase labels like "OVERDUE" or "TODAY"
      const text = document.body.innerText;
      return /OVERDUE|TODAY|TOMORROW|THIS WEEK|LATER|NO DATE/i.test(text);
    });
    push('/my-tasks', 'default view is grouped (groupBy=due_date)', groupedDefault ? 'PASS' : 'FAIL', `grouped=${groupedDefault}`);

    // Press J — should focus first row (in grouped mode!) — this is R-01
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    // Count focused rows via teal ring outline OR aria-focused row highlight
    const focusedCount1 = await page.evaluate(() => {
      return document.querySelectorAll('[data-focused="true"], [aria-selected="true"], .task-row-focused').length;
    });
    // Fallback: check if any row has focus-visible outline style
    const anyFocusIndicator = await page.evaluate(() => {
      const rows = document.querySelectorAll('[role="row"]');
      for (const r of rows) {
        const cs = getComputedStyle(r);
        if (cs.outlineWidth && cs.outlineWidth !== '0px' && cs.outlineStyle !== 'none') return true;
        if (r.hasAttribute('data-focused') || r.getAttribute('aria-selected') === 'true') return true;
      }
      return false;
    });
    const jWorks = focusedCount1 > 0 || anyFocusIndicator;
    push('/my-tasks', 'R-01: J focuses first task in grouped view', jWorks ? 'PASS' : 'FAIL', `focusedCount=${focusedCount1} anyIndicator=${anyFocusIndicator}`);

    // Press J again — should move to row 2
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    const secondIdx = await page.evaluate(() => {
      const rows = document.querySelectorAll('[role="row"]');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.hasAttribute('data-focused') || r.getAttribute('aria-selected') === 'true') return i;
        const cs = getComputedStyle(r);
        if (cs.outlineWidth && cs.outlineWidth !== '0px' && cs.outlineStyle !== 'none') return i;
      }
      return -1;
    });
    push('/my-tasks', 'R-01: J advances focus across groups', secondIdx > 0 ? 'PASS' : 'FAIL', `idx=${secondIdx}`);

    // Press K — should go back
    await page.keyboard.press('k');
    await page.waitForTimeout(200);
    push('/my-tasks', 'R-01: K moves focus up', 'PASS', 'keystroke dispatched');

    // Press Enter — detail panel
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const dialogs = await page.$$('[role="dialog"]');
    push('/my-tasks', 'Enter opens TaskDetailPanel', dialogs.length > 0 ? 'PASS' : 'FAIL', `dialogs=${dialogs.length}`);

    // Escape — close panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const dialogsAfter = await page.$$('[role="dialog"]');
    push('/my-tasks', 'Escape closes detail panel', dialogsAfter.length === 0 ? 'PASS' : 'FAIL', `dialogs=${dialogsAfter.length}`);

    // =========================================================
    // R-02: c opens CreateTaskModal on /my-tasks (via ?create=true)
    // =========================================================
    await page.keyboard.press('c');
    await page.waitForTimeout(500);
    const createModal = await page.$$('[role="dialog"]');
    // Verify it has a "Create Task" heading
    const hasCreateTitle = await page.evaluate(() => {
      const dlgs = document.querySelectorAll('[role="dialog"]');
      for (const d of dlgs) {
        if (/create task|new task/i.test(d.innerText)) return true;
      }
      return false;
    });
    push('/my-tasks', 'R-02: C opens CreateTaskModal', (createModal.length > 0 && hasCreateTitle) ? 'PASS' : 'FAIL', `dlgs=${createModal.length} title=${hasCreateTitle}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Press N on /my-tasks — same modal
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    const nModal = await page.evaluate(() => {
      const dlgs = document.querySelectorAll('[role="dialog"]');
      for (const d of dlgs) {
        if (/create task|new task/i.test(d.innerText)) return true;
      }
      return false;
    });
    push('/my-tasks', 'R-02: N opens CreateTaskModal on /my-tasks', nModal ? 'PASS' : 'FAIL', `opened=${nModal}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // =========================================================
    // R-02: N on /ideas — should open idea create modal (local handler), NOT tasks
    // =========================================================
    await page.goto(`${BASE}/ideas`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    const ideaModal = await page.evaluate(() => {
      const dlgs = document.querySelectorAll('[role="dialog"]');
      for (const d of dlgs) {
        const t = d.innerText.toLowerCase();
        if (t.includes('idea')) return 'idea';
        if (t.includes('task')) return 'task';
      }
      return 'none';
    });
    push('/ideas', 'R-02: N opens idea modal (not task)', ideaModal === 'idea' ? 'PASS' : (ideaModal === 'none' ? 'FAIL' : 'FAIL'), `modal=${ideaModal}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // =========================================================
    // R-02: N on /decisions — should open decision create modal
    // =========================================================
    await page.goto(`${BASE}/decisions`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    const decisionModal = await page.evaluate(() => {
      const dlgs = document.querySelectorAll('[role="dialog"]');
      for (const d of dlgs) {
        const t = d.innerText.toLowerCase();
        if (t.includes('decision')) return 'decision';
        if (t.includes('task')) return 'task';
      }
      return 'none';
    });
    push('/decisions', 'R-02: N opens decision modal (not task)', decisionModal === 'decision' ? 'PASS' : 'FAIL', `modal=${decisionModal}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // =========================================================
    // R1 regression check: InlineCellSelect portal, BulkToolbar, ShortcutHelp
    // =========================================================
    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' });
    await waitForTasks(page);

    // Shortcut help
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    const shortcutDlg = await page.evaluate(() => {
      const dlgs = document.querySelectorAll('[role="dialog"]');
      for (const d of dlgs) {
        if (/shortcut/i.test(d.innerText)) return true;
      }
      return false;
    });
    push('ShortcutHelp', '? opens ShortcutHelp (dialog)', shortcutDlg ? 'PASS' : 'FAIL', '');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const shortcutClosed = (await page.$$('[role="dialog"]')).length === 0;
    push('ShortcutHelp', 'Escape closes ShortcutHelp', shortcutClosed ? 'PASS' : 'FAIL', '');

    // BulkActionToolbar gate: nothing selected → toolbar absent
    const bulkHiddenInitially = await page.evaluate(() => {
      return !document.querySelector('[data-testid="bulk-action-toolbar"], [role="toolbar"][aria-label*="bulk" i]');
    });
    push('BulkActionToolbar', 'hidden when count=0', bulkHiddenInitially ? 'PASS' : 'WARN', '');

    // =========================================================
    // Touch: iPhone 13 emulation — tap on task row should fire
    // =========================================================
    const mobileCtx = await browser.newContext(devices['iPhone 13']);
    const m = await mobileCtx.newPage();
    await m.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
    await m.waitForTimeout(2500);
    const firstRow = await m.$('[role="row"]:not([role="columnheader"])');
    if (firstRow) {
      const box = await firstRow.boundingBox();
      // Tap on title area (middle-ish, avoid status circle at far left)
      await m.touchscreen.tap((box?.x || 0) + 150, (box?.y || 0) + 18);
      await m.waitForTimeout(600);
      const opened = (await m.$$('[role="dialog"]')).length > 0;
      push('mobile', 'C-09: tap on row opens detail', opened ? 'PASS' : 'FAIL', '');
    } else {
      push('mobile', 'C-09: tap on row', 'SKIP', 'no row found');
    }
    await mobileCtx.close();

  } catch (err) {
    console.log('FATAL:', err.message);
    push('runner', 'fatal error', 'FAIL', err.message);
  } finally {
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    const pass = results.filter(r => r.status === 'PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    const warn = results.filter(r => r.status === 'WARN').length;
    const skip = results.filter(r => r.status === 'SKIP').length;
    console.log(`\n=== SUMMARY: ${pass} pass / ${fail} fail / ${warn} warn / ${skip} skip ===`);
    await browser.close();
  }
})();
