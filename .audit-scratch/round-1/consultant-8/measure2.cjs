// Resumable measurement: writes results.jsonl line per page
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ALL_PAGES = [
  '/', '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/research-digest', '/calendar', '/analytics', '/pi-analytics',
  '/search', '/settings', '/activity', '/publications'
];
const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, 'results.jsonl');

// figure out which pages remain
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).path); } catch {}
  }
}
const PAGES = ALL_PAGES.filter(p => !done.has(p));
process.stderr.write(`Already done: ${done.size}. Remaining: ${PAGES.length}\n`);

async function measurePage(page, client, url) {
  let totalBytes = 0, jsBytes = 0, cssBytes = 0, imgBytes = 0, fontBytes = 0;
  const apiCalls = [];
  const fullChunks = {};
  const onResponse = async (response) => {
    try {
      const u = response.url();
      const rtype = response.request().resourceType();
      let size = 0;
      const headers = response.headers();
      if (headers['content-length']) size = parseInt(headers['content-length'], 10);
      if (size === 0) { try { const b = await response.body(); size = b.length; } catch {} }
      totalBytes += size;
      if (rtype === 'script' || u.endsWith('.js')) {
        jsBytes += size;
        const name = u.split('/').pop().split('?')[0];
        fullChunks[name] = (fullChunks[name] || 0) + size;
      } else if (rtype === 'stylesheet') cssBytes += size;
      else if (rtype === 'image') imgBytes += size;
      else if (rtype === 'font') fontBytes += size;
      if (u.includes('/api/')) apiCalls.push(u.replace(BASE, '').split('?')[0]);
    } catch {}
  };
  page.on('response', onResponse);
  await page.addInitScript(() => {
    window.__lcp = null; window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        const e = list.getEntries(); window.__lcp = e[e.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  const t0 = Date.now();
  let err = null;
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { err = e.message.slice(0, 80); }
  const dclMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    return {
      ttfb: Math.round(nav.responseStart - nav.startTime) || null,
      dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp ? Math.round(window.__lcp) : null,
      cls: Math.round((window.__cls || 0) * 1000) / 1000,
    };
  });
  page.off('response', onResponse);
  const topChunks = Object.entries(fullChunks).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([n, s]) => ({ name: n, kb: Math.round(s / 1024) }));
  return { dclMs, ...m, jsKB: Math.round(jsBytes/1024), cssKB: Math.round(cssBytes/1024),
    imgKB: Math.round(imgBytes/1024), fontKB: Math.round(fontBytes/1024),
    totalKB: Math.round(totalBytes/1024), topChunks, apiCallCount: apiCalls.length, apiCalls, err };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);

  for (const p of PAGES) {
    const url = BASE + p;
    process.stderr.write(`Measuring ${p}...\n`);
    try { await client.send('Network.clearBrowserCache'); } catch {}
    const cold = await measurePage(page, client, url);
    const warm = await measurePage(page, client, url);
    const row = { path: p, cold, warm };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
    process.stderr.write(`  cold:dcl=${cold.dclMs}/lcp=${cold.lcp}/cls=${cold.cls} js=${cold.jsKB}KB total=${cold.totalKB}KB warm:dcl=${warm.dclMs}/lcp=${warm.lcp}/cls=${warm.cls} api=${warm.apiCallCount}\n`);
  }
  await browser.close();
  process.stderr.write('All done.\n');
})();
