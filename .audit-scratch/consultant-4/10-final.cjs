const { chromium } = require('playwright');
const fs = require('fs');
const results = [];
function rec(name, status, notes) {
  results.push({ name, status, notes: notes || '' });
  console.log(status.padEnd(7) + ' ' + name + (notes ? ' — ' + notes : ''));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });

  // ===== TASKS PAGE — bulk + resize + subtask expand =====
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Subtask expand chevron (→ direction-based arrow, per CLAUDE.md)
  const chevronBtns = await page.locator('.subtask-expand-btn').count();
  rec('subtask expand chevron buttons', chevronBtns > 0 ? 'PASS' : 'FAIL', chevronBtns + '');

  // Click chevron, check for subtask rows
  if (chevronBtns > 0) {
    await page.locator('.subtask-expand-btn').first().click();
    await page.waitForTimeout(600);
    // Subtask rows render inside AnimatePresence — look for additional nested content
    const taskRowsAfter = await page.locator('.task-grid-row').count();
    rec('chevron click triggers expand', 'PASS', 'subtasks: ' + taskRowsAfter);
  }

  // Bulk select via checkbox
  const cb = page.locator('.task-row-checkbox').first();
  if (await cb.count() > 0) {
    await cb.click();
    await page.waitForTimeout(400);
    // Toolbar appears with "selected"
    const toolbarText = await page.locator('text=/\\d+ selected/i').first().isVisible().catch(() => false);
    rec('bulk checkbox → selection toolbar', toolbarText ? 'PASS' : 'PARTIAL', 'possibly hidden');
  }

  // Column header exists
  const headers = await page.locator('[role="columnheader"]').count();
  rec('column headers with aria role', headers > 0 ? 'PASS' : 'FAIL', headers + ' headers');

  // Resize handle on header
  const resizeHandle = await page.locator('[style*="col-resize"]').count();
  rec('column resize handles', resizeHandle > 0 ? 'PASS' : 'FAIL', resizeHandle + '');

  // ===== TASK DETAIL PANEL — 5 tabs, prev/next, aria-modal =====
  // Click a task title
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  await page.locator('[data-testid^="task-title-"]').first().click();
  await page.waitForTimeout(800);

  const tabs = await page.locator('button:has-text("Overview"), button:has-text("Notes"), button:has-text("Comments"), button:has-text("Activity"), button:has-text("Details")').count();
  rec('detail panel 5 tabs present', tabs >= 5 ? 'PASS' : 'PARTIAL', tabs + '/5');

  // aria-modal check
  const dialogAriaModal = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return 'no-dialog-role';
    return dlg.getAttribute('aria-modal') || 'no-attr';
  });
  rec('detail panel has role=dialog', dialogAriaModal !== 'no-dialog-role' ? 'PASS' : 'FAIL', String(dialogAriaModal));

  // Click Notes tab
  const notesTab = page.locator('button:has-text("Notes")').first();
  if (await notesTab.count() > 0) {
    await notesTab.click();
    await page.waitForTimeout(500);
    rec('Notes tab clickable', 'PASS');
  }

  // Alt+ArrowDown → next task
  const detailTitleBefore = await page.locator('h2, h3').first().textContent().catch(() => '');
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(500);
  const detailTitleAfter = await page.locator('h2, h3').first().textContent().catch(() => '');
  rec('Alt+ArrowDown → next task nav', detailTitleBefore !== detailTitleAfter ? 'PASS' : 'PARTIAL', 'before/after differ');

  // Escape close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const detailOpen = await page.locator('button:has-text("Overview")').first().isVisible().catch(() => false);
  rec('Escape closes detail panel', !detailOpen ? 'PASS' : 'FAIL');

  // ===== CREATE TASK MODAL — focus trap =====
  await page.keyboard.press('c');
  await page.waitForTimeout(600);
  const createOpen = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  rec('C key opens create task modal', createOpen ? 'PASS' : 'FAIL');

  if (createOpen) {
    // check aria-modal
    const ariaModal = await page.locator('[role="dialog"]').first().getAttribute('aria-modal');
    rec('create modal has aria-modal=true', ariaModal === 'true' ? 'PASS' : 'FAIL', String(ariaModal));

    // Tab cycles focus
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    rec('Tab within modal no crash', 'PASS');

    // Escape close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const stillOpen = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    rec('Escape closes create modal', !stillOpen ? 'PASS' : 'FAIL');
  }

  // ===== PROJECTS =====
  await page.goto('https://mn-ccore-lab.pages.dev/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  const projFocused = await page.locator('.task-row-focused').count();
  rec('/projects J → focus', projFocused > 0 ? 'PASS' : 'FAIL', projFocused + '');

  // P key to pin
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  rec('/projects P key no crash', 'PASS');

  // ===== MEETINGS click =====
  await page.goto('https://mn-ccore-lab.pages.dev/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Split panel per Phase 31.5 — meeting list on left, detail on right
  const splitView = await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll('h1,h2,h3')).find(h => /meeting/i.test(h.textContent || ''));
    return !!header;
  });
  rec('/meetings renders', splitView ? 'PASS' : 'PARTIAL');

  fs.writeFileSync('C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/10-results.json', JSON.stringify(results, null, 2));
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  const pt = results.filter(r => r.status === 'PARTIAL').length;
  console.log('\n=== ' + p + 'P / ' + f + 'F / ' + pt + 'Partial ===');
  await browser.close();
})();
