import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://mn-ccore-lab.pages.dev';
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/round-1/consultant-2';

const PAGES = [
  '/dashboard', '/my-tasks', '/tasks', '/projects', '/deadlines',
  '/manuscripts', '/ideas', '/decisions', '/meetings', '/grants',
  '/publications', '/team', '/activity', '/search', '/calendar',
  '/analytics', '/settings', '/personal',
  '/'
];

async function probe(page, theme) {
  return await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    // Find a bento card
    const bento = document.querySelector('.bento-card');
    const bentoStyle = bento ? getComputedStyle(bento) : null;
    // Find sidebar
    const sidebar = document.querySelector('aside, [class*="sidebar"], nav[class*="side"]');
    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    // Find any .border-light user
    return {
      pageBg: body.backgroundColor,
      ink: cs.getPropertyValue('--ink').trim(),
      cream: cs.getPropertyValue('--cream').trim(),
      surfaceCard: cs.getPropertyValue('--surface-card').trim(),
      surface1: cs.getPropertyValue('--surface-1').trim(),
      surface2: cs.getPropertyValue('--surface-2').trim(),
      borderSubtle: cs.getPropertyValue('--border-subtle').trim(),
      borderLight: cs.getPropertyValue('--border-light').trim(),
      focusRing: cs.getPropertyValue('--focus-ring').trim(),
      alertBg: cs.getPropertyValue('--alert-bg').trim(),
      sidebarBg: cs.getPropertyValue('--sidebar-bg').trim(),
      bentoBg: bentoStyle?.backgroundColor || null,
      bentoBoxShadow: bentoStyle?.boxShadow || null,
      sidebarBgComputed: sidebarStyle?.backgroundColor || null,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = {};
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(SITE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('mn-ccore-theme', t), theme);
    results[theme] = {};
    for (const path of PAGES) {
      try {
        await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(800);
        const data = await probe(page, theme);
        results[theme][path] = data;
        // Screenshot
        const safe = path.replace(/\//g, '_') || '_root';
        await page.screenshot({ path: `${OUT}/screens/${theme}${safe}.png`, fullPage: true });
        console.log(`[${theme}] ${path} ok`);
      } catch (e) {
        results[theme][path] = { error: e.message };
        console.log(`[${theme}] ${path} ERROR ${e.message}`);
      }
    }
    await ctx.close();
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(results, null, 2));
  await browser.close();
  console.log('done');
})();
