const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('mn-ccore-theme', 'dark');
    localStorage.setItem('hub-welcome-dismissed', 'true');
    localStorage.setItem('hub-signin-banner-dismissed', 'true');
  });

  const f = {};

  // Personal — wait longer, search more aggressively
  await page.goto(BASE + '/personal', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  // Try checking the API directly
  const regAPI = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/regulatory');
      return { status: r.status, body: (await r.text()).slice(0, 500) };
    } catch (e) { return { err: e.message }; }
  });
  f.regulatoryAPI = regAPI;
  // Search for "IRB" anywhere in DOM including hidden
  const irbEls = await page.locator('text=/IRB/i').count();
  const expirEls = await page.locator('text=/expir/i').count();
  const regulatoryEls = await page.locator('text=/regulator/i').count();
  f.personalCounts = { irbEls, expirEls, regulatoryEls };
  // Get all card titles in personal page
  const cardTitles = await page.locator('h1, h2, h3, h4').allTextContents();
  f.personalCardTitles = cardTitles;
  console.log('PERSONAL DEEP:', JSON.stringify(f, null, 2));

  // Try /my-hub
  await page.goto(BASE + '/my-hub', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const myHubIRB = await page.locator('text=/IRB/i').count();
  const myHubExpir = await page.locator('text=/expir/i').count();
  const myHubReg = await page.locator('text=/regulator/i').count();
  f.myHub = { myHubIRB, myHubExpir, myHubReg };
  // Get card titles
  f.myHubCardTitles = await page.locator('h1, h2, h3, h4').allTextContents();

  // Test API for regulatory
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const dashIRB = await page.locator('text=/IRB/i').count();
  const dashExpir = await page.locator('text=/expir/i').count();
  const dashReg = await page.locator('text=/regulator/i').count();
  f.dashboard = { dashIRB, dashExpir, dashReg };

  // Check what regulatory endpoints exist
  const apiProbe = await page.evaluate(async () => {
    const endpoints = [
      '/api/regulatory',
      '/api/regulatory-items',
      '/api/regulatory_items',
      '/api/irb',
      '/api/protocols',
    ];
    const out = {};
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep);
        out[ep] = { status: r.status, sample: (await r.text()).slice(0, 200) };
      } catch (e) { out[ep] = { err: e.message }; }
    }
    return out;
  });
  f.apiProbe = apiProbe;

  // Check Mentee for stalled
  await page.goto(BASE + '/mentee-milestones', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const stalledCount = await page.locator('text=/stalled/i').count();
  const daysAgoCount = await page.locator('text=/\\d+ days ago/i').count();
  f.mentee = { stalledCount, daysAgoCount };

  // Check meetings carry-forward more carefully
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  // Auto-select first meeting then look for carry forward
  const cfCount = await page.locator('text=/carried forward/i').count();
  const xNCount = await page.locator('text=/×\\d+/').count();
  // Try clicking "Log Decision"
  const allBtns = await page.locator('button').allTextContents();
  f.meetings = {
    cfCount,
    xNCount,
    logDecisionBtn: allBtns.filter(b => /log decision|log a decision|new decision/i.test(b)),
    relatedProjects: await page.locator('text=/related project/i').count(),
  };

  // Re-check pi-analytics — maybe sign-in flow has changed
  await page.goto(BASE + '/pi-analytics', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const pia = await page.locator('body').textContent();
  f.pia = {
    hasPIAccess: /PI Access Only/i.test(pia),
    hasCopyReport: /copy report/i.test(pia),
    hasPrint: /print/i.test(pia),
  };

  fs.writeFileSync(path.join(OUT, 'findings2.json'), JSON.stringify(f, null, 2));
  console.log(JSON.stringify(f, null, 2));
  await browser.close();
})();
