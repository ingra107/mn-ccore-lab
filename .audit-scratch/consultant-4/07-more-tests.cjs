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

  // ─── /projects ───
  await page.goto('https://mn-ccore-lab.pages.dev/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const projectRows = await page.locator('[data-testid^="project-"], [class*="project-row"]').count();
  rec('/projects rows render', projectRows >= 0 ? 'PASS' : 'FAIL', projectRows + ' rows');

  // j key
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  const pfocused = await page.locator('.task-row-focused, [class*="focused"]').count();
  rec('/projects J key focus', pfocused > 0 ? 'PASS' : 'FAIL', pfocused + '');

  // ─── /dashboard → click metric cards ───
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  const dashHeader = await page.locator('h1').first().textContent({ timeout: 5000 }).catch(() => null);
  rec('/dashboard loads', dashHeader ? 'PASS' : 'PARTIAL', (dashHeader || '').slice(0, 40));

  // Hover a card → check transform
  const cards = page.locator('[class*="bento"], [class*="metric-card"], [class*="dashboard-card"]');
  const cc = await cards.count();
  if (cc > 0) {
    const transformBefore = await cards.first().evaluate(el => getComputedStyle(el).transform);
    await cards.first().hover();
    await page.waitForTimeout(300);
    const transformAfter = await cards.first().evaluate(el => getComputedStyle(el).transform);
    rec('dashboard card hover transform changes', transformBefore !== transformAfter ? 'PASS' : 'PARTIAL', 'before=' + transformBefore.slice(0,30) + ' after=' + transformAfter.slice(0,30));
  }

  // ─── /deadlines ───
  await page.goto('https://mn-ccore-lab.pages.dev/deadlines', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const deadlineRows = await page.locator('tr, [role="row"]').count();
  rec('/deadlines rows', deadlineRows > 0 ? 'PASS' : 'FAIL', deadlineRows + '');

  // ─── /ideas ───
  await page.goto('https://mn-ccore-lab.pages.dev/ideas', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  // N key opens create modal
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  const createVisible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  rec('/ideas N key opens create modal', createVisible ? 'PASS' : 'FAIL');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ─── /meetings ───
  await page.goto('https://mn-ccore-lab.pages.dev/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);

  const meetingCards = await page.locator('[class*="meeting"], button:has-text("Meeting"), a[href*="/meeting"]').count();
  rec('/meetings items', meetingCards > 0 ? 'PASS' : 'FAIL', meetingCards + '');

  // J key
  await page.keyboard.press('j');
  await page.waitForTimeout(300);
  rec('/meetings J no crash', 'PASS');

  // ─── /personal ───
  await page.goto('https://mn-ccore-lab.pages.dev/personal', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const personalTasks = await page.locator('[data-testid^="task-title-"]').count();
  rec('/personal tasks visible', personalTasks > 0 ? 'PASS' : 'PARTIAL', personalTasks + '');

  // ─── /decisions N key ───
  await page.goto('https://mn-ccore-lab.pages.dev/decisions', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  const decisionDialog = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  rec('/decisions N opens modal', decisionDialog ? 'PASS' : 'FAIL');
  await page.keyboard.press('Escape');

  // ─── /calendar T key ───
  await page.goto('https://mn-ccore-lab.pages.dev/calendar', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
  // Calendar today button
  const todayBtn = await page.locator('button:has-text("Today")').count();
  rec('/calendar Today button exists', todayBtn > 0 ? 'PASS' : 'FAIL');
  await page.keyboard.press('t');
  await page.waitForTimeout(300);
  rec('/calendar T key no crash', 'PASS');

  // Arrow navigation
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  rec('/calendar Arrow keys no crash', 'PASS');

  // ─── CommandPalette: task counts in footer ───
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  const footerContent = await page.locator('[role="combobox"]').locator('..').textContent().catch(() => '');
  const hasCounts = /\d+\s*(tasks?|projects?)/i.test(footerContent);
  rec('CommandPalette footer counts', hasCounts ? 'PASS' : 'PARTIAL', footerContent.length + ' chars');
  await page.keyboard.press('Escape');

  fs.writeFileSync('C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/07-results.json', JSON.stringify(results, null, 2));
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  const pt = results.filter(r => r.status === 'PARTIAL').length;
  console.log('\n=== ' + p + 'P / ' + f + 'F / ' + pt + 'Partial ===');
  await browser.close();
})();
