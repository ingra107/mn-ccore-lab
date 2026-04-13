const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const LOG = [];
const log = (...a) => { const s = a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '); LOG.push(s); console.log(s); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') log('CONSOLE ERROR:', m.text().slice(0, 200)); });
  page.on('pageerror', e => log('PAGE ERROR:', e.message.slice(0, 200)));

  try {
    log('=== DESKTOP 1440x900 ===');
    log('--- Landing page / ---');
    await page.goto('https://mn-ccore-lab.pages.dev/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    log('Title:', await page.title());
    await page.screenshot({ path: path.join(OUT, 'd01-landing.png'), fullPage: false });

    // Find CTA
    const ctas = await page.locator('a, button').evaluateAll(els => els.filter(e => /explore|get started|portal|enter|dashboard/i.test(e.textContent || '')).map(e => ({ text: e.textContent.trim().slice(0, 40), href: e.getAttribute('href'), tag: e.tagName })));
    log('CTAs found:', JSON.stringify(ctas.slice(0, 10)));

    // Try Explore Research
    const explore = page.locator('a', { hasText: /explore research/i }).first();
    if (await explore.count()) {
      await explore.click();
      await page.waitForTimeout(2500);
      log('After Explore Research URL:', page.url());
      await page.screenshot({ path: path.join(OUT, 'd02-after-explore.png') });
    } else {
      log('No "Explore Research" link, trying /portal');
      await page.goto('https://mn-ccore-lab.pages.dev/portal', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
    }

    log('--- Portal / Dashboard ---');
    await page.goto('https://mn-ccore-lab.pages.dev/portal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, 'd03-dashboard.png'), fullPage: true });
    log('Dashboard URL:', page.url());

    // Check for onboarding
    const onboarding = await page.locator('text=/get started|onboarding|welcome|first time/i').count();
    log('Onboarding hints count:', onboarding);

    // Look for sign in banner
    const signIn = await page.locator('a[href*="/api/auth/login"]').count();
    const signInText = await page.getByText(/sign in/i).count();
    log('Sign-in links:', signIn, 'sign-in text:', signInText);

    // Sidebar inventory
    const navItems = await page.locator('aside a, nav a').evaluateAll(els => els.map(e => (e.textContent || '').trim()).filter(t => t.length && t.length < 30));
    log('Nav items:', JSON.stringify(navItems.slice(0, 30)));

    log('--- /personal ---');
    await page.goto('https://mn-ccore-lab.pages.dev/personal', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'd04-personal.png'), fullPage: true });

    log('--- /tasks ---');
    await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, 'd05-tasks.png'), fullPage: true });
    const taskRows = await page.locator('[role="row"], tbody tr').count();
    log('Task rows (role=row/tr):', taskRows);

    // Find "My Tasks" filter
    const myTasksToggle = await page.locator('text=/my tasks/i').count();
    log('"My Tasks" toggles:', myTasksToggle);

    // Click first task
    const firstTaskTitle = page.locator('[role="row"] a, [role="row"] button, tbody tr td').first();
    if (await firstTaskTitle.count()) {
      try {
        await firstTaskTitle.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, 'd06-task-detail.png') });
      } catch (e) { log('Task click failed:', e.message.slice(0, 80)); }
    }

    log('--- /my-tasks ---');
    await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, 'd07-my-tasks.png'), fullPage: true });
    const streakText = await page.locator('text=/streak|completion/i').allTextContents();
    log('Streak/completion text:', JSON.stringify(streakText.slice(0, 5)));

    log('--- /mentee-milestones ---');
    await page.goto('https://mn-ccore-lab.pages.dev/mentee-milestones', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'd08-mentee.png'), fullPage: true });

    log('--- /meetings ---');
    await page.goto('https://mn-ccore-lab.pages.dev/meetings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, 'd09-meetings.png'), fullPage: true });

    // Check horizontal overflow
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, body: document.body.scrollWidth }));
    log('Desktop overflow check:', JSON.stringify(overflow));

  } catch (e) {
    log('FATAL:', e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'desktop.log'), LOG.join('\n'));
    await browser.close();
  }
})();
