const { chromium } = require('playwright');
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-5';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard');
  await page.waitForTimeout(1500);
  // List all nav hrefs
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('nav a, aside a')).map(a => ({ t: a.textContent.trim().slice(0, 40), h: a.getAttribute('href') })));
  console.log('NAV LINKS:');
  links.forEach(l => console.log(' ', l.h, '|', l.t));

  // Click a project row to see detail
  await page.goto('https://mn-ccore-lab.pages.dev/projects');
  await page.waitForTimeout(1500);
  const titles = await page.locator('a[href*="/projects/"]').all();
  console.log('project links:', titles.length);
  if (titles.length) {
    const href = await titles[0].getAttribute('href');
    console.log('  clicking', href);
    await page.goto('https://mn-ccore-lab.pages.dev' + href);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: OUT + '/project-detail.png', fullPage: true });
  }

  // Task detail panel — click a task title
  await page.goto('https://mn-ccore-lab.pages.dev/tasks');
  await page.waitForTimeout(2000);
  const taskTitle = page.locator('[role="gridcell"] button, td button').first();
  if (await taskTitle.count()) {
    await taskTitle.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT + '/task-detail.png', fullPage: true });
  }

  await browser.close();
})();
