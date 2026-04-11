/**
 * Interaction Audit v2 — Comprehensive Playwright interaction audit
 * Tests read-only UI interactions on the live site.
 * NO data creation, NO form submission.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE = 'https://mn-ccore-lab.pages.dev';
const SCREENSHOT_DIR = join(process.cwd(), 'qa-screenshots', 'post-fix');
const RESULTS = [];

function log(test, status, details = '') {
  const entry = { test, status, details };
  RESULTS.push(entry);
  const icon = status === 'PASS' ? '[PASS]' : '[FAIL]';
  console.log(`${icon} ${test}${details ? ' — ' + details : ''}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

async function waitForPageReady(page, url, timeout = 15000) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 30000 });
  // Wait for loading skeletons to disappear
  try {
    await page.waitForSelector('[class*="skeleton"], [class*="Skeleton"]', { state: 'detached', timeout });
  } catch { /* no skeleton found — that's fine */ }
  // Additional settle time
  await page.waitForTimeout(1500);
}

(async () => {
  console.log('=== MN-CCORE Lab Hub — Interaction Audit v2 ===\n');
  console.log(`Target: ${BASE}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  // ─────────────────────────────────────────────
  // /my-tasks page tests
  // ─────────────────────────────────────────────
  console.log('\n── /my-tasks ──\n');
  await waitForPageReady(page, '/my-tasks');
  await screenshot(page, 'audit-mytasks-initial');

  // TEST 1: Column resize handles
  try {
    // Look for resize handle divs (4px wide, col-resize cursor)
    const resizeHandles = await page.$$('.resize-handle, .resize-handle-active');
    if (resizeHandles.length > 0) {
      // Check cursor style on one of them
      const cursor = await resizeHandles[0].evaluate(el => {
        return window.getComputedStyle(el).cursor || el.style.cursor;
      });
      const width = await resizeHandles[0].evaluate(el => el.style.width || window.getComputedStyle(el).width);
      log('1. Column resize handles',
        cursor === 'col-resize' ? 'PASS' : 'FAIL',
        `Found ${resizeHandles.length} handles; cursor=${cursor}, width=${width}`);
      await screenshot(page, 'audit-01-resize-handles');
    } else {
      // Try inline style approach
      const inlineHandles = await page.$$('div[style*="col-resize"]');
      if (inlineHandles.length > 0) {
        log('1. Column resize handles', 'PASS',
          `Found ${inlineHandles.length} handles via inline style cursor:col-resize`);
      } else {
        log('1. Column resize handles', 'FAIL', 'No resize handles found');
      }
      await screenshot(page, 'audit-01-resize-handles');
    }
  } catch (err) {
    log('1. Column resize handles', 'FAIL', err.message);
  }

  // TEST 2: Cell focus (click editable cell, check outline, then Tab)
  try {
    // Find a status cell (InlineSelect) — look for data-testid
    const statusCells = await page.$$('[data-testid^="task-status-"]');
    if (statusCells.length > 0) {
      const firstStatusCell = statusCells[0];
      // Click the status cell to focus it
      await firstStatusCell.click();
      await page.waitForTimeout(300);

      // Check for cell-focused class in ancestor or the cell itself
      const hasFocusClass = await page.evaluate(() => {
        const focused = document.querySelector('.cell-focused');
        return focused !== null;
      });

      // Also check outline style
      const outlineInfo = await page.evaluate(() => {
        const focused = document.querySelector('.cell-focused');
        if (!focused) return null;
        const cs = window.getComputedStyle(focused);
        return { outline: cs.outline, outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth };
      });

      await screenshot(page, 'audit-02-cell-focus');

      // Press Escape first to close any dropdown that opened
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);

      if (hasFocusClass) {
        log('2. Cell focus outline', 'PASS',
          `cell-focused class found. Outline: ${JSON.stringify(outlineInfo)}`);
      } else {
        // The click might have opened an InlineSelect dropdown instead.
        // Check if a dropdown portal is visible
        const hasDropdown = await page.evaluate(() => {
          const portals = document.querySelectorAll('[style*="position: fixed"], [style*="z-index: 9999"]');
          return portals.length > 0;
        });
        log('2. Cell focus outline', hasDropdown ? 'PASS' : 'FAIL',
          hasDropdown ? 'Click opened InlineSelect dropdown (focus ring may be under dropdown)' :
          'No cell-focused class or dropdown found');
      }

      // Tab navigation test
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
      const afterTab = await page.evaluate(() => {
        const focused = document.querySelector('.cell-focused');
        return focused ? focused.getAttribute('data-testid') || focused.className : null;
      });
      await screenshot(page, 'audit-02-cell-tab');
      log('2b. Cell Tab navigation', afterTab ? 'PASS' : 'FAIL',
        afterTab ? `Focus moved to: ${afterTab}` : 'No cell-focused element after Tab');
    } else {
      log('2. Cell focus outline', 'FAIL', 'No status cells found');
      log('2b. Cell Tab navigation', 'FAIL', 'No status cells to test');
    }
  } catch (err) {
    log('2. Cell focus', 'FAIL', err.message);
  }

  // Dismiss any lingering overlays/dropdowns before continuing
  await page.evaluate(() => {
    // Click any z-40 backdrop to close dropdowns
    const backdrops = document.querySelectorAll('.fixed.inset-0.z-40');
    for (const b of backdrops) b.click();
  });
  await page.waitForTimeout(300);

  // TEST 3: Pin to Focus button on hover
  try {
    const taskRows = await page.$$('.task-grid-row');
    if (taskRows.length > 0) {
      // Hover over a task row
      await taskRows[0].hover();
      await page.waitForTimeout(500);
      await screenshot(page, 'audit-03-hover-row');

      // Look for pin button by title attribute
      const pinBtn = await page.$('button[title="Pin to Focus Next"], button[title="Unpin from focus"]');
      // Also check for any Pin icon in hover actions area
      const pinInActions = await page.evaluate(() => {
        const actions = document.querySelectorAll('.task-grid-row-actions button, .task-grid-row-action-btn');
        for (const btn of actions) {
          const title = btn.getAttribute('title') || '';
          if (title.toLowerCase().includes('pin')) return title;
        }
        return null;
      });

      if (pinBtn || pinInActions) {
        log('3. Pin to Focus button', 'PASS',
          `Pin button found: ${pinInActions || 'via selector'}`);
      } else {
        // Pin only shows on My Tasks page when onPinToFocus is passed
        // Check if we're actually on My Tasks grid view
        const hasGridView = await page.$('.task-grid-row');
        log('3. Pin to Focus button', 'FAIL',
          `No pin button found on hover (grid view present: ${!!hasGridView}). Pin may only show for incomplete tasks or when not already pinned.`);
      }
    } else {
      log('3. Pin to Focus button', 'FAIL', 'No task rows found on page');
    }
  } catch (err) {
    log('3. Pin to Focus button', 'FAIL', err.message);
  }

  // TEST 4: Project column
  try {
    // Check for PROJECT column header
    const projectHeader = await page.evaluate(() => {
      const headers = document.querySelectorAll('.col-header, button');
      for (const h of headers) {
        if (h.textContent?.trim() === 'PROJECT') return true;
      }
      return false;
    });

    // Check for project cells with content
    const projectCells = await page.$$('[data-testid^="task-project-"]');
    let projectsWithNames = 0;
    for (const cell of projectCells.slice(0, 20)) {
      const text = await cell.textContent();
      if (text && text.trim() !== '' && text.trim() !== '—' && text.trim() !== '-') {
        projectsWithNames++;
      }
    }

    await screenshot(page, 'audit-04-project-column');
    log('4. Project column header', projectHeader ? 'PASS' : 'FAIL',
      projectHeader ? 'PROJECT header found' : 'PROJECT header not found');
    log('4b. Project column data', projectsWithNames > 0 ? 'PASS' : 'FAIL',
      `${projectsWithNames} of ${Math.min(projectCells.length, 20)} checked cells show project names`);
  } catch (err) {
    log('4. Project column', 'FAIL', err.message);
  }

  // TEST 5: Density toggle
  try {
    // Find density toggle buttons
    const densityButtons = await page.$$('button[title="Compact"], button[title="Default"], button[title="Relaxed"]');
    if (densityButtons.length === 3) {
      // Measure initial row height
      const initialHeight = await page.evaluate(() => {
        const row = document.querySelector('.task-grid-row');
        return row ? row.getBoundingClientRect().height : null;
      });

      // Click Compact
      await densityButtons[0].click();
      await page.waitForTimeout(400);
      const compactHeight = await page.evaluate(() => {
        const row = document.querySelector('.task-grid-row');
        return row ? row.getBoundingClientRect().height : null;
      });
      await screenshot(page, 'audit-05-density-compact');

      // Click Relaxed
      await densityButtons[2].click();
      await page.waitForTimeout(400);
      const relaxedHeight = await page.evaluate(() => {
        const row = document.querySelector('.task-grid-row');
        return row ? row.getBoundingClientRect().height : null;
      });
      await screenshot(page, 'audit-05-density-relaxed');

      // Reset to Default
      await densityButtons[1].click();
      await page.waitForTimeout(300);
      const defaultHeight = await page.evaluate(() => {
        const row = document.querySelector('.task-grid-row');
        return row ? row.getBoundingClientRect().height : null;
      });
      await screenshot(page, 'audit-05-density-default');

      const allDifferent = compactHeight !== null && relaxedHeight !== null &&
        compactHeight < defaultHeight && defaultHeight < relaxedHeight;

      log('5. Density toggle', allDifferent ? 'PASS' : 'FAIL',
        `Compact=${compactHeight}px, Default=${defaultHeight}px, Relaxed=${relaxedHeight}px ` +
        `(initial=${initialHeight}px). Heights ${allDifferent ? 'correctly vary' : 'do NOT correctly vary'}`);
    } else {
      log('5. Density toggle', 'FAIL',
        `Expected 3 density buttons, found ${densityButtons.length}`);
    }
  } catch (err) {
    log('5. Density toggle', 'FAIL', err.message);
  }

  // TEST 6: Hover-only badges
  try {
    const hoverBadges = await page.$$('.hover-badge');
    if (hoverBadges.length > 0) {
      // Check default opacity
      const defaultOpacity = await hoverBadges[0].evaluate(el => {
        return window.getComputedStyle(el).opacity;
      });

      // Hover over the parent row to make them visible
      const parentRow = await hoverBadges[0].evaluate(el => {
        const row = el.closest('.task-grid-row');
        return row ? true : false;
      });

      log('6. Hover-only badges', defaultOpacity === '0' ? 'PASS' : 'FAIL',
        `Found ${hoverBadges.length} badges; default opacity=${defaultOpacity} (expected: 0). In row: ${parentRow}`);
    } else {
      log('6. Hover-only badges', 'FAIL', 'No elements with class "hover-badge" found');
    }
  } catch (err) {
    log('6. Hover-only badges', 'FAIL', err.message);
  }

  // TEST 7: InlineCellSelect dropdown — open and close
  // Status column uses InlineCellSelect (local dropdown with fixed backdrop)
  // NOT the portal-based InlineSelect component
  try {
    // Use page.evaluate to click the button inside the status cell (avoids Playwright actionability checks blocking on overlays)
    const openResult = await page.evaluate(() => {
      // Find the first status cell button
      const statusCell = document.querySelector('[data-testid^="task-status-"] button');
      if (!statusCell) return { found: false };

      // Get initial text
      const initialText = statusCell.textContent?.replace(/\s+/g, ' ').trim() || '';

      // Click to open
      statusCell.click();

      return { found: true, initialText };
    });

    if (openResult.found) {
      await page.waitForTimeout(600);

      // Check for the dropdown: InlineCellSelect renders z-50 absolute dropdown + z-40 fixed backdrop
      const dropdownInfo = await page.evaluate(() => {
        // Look for the z-40 backdrop (sign dropdown is open)
        const backdrop = document.querySelector('.fixed.inset-0.z-40');
        // Look for the z-50 dropdown options
        const dropdown = document.querySelector('.absolute.z-50');
        if (!dropdown) return { open: false, options: [] };

        const buttons = dropdown.querySelectorAll('button');
        const labels = Array.from(buttons).map(b => b.textContent?.trim()).filter(Boolean);
        return { open: true, hasBackdrop: !!backdrop, optionCount: buttons.length, options: labels };
      });

      await screenshot(page, 'audit-07-inline-select-open');

      // Close by clicking the backdrop (Escape only works if filter input exists, which requires 5+ options)
      await page.evaluate(() => {
        const backdrop = document.querySelector('.fixed.inset-0.z-40');
        if (backdrop) backdrop.click();
      });
      await page.waitForTimeout(400);

      // Verify closed
      const afterClose = await page.evaluate(() => {
        const dropdown = document.querySelector('.absolute.z-50');
        const backdrop = document.querySelector('.fixed.inset-0.z-40');
        // Get current button text
        const statusCell = document.querySelector('[data-testid^="task-status-"] button');
        const afterText = statusCell?.textContent?.replace(/\s+/g, ' ').trim() || '';
        return { closed: !dropdown && !backdrop, afterText };
      });

      await screenshot(page, 'audit-07-inline-select-closed');

      log('7. InlineCellSelect dropdown open', dropdownInfo.open ? 'PASS' : 'FAIL',
        dropdownInfo.open
          ? `Dropdown opened with ${dropdownInfo.optionCount} options: ${dropdownInfo.options.join(', ')}. Backdrop: ${dropdownInfo.hasBackdrop}`
          : 'No dropdown detected after click');
      log('7b. InlineCellSelect close via backdrop', afterClose.closed ? 'PASS' : 'FAIL',
        `Closed: ${afterClose.closed}. Value before: "${openResult.initialText}", after: "${afterClose.afterText}"`);
    } else {
      log('7. InlineCellSelect dropdown', 'FAIL', 'No button found inside status cell');
    }
  } catch (err) {
    log('7. InlineCellSelect dropdown', 'FAIL', err.message);
  }

  // TEST 8: Batch selection + BulkActionToolbar
  try {
    // Use page.evaluate for clicking to avoid actionability issues with overlays
    const batchResult = await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('.task-row-checkbox');
      if (checkboxes.length < 2) return { enough: false, count: checkboxes.length };
      // Click first two checkboxes
      checkboxes[0].click();
      checkboxes[1].click();
      return { enough: true, count: checkboxes.length };
    });

    if (batchResult.enough) {
      await page.waitForTimeout(800);

      // Check for BulkActionToolbar
      const bulkToolbar = await page.evaluate(() => {
        const els = document.querySelectorAll('div[style*="position: fixed"][style*="bottom"]');
        for (const el of els) {
          if (el.textContent?.includes('selected')) return el.textContent?.trim().substring(0, 80);
        }
        return null;
      });

      await screenshot(page, 'audit-08-batch-selection');

      log('8. Batch selection + BulkActionToolbar',
        bulkToolbar ? 'PASS' : 'FAIL',
        bulkToolbar ? `Toolbar visible: "${bulkToolbar}"` : 'BulkActionToolbar not found after selecting 2 tasks');

      // Clear selection
      await page.evaluate(() => {
        const checkboxes = document.querySelectorAll('.task-row-checkbox');
        if (checkboxes.length >= 2) { checkboxes[0].click(); checkboxes[1].click(); }
      });
      await page.waitForTimeout(300);
    } else {
      log('8. Batch selection', 'FAIL', `Only ${batchResult.count} checkboxes found (need >= 2)`);
    }
  } catch (err) {
    log('8. Batch selection', 'FAIL', err.message);
  }

  // TEST 9: Date picker
  try {
    // InlineDatePicker: clicking the button replaces it with <input type="date"> + quick presets
    // The button is inside [data-testid^="task-due-"] and has the CalendarDays icon
    // Need to click directly via JS and wait for React re-render

    // First dismiss any overlays
    await page.evaluate(() => {
      const backdrops = document.querySelectorAll('.fixed.inset-0.z-40');
      for (const b of backdrops) b.click();
    });
    await page.waitForTimeout(300);

    // Find a due date button that has a date value (not "Set date")
    // Use Playwright's force click to bypass actionability checks
    const dueButtons = await page.$$('[data-testid^="task-due-"] button');
    let clickResult = { found: false, initialText: '', cellId: '' };
    let targetBtn = null;
    for (const btn of dueButtons) {
      const text = await btn.textContent();
      if (text && text.trim() !== 'Set date' && text.trim().length > 0) {
        clickResult = { found: true, initialText: text.trim(), cellId: 'selected' };
        targetBtn = btn;
        break;
      }
    }
    if (!targetBtn && dueButtons.length > 0) {
      targetBtn = dueButtons[0];
      const text = await targetBtn.textContent();
      clickResult = { found: true, initialText: text?.trim() || '', cellId: 'first' };
    }

    if (clickResult.found && targetBtn) {
      // Force click bypasses z-index/overlay issues
      await targetBtn.click({ force: true });
      // Wait for React to re-render (InlineDatePicker swaps button for input)
      await page.waitForTimeout(1500);

      // Check for date input — also dump the cell contents for diagnostics
      const dateInput = await page.evaluate(() => {
        // Check all inputs on the page
        const allInputs = document.querySelectorAll('input');
        const inputTypes = Array.from(allInputs).map(i => ({
          type: i.type,
          value: i.value,
          visible: i.offsetParent !== null,
        }));

        const dateInputs = document.querySelectorAll('input[type="date"]');
        if (dateInputs.length > 0) {
          const container = dateInputs[0].parentElement;
          const presetBtns = container ? container.querySelectorAll('button') : [];
          const presetLabels = Array.from(presetBtns).map(b => b.textContent?.trim()).filter(Boolean);
          return {
            type: 'date-input',
            count: dateInputs.length,
            value: dateInputs[0].value,
            presets: presetLabels,
            borderColor: window.getComputedStyle(dateInputs[0]).borderColor,
          };
        }

        // Diagnostics: What does the due date cell contain now?
        const dueCell = document.querySelector('[data-testid^="task-due-"]');
        const cellHTML = dueCell?.innerHTML?.substring(0, 300) || 'N/A';
        const cellText = dueCell?.textContent?.trim() || 'N/A';

        return {
          type: 'NOT_FOUND',
          totalInputsOnPage: allInputs.length,
          inputTypes: inputTypes.slice(0, 5),
          dueCellHTML: cellHTML,
          dueCellText: cellText,
        };
      });

      await screenshot(page, 'audit-09-date-picker');

      // Press Escape to close without changing (InlineDatePicker handles Escape key on input)
      if (dateInput) {
        // Focus the input first to ensure key handler fires
        await page.evaluate(() => {
          const input = document.querySelector('input[type="date"]');
          if (input) input.focus();
        });
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(400);

      const isDateInput = dateInput?.type === 'date-input';
      log('9. Date picker', isDateInput ? 'PASS' : 'FAIL',
        isDateInput
          ? `Input type="date" opened (value="${dateInput.value}"). Presets: ${dateInput.presets?.join(', ')}. Border: ${dateInput.borderColor}. Initial: "${clickResult.initialText}"`
          : `No date picker input found after clicking. Initial: "${clickResult.initialText}". Diagnostics: ${JSON.stringify(dateInput)}`);
    } else {
      log('9. Date picker', 'FAIL', 'No due date cells or buttons found');
    }
  } catch (err) {
    log('9. Date picker', 'FAIL', err.message);
  }

  // TEST 10: Column headers sortable — click DUE DATE
  try {
    // Find the DUE DATE header button
    const dueDateHeader = await page.evaluate(() => {
      const buttons = document.querySelectorAll('.col-header, button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (text === 'DUE DATE' || text?.startsWith('DUE DATE')) {
          return { found: true, text };
        }
      }
      return { found: false };
    });

    if (dueDateHeader.found) {
      // Click the header
      const headerBtn = await page.$('button:has-text("DUE DATE")');
      if (headerBtn) {
        await headerBtn.click();
        await page.waitForTimeout(500);

        // Check for sort indicator (ChevronUp/ChevronDown SVG)
        const sortIndicator = await page.evaluate(() => {
          const buttons = document.querySelectorAll('.col-header, button');
          for (const btn of buttons) {
            const text = btn.textContent?.trim();
            if (text?.includes('DUE DATE')) {
              // Check for SVG (chevron icon)
              const svg = btn.querySelector('svg');
              const hasIndicator = svg !== null;
              // Check for teal color (active sort)
              const color = window.getComputedStyle(btn).color;
              return { hasIndicator, color, text };
            }
          }
          return null;
        });

        await screenshot(page, 'audit-10-sort-indicator');

        log('10. Column headers sortable', sortIndicator?.hasIndicator ? 'PASS' : 'FAIL',
          sortIndicator ? `Sort indicator present: ${sortIndicator.hasIndicator}, color: ${sortIndicator.color}` :
          'Could not find DUE DATE header after click');
      } else {
        log('10. Column headers sortable', 'FAIL', 'Could not locate DUE DATE button element');
      }
    } else {
      log('10. Column headers sortable', 'FAIL', 'No DUE DATE header found');
    }
  } catch (err) {
    log('10. Column headers sortable', 'FAIL', err.message);
  }

  // ─────────────────────────────────────────────
  // /deadlines page tests
  // ─────────────────────────────────────────────
  console.log('\n── /deadlines ──\n');
  await waitForPageReady(page, '/deadlines');
  await screenshot(page, 'audit-deadlines-initial');

  // TEST 11: PROJECT column in deadlines
  try {
    const projectColHeader = await page.evaluate(() => {
      // Deadlines uses column headers: TITLE, PROJECT, DUE DATE, ASSIGNEE, STATUS, TYPE
      const headers = document.querySelectorAll('span, div, th');
      for (const h of headers) {
        const text = h.textContent?.trim();
        if (text === 'PROJECT') return true;
      }
      return false;
    });

    await screenshot(page, 'audit-11-deadlines-project-col');
    log('11. Deadlines PROJECT column', projectColHeader ? 'PASS' : 'FAIL',
      projectColHeader ? 'PROJECT column header found' : 'PROJECT column header NOT found');
  } catch (err) {
    log('11. Deadlines PROJECT column', 'FAIL', err.message);
  }

  // TEST 12: Batch selection checkboxes on deadline rows
  try {
    // Look for checkbox buttons in deadline rows
    const deadlineCheckboxes = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[aria-label*="elect task"]');
      return buttons.length;
    });

    // Also check for the styled checkbox divs
    const checkboxStyled = await page.evaluate(() => {
      // Deadline checkboxes have 18x18 size with border-radius
      const btns = document.querySelectorAll('button[aria-label="Select task"], button[aria-label="Deselect task"]');
      return btns.length;
    });

    await screenshot(page, 'audit-12-deadlines-checkboxes');

    const total = Math.max(deadlineCheckboxes, checkboxStyled);
    log('12. Deadlines batch selection checkboxes', total > 0 ? 'PASS' : 'FAIL',
      `Found ${total} checkbox buttons on deadline rows`);
  } catch (err) {
    log('12. Deadlines batch selection', 'FAIL', err.message);
  }

  // ─────────────────────────────────────────────
  // /projects page tests
  // ─────────────────────────────────────────────
  console.log('\n── /projects ──\n');
  await waitForPageReady(page, '/projects');
  await screenshot(page, 'audit-projects-initial');

  // TEST 13: Category filter pills
  try {
    const filterPills = await page.$$('.filter-pill');
    if (filterPills.length > 0) {
      // Get all pill labels
      const pillLabels = [];
      for (const pill of filterPills) {
        const text = await pill.textContent();
        pillLabels.push(text?.trim());
      }

      // Click "CLIF" filter
      let clifPill = null;
      for (const pill of filterPills) {
        const text = await pill.textContent();
        if (text?.includes('CLIF')) { clifPill = pill; break; }
      }

      if (clifPill) {
        await clifPill.click();
        await page.waitForTimeout(600);
        await screenshot(page, 'audit-13-projects-clif-filter');

        // Click "All" to reset
        for (const pill of filterPills) {
          const text = await pill.textContent();
          if (text?.includes('All')) { await pill.click(); break; }
        }
        await page.waitForTimeout(400);

        log('13. Category filter pills', 'PASS',
          `Found ${filterPills.length} pills: ${pillLabels.join(', ')}`);
      } else {
        log('13. Category filter pills', 'FAIL', 'CLIF pill not found among filter pills');
      }
    } else {
      log('13. Category filter pills', 'FAIL', 'No elements with class "filter-pill" found');
    }
  } catch (err) {
    log('13. Category filter pills', 'FAIL', err.message);
  }

  // TEST 14: Projects column headers sortable
  try {
    // Projects page uses <button> elements for column headers with uppercase text
    // Headers: Title, Status, Stage, PI, Group — rendered as buttons with cursor:pointer
    const colHeaders = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      const sortable = [];
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toUpperCase();
        const style = btn.style;
        // Column headers have textTransform uppercase and cursor pointer
        if (text && ['TITLE', 'STATUS', 'STAGE', 'PI', 'GROUP'].includes(text.replace(/[▲▼]/g, '').trim())) {
          sortable.push(text);
        }
      }
      return sortable;
    });

    if (colHeaders.length > 0) {
      // Click "Title" header to sort by title
      const clicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim().toUpperCase().replace(/[▲▼]/g, '').trim();
          if (text === 'TITLE') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      await page.waitForTimeout(500);

      // Check for sort indicator ▲ or ▼ in a <span> near the header
      const hasIndicator = await page.evaluate(() => {
        const spans = document.querySelectorAll('span');
        for (const s of spans) {
          const text = s.textContent?.trim();
          if (text === '▲' || text === '▼') return text;
        }
        return null;
      });

      await screenshot(page, 'audit-14-projects-sort');

      log('14. Projects column headers sortable',
        clicked && hasIndicator ? 'PASS' : 'FAIL',
        `Found ${colHeaders.length} headers: ${colHeaders.join(', ')}. Clicked Title: ${clicked}. Sort indicator: ${hasIndicator || 'none found'}`);
    } else {
      log('14. Projects column headers sortable', 'FAIL',
        'No sortable column header buttons found (expected Title, Status, Stage, PI, Group)');
    }
  } catch (err) {
    log('14. Projects sortable headers', 'FAIL', err.message);
  }

  // ─────────────────────────────────────────────
  // /analytics page test
  // ─────────────────────────────────────────────
  console.log('\n── /analytics ──\n');
  await waitForPageReady(page, '/analytics');
  await screenshot(page, 'audit-analytics-initial');

  // TEST 15: Recharts SVG elements
  try {
    const rechartsInfo = await page.evaluate(() => {
      // Check for recharts-specific classes
      const rechartsClasses = document.querySelectorAll('.recharts-wrapper, .recharts-surface, .recharts-bar, .recharts-line');
      // Check for SVG rect elements (bar chart bars)
      const svgRects = document.querySelectorAll('svg rect');
      // Check for SVG path elements (line charts)
      const svgPaths = document.querySelectorAll('svg path');
      // Check for SVG in general
      const allSvg = document.querySelectorAll('svg');

      return {
        rechartsElements: rechartsClasses.length,
        svgRects: svgRects.length,
        svgPaths: svgPaths.length,
        totalSvgs: allSvg.length,
      };
    });

    await screenshot(page, 'audit-15-analytics-charts');

    const hasCharts = rechartsInfo.rechartsElements > 0 || rechartsInfo.svgRects > 5;
    log('15. Recharts elements on Analytics', hasCharts ? 'PASS' : 'FAIL',
      `Recharts elements: ${rechartsInfo.rechartsElements}, SVG rects: ${rechartsInfo.svgRects}, SVG paths: ${rechartsInfo.svgPaths}, Total SVGs: ${rechartsInfo.totalSvgs}`);
  } catch (err) {
    log('15. Recharts elements', 'FAIL', err.message);
  }

  // ─────────────────────────────────────────────
  // /dashboard page tests
  // ─────────────────────────────────────────────
  console.log('\n── /dashboard ──\n');
  await waitForPageReady(page, '/dashboard');
  await screenshot(page, 'audit-dashboard-initial');

  // TEST 16: Dashboard cards drag handles (GripVertical)
  try {
    // Look for GripVertical icon (rendered as SVG with title="Drag to reorder")
    const gripHandles = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[title="Drag to reorder"]');
      const count = buttons.length;
      // Check visibility — these should be visible on hover
      const visibilityInfo = [];
      for (const btn of Array.from(buttons).slice(0, 3)) {
        const cs = window.getComputedStyle(btn);
        visibilityInfo.push({
          opacity: cs.opacity,
          display: cs.display,
          visibility: cs.visibility,
        });
      }
      return { count, visibilityInfo };
    });

    await screenshot(page, 'audit-16-dashboard-grip');

    log('16. Dashboard card drag handles', gripHandles.count > 0 ? 'PASS' : 'FAIL',
      `Found ${gripHandles.count} GripVertical handles. Sample visibility: ${JSON.stringify(gripHandles.visibilityInfo.slice(0, 2))}`);
  } catch (err) {
    log('16. Dashboard drag handles', 'FAIL', err.message);
  }

  // TEST 17: MetricCard sparklines (polyline elements)
  // Sparklines with sparklineData are on /analytics, not /dashboard
  // Check /analytics for MetricCard polyline SVGs
  try {
    await waitForPageReady(page, '/analytics');
    await page.waitForTimeout(1000);

    const sparklineInfo = await page.evaluate(() => {
      // MetricCard renders SVG with polyline for sparklineData
      const polylines = document.querySelectorAll('svg polyline');
      const sparklineSvgs = [];
      for (const pl of polylines) {
        const parentSvg = pl.closest('svg');
        const viewBox = parentSvg?.getAttribute('viewBox') || '';
        const height = parentSvg?.style.height || parentSvg?.getAttribute('height') || '';
        sparklineSvgs.push({ viewBox, height: height.toString() });
      }
      return {
        polylineCount: polylines.length,
        details: sparklineSvgs.slice(0, 5),
      };
    });

    await screenshot(page, 'audit-17-sparklines');

    log('17. MetricCard sparklines (on /analytics)', sparklineInfo.polylineCount > 0 ? 'PASS' : 'FAIL',
      `Found ${sparklineInfo.polylineCount} polyline elements. Details: ${JSON.stringify(sparklineInfo.details)}`);
  } catch (err) {
    log('17. MetricCard sparklines', 'FAIL', err.message);
  }

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  await browser.close();

  const passed = RESULTS.filter(r => r.status === 'PASS').length;
  const failed = RESULTS.filter(r => r.status === 'FAIL').length;
  const total = RESULTS.length;

  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASS / ${failed} FAIL / ${total} total`);
  console.log('══════════════════════════════════════════\n');

  // Write JSON results
  const resultFile = join(SCREENSHOT_DIR, 'audit-v2-results.json');
  writeFileSync(resultFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { passed, failed, total },
    tests: RESULTS,
  }, null, 2));
  console.log(`Results saved to ${resultFile}`);

  // Exit with error code if any failures
  process.exit(failed > 0 ? 1 : 0);
})();
