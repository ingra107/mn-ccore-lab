/* Round 1 — deeper interaction probes after first pass surprises */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '02-results.json');
const results = [];
function rec(area, test, status, notes) {
  results.push({ area, test, status, notes: notes || '' });
  console.log(`[${status.padEnd(7)}] ${area} :: ${test}${notes ? '  -- ' + notes : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ==========================================================================
  // Test 1: /my-tasks J/K with groupBy=none
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Try to find Group By dropdown and set to None
  const groupByBefore = await page.evaluate(() => {
    // Look for any text containing "Group" near a button
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const txt = b.textContent || '';
      if (/group/i.test(txt) && txt.length < 30) return { txt: txt.trim() };
    }
    return null;
  });
  rec('/my-tasks', 'GroupBy control found', groupByBefore ? 'INFO' : 'INFO', JSON.stringify(groupByBefore));

  // Try to programmatically focus body and dispatch j
  await page.evaluate(() => document.body.focus());
  await page.waitForTimeout(100);
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  let focused = await page.locator('.task-row-focused').count();
  rec('/my-tasks', 'J with groupBy=due_date (default)', focused > 0 ? 'PASS' : 'FAIL', `focused=${focused}`);

  // Now try to switch to no grouping by clicking the GroupBy button + selecting None
  // GroupBy button is a button with text matching "due_date" or "priority" or "Group: ..."
  const grpClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'group' || t.startsWith('group') || t.includes('due_date') || t.includes('due date')) {
        b.click();
        return t;
      }
    }
    return null;
  });
  await page.waitForTimeout(400);

  // Look for "None" option
  const noneClicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="option"], li'));
    for (const e of els) {
      if ((e.textContent || '').trim().toLowerCase() === 'none') {
        e.click();
        return true;
      }
    }
    return false;
  });
  await page.waitForTimeout(500);

  await page.locator('body').click({ position: { x: 800, y: 400 } });
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  focused = await page.locator('.task-row-focused').count();
  rec('/my-tasks', 'J with groupBy=none', focused > 0 ? 'PASS' : 'FAIL', `clicked=${grpClicked} none=${noneClicked} focused=${focused}`);

  // Enter -> detail
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const dlg = await page.locator('[role="dialog"][aria-modal="true"]').count();
  rec('/my-tasks', 'Enter opens detail panel (after groupBy=none)', dlg > 0 ? 'PASS' : 'FAIL', `dialogs=${dlg}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ==========================================================================
  // Test 2: ShortcutHelp via different key methods
  // ==========================================================================
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('body').click({ position: { x: 800, y: 400 } });

  // Method 1: Shift+/
  await page.keyboard.press('Shift+/');
  await page.waitForTimeout(400);
  let sh = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  rec('ShortcutHelp', 'Shift+/ opens', sh > 0 ? 'PASS' : 'FAIL', `dialogs=${sh}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Method 2: literal '?'
  await page.keyboard.press('?');
  await page.waitForTimeout(400);
  sh = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  rec('ShortcutHelp', '? key opens', sh > 0 ? 'PASS' : 'FAIL', `dialogs=${sh}`);

  if (sh > 0) {
    // Test focus trap: tab repeatedly, focus should stay in modal
    const focusedTagsInModal = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return false;
      const a = document.activeElement;
      return modal.contains(a);
    });
    rec('ShortcutHelp', 'initial focus inside modal (focus trap)', focusedTagsInModal ? 'PASS' : 'PARTIAL');

    // Escape closes
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    sh = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
    rec('ShortcutHelp', 'Escape closes', sh === 0 ? 'PASS' : 'FAIL');
  }

  // ==========================================================================
  // Test 3: /ideas — N key with broader modal detection
  // ==========================================================================
  await page.goto(BASE + '/ideas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('body').click({ position: { x: 800, y: 400 } });
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  const ideaInputs = await page.locator('input[type="text"], textarea').count();
  const beforeNav = page.url();
  // Look for any overlay that wasn't there before
  const overlay = await page.evaluate(() => {
    // Check for fixed-position overlays with text input
    const fixed = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && d.querySelector('input, textarea');
    });
    return fixed.length;
  });
  rec('/ideas', 'N opens create overlay', overlay > 0 ? 'PASS' : 'FAIL', `fixed-overlays-with-input=${overlay}`);

  // ==========================================================================
  // Test 4: /decisions N key
  // ==========================================================================
  await page.goto(BASE + '/decisions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('body').click({ position: { x: 800, y: 400 } });
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  const decOverlay = await page.evaluate(() => {
    const fixed = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && d.querySelector('input, textarea');
    });
    return fixed.length;
  });
  rec('/decisions', 'N opens create overlay', decOverlay > 0 ? 'PASS' : 'FAIL', `fixed-overlays=${decOverlay}`);

  // ==========================================================================
  // Test 5: Bulk action toolbar — find checkboxes (may need groupBy=none view)
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Set groupBy=none again
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t.includes('group') && t.length < 30) { b.click(); break; }
    }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [role="option"], li'));
    for (const e of els) {
      if ((e.textContent || '').trim().toLowerCase() === 'none') { e.click(); return; }
    }
  });
  await page.waitForTimeout(500);

  // Now look for checkboxes
  const cbRound2 = await page.locator('input[type="checkbox"]').count();
  rec('/my-tasks', 'checkboxes after groupBy=none', cbRound2 > 0 ? 'PASS' : 'PARTIAL', `count=${cbRound2}`);
  if (cbRound2 > 0) {
    await page.locator('input[type="checkbox"]').nth(1).check({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const toolbarVis = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div, section'));
      for (const el of all) {
        const txt = (el.textContent || '');
        if (/\d+\s+selected/i.test(txt) && txt.length < 300) {
          const cs = getComputedStyle(el);
          if (parseFloat(cs.opacity) > 0.5) return { found: true, opacity: cs.opacity, text: txt.slice(0, 100) };
        }
      }
      return { found: false };
    });
    rec('BulkActionToolbar', 'visible at count>=1 (H-24)', toolbarVis.found ? 'PASS' : 'FAIL', JSON.stringify(toolbarVis));
  }

  // ==========================================================================
  // Test 6: Mobile tap on task row → detail panel (C-09)
  // ==========================================================================
  const mobile = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const mp = await mobile.newPage();
  await mp.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(2500);

  // Try tapping a title element instead of the row
  const mTitleCount = await mp.locator('.task-grid-row a, .task-grid-row [class*="title"], .task-grid-row span').count();
  if (mTitleCount > 0) {
    const t = mp.locator('.task-grid-row a, .task-grid-row [class*="title"]').first();
    if (await t.count() > 0) {
      await t.tap({ force: true }).catch(() => {});
      await mp.waitForTimeout(700);
      const dp = await mp.locator('[role="dialog"][aria-modal="true"]').count();
      rec('mobile', 'tap title opens detail (C-09)', dp > 0 ? 'PASS' : 'FAIL', `dialogs=${dp}`);
    }
  }
  await mobile.close();

  // ==========================================================================
  // Test 7: TaskDetailPanel verify dialog attributes from actual click flow
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const titleSpan = page.locator('.task-grid-row a, .task-grid-row [class*="title"], [data-testid="task-title"]').first();
  if (await titleSpan.count() > 0) {
    await titleSpan.click().catch(() => {});
    await page.waitForTimeout(600);
    const tdpRole = await page.locator('[role="dialog"]').first().getAttribute('role').catch(() => null);
    const tdpModal = await page.locator('[role="dialog"]').first().getAttribute('aria-modal').catch(() => null);
    rec('TaskDetailPanel', 'role=dialog (C-03)', tdpRole === 'dialog' ? 'PASS' : 'FAIL', `role=${tdpRole}`);
    rec('TaskDetailPanel', 'aria-modal=true (C-03)', tdpModal === 'true' ? 'PASS' : 'FAIL', `modal=${tdpModal}`);

    // H-23: typing in textarea, Escape should not close
    const ta = page.locator('[role="dialog"] textarea').first();
    if (await ta.count() > 0) {
      await ta.click();
      await page.keyboard.type('x');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const stillOpen = await page.locator('[role="dialog"][aria-modal="true"]').count();
      rec('TaskDetailPanel', 'Escape in textarea preserves panel (H-23)', stillOpen > 0 ? 'PASS' : 'FAIL', `open=${stillOpen}`);
      // Click outside textarea, escape should now close
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }
    // Final escape
    await page.locator('body').click({ position: { x: 100, y: 100 } });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ==========================================================================
  // Test 8: InlineCellSelect dropdown clipping inside virtualizer
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  // Click last visible status pill to test bottom-row dropdown clipping
  const pills = page.locator('button[aria-haspopup="listbox"]');
  const pCount = await pills.count();
  if (pCount > 0) {
    await pills.nth(Math.min(pCount - 1, 5)).click().catch(() => {});
    await page.waitForTimeout(400);
    const lb = await page.locator('[role="listbox"]').first();
    if (await lb.count() > 0) {
      const box = await lb.boundingBox();
      const inViewport = box && box.y >= 0 && box.y < 900 && box.x >= 0 && box.x < 1440;
      rec('InlineCellSelect', 'dropdown in viewport (no clipping)', inViewport ? 'PASS' : 'PARTIAL', JSON.stringify(box));
      // Verify dropdown is portaled (parent is body or near body)
      const isPortaled = await page.evaluate(() => {
        const lb = document.querySelector('[role="listbox"]');
        if (!lb) return false;
        let p = lb.parentElement;
        let depth = 0;
        while (p && p !== document.body && depth < 5) { p = p.parentElement; depth++; }
        return p === document.body && depth <= 4;
      });
      rec('InlineCellSelect', 'dropdown shallow in DOM (portaled)', isPortaled ? 'PASS' : 'PARTIAL');
      await page.keyboard.press('Escape');
    }
  }

  // ==========================================================================
  // Test 9: CommandPalette Cmd+K + ARIA combobox + Escape
  // ==========================================================================
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const cp = await page.locator('[role="combobox"], [role="dialog"]').count();
  rec('CommandPalette', 'opens with Ctrl+K', cp > 0 ? 'PASS' : 'FAIL', `el=${cp}`);
  // type to filter
  await page.keyboard.type('task');
  await page.waitForTimeout(300);
  const opts = await page.locator('[role="option"]').count();
  rec('CommandPalette', 'typeahead filters options', opts > 0 ? 'PASS' : 'PARTIAL', `options=${opts}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ==========================================================================
  // Save
  // ==========================================================================
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(counts, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
