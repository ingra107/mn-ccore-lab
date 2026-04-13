const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));

  const out = {};

  // 1. Manuscript: what stage/age signals are visible?
  await page.goto(BASE + '/manuscripts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  out.manuscripts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"], tr')].slice(0, 5);
    return {
      hasStageColumn: /stage/i.test(document.body.innerText),
      hasAgeInStage: /days in stage|weeks in|stalled|stuck/i.test(document.body.innerText),
      hasLastActivity: /last activity|updated/i.test(document.body.innerText),
      visibleColumns: [...document.querySelectorAll('[role="columnheader"], th')].map(e => e.innerText.trim()).filter(Boolean),
    };
  });

  // 2. Meeting detail: carry-forward action items?
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const meetingBtn = await page.$('button:has-text("April 07"), a:has-text("April 07"), [data-testid*="meeting"]');
  if (meetingBtn) await meetingBtn.click().catch(() => {});
  await page.waitForTimeout(1200);
  out.meetingDetail = await page.evaluate(() => {
    const bt = document.body.innerText;
    return {
      hasCarriedForward: /carried forward|carry.forward/i.test(bt),
      hasPrepView: /prep view/i.test(bt),
      hasActionItems: /action items?/i.test(bt),
      hasAttendees: /attendees/i.test(bt),
      hasLinkedProjects: /related project|linked project/i.test(bt),
      hasDecisions: /decision/i.test(bt),
      bodyLen: bt.length,
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'meeting-detail-deep.png'), fullPage: true });

  // 3. Personal page: onboarding vs command center order
  await page.goto(BASE + '/personal', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  out.personal = await page.evaluate(() => {
    const headings = [...document.querySelectorAll('h1, h2, h3')].map(h => ({
      tag: h.tagName,
      text: h.innerText.trim(),
      y: Math.round(h.getBoundingClientRect().top),
    })).filter(h => h.text);
    return { headings: headings.slice(0, 20) };
  });

  // 4. Try signing in? No — check what "nick" view looks like vs anon
  // 5. Check regulatory tracking visibility
  out.regulatory = await page.evaluate(() => {
    const bt = document.body.innerText.toLowerCase();
    return {
      irbMentioned: bt.includes('irb'),
      regulatoryMentioned: bt.includes('regulatory'),
      expirationWarning: /expir/.test(bt),
    };
  });

  // 6. PI Analytics report export?
  await page.goto(BASE + '/pi-analytics', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  out.piAnalytics = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean);
    return {
      hasCopyReport: btns.some(b => /copy/i.test(b)),
      hasPrint: btns.some(b => /print/i.test(b)),
      hasExport: btns.some(b => /export/i.test(b)),
      topButtons: btns.slice(0, 20),
      renders: document.body.innerText.length > 500,
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'pi-analytics.png'), fullPage: true });

  // 7. Click into a manuscript to see if stuck duration is visible
  await page.goto(BASE + '/manuscripts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const mLinks = await page.$$('a[href*="/manuscripts/"], a[href*="/projects/"]');
  if (mLinks[0]) {
    try {
      await mLinks[0].click();
      await page.waitForTimeout(1500);
      out.manuscriptDetail = await page.evaluate(() => ({
        url: location.pathname,
        tabs: [...document.querySelectorAll('[role="tab"]')].map(t => t.innerText.trim()),
        hasRevisionTracker: /revision|round \d|reviewer/i.test(document.body.innerText),
        hasTimeline: /timeline|history/i.test(document.body.innerText),
      }));
    } catch (e) { out.manuscriptDetail = { err: e.message.slice(0, 150) }; }
  }

  fs.writeFileSync(path.join(__dirname, 'deep-dives.json'), JSON.stringify(out, null, 2));
  await browser.close();
  console.log('deep dives saved');
})();
