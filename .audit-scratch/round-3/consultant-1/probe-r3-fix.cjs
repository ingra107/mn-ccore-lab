// Follow-up probe: better selectors for banner + mentee risk
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('mn-ccore-theme', 'dark');
    localStorage.removeItem('hub-signin-banner-dismissed');
  });
  const out = {};

  // MyTasks banner — more precise: look for flex row with Sign in link
  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);
  out.myTasksBanner = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="auth/login"]'));
    const match = links.find(a => /sign in/i.test(a.innerText || ''));
    if (!match) return 'no-signin-link';
    // Walk up until we find a bordered container
    let el = match;
    for (let i = 0; i < 6; i++) {
      el = el.parentElement;
      if (!el) break;
      const cs = getComputedStyle(el);
      if (cs.borderLeftWidth !== '0px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const r = el.getBoundingClientRect();
        return {
          height: Math.round(r.height),
          width: Math.round(r.width),
          bg: cs.backgroundColor,
          borderLeftColor: cs.borderLeftColor,
          borderLeftWidth: cs.borderLeftWidth,
          text: (el.innerText || '').slice(0, 120),
        };
      }
    }
    return 'no-styled-ancestor';
  });

  // Mentee risk — scan for "d" silence badges (e.g., "Quiet 12d")
  await page.goto('https://mn-ccore-lab.pages.dev/mentee-milestones', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  out.menteeRisk = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    return {
      hasQuiet: /\bQuiet\b/.test(bodyText),
      hasSilent: /\bSilent\b/.test(bodyText),
      // Extract any badges with Nd pattern
      matches: (bodyText.match(/(Quiet|Silent)\s+\d+d/g) || []).slice(0, 5),
    };
  });

  // Ideas empty — data might be present; check the EmptyState presence in source-level vs data
  await page.goto('https://mn-ccore-lab.pages.dev/ideas', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);
  out.ideasHasData = await page.evaluate(() => {
    const rows = document.querySelectorAll('[role="row"], tr');
    return { rowCount: rows.length };
  });

  // Verify a route change animation by pressing back/forward
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  out.tasksLoaded = true;
  // Check motion root has transform on initial mount (captured before animation ends)
  await page.goto('https://mn-ccore-lab.pages.dev/projects', { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Capture mid-transition (very fast — needs ~50ms)
  const mid = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const wrapper = main.querySelector('div[style*="transform"], div[style*="opacity"]');
    if (!wrapper) return 'no-wrapper';
    return { style: wrapper.getAttribute('style') || '' };
  });
  out.routeMotion = mid;

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
