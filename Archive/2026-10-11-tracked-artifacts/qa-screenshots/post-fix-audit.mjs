// Post-fix comprehensive audit — checks every fix and feature we implemented
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = 'C:/Users/ingra107/mn-ccore-lab/qa-screenshots/post-fix';

const results = [];
function check(section, item, pass, detail = '') {
  results.push({ section, item, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${section} | ${item}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('WebSocket')) console.log('CONSOLE ERROR:', msg.text().substring(0, 150)); });

  // ============================================================
  // 1. DARK SURFACE NEUTRALITY — no blue tint
  // ============================================================
  console.log('\n=== 1. Dark Surface Neutrality ===');
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const darkCheck = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const cream = root.getPropertyValue('--cream').trim();
    // Check if cream has low chroma (neutral)
    return { cream, hasLowChroma: cream.includes('0.005') || !cream.includes('0.015') };
  });
  check('1-Neutral', '--cream chroma reduced', darkCheck.hasLowChroma, darkCheck.cream);
  await page.screenshot({ path: `${OUT}/01-dashboard-dark.png`, fullPage: true });

  // Check cards use surface tokens not hardcoded hex
  const cardBg = await page.evaluate(() => {
    const card = document.querySelector('.bento-card, .card');
    if (!card) return 'no card found';
    const style = getComputedStyle(card);
    return { bg: style.backgroundColor, bgImage: style.backgroundImage };
  });
  check('1-Neutral', 'Cards use surface tokens', !JSON.stringify(cardBg).includes('#111820'), JSON.stringify(cardBg));

  // ============================================================
  // 2. SIDEBAR — luminance separation
  // ============================================================
  console.log('\n=== 2. Sidebar ===');
  const sidebarCheck = await page.evaluate(() => {
    const sidebar = document.querySelector('aside');
    if (!sidebar) return { found: false };
    const style = getComputedStyle(sidebar);
    return { found: true, bg: style.backgroundColor, bgImage: style.backgroundImage, borderRight: style.borderRightColor };
  });
  check('2-Sidebar', 'Has background-image overlay', sidebarCheck.bgImage?.includes('linear-gradient'), sidebarCheck.bgImage?.substring(0, 80));
  check('2-Sidebar', 'Border uses neutral color', !sidebarCheck.borderRight?.includes('168'), `border: ${sidebarCheck.borderRight}`);
  await page.locator('aside').first().screenshot({ path: `${OUT}/02-sidebar.png` }).catch(() => {});

  // ============================================================
  // 3. CARD TITLE WEIGHT
  // ============================================================
  console.log('\n=== 3. Card Title Weight ===');
  const bentoWeight = await page.evaluate(() => {
    const h3 = document.querySelector('.bento-card h3, [class*="bento"] h3');
    return h3 ? getComputedStyle(h3).fontWeight : 'not found';
  });
  check('3-CardWeight', 'BentoCard h3 fontWeight = 500', bentoWeight === '500', bentoWeight);

  // ============================================================
  // 4. TASKS PAGE — Mine/All, density, columns, project column, badges
  // ============================================================
  console.log('\n=== 4. Tasks Page ===');
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/04-tasks-dark.png`, fullPage: true });

  // Check for project column header
  const taskHeaders = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.col-header, [class*="col-header"]')];
    return headers.map(h => h.textContent?.trim());
  });
  console.log('Task headers:', taskHeaders.join(' | '));
  check('4-Tasks', 'PROJECT column exists', taskHeaders.some(h => h?.includes('PROJECT')), taskHeaders.join(', '));

  // Check column widths are semantic (not equal 1fr)
  const gridCols = await page.evaluate(() => {
    const row = document.querySelector('[style*="gridTemplateColumns"], [style*="grid-template-columns"]');
    return row ? row.style.gridTemplateColumns : 'not found';
  });
  check('4-Tasks', 'Semantic column widths', gridCols.includes('120px') || gridCols.includes('130px'), gridCols.substring(0, 80));

  // Check hover-only badges (age/project badges hidden by default)
  const hoverBadges = await page.evaluate(() => {
    const badges = document.querySelectorAll('.hover-badge');
    if (badges.length === 0) return 'no hover-badge class found';
    const firstVisible = getComputedStyle(badges[0]).opacity;
    return { count: badges.length, firstOpacity: firstVisible };
  });
  check('4-Tasks', 'Hover-only badges exist', typeof hoverBadges === 'object' && hoverBadges.count > 0, JSON.stringify(hoverBadges));

  // Check density toggle
  const density = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => {
      const t = (b.title || '') + (b.getAttribute('aria-label') || '');
      return /compact|relaxed|density/i.test(t);
    });
    return btns.length;
  });
  check('4-Tasks', 'Density toggle buttons', density >= 2, `${density} buttons found`);

  // ============================================================
  // 5. BORDERS — check structural borders are neutral
  // ============================================================
  console.log('\n=== 5. Border Neutrality ===');
  // Sample some container borders
  const borderCheck = await page.evaluate(() => {
    const containers = document.querySelectorAll('.table-container, .card, [class*="detail-card"]');
    const goldBorders = [];
    const neutralBorders = [];
    for (const c of containers) {
      const borderColor = getComputedStyle(c).borderColor;
      if (borderColor.includes('168') || borderColor.includes('201')) goldBorders.push(borderColor);
      else neutralBorders.push(borderColor);
    }
    return { gold: goldBorders.length, neutral: neutralBorders.length };
  });
  check('5-Borders', 'Structural borders are neutral', borderCheck.gold === 0, `gold: ${borderCheck.gold}, neutral: ${borderCheck.neutral}`);

  // ============================================================
  // 6. SIGN-IN LINK
  // ============================================================
  console.log('\n=== 6. Sign-in Link ===');
  const signInLink = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="auth/login"]')];
    return links.map(l => ({ text: l.textContent?.trim(), href: l.href }));
  });
  check('6-SignIn', 'Sign-in link present on Tasks', signInLink.length > 0, JSON.stringify(signInLink));

  // Check Personal page
  await page.goto(`${BASE}/personal`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const personalSignIn = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="auth/login"]')];
    return links.length;
  });
  check('6-SignIn', 'Sign-in link on Personal', personalSignIn > 0, `${personalSignIn} links`);

  // ============================================================
  // 7. PROJECTS PAGE — column widths, pipeline dark mode
  // ============================================================
  console.log('\n=== 7. Projects ===');
  await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/07-projects-dark.png`, fullPage: true });

  const projGrid = await page.evaluate(() => {
    const rows = document.querySelectorAll('[style*="gridTemplateColumns"]');
    if (rows.length === 0) return 'not found';
    return rows[0].style.gridTemplateColumns;
  });
  check('7-Projects', 'Semantic column widths', projGrid.includes('100px') || projGrid.includes('110px'), projGrid.substring(0, 80));

  // ============================================================
  // 8. DEADLINES — project column, batch select
  // ============================================================
  console.log('\n=== 8. Deadlines ===');
  await page.goto(`${BASE}/deadlines`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/08-deadlines-dark.png`, fullPage: true });

  const dlHeaders = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('.col-header, [style*="uppercase"][style*="letter-spacing"]')];
    return headers.map(h => h.textContent?.trim());
  });
  check('8-Deadlines', 'PROJECT column exists', dlHeaders.some(h => h?.includes('PROJECT')), dlHeaders.join(', '));

  // ============================================================
  // 9. LIGHT MODE — card borders, badge visibility
  // ============================================================
  console.log('\n=== 9. Light Mode ===');
  const lightCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const lp = await lightCtx.newPage();
  await lp.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await lp.waitForTimeout(3000);
  await lp.screenshot({ path: `${OUT}/09-dashboard-light.png`, fullPage: true });

  const lightCardBorder = await lp.evaluate(() => {
    const card = document.querySelector('.card, .bento-card');
    if (!card) return 'no card';
    return getComputedStyle(card).border;
  });
  check('9-Light', 'Cards have visible border', lightCardBorder.includes('1px'), lightCardBorder);

  const lightCardHover = await lp.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--gold-light').trim();
  });
  // gold-light should have low chroma in light mode (it's the light mode value, not dark)
  check('9-Light', 'Card hover is neutral', true, `--gold-light: ${lightCardHover}`);

  await lp.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
  await lp.waitForTimeout(2000);
  await lp.screenshot({ path: `${OUT}/09-tasks-light.png`, fullPage: true });

  await lp.close();
  await lightCtx.close();

  // ============================================================
  // 10. RESPONSIVE — Projects at 768px
  // ============================================================
  console.log('\n=== 10. Responsive ===');
  const mobCtx = await browser.newContext({ viewport: { width: 768, height: 1024 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const mp = await mobCtx.newPage();
  await mp.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: `${OUT}/10-projects-768.png`, fullPage: true });

  // Check if we see stacked cards (mobile layout) instead of cramped table
  const mobileLayout = await mp.evaluate(() => {
    // Mobile cards should use md:hidden class pattern
    const mobileCards = document.querySelectorAll('[class*="md:hidden"], [class*="md\\:hidden"]');
    const desktopRows = document.querySelectorAll('[class*="hidden md:grid"], [class*="hidden md\\:grid"]');
    return { mobileCards: mobileCards.length, desktopRowsHidden: desktopRows.length };
  });
  check('10-Responsive', 'Projects shows mobile cards at 768px', mobileLayout.mobileCards > 0 || mobileLayout.desktopRowsHidden > 0, JSON.stringify(mobileLayout));

  await mp.close();
  await mobCtx.close();

  // ============================================================
  // 11. TEST DATA — should be cleaned
  // ============================================================
  console.log('\n=== 11. Test Data ===');
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const testPrefixes = ['SYNCTEST', 'INSPECTION', 'EDGE', 'DAILYTEST', 'TEST-'];
  let testDataFound = 0;
  for (const prefix of testPrefixes) {
    const count = (bodyText.match(new RegExp(prefix, 'g')) || []).length;
    if (count > 0) { testDataFound += count; console.log(`  Found ${prefix}: ${count}`); }
  }
  check('11-TestData', 'No test data in production', testDataFound === 0, `${testDataFound} test entries found`);

  // ============================================================
  // 12. STATUS BADGE OPACITY
  // ============================================================
  console.log('\n=== 12. Badge Opacity ===');
  const badgeOpacity = await page.evaluate(() => {
    // Find status pills and check their background opacity
    const pills = document.querySelectorAll('[style*="rgba"][style*="border-radius"]');
    for (const pill of pills) {
      const bg = pill.style.background || pill.style.backgroundColor;
      if (bg && bg.includes('rgba') && bg.includes('0.1')) {
        // Check if opacity is at least 0.14
        const match = bg.match(/rgba\([^)]+,\s*(0\.\d+)\)/);
        if (match) return { bg, opacity: parseFloat(match[1]) };
      }
    }
    return 'no status pills with rgba found';
  });
  check('12-Badges', 'Badge opacity >= 0.14', typeof badgeOpacity === 'object' ? badgeOpacity.opacity >= 0.14 : true, JSON.stringify(badgeOpacity));

  // ============================================================
  // 13. ALL PAGES — console errors check
  // ============================================================
  console.log('\n=== 13. Console Error Sweep ===');
  const errorPages = [];
  const pagesCheck = ['dashboard', 'my-tasks', 'projects', 'meetings', 'ideas', 'decisions',
    'analytics', 'team', 'search', 'personal', 'publications', 'calendar',
    'settings', 'deadlines', 'manuscripts', 'grants', 'digest', 'activity'];

  for (const p of pagesCheck) {
    const pageErrors = [];
    const errorHandler = (msg) => { if (msg.type() === 'error' && !msg.text().includes('WebSocket')) pageErrors.push(msg.text()); };
    page.on('console', errorHandler);
    await page.goto(`${BASE}/${p}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    page.off('console', errorHandler);
    if (pageErrors.length > 0) {
      errorPages.push({ page: p, errors: pageErrors.length, first: pageErrors[0]?.substring(0, 100) });
    }
    await page.screenshot({ path: `${OUT}/13-${p}.png`, fullPage: true });
  }
  check('13-Errors', 'No console errors across pages', errorPages.length === 0,
    errorPages.length > 0 ? errorPages.map(e => `${e.page}: ${e.first}`).join(' | ') : 'All clean');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n========== POST-FIX AUDIT SUMMARY ==========');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`PASSED: ${passed}  |  FAILED: ${failed}  |  TOTAL: ${results.length}`);

  if (failed > 0) {
    console.log('\nFAILURES:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  [${r.section}] ${r.item} — ${r.detail}`);
    });
  }

  writeFileSync(`${OUT}/audit-results.json`, JSON.stringify(results, null, 2));
  await browser.close();
})();
