// Round 2 — focus on specifics, use /tasks (has J/K), measure timings
const { chromium } = require('playwright');
const fs = require('fs');

const results = [];
function rec(name, status, notes) {
  results.push({ name, status, notes: notes || '' });
  console.log(status.padEnd(7) + ' ' + name + (notes ? ' — ' + notes : ''));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch (e) {} });

  // ─────────── /tasks — full keyboard nav expected ───────────
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  const rowCount = await page.locator('[data-testid^="task-row-"]').count();
  rec('/tasks rows present', rowCount > 0 ? 'PASS' : 'FAIL', rowCount + ' rows');

  // J/K
  await page.locator('body').click({ position: { x: 700, y: 400 } });
  await page.keyboard.press('j');
  await page.waitForTimeout(250);
  const focusedAfterJ = await page.locator('.task-row-focused').count();
  rec('/tasks J key focuses row', focusedAfterJ > 0 ? 'PASS' : 'FAIL', focusedAfterJ + ' focused');

  // Space → peek
  if (focusedAfterJ > 0) {
    await page.keyboard.press(' ');
    await page.waitForTimeout(400);
    const peekVisible = await page.locator('.task-peek-overlay, [class*="task-peek"]').first().isVisible().catch(() => false);
    rec('/tasks Space → peek overlay', peekVisible ? 'PASS' : 'FAIL');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Enter → detail
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const detailOpen = await page.locator('text=Overview').first().isVisible().catch(() => false);
  rec('/tasks Enter → detail panel', detailOpen ? 'PASS' : 'FAIL');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Right-click context menu precision
  const firstRow = page.locator('[data-testid^="task-row-"]').first();
  await firstRow.click({ button: 'right' });
  await page.waitForTimeout(400);
  const menuItems = await page.locator('[class*="task-context-menu"] button, [role="menu"] button, [role="menu"] [role="menuitem"]').count();
  rec('right-click context menu items', menuItems > 0 ? 'PASS' : 'PARTIAL', menuItems + ' items');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Click status cell → dropdown opens (InlineCellSelect)
  const statusCell = page.locator('[data-testid^="task-status-"]').first();
  await statusCell.locator('button').first().click();
  await page.waitForTimeout(400);
  const dropdownOpen = await page.locator('button:has-text("In Progress"), button:has-text("Todo"), button:has-text("Done")').count();
  rec('status click opens dropdown', dropdownOpen > 0 ? 'PASS' : 'FAIL', dropdownOpen + ' opts');

  if (dropdownOpen > 0) {
    // Pick a different option
    const currentText = await statusCell.locator('button').first().textContent();
    // Click the first dropdown option that isn't the current value
    const opts = await page.locator('[style*="padding: 7px 12px"]').all();
    let clicked = false;
    for (const opt of opts) {
      const txt = (await opt.textContent()) || '';
      if (txt && currentText && !currentText.includes(txt.trim())) {
        await opt.click();
        clicked = true;
        break;
      }
    }
    await page.waitForTimeout(700);
    const toast = await page.locator('[data-testid="undo-toast"]').isVisible().catch(() => false);
    rec('status change → undo toast', toast ? 'PASS' : 'FAIL', clicked ? '' : 'no distinct opt');
    if (toast) {
      // Verify undo button presence
      const undoBtn = await page.locator('[data-testid="undo-button"]').isVisible();
      rec('undo button visible', undoBtn ? 'PASS' : 'FAIL');
    }
  }

  // Close any dropdown/toast
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // Bulk select: click checkbox on a row
  const checkbox = page.locator('.task-row-checkbox').first();
  if (await checkbox.count() > 0) {
    await checkbox.click();
    await page.waitForTimeout(400);
    const toolbar = await page.locator('text=selected').first().isVisible().catch(() => false);
    rec('checkbox → bulk action toolbar appears', toolbar ? 'PASS' : 'FAIL');
    // Deselect
    await checkbox.click();
    await page.waitForTimeout(200);
  }

  // Multi-sort: Shift+Click column header
  const headerTitle = page.locator('[role="columnheader"]').filter({ hasText: /TITLE/i }).first();
  const headerDue = page.locator('[role="columnheader"]').filter({ hasText: /DUE/i }).first();
  if (await headerTitle.count() > 0 && await headerDue.count() > 0) {
    await headerTitle.click();
    await page.waitForTimeout(200);
    await headerDue.click({ modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    // Look for rank indicator ① or ②
    const hasRankIndicator = (await page.locator('text=/[①②]/').count()) > 0;
    rec('Shift+Click multi-sort indicators', hasRankIndicator ? 'PASS' : 'FAIL');
  } else {
    rec('column header locators', 'PARTIAL', 'headers not found by role');
  }

  // Column resize drag handle — just check it exists
  const resizeHandles = await page.locator('[style*="cursor: col-resize"], [class*="resize-handle"]').count();
  rec('column resize handles present', resizeHandles > 0 ? 'PASS' : 'FAIL', resizeHandles + ' handles');

  // ─────────── Measure CSS transitions ───────────
  const rowTransition = await page.locator('[data-testid^="task-row-"]').first().evaluate(el => {
    return getComputedStyle(el).transition;
  });
  rec('row transition css', 'INFO', rowTransition);

  const statusPillTransition = await page.locator('.status-transition').first().evaluate(el => {
    return getComputedStyle(el).transition;
  }).catch(() => 'N/A');
  rec('status pill transition', 'INFO', statusPillTransition);

  // ─────────── Shortcuts helper ───────────
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Shift+/');
  await page.waitForTimeout(500);
  const shortcutsHelpVisible = await page.locator('text=Keyboard').first().isVisible().catch(() => false);
  rec('? opens shortcuts help modal', shortcutsHelpVisible ? 'PASS' : 'FAIL');

  // Tab focus trap within
  if (shortcutsHelpVisible) {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closed = !(await page.locator('text=Keyboard').first().isVisible().catch(() => false));
    rec('? modal closes on Escape', closed ? 'PASS' : 'FAIL');
  }

  fs.writeFileSync('C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/03-results.json', JSON.stringify(results, null, 2));
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  const pt = results.filter(r => r.status === 'PARTIAL').length;
  console.log('\n=== ' + p + 'P / ' + f + 'F / ' + pt + 'Partial ===');
  await browser.close();
})();
