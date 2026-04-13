// Measure transition durations across components
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });

  const measurements = [];

  // Tasks page row transitions
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  const firstRow = page.locator('.task-grid-row').first();
  const rowTrans = await firstRow.evaluate(el => getComputedStyle(el).transition);
  measurements.push(['task-grid-row', rowTrans]);

  // Inline status button transition
  const statusBtn = page.locator('[data-testid^="task-status-"] button').first();
  if (await statusBtn.count() > 0) {
    const btnTrans = await statusBtn.evaluate(el => getComputedStyle(el).transition);
    measurements.push(['InlineCellSelect button', btnTrans]);
  }

  // Row action buttons
  const actionBtn = page.locator('.task-grid-row-action-btn').first();
  if (await actionBtn.count() > 0) {
    const actionTrans = await actionBtn.evaluate(el => getComputedStyle(el).transition);
    measurements.push(['row action btn', actionTrans]);
  }

  // Dashboard card
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Find a bento card
  const bentos = page.locator('[class*="bento"], [class*="dashboard-card"], .card').first();
  if (await bentos.count() > 0) {
    const bentoTrans = await bentos.evaluate(el => getComputedStyle(el).transition);
    measurements.push(['dashboard card', bentoTrans]);
  }

  // Sidebar nav item
  const sideNav = page.locator('nav a, [class*="sidebar"] a').first();
  if (await sideNav.count() > 0) {
    const navTrans = await sideNav.evaluate(el => getComputedStyle(el).transition);
    measurements.push(['sidebar nav', navTrans]);
  }

  // Buttons
  const buttons = page.locator('button').first();
  if (await buttons.count() > 0) {
    const btnTrans = await buttons.evaluate(el => getComputedStyle(el).transition);
    measurements.push(['button (first)', btnTrans]);
  }

  // Check if CSS vars --duration-fast etc are defined
  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      fast: cs.getPropertyValue('--duration-fast').trim(),
      normal: cs.getPropertyValue('--duration-normal').trim(),
      moderate: cs.getPropertyValue('--duration-moderate').trim(),
      slow: cs.getPropertyValue('--duration-slow').trim(),
      easeOut: cs.getPropertyValue('--ease-out').trim(),
      easeInOut: cs.getPropertyValue('--ease-in-out').trim(),
      transitionFast: cs.getPropertyValue('--transition-fast').trim(),
      transitionPanel: cs.getPropertyValue('--transition-panel').trim(),
    };
  });
  measurements.push(['CSS vars', JSON.stringify(vars)]);

  console.log('\n=== TIMING ===');
  for (const [k, v] of measurements) console.log(k + ': ' + v);

  const fs = require('fs');
  fs.writeFileSync('C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/09-timing.json', JSON.stringify(measurements, null, 2));

  await browser.close();
})();
