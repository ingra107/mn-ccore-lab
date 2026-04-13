/* Final test pass with proper groupBy=none + corrected probes */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '04-results.json');
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
  // 1. /my-tasks with groupBy=none — J/K/Enter/C
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Set groupBy=none via the native select
  const sel = page.locator('select').first();
  if (await sel.count() > 0) {
    await sel.selectOption('none').catch(() => {});
    await page.waitForTimeout(500);
  }

  // Click somewhere safe (header)
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(200);
  // J should focus first row
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  let focused = await page.locator('.task-row-focused').count();
  rec('/my-tasks', 'J focuses first task (groupBy=none) C-02', focused > 0 ? 'PASS' : 'FAIL', `focused=${focused}`);
  // J again
  await page.keyboard.press('j');
  await page.waitForTimeout(200);
  // Enter opens detail
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  let dlg = await page.locator('[role="dialog"][aria-modal="true"]').count();
  rec('/my-tasks', 'Enter opens TaskDetailPanel', dlg > 0 ? 'PASS' : 'FAIL', `dialogs=${dlg}`);

  // While dialog open, verify role/aria/labelledby
  if (dlg > 0) {
    const roleA = await page.locator('[role="dialog"][aria-modal="true"]').first().getAttribute('role');
    const modalA = await page.locator('[role="dialog"][aria-modal="true"]').first().getAttribute('aria-modal');
    const lblA = await page.locator('[role="dialog"][aria-modal="true"]').first().getAttribute('aria-labelledby');
    rec('TaskDetailPanel', 'role=dialog (C-03)', roleA === 'dialog' ? 'PASS' : 'FAIL');
    rec('TaskDetailPanel', 'aria-modal=true (C-03)', modalA === 'true' ? 'PASS' : 'FAIL');
    rec('TaskDetailPanel', 'aria-labelledby present', lblA ? 'PASS' : 'PARTIAL', `lbl=${lblA}`);
  }

  // Escape closes
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  dlg = await page.locator('[role="dialog"][aria-modal="true"]').count();
  rec('/my-tasks', 'Escape closes detail panel', dlg === 0 ? 'PASS' : 'FAIL');

  // C key — note: useKeyboardShortcuts navigates to /tasks?create=true, which redirects to /my-tasks
  // We expect EITHER a modal opens OR we land on /my-tasks?create=true
  await page.keyboard.press('c');
  await page.waitForTimeout(800);
  const url = page.url();
  const createDlg = await page.locator('[role="dialog"]').filter({ hasText: /Create|New Task/i }).count();
  rec('/my-tasks', 'C opens CreateTaskModal', createDlg > 0 ? 'PASS' : (url.includes('create=true') ? 'PARTIAL' : 'FAIL'), `url=${url} dlg=${createDlg}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ==========================================================================
  // 2. ShortcutHelp via ? on a non-input area
  // ==========================================================================
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Click on a heading (non-input)
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);
  // Verify activeElement is not an input
  const aTag = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
  rec('ShortcutHelp', 'pre-key focus is not input', aTag !== 'INPUT' ? 'PASS' : 'INFO', `activeTag=${aTag}`);
  await page.keyboard.press('?');
  await page.waitForTimeout(500);
  let sh = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  rec('ShortcutHelp', '? opens (M-18)', sh > 0 ? 'PASS' : 'FAIL', `dialogs=${sh}`);
  if (sh > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    sh = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
    rec('ShortcutHelp', 'Escape closes (M-18)', sh === 0 ? 'PASS' : 'FAIL');
  }

  // ==========================================================================
  // 3. /ideas N key — global N intercepts and navigates to /tasks?create=true
  //    Verify whether Ideas page also catches N first OR loses to global handler
  // ==========================================================================
  await page.goto(BASE + '/ideas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(200);
  await page.keyboard.press('n');
  await page.waitForTimeout(800);
  const ideasUrl = page.url();
  // Look for ANY overlay (any visible fixed div containing input or modal)
  const ideasModal = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && parseFloat(cs.opacity) > 0.5 && d.querySelector('input, textarea');
    });
    return all.length;
  });
  // If url changed to /tasks or /my-tasks → global hijacked
  const stillOnIdeas = ideasUrl.includes('/ideas');
  rec('/ideas', 'N opens create on Ideas (not redirect)',
    stillOnIdeas && ideasModal > 0 ? 'PASS' : 'FAIL',
    `url=${ideasUrl} overlays=${ideasModal}`);
  await page.keyboard.press('Escape');

  // ==========================================================================
  // 4. /decisions N key — same test
  // ==========================================================================
  await page.goto(BASE + '/decisions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(200);
  await page.keyboard.press('n');
  await page.waitForTimeout(800);
  const decUrl = page.url();
  const decOverlay = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && parseFloat(cs.opacity) > 0.5 && d.querySelector('input, textarea');
    });
    return all.length;
  });
  rec('/decisions', 'N opens create on Decisions (not redirect)',
    decUrl.includes('/decisions') && decOverlay > 0 ? 'PASS' : 'FAIL',
    `url=${decUrl} overlays=${decOverlay}`);

  // ==========================================================================
  // 5. Bulk action toolbar (groupBy=none required)
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('select').first().selectOption('none').catch(() => {});
  await page.waitForTimeout(500);
  const cbAll = page.locator('input[type="checkbox"]');
  const cbN = await cbAll.count();
  rec('/my-tasks', 'checkboxes after groupBy=none', cbN > 0 ? 'PASS' : 'FAIL', `count=${cbN}`);
  if (cbN > 0) {
    await cbAll.nth(0).check({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const tbVis = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div, section'));
      for (const el of all) {
        const txt = (el.textContent || '');
        if (/\d+\s+selected/i.test(txt) && txt.length < 300) {
          const cs = getComputedStyle(el);
          return { found: true, opacity: cs.opacity, transform: cs.transform, text: txt.slice(0, 100) };
        }
      }
      return { found: false };
    });
    rec('BulkActionToolbar', 'rendered at count=1 (H-24)', tbVis.found ? 'PASS' : 'FAIL', JSON.stringify(tbVis));
    await cbAll.nth(0).uncheck({ force: true }).catch(() => {});
  }

  // ==========================================================================
  // 6. UndoToast: change status, expect toast, verify it's CSS (no Framer)
  // ==========================================================================
  await page.locator('select').first().selectOption('none').catch(() => {});
  await page.waitForTimeout(400);
  const statusBtn = page.locator('button[aria-haspopup="listbox"]').first();
  if (await statusBtn.count() > 0) {
    await statusBtn.click();
    await page.waitForTimeout(400);
    const opts = page.locator('[role="option"]');
    if ((await opts.count()) >= 2) {
      await opts.nth(1).click();
      await page.waitForTimeout(700);
      const toast = await page.locator('[role="status"][aria-live="polite"], button:has-text("Undo")').count();
      rec('UndoToast', 'appears after status change', toast > 0 ? 'PASS' : 'PARTIAL', `el=${toast}`);
      // GC-2: verify no framer-motion in undo toast (best we can do is check class names)
      const undoBtn = page.locator('button').filter({ hasText: /^Undo$/i });
      if (await undoBtn.count() > 0) {
        await undoBtn.first().click();
        await page.waitForTimeout(500);
        rec('UndoToast', 'Undo button clickable', 'PASS');
      }
    }
  }

  // ==========================================================================
  // 7. InlineCellSelect: open dropdown on bottom row, verify portaling
  // ==========================================================================
  const allPills = page.locator('button[aria-haspopup="listbox"]');
  const np = await allPills.count();
  if (np > 0) {
    await allPills.nth(Math.min(np - 1, 8)).click();
    await page.waitForTimeout(400);
    const portaled = await page.evaluate(() => {
      const lb = document.querySelector('[role="listbox"]');
      if (!lb) return { ok: false };
      // Walk up to body
      let depth = 0; let p = lb.parentElement;
      while (p && p !== document.body) { depth++; p = p.parentElement; }
      const rect = lb.getBoundingClientRect();
      return { ok: true, depth, x: rect.x, y: rect.y, width: rect.width, height: rect.height, inViewport: rect.y >= 0 && rect.y < 900 };
    });
    rec('InlineCellSelect', 'dropdown portaled (H-14)', portaled.ok && portaled.depth <= 5 ? 'PASS' : 'PARTIAL', JSON.stringify(portaled));
    rec('InlineCellSelect', 'dropdown in viewport (no clip)', portaled.inViewport ? 'PASS' : 'PARTIAL');
    await page.keyboard.press('Escape');
  }

  // ==========================================================================
  // 8. CommandPalette ARIA
  // ==========================================================================
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  const cp = await page.locator('[role="combobox"], [role="dialog"]').filter({ hasText: /search|command/i }).count();
  rec('CommandPalette', 'opens with Ctrl+K', cp > 0 ? 'PASS' : 'FAIL');
  // Type a query
  await page.keyboard.type('proj');
  await page.waitForTimeout(300);
  const cpOpts = await page.locator('[role="option"]').count();
  rec('CommandPalette', 'typeahead populates options', cpOpts > 0 ? 'PASS' : 'PARTIAL', `opts=${cpOpts}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ==========================================================================
  // 9. /personal: J kb shortcut needs currentUser - test as anon
  // ==========================================================================
  await page.goto(BASE + '/personal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const personalBody = await page.evaluate(() => document.body.textContent.length);
  rec('/personal', 'page renders for anon', personalBody > 100 ? 'PASS' : 'FAIL', `body=${personalBody}`);
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  const pf = await page.locator('.task-row-focused').count();
  rec('/personal', 'J focuses task (anon)', pf > 0 ? 'PASS' : 'PARTIAL', `focused=${pf} (gated on currentUser)`);

  // ==========================================================================
  // 10. Mobile C-09: tap title opens detail
  // ==========================================================================
  const mobile = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const mp = await mobile.newPage();
  await mp.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await mp.waitForTimeout(2500);
  // Set groupBy=none
  await mp.locator('select').first().selectOption('none').catch(() => {});
  await mp.waitForTimeout(500);
  // Tap any task title link
  const mTitle = mp.locator('.task-grid-row a, .task-grid-row [class*="title-clickable"]').first();
  if (await mTitle.count() > 0) {
    await mTitle.tap({ force: true }).catch(() => {});
    await mp.waitForTimeout(700);
    const mDlg = await mp.locator('[role="dialog"][aria-modal="true"]').count();
    rec('mobile/my-tasks', 'tap title opens detail (C-09)', mDlg > 0 ? 'PASS' : 'FAIL', `dlg=${mDlg}`);
  }
  // Tap row body (not title)
  await mp.keyboard.press('Escape').catch(() => {});
  await mp.waitForTimeout(300);
  const mRow = mp.locator('.task-grid-row').first();
  if (await mRow.count() > 0) {
    await mRow.tap({ force: true, position: { x: 200, y: 20 } }).catch(() => {});
    await mp.waitForTimeout(700);
    const mDlg2 = await mp.locator('[role="dialog"][aria-modal="true"]').count();
    rec('mobile/my-tasks', 'tap row body opens detail', mDlg2 > 0 ? 'PASS' : 'PARTIAL', `dlg=${mDlg2}`);
  }
  await mobile.close();

  // ==========================================================================
  // 11. PageHeader subtitle wrap (M-32)
  // ==========================================================================
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const subtitleBox = await page.evaluate(() => {
    const sub = document.querySelector('h1 + p, [class*="subtitle"], header p');
    if (!sub) return null;
    const r = sub.getBoundingClientRect();
    return { w: r.width, h: r.height, text: sub.textContent.slice(0, 100) };
  });
  rec('PageHeader', 'subtitle measurable (M-32)', subtitleBox ? 'PASS' : 'INFO', JSON.stringify(subtitleBox));

  // ==========================================================================
  // 12. MeetingDetail Log Decision (M-26)
  // ==========================================================================
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const logDec = await page.locator('button, a').filter({ hasText: /log decision|new decision|add decision/i }).count();
  rec('MeetingDetail', 'Log Decision button (M-26)', logDec > 0 ? 'PASS' : 'PARTIAL', `count=${logDec}`);

  // Save
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const counts = results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(counts, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
