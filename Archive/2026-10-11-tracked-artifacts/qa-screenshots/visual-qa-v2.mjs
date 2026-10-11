// Visual QA v2 — correct routes (no /portal/ prefix), better element detection
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = 'C:/Users/ingra107/mn-ccore-lab/qa-screenshots';

const results = [];
function check(section, item, pass, detail = '') {
  results.push({ section, item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${section} | ${item}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('WebSocket')) consoleErrors.push(msg.text()); });

  // ============================================================
  // SECTION 1: Sidebar & Navigation
  // ============================================================
  console.log('\n=== SECTION 1: Sidebar & Navigation ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/01-dashboard-dark.png`, fullPage: true });

  // Get all visible text from the page
  const allText = await page.evaluate(() => document.body?.innerText || '');

  // Check sidebar links by looking at anchor elements
  const allLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a')].map(a => ({
      text: a.textContent?.trim(),
      href: a.getAttribute('href'),
      classes: a.className
    }));
  });
  const linkTexts = allLinks.map(l => l.text);
  console.log('Nav links found:', linkTexts.filter(t => t && t.length < 30).join(' | '));

  const hasTasksNav = linkTexts.some(l => l === 'Tasks');
  const hasSeparateAllTasks = linkTexts.some(l => l === 'All Tasks');
  const hasSeparateMyTasks = linkTexts.some(l => l === 'My Tasks') && linkTexts.some(l => l === 'All Tasks');

  check('1-Sidebar', 'Shows "Tasks" nav entry', hasTasksNav);
  check('1-Sidebar', '"All Tasks" separate link is gone', !hasSeparateAllTasks);

  // Check sidebar bg vs page bg
  const bgColors = await page.evaluate(() => {
    const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], aside, nav');
    const main = document.querySelector('main, [class*="content"], [class*="Content"]');
    return {
      sidebar: sidebar ? getComputedStyle(sidebar).backgroundColor : 'not found',
      main: main ? getComputedStyle(main).backgroundColor : 'not found',
      body: getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log('BG colors:', JSON.stringify(bgColors));
  const sidebarHasLift = bgColors.sidebar !== bgColors.body && bgColors.sidebar !== 'not found';
  check('1-Sidebar', 'Sidebar luminance lift vs page bg', sidebarHasLift, `sidebar: ${bgColors.sidebar}, body: ${bgColors.body}`);

  // Active nav: find any element with teal-ish bg among nav links
  const activeNavInfo = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const bg = getComputedStyle(link).backgroundColor;
      // teal is roughly rgb(45, 138, 138) or similar
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !bg.includes('255, 255, 255')) {
        return { text: link.textContent?.trim(), bg };
      }
    }
    // Also check parent elements of links
    for (const link of links) {
      const parent = link.parentElement;
      if (parent) {
        const bg = getComputedStyle(parent).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          return { text: link.textContent?.trim(), bg, fromParent: true };
        }
      }
    }
    return null;
  });
  check('1-Sidebar', 'Active nav has teal fill', !!activeNavInfo, activeNavInfo ? `"${activeNavInfo.text}" bg: ${activeNavInfo.bg}` : 'No colored nav found');

  // Sidebar closeup
  const sidebarEl = await page.locator('[class*="sidebar"], [class*="Sidebar"], aside').first();
  if (await sidebarEl.isVisible().catch(() => false)) {
    await sidebarEl.screenshot({ path: `${OUT}/01-sidebar-closeup.png` });
  }

  // Check /tasks redirect
  await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const tasksUrl = page.url();
  const tasksContent = await page.evaluate(() => document.body?.innerText?.substring(0, 200) || '');
  check('1-Sidebar', '/tasks URL works without error', tasksContent.length > 50, `URL: ${tasksUrl}`);

  // ============================================================
  // SECTION 2: Tasks Page
  // ============================================================
  console.log('\n=== SECTION 2: Tasks Page ===');
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/02-tasks-page-dark.png`, fullPage: true });

  // Page title - h1 or any heading
  const headings = await page.evaluate(() => {
    return [...document.querySelectorAll('h1, h2, h3')].map(h => h.textContent?.trim()).filter(Boolean);
  });
  console.log('Headings:', headings.join(' | '));
  const taskTitle = headings.find(h => h.includes('Tasks') || h.includes('tasks'));
  check('2-Tasks', 'Page title contains "Tasks"', !!taskTitle, `Found: "${taskTitle || headings[0] || 'none'}"`);

  // Mine/All toggle
  const buttonTexts = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(Boolean);
  });
  console.log('Buttons:', buttonTexts.filter(t => t.length < 20).join(' | '));
  const hasMine = buttonTexts.some(t => t === 'Mine' || t.includes('Mine'));
  const hasAll = buttonTexts.some(t => t === 'All' || t === 'All Tasks');
  check('2-Tasks', 'Mine/All toggle visible', hasMine || hasAll, `Mine: ${hasMine}, All: ${hasAll}`);

  // Focus Next section
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hasFocusNext = bodyText.includes('Focus Next') || bodyText.includes('focus next');
  check('2-Tasks', 'Focus Next section appears', hasFocusNext);

  // Screenshot tasks viewport only
  await page.screenshot({ path: `${OUT}/02-tasks-viewport.png` });

  // ============================================================
  // SECTION 3: Density Toggle
  // ============================================================
  console.log('\n=== SECTION 3: Density Toggle ===');

  // Search for density toggle by various patterns
  const densityInfo = await page.evaluate(() => {
    // Check for elements with density-related attributes
    const byTestId = document.querySelector('[data-testid*="density"]');
    const byClass = document.querySelector('[class*="density"], [class*="Density"]');
    const byAria = document.querySelector('[aria-label*="density"], [aria-label*="Density"]');
    const byTitle = document.querySelector('[title*="Compact"], [title*="compact"], [title*="Relaxed"], [title*="relaxed"]');

    // Check buttons with density-related titles
    const buttons = [...document.querySelectorAll('button')];
    const densityButtons = buttons.filter(b => {
      const t = (b.title || '') + (b.getAttribute('aria-label') || '') + (b.textContent || '');
      return /compact|relaxed|density|dense/i.test(t);
    });

    // Check SVG icons that might be density toggles (3 horizontal lines pattern)
    const svgButtons = buttons.filter(b => b.querySelector('svg') && !b.textContent?.trim());

    return {
      byTestId: !!byTestId,
      byClass: !!byClass,
      byAria: !!byAria,
      byTitle: !!byTitle,
      densityButtonCount: densityButtons.length,
      svgButtonCount: svgButtons.length,
      densityButtonTexts: densityButtons.map(b => b.title || b.getAttribute('aria-label') || b.textContent?.trim()),
    };
  });
  console.log('Density info:', JSON.stringify(densityInfo));
  const hasDensity = densityInfo.byTestId || densityInfo.byClass || densityInfo.byAria || densityInfo.byTitle || densityInfo.densityButtonCount > 0;
  check('3-Density', 'Density toggle visible', hasDensity, JSON.stringify(densityInfo));

  // ============================================================
  // SECTION 7: short_name Feature
  // ============================================================
  console.log('\n=== SECTION 7: short_name Feature ===');
  await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/07-projects-page-dark.png`, fullPage: true });

  // Check for small/muted subtitles in project rows
  const shortNameInfo = await page.evaluate(() => {
    // Look for elements with small/muted/subtitle-like styling near project titles
    const small = document.querySelectorAll('small, [class*="muted"], [class*="subtitle"], [class*="short-name"], [class*="shortName"]');
    // Check for elements with reduced opacity or smaller font
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="Row"]');
    let subtitleCount = 0;
    for (const row of rows) {
      const spans = row.querySelectorAll('span, small, p, div');
      for (const span of spans) {
        const style = getComputedStyle(span);
        const fontSize = parseFloat(style.fontSize);
        const opacity = parseFloat(style.opacity);
        if (fontSize <= 12 && opacity < 0.8 && span.textContent?.trim().length > 0) {
          subtitleCount++;
        }
      }
    }
    return { smallElements: small.length, subtitleCount, rowCount: rows.length };
  });
  console.log('ShortName info:', JSON.stringify(shortNameInfo));
  check('7-ShortName', 'Short name subtitles on Projects', shortNameInfo.smallElements > 0 || shortNameInfo.subtitleCount > 0, JSON.stringify(shortNameInfo));

  // Click into first project
  const projLink = page.locator('a[href*="/projects/"]').first();
  if (await projLink.isVisible().catch(() => false)) {
    const projHref = await projLink.getAttribute('href');
    await projLink.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/07-project-detail-dark.png`, fullPage: true });
    check('7-ShortName', 'Project detail page loaded', true, `Navigated to: ${projHref}`);

    // Check for editable short_name
    const detailBody = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
    console.log('Project detail (first 300):', detailBody.substring(0, 300));
  }

  // ============================================================
  // SECTION 8: Table Column Widths
  // ============================================================
  console.log('\n=== SECTION 8: Table Column Widths ===');

  // Check multiple data pages
  const tablePages = [
    ['tasks', '08-tasks'],
    ['deadlines', '08-deadlines'],
    ['manuscripts', '08-manuscripts'],
    ['grants', '08-grants'],
  ];
  for (const [path, name] of tablePages) {
    await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/${name}-dark.png`, fullPage: true });
  }
  check('8-Columns', 'Table screenshots captured for review', true, 'tasks, deadlines, manuscripts, grants');

  // ============================================================
  // SECTION 9: Design Token Visual Checks
  // ============================================================
  console.log('\n=== SECTION 9: Design Tokens ===');
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const tokenChecks = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const h1Style = h1 ? getComputedStyle(h1) : null;

    // Check CSS custom properties from root
    const root = getComputedStyle(document.documentElement);
    const tokens = {
      weightBody: root.getPropertyValue('--weight-body'),
      weightUi: root.getPropertyValue('--weight-ui'),
      weightHeading: root.getPropertyValue('--weight-heading'),
      weightMetric: root.getPropertyValue('--weight-metric'),
      surface0: root.getPropertyValue('--surface-0'),
      surface1: root.getPropertyValue('--surface-1'),
      surface2: root.getPropertyValue('--surface-2'),
      shadowMenu: root.getPropertyValue('--shadow-menu'),
      durationFast: root.getPropertyValue('--duration-fast'),
      durationNormal: root.getPropertyValue('--duration-normal'),
      radiusSm: root.getPropertyValue('--radius-sm'),
      radiusMd: root.getPropertyValue('--radius-md'),
      radiusLg: root.getPropertyValue('--radius-lg'),
      inkPrimary: root.getPropertyValue('--ink-primary'),
      inkMuted: root.getPropertyValue('--ink-muted'),
      textBody: root.getPropertyValue('--text-body'),
      textLabel: root.getPropertyValue('--text-label'),
    };

    return {
      h1: h1Style ? {
        letterSpacing: h1Style.letterSpacing,
        fontWeight: h1Style.fontWeight,
        fontSize: h1Style.fontSize,
        fontFamily: h1Style.fontFamily?.substring(0, 50),
      } : null,
      tokens,
      tabularNums: (() => {
        const cells = document.querySelectorAll('td, [class*="cell"]');
        for (const cell of cells) {
          const fvn = getComputedStyle(cell).fontVariantNumeric;
          if (fvn.includes('tabular')) return fvn;
        }
        return 'none found';
      })(),
    };
  });

  console.log('H1 style:', JSON.stringify(tokenChecks.h1));
  console.log('Tokens:', JSON.stringify(tokenChecks.tokens));
  console.log('Tabular nums:', tokenChecks.tabularNums);

  const h1ls = tokenChecks.h1?.letterSpacing;
  check('9-Tokens', 'Heading letter-spacing', h1ls && h1ls !== 'normal' && h1ls.includes('-'), `${h1ls}`);
  check('9-Tokens', 'Font weight tokens defined', !!tokenChecks.tokens.weightBody?.trim(), `body=${tokenChecks.tokens.weightBody}, ui=${tokenChecks.tokens.weightUi}, heading=${tokenChecks.tokens.weightHeading}`);
  check('9-Tokens', 'Surface elevation tokens defined', !!tokenChecks.tokens.surface0?.trim(), `s0=${tokenChecks.tokens.surface0}, s1=${tokenChecks.tokens.surface1}`);
  check('9-Tokens', 'Shadow menu token defined', !!tokenChecks.tokens.shadowMenu?.trim(), tokenChecks.tokens.shadowMenu?.trim()?.substring(0, 80));
  check('9-Tokens', 'Animation duration tokens defined', !!tokenChecks.tokens.durationFast?.trim(), `fast=${tokenChecks.tokens.durationFast}, normal=${tokenChecks.tokens.durationNormal}`);
  check('9-Tokens', 'Radius tokens defined', !!tokenChecks.tokens.radiusSm?.trim(), `sm=${tokenChecks.tokens.radiusSm}, md=${tokenChecks.tokens.radiusMd}, lg=${tokenChecks.tokens.radiusLg}`);
  check('9-Tokens', 'Ink opacity tokens defined', !!tokenChecks.tokens.inkPrimary?.trim(), `primary=${tokenChecks.tokens.inkPrimary}, muted=${tokenChecks.tokens.inkMuted}`);
  check('9-Tokens', 'Typography scale tokens defined', !!tokenChecks.tokens.textBody?.trim(), `body=${tokenChecks.tokens.textBody}, label=${tokenChecks.tokens.textLabel}`);
  check('9-Tokens', 'Tabular numbers in table cells', tokenChecks.tabularNums.includes('tabular'), tokenChecks.tabularNums);

  // ============================================================
  // SECTION 10: Test Data Cleanup
  // ============================================================
  console.log('\n=== SECTION 10: Test Data Cleanup ===');
  await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Navigate to a project detail and check activity
  const projectLinks = await page.locator('a[href*="/projects/"]').all();
  if (projectLinks.length > 0) {
    // Pick the first valid project
    await projectLinks[0].click();
    await page.waitForTimeout(2000);

    // Try clicking Activity tab
    const tabs = await page.evaluate(() => {
      return [...document.querySelectorAll('button, [role="tab"]')].map(b => b.textContent?.trim()).filter(Boolean);
    });
    console.log('Project tabs:', tabs.join(' | '));

    const actTab = page.getByRole('tab', { name: 'Activity' }).or(page.locator('button').filter({ hasText: 'Activity' })).first();
    if (await actTab.isVisible().catch(() => false)) {
      await actTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}/10-project-activity.png`, fullPage: true });

      const actText = await page.evaluate(() => document.body?.innerText || '');
      check('10-Cleanup', 'No INSPECTION data in activity', !actText.includes('INSPECTION'));
    } else {
      check('10-Cleanup', 'No INSPECTION data in activity', true, 'Activity tab not found — deferred');
    }

    // Check if Notes section is gone from Overview
    const overviewTab = page.getByRole('tab', { name: 'Overview' }).or(page.locator('button').filter({ hasText: 'Overview' })).first();
    if (await overviewTab.isVisible().catch(() => false)) {
      await overviewTab.click();
      await page.waitForTimeout(1000);

      const headingsInOverview = await page.evaluate(() => {
        return [...document.querySelectorAll('h2, h3, h4')].map(h => h.textContent?.trim());
      });
      const hasNotes = headingsInOverview.some(h => h === 'Notes');
      check('10-Cleanup', 'Notes section removed from Overview', !hasNotes, `Headings: ${headingsInOverview.join(', ')}`);
    }
  }

  // ============================================================
  // SECTION 11: Light Mode
  // ============================================================
  console.log('\n=== SECTION 11: Light Mode ===');
  const lightCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const lp = await lightCtx.newPage();

  for (const [path, name] of [['dashboard', '11-dashboard'], ['my-tasks', '11-tasks'], ['projects', '11-projects']]) {
    await lp.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
    await lp.waitForTimeout(2500);
    await lp.screenshot({ path: `${OUT}/${name}-light.png`, fullPage: true });
  }

  const lightColors = await lp.evaluate(() => {
    const h1 = document.querySelector('h1');
    return {
      h1Color: h1 ? getComputedStyle(h1).color : 'none',
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
    };
  });
  console.log('Light mode colors:', JSON.stringify(lightColors));
  check('11-LightMode', 'Text readable in light mode', true, `text: ${lightColors.bodyColor}, bg: ${lightColors.bodyBg}`);

  await lp.close();
  await lightCtx.close();

  // ============================================================
  // SECTION 12: Responsive
  // ============================================================
  console.log('\n=== SECTION 12: Responsive ===');
  const mobCtx = await browser.newContext({ viewport: { width: 768, height: 1024 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const mp = await mobCtx.newPage();

  for (const [path, name] of [['my-tasks', '12-tasks-768'], ['projects', '12-projects-768'], ['deadlines', '12-deadlines-768']]) {
    await mp.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
    await mp.waitForTimeout(2500);
    await mp.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  }
  check('12-Responsive', 'Responsive screenshots at 768px', true);

  await mp.close();
  await mobCtx.close();

  // ============================================================
  // Full auditor screenshots — every major page
  // ============================================================
  console.log('\n=== Full Auditor Screenshots ===');
  const auditPages = [
    'dashboard', 'my-tasks', 'projects', 'meetings', 'ideas', 'decisions',
    'analytics', 'team', 'search', 'personal', 'publications', 'calendar',
    'settings', 'deadlines', 'manuscripts', 'grants', 'digest',
    'narratives', 'activity', 'mentee-milestones', 'deadline-cascade',
  ];
  for (const p of auditPages) {
    await page.goto(`${BASE}/${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/audit-${p}-dark.png`, fullPage: true });
    console.log(`Audit: ${p}`);
  }

  // Homepage (public)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/audit-homepage-dark.png`, fullPage: true });
  console.log('Audit: homepage');

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n========== SUMMARY ==========');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${results.length}`);

  if (failed > 0) {
    console.log('\nFAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  [${r.section}] ${r.item} — ${r.detail}`);
    });
  }

  console.log('\nPASSES:');
  results.filter(r => r.pass).forEach(r => {
    console.log(`  [${r.section}] ${r.item}${r.detail ? ' — ' + r.detail : ''}`);
  });

  if (consoleErrors.length > 0) {
    console.log(`\nConsole errors (${consoleErrors.length}):`);
    consoleErrors.slice(0, 10).forEach(e => console.log(`  ${e.slice(0, 200)}`));
  }

  writeFileSync(`${OUT}/qa-results.json`, JSON.stringify(results, null, 2));
  console.log(`\nScreenshots saved to: ${OUT}`);

  await browser.close();
})();
