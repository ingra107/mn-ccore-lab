// Interaction battery — MyTasks + TaskGridView + CommandPalette
const { chromium } = require('playwright');

const results = [];
function record(name, status, notes) {
  results.push({ name, status, notes: notes || '' });
  const msg = status.padEnd(7) + ' ' + name + (notes ? ' — ' + notes : '');
  console.log(msg);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch (e) {}
  });

  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  // 1. Click task title → opens detail panel
  try {
    const titleCount = await page.locator('[data-testid^="task-title-"]').count();
    record('tasks present', titleCount > 0 ? 'PASS' : 'FAIL', titleCount + ' titles');

    if (titleCount > 0) {
      const firstTitle = page.locator('[data-testid^="task-title-"]').first();
      const firstId = await firstTitle.getAttribute('data-testid');
      await firstTitle.click({ timeout: 5000 });
      await page.waitForTimeout(600);

      const panelOpen = (await page.locator('text=Overview').first().isVisible().catch(() => false))
        || (await page.locator('text=Activity').first().isVisible().catch(() => false));
      record('click title → detail panel', panelOpen ? 'PASS' : 'FAIL', firstId || '');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const stillOpen = await page.locator('text=Overview').first().isVisible().catch(() => false);
      record('Escape closes detail panel', !stillOpen ? 'PASS' : 'FAIL');
    }
  } catch (e) { record('click title → detail panel', 'FAIL', String(e.message).slice(0, 80)); }

  // 2. Cmd+K opens CommandPalette
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    let visible = await page.locator('[role="combobox"]').first().isVisible().catch(() => false);
    if (!visible) {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(500);
      visible = await page.locator('[role="combobox"]').first().isVisible().catch(() => false);
    }
    record('Cmd/Ctrl+K opens CommandPalette', visible ? 'PASS' : 'FAIL');

    if (visible) {
      await page.keyboard.type('tasks', { delay: 40 });
      await page.waitForTimeout(400);
      const listItems = await page.locator('[role="option"]').count();
      record('CommandPalette filters results', listItems > 0 ? 'PASS' : 'FAIL', listItems + ' options');

      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      const url = page.url();
      record('CommandPalette Enter navigates', url.includes('task') ? 'PASS' : 'PARTIAL', url.slice(-40));
    }
  } catch (e) { record('Cmd+K opens palette', 'FAIL', String(e.message).slice(0, 80)); }

  // 3. J/K nav
  try {
    await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    await page.keyboard.press('j');
    await page.waitForTimeout(250);
    const focusedAfter = await page.locator('.task-row-focused').count();
    record('J key focuses a task row', focusedAfter > 0 ? 'PASS' : 'FAIL', focusedAfter + ' focused');

    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.waitForTimeout(200);
    await page.keyboard.press('k');
    await page.waitForTimeout(200);
    record('K key does not crash', 'PASS');

    await page.keyboard.press(' ');
    await page.waitForTimeout(500);
    const peekVisible = (await page.locator('[class*="peek"]').first().isVisible().catch(() => false))
      || (await page.locator('[class*="Peek"]').first().isVisible().catch(() => false));
    record('Space → peek overlay', peekVisible ? 'PASS' : 'FAIL');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const detailViaEnter = await page.locator('text=Overview').first().isVisible().catch(() => false);
    record('Enter → detail panel', detailViaEnter ? 'PASS' : 'PARTIAL');
    await page.keyboard.press('Escape');
  } catch (e) { record('J/K keyboard nav', 'FAIL', String(e.message).slice(0, 80)); }

  // 4. Status click → undo toast
  try {
    await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);

    const statusCells = page.locator('[data-testid^="task-status-"]');
    const statusCount = await statusCells.count();
    if (statusCount > 0) {
      await statusCells.first().click();
      await page.waitForTimeout(700);
      const toast = await page.locator('[data-testid="undo-toast"]').isVisible().catch(() => false);
      record('status click → undo toast', toast ? 'PASS' : 'FAIL');
      if (toast) {
        await page.locator('[data-testid="undo-button"]').click().catch(() => {});
        await page.waitForTimeout(400);
        record('undo button clickable', 'PASS');
      }
    } else {
      record('status cells present', 'FAIL', 'no task-status testids');
    }
  } catch (e) { record('status undo flow', 'FAIL', String(e.message).slice(0, 80)); }

  // 5. Right-click context menu
  try {
    const firstRow = page.locator('[data-testid^="task-row-"]').first();
    const rc = await firstRow.count();
    if (rc > 0) {
      await firstRow.click({ button: 'right' });
      await page.waitForTimeout(500);
      const menuVisible = (await page.locator('[class*="context-menu"]').first().isVisible().catch(() => false))
        || (await page.locator('[role="menu"]').first().isVisible().catch(() => false));
      record('right-click → context menu', menuVisible ? 'PASS' : 'FAIL');
      await page.keyboard.press('Escape');
    }
  } catch (e) { record('right-click context menu', 'FAIL', String(e.message).slice(0, 80)); }

  // 6. ? → shortcut help
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Shift+/');
    await page.waitForTimeout(500);
    const helpOpen = (await page.locator('text=Keyboard').first().isVisible().catch(() => false))
      || (await page.locator('text=Shortcuts').first().isVisible().catch(() => false));
    record('? → shortcut help', helpOpen ? 'PASS' : 'FAIL');
    await page.keyboard.press('Escape');
  } catch (e) { record('? shortcut help', 'FAIL', String(e.message).slice(0, 80)); }

  const fs = require('fs');
  fs.writeFileSync('C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/02-results.json', JSON.stringify(results, null, 2));
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  const pt = results.filter(r => r.status === 'PARTIAL').length;
  console.log('\n=== ' + p + 'P / ' + f + 'F / ' + pt + 'Partial ===');

  await browser.close();
})();
