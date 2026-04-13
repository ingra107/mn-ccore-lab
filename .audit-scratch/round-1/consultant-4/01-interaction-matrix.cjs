/* Round 1 — Consultant 4 — Interaction Matrix re-run
 * Tests every Round 0 finding + new probes.
 * Run: node .audit-scratch/round-1/consultant-4/01-interaction-matrix.cjs
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '01-results.json');
const results = [];
function rec(area, test, status, notes) {
  results.push({ area, test, status, notes: notes || '' });
  const tag = status.padEnd(7);
  console.log(`[${tag}] ${area} :: ${test}${notes ? '  -- ' + notes : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ========== /tasks (which redirects to /my-tasks per App.tsx:195) ==========
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  const tasksUrl = page.url();
  rec('routing', '/tasks lands somewhere usable', tasksUrl.match(/(my-tasks|tasks)/) ? 'PASS' : 'FAIL', 'url=' + tasksUrl);

  // ========== /my-tasks keyboard shortcuts (C-02 fix verification) ==========
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);
  const mtRows = await page.locator('[data-testid="task-row"], .task-grid-row, [role="row"]').count();
  rec('/my-tasks', 'rows render', mtRows > 0 ? 'PASS' : 'FAIL', `rows=${mtRows}`);

  // J should focus first row
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('body').click({ position: { x: 600, y: 400 } }).catch(() => {});
  await page.waitForTimeout(200);
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  let focusedJ = await page.locator('.task-row-focused, [data-focused="true"], [aria-selected="true"]').count();
  rec('/my-tasks', 'J focuses task row', focusedJ > 0 ? 'PASS' : 'FAIL', `focused=${focusedJ}`);

  // K
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  await page.keyboard.press('k');
  await page.waitForTimeout(200);
  let focusedK = await page.locator('.task-row-focused, [data-focused="true"]').count();
  rec('/my-tasks', 'K moves focus', focusedK > 0 ? 'PASS' : 'PARTIAL', `focused=${focusedK}`);

  // Enter opens detail
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  let detailOpen = await page.locator('[role="dialog"][aria-modal="true"]').count();
  rec('/my-tasks', 'Enter opens TaskDetailPanel', detailOpen > 0 ? 'PASS' : 'FAIL', `dialogs=${detailOpen}`);

  // Verify role=dialog + aria-modal on TaskDetailPanel (C-03)
  if (detailOpen > 0) {
    const roleAttr = await page.locator('[role="dialog"]').first().getAttribute('role');
    const ariaModal = await page.locator('[role="dialog"]').first().getAttribute('aria-modal');
    rec('TaskDetailPanel', 'has role="dialog"', roleAttr === 'dialog' ? 'PASS' : 'FAIL', `role=${roleAttr}`);
    rec('TaskDetailPanel', 'has aria-modal="true"', ariaModal === 'true' ? 'PASS' : 'FAIL', `aria-modal=${ariaModal}`);
    // aria-labelledby
    const labelledby = await page.locator('[role="dialog"]').first().getAttribute('aria-labelledby');
    rec('TaskDetailPanel', 'has aria-labelledby', labelledby ? 'PASS' : 'PARTIAL', `aria-labelledby=${labelledby}`);
  }

  // Escape closes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  detailOpen = await page.locator('[role="dialog"][aria-modal="true"]').count();
  rec('/my-tasks', 'Escape closes detail panel', detailOpen === 0 ? 'PASS' : 'FAIL', `dialogs=${detailOpen}`);

  // C opens create modal
  await page.keyboard.press('c');
  await page.waitForTimeout(500);
  const createOpen = await page.locator('[role="dialog"]').filter({ hasText: /Create|New Task/i }).count();
  rec('/my-tasks', 'C opens CreateTaskModal', createOpen > 0 ? 'PASS' : 'FAIL', `modals=${createOpen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ========== H-23: Escape inside textarea must NOT close detail panel ==========
  // Reopen panel
  await page.keyboard.press('j');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  detailOpen = await page.locator('[role="dialog"][aria-modal="true"]').count();
  if (detailOpen > 0) {
    // Find a textarea inside the dialog and type, then Escape
    const ta = page.locator('[role="dialog"] textarea').first();
    const taExists = await ta.count();
    if (taExists > 0) {
      await ta.click();
      await page.keyboard.type('test typing');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const stillOpen = await page.locator('[role="dialog"][aria-modal="true"]').count();
      rec('TaskDetailPanel', 'Escape in textarea does NOT close panel (H-23)', stillOpen > 0 ? 'PASS' : 'FAIL', `still=${stillOpen}`);
    } else {
      rec('TaskDetailPanel', 'Escape in textarea (H-23)', 'INFO', 'no textarea found in detail panel');
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ========== /tasks page (if it routes to /tasks proper) ==========
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('body').click({ position: { x: 600, y: 400 } });
  await page.waitForTimeout(200);

  // ========== Status pill click → InlineCellSelect (H-14 portal fix) ==========
  const statusBtns = await page.locator('button[aria-haspopup="listbox"], .task-grid-row button').count();
  rec('/my-tasks', 'status pill buttons present', statusBtns > 0 ? 'PASS' : 'INFO', `buttons=${statusBtns}`);

  // Try clicking a status pill
  const firstStatus = page.locator('button[aria-haspopup="listbox"]').first();
  if (await firstStatus.count() > 0) {
    await firstStatus.click({ trial: false }).catch(() => {});
    await page.waitForTimeout(300);
    // Dropdown rendered via portal should be a child of body, not inside the row
    const portaledListbox = await page.locator('body > [role="listbox"], body > div[role="listbox"]').count();
    const anyListbox = await page.locator('[role="listbox"]').count();
    rec('InlineCellSelect', 'dropdown ARIA role=listbox (M-17)', anyListbox > 0 ? 'PASS' : 'FAIL', `listboxes=${anyListbox}`);
    rec('InlineCellSelect', 'portaled to body (H-14)', portaledListbox > 0 ? 'PASS' : 'PARTIAL', `body-children=${portaledListbox}`);
    // option roles
    const optionCount = await page.locator('[role="option"]').count();
    rec('InlineCellSelect', 'options have role="option"', optionCount > 0 ? 'PASS' : 'FAIL', `options=${optionCount}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ========== UndoToast: change a status, expect toast, click undo ==========
  const statusBtn2 = page.locator('button[aria-haspopup="listbox"]').first();
  if (await statusBtn2.count() > 0) {
    await statusBtn2.click().catch(() => {});
    await page.waitForTimeout(300);
    const opts = page.locator('[role="option"]');
    const oc = await opts.count();
    if (oc >= 2) {
      await opts.nth(1).click().catch(() => {});
      await page.waitForTimeout(800);
      const toast = await page.locator('[role="status"], .undo-toast, [aria-live="polite"]').filter({ hasText: /undo/i }).count();
      rec('UndoToast', 'appears after status change', toast > 0 ? 'PASS' : 'PARTIAL', `toasts=${toast}`);
      // try undo button
      const undoBtn = page.locator('button').filter({ hasText: /^Undo$/i });
      if (await undoBtn.count() > 0) {
        await undoBtn.first().click().catch(() => {});
        await page.waitForTimeout(500);
        rec('UndoToast', 'Undo button clickable', 'PASS');
      }
    }
  }

  // ========== Bulk action toolbar (H-24): single-checkbox should now show toolbar ==========
  const checkboxes = page.locator('input[type="checkbox"]');
  const cbCount = await checkboxes.count();
  rec('/my-tasks', 'checkboxes present', cbCount > 0 ? 'PASS' : 'INFO', `count=${cbCount}`);
  if (cbCount > 0) {
    await checkboxes.nth(1).check({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    // BulkActionToolbar uses translateY + opacity, opacity:1 when count>=1
    const toolbarVis = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div, section'));
      for (const el of all) {
        const txt = el.textContent || '';
        if (txt.includes('selected') && txt.length < 200) {
          const cs = getComputedStyle(el);
          if (parseFloat(cs.opacity) > 0.5) return { found: true, opacity: cs.opacity, text: txt.slice(0, 80) };
        }
      }
      return { found: false };
    });
    rec('BulkActionToolbar', 'visible at count>=1 (H-24)', toolbarVis.found ? 'PASS' : 'FAIL', JSON.stringify(toolbarVis));
    // uncheck
    await checkboxes.nth(1).uncheck({ force: true }).catch(() => {});
  }

  // ========== Cmd+K CommandPalette ==========
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const cpOpen = await page.locator('[role="combobox"], [role="dialog"]').filter({ hasText: /search|command/i }).count();
  rec('CommandPalette', 'Ctrl+K opens', cpOpen > 0 ? 'PASS' : 'FAIL', `dialogs=${cpOpen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ========== ? opens ShortcutHelp ==========
  await page.keyboard.press('Shift+?');
  await page.waitForTimeout(400);
  let shHelp = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  rec('ShortcutHelp', '? opens (M-18)', shHelp > 0 ? 'PASS' : 'FAIL', `dialogs=${shHelp}`);
  // Escape closes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  shHelp = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  rec('ShortcutHelp', 'Escape closes (M-18)', shHelp === 0 ? 'PASS' : 'FAIL', `dialogs=${shHelp}`);

  // ========== /personal kb shortcut wiring (R3-D) ==========
  await page.goto(BASE + '/personal', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('body').click({ position: { x: 600, y: 400 } });
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  const personalFocused = await page.locator('.task-row-focused, [data-focused="true"]').count();
  rec('/personal', 'J focuses task (C-02 fix)', personalFocused > 0 ? 'PASS' : 'PARTIAL', `focused=${personalFocused}`);

  // ========== /tasks (the actual route, not redirect) - test if exists ==========
  await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('body').click({ position: { x: 600, y: 400 } });
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  const tasksFocused = await page.locator('.task-row-focused, [data-focused="true"]').count();
  const tasksRows = await page.locator('.task-grid-row, [role="row"]').count();
  rec('/tasks', 'J focuses task (C-01 fix)', tasksFocused > 0 ? 'PASS' : (tasksRows > 0 ? 'FAIL' : 'INFO'), `focused=${tasksFocused} rows=${tasksRows}`);

  // ========== Title click vs status click precision (H-25) ==========
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);
  // Find first task title and click it -> should open detail panel
  const titleEl = page.locator('.task-grid-row a, [data-testid="task-title"], .task-grid-row [class*="title"]').first();
  if (await titleEl.count() > 0) {
    await titleEl.click().catch(() => {});
    await page.waitForTimeout(500);
    const dp = await page.locator('[role="dialog"][aria-modal="true"]').count();
    rec('TaskGridView', 'title click opens detail (H-25)', dp > 0 ? 'PASS' : 'PARTIAL', `dialog=${dp}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ========== Mobile (C-09) — touch handler on TaskGridView row ==========
  const mobile = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const mp = await mobile.newPage();
  await mp.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' }).catch(() => {});
  await mp.waitForTimeout(2500);
  const mobileRows = await mp.locator('.task-grid-row, [role="row"], [data-testid="task-row"]').count();
  rec('mobile/my-tasks', 'rows render', mobileRows > 0 ? 'PASS' : 'INFO', `rows=${mobileRows}`);
  if (mobileRows > 0) {
    const firstRow = mp.locator('.task-grid-row, [role="row"], [data-testid="task-row"]').first();
    await firstRow.tap({ force: true }).catch(() => {});
    await mp.waitForTimeout(700);
    const mDetail = await mp.locator('[role="dialog"][aria-modal="true"]').count();
    rec('mobile/my-tasks', 'tap row opens detail (C-09)', mDetail > 0 ? 'PASS' : 'FAIL', `dialog=${mDetail}`);
  }
  await mobile.close();

  // ========== Other modals — focus trap, escape ==========
  // Already verified ShortcutHelp + CommandPalette + TaskDetailPanel above

  // ========== /projects, /ideas, /decisions kb nav ==========
  for (const route of ['/projects', '/ideas', '/decisions', '/deadlines']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('body').click({ position: { x: 600, y: 400 } });
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    const f = await page.locator('.task-row-focused, [data-focused="true"], [aria-selected="true"]').count();
    rec(route, 'J kb nav', f > 0 ? 'PASS' : 'PARTIAL', `focused=${f}`);
  }

  // ========== N opens create on /ideas, /decisions ==========
  for (const route of ['/ideas', '/decisions']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.locator('body').click({ position: { x: 600, y: 400 } });
    await page.keyboard.press('n');
    await page.waitForTimeout(500);
    const m = await page.locator('[role="dialog"]').count();
    rec(route, 'N opens create modal', m > 0 ? 'PASS' : 'FAIL', `dialogs=${m}`);
    await page.keyboard.press('Escape');
  }

  // Save
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(counts, null, 2));
  console.log(`Saved -> ${OUT}`);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
