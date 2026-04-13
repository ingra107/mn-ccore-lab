// Mobile regression sweep at 375px.
// Detects:
//  - horizontal scroll
//  - elements wider than viewport
//  - desktop+mobile dual rendering (rows with >0 height where they should be display:none)
//  - row overlap (rows whose bounding rect Y extends into the next row)
// Captures screenshots.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'https://mn-ccore-lab.pages.dev';
const OUTDIR = __dirname;
const SCREENSHOTS = path.join(OUTDIR, 'screenshots');
if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS, { recursive: true });

const PAGES = [
  '/dashboard',
  '/my-tasks',
  '/personal',
  '/projects',
  '/manuscripts',
  '/grants',
  '/deadlines',
  '/meetings',
  '/team',
  '/ideas',
  '/decisions',
  '/research-digest',
  '/calendar',
  '/analytics',
  '/pi-analytics',
  '/search',
  '/settings',
  '/activity',
];

async function audit(page, url) {
  return page.evaluate((url) => {
    const res = {
      url,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      oversizedElements: [],
      dualRendering: null,
      rowOverlap: null,
    };

    // Find any element wider than viewport
    const all = Array.from(document.querySelectorAll('body *'));
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth + 1 && r.height > 0) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        res.oversizedElements.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '',
          w: Math.round(r.width),
          x: Math.round(r.left),
        });
        if (res.oversizedElements.length >= 6) break;
      }
    }

    // Dual rendering check: for any Link/anchor that contains BOTH a `.hidden.md:grid` (or sm:grid)
    // descendant AND a `.md:hidden` (or sm:hidden) descendant, measure both.
    const projectRowsDesktop = Array.from(document.querySelectorAll('.project-list-row.hidden'));
    const projectRowsMobile = Array.from(document.querySelectorAll('.project-list-row.md\\:hidden'));
    const manuscriptRowsDesktop = Array.from(document.querySelectorAll('.manuscript-list-row.hidden'));
    const manuscriptRowsMobile = Array.from(document.querySelectorAll('.manuscript-list-row.sm\\:hidden'));

    const measureRows = (rows) => rows.slice(0, 5).map(r => {
      const rect = r.getBoundingClientRect();
      const style = window.getComputedStyle(r);
      return { w: Math.round(rect.width), h: Math.round(rect.height), display: style.display, visible: rect.height > 0 };
    });

    res.dualRendering = {
      projectDesktopRows: measureRows(projectRowsDesktop),
      projectMobileRows: measureRows(projectRowsMobile),
      manuscriptDesktopRows: measureRows(manuscriptRowsDesktop),
      manuscriptMobileRows: measureRows(manuscriptRowsMobile),
    };

    // Row overlap detection — check if mobile card rows render at correct heights or get clipped
    const checkOverlap = (sel) => {
      const rows = Array.from(document.querySelectorAll(sel)).slice(0, 5);
      const rects = rows.map(r => r.getBoundingClientRect());
      const overlaps = [];
      for (let i = 0; i < rects.length - 1; i++) {
        if (rects[i].bottom > rects[i + 1].top + 1) {
          overlaps.push({ i, bottom: rects[i].bottom, nextTop: rects[i + 1].top });
        }
      }
      return { sel, count: rows.length, heights: rects.map(r => Math.round(r.height)), overlaps };
    };

    res.rowOverlap = {
      project: checkOverlap('.project-list-row.md\\:hidden'),
      manuscript: checkOverlap('.manuscript-list-row.sm\\:hidden'),
      task: checkOverlap('.task-grid-row'),
      deadline: checkOverlap('.deadline-list-row'),
    };

    return res;
  }, url);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // Force dark theme via localStorage
  await page.addInitScript(() => {
    try { localStorage.setItem('theme', 'dark'); } catch (e) {}
  });

  const report = { base: BASE, generated: new Date().toISOString(), pages: {} };

  for (const p of PAGES) {
    try {
      await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1200);
      const data = await audit(page, p);
      const name = p.replace(/\//g, '_').replace(/^_/, '') || 'root';
      await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true }).catch(() => {});
      report.pages[p] = data;
      const badge = data.hasHorizontalScroll ? 'H-SCROLL' : 'ok';
      const overSz = data.oversizedElements.length;
      console.log(`${p.padEnd(24)} ${badge.padEnd(9)} over=${overSz}`);
    } catch (e) {
      report.pages[p] = { error: String(e).slice(0, 200) };
      console.log(`${p.padEnd(24)} ERROR ${String(e).slice(0, 80)}`);
    }
  }

  fs.writeFileSync(path.join(OUTDIR, 'mobile-survey.json'), JSON.stringify(report, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
