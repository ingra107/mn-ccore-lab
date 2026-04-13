const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('mn-ccore-theme', 'dark');
    localStorage.setItem('hub-welcome-dismissed', 'true');
    localStorage.setItem('hub-signin-banner-dismissed', 'true');
  });

  const findings = {};

  // ---- P0 #1: /pi-analytics has Copy/Print/Export ----
  try {
    await page.goto(BASE + '/pi-analytics', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const url = page.url();
    const h1 = await page.locator('h1').first().textContent().catch(() => null);
    const allButtons = await page.locator('button').allTextContents();
    const copyBtn = allButtons.filter(b => /copy/i.test(b));
    const printBtn = allButtons.filter(b => /print/i.test(b));
    const exportBtn = allButtons.filter(b => /export/i.test(b));
    const bodyText = await page.locator('body').textContent();
    const mentionsKeywords = {
      grants: /grant/i.test(bodyText),
      mentee: /mentee/i.test(bodyText),
      manuscripts: /manuscript/i.test(bodyText),
      workload: /workload|capacity/i.test(bodyText),
      overdue: /overdue/i.test(bodyText),
    };
    findings.pi_analytics = {
      finalUrl: url,
      redirected: !url.includes('/pi-analytics'),
      h1,
      buttonCount: allButtons.length,
      copyBtn,
      printBtn,
      exportBtn,
      mentionsKeywords,
    };
    await page.screenshot({ path: path.join(OUT, 'pi-analytics.png'), fullPage: true });
    console.log('PI ANALYTICS:', JSON.stringify(findings.pi_analytics, null, 2));
  } catch (e) {
    findings.pi_analytics_err = e.message;
    console.log('PI ANALYTICS FAIL:', e.message);
  }

  // ---- P0 #2: IRB / Regulatory alerts visible ----
  try {
    await page.goto(BASE + '/personal', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    findings.personal_regulatory = {
      mentionsIRB: /\bIRB\b/.test(bodyText),
      mentionsRegulatory: /regulator/i.test(bodyText),
      mentionsExpir: /expir/i.test(bodyText),
      hasTestDelete: /test_delete/i.test(bodyText),
    };
    // Look for an alert strip element
    const alertStripText = await page.locator('[data-testid*="regulatory"], .regulatory-alert, [class*="Regulatory"]').first().textContent().catch(() => null);
    findings.personal_regulatory.alertStripText = alertStripText;
    await page.screenshot({ path: path.join(OUT, 'personal.png'), fullPage: true });
    console.log('PERSONAL REGULATORY:', JSON.stringify(findings.personal_regulatory, null, 2));
  } catch (e) {
    findings.personal_regulatory_err = e.message;
  }

  // Also check Dashboard for inline RegulatoryAlertStrip
  try {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    findings.dashboard_regulatory = {
      mentionsIRB: /\bIRB\b/.test(bodyText),
      mentionsRegulatory: /regulator/i.test(bodyText),
      mentionsExpir: /expir/i.test(bodyText),
    };
    await page.screenshot({ path: path.join(OUT, 'dashboard.png'), fullPage: true });
    console.log('DASHBOARD REGULATORY:', JSON.stringify(findings.dashboard_regulatory, null, 2));
  } catch (e) {
    findings.dashboard_regulatory_err = e.message;
  }

  // ---- P0 #3: Manuscripts days-in-stage + Stalled filter ----
  try {
    await page.goto(BASE + '/manuscripts', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').textContent();
    const headers = await page.locator('[role="columnheader"], .column-header, th').allTextContents();
    const allButtons = await page.locator('button').allTextContents();
    const stalledFilter = allButtons.filter(b => /stalled/i.test(b));
    const daysInStageHeader = headers.filter(h => /days|stage|stalled/i.test(h));
    findings.manuscripts = {
      headers: headers.slice(0, 30),
      daysInStageHeader,
      stalledFilter,
      mentionsDays: /\bdays\b/i.test(bodyText),
      mentionsStalled: /stalled/i.test(bodyText),
    };
    await page.screenshot({ path: path.join(OUT, 'manuscripts.png'), fullPage: true });

    // Click Stalled if present
    if (stalledFilter.length) {
      await page.locator('button', { hasText: /^stalled$/i }).first().click().catch(() => {});
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'manuscripts-stalled.png'), fullPage: true });
    }
    console.log('MANUSCRIPTS:', JSON.stringify(findings.manuscripts, null, 2));
  } catch (e) {
    findings.manuscripts_err = e.message;
  }

  // ---- BONUS: Coordinator journey ----
  // Meetings: split-panel, carry-forward badges, log decision
  try {
    await page.goto(BASE + '/meetings', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    const allButtons = await page.locator('button').allTextContents();
    findings.meetings = {
      hasCarryForward: /carried forward/i.test(bodyText),
      hasLogDecision: allButtons.some(b => /log decision/i.test(b)),
      countBadge: /×\d+|x\d+/i.test(bodyText),
      buttonCount: allButtons.length,
    };
    await page.screenshot({ path: path.join(OUT, 'meetings.png'), fullPage: true });
    console.log('MEETINGS:', JSON.stringify(findings.meetings));
  } catch (e) {
    findings.meetings_err = e.message;
  }

  // Decisions table
  try {
    await page.goto(BASE + '/decisions', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const headers = await page.locator('[role="columnheader"], .column-header, th').allTextContents();
    findings.decisions = { headers: headers.slice(0, 20) };
    await page.screenshot({ path: path.join(OUT, 'decisions.png'), fullPage: true });
    console.log('DECISIONS:', JSON.stringify(findings.decisions));
  } catch (e) {}

  // Ideas table
  try {
    await page.goto(BASE + '/ideas', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const headers = await page.locator('[role="columnheader"], .column-header, th').allTextContents();
    findings.ideas = { headers: headers.slice(0, 20) };
    await page.screenshot({ path: path.join(OUT, 'ideas.png'), fullPage: true });
  } catch (e) {}

  // Mentee Milestones — stalled detector
  try {
    await page.goto(BASE + '/mentee-milestones', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').textContent();
    findings.mentee = {
      hasStalled: /stalled/i.test(bodyText),
      hasRedBadge: /\d+\s*days/i.test(bodyText),
      hasContent: bodyText.length > 500,
      mentions: {
        committee: /committee/i.test(bodyText),
        milestone: /milestone/i.test(bodyText),
      },
    };
    await page.screenshot({ path: path.join(OUT, 'mentee.png'), fullPage: true });
    console.log('MENTEE:', JSON.stringify(findings.mentee));
  } catch (e) {}

  // Deadlines
  try {
    await page.goto(BASE + '/deadlines', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'deadlines.png'), fullPage: true });
  } catch (e) {}

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  await browser.close();
  console.log('DONE');
})();
