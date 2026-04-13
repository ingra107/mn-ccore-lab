const { chromium, devices } = require('playwright');
const path = require('path');
const OUTDIR = path.join(__dirname, 'screenshots');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();

  // Get a project slug
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const projectLink = await page.$eval('a[href^="/projects/"]', a => a.getAttribute('href')).catch(()=>null);
  console.log('project link:', projectLink);
  if (projectLink) {
    await page.goto(BASE + projectLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTDIR, '375-project-detail.png'), fullPage: false });
    const scroll = await page.evaluate(() => ({ d: document.documentElement.scrollWidth, w: window.innerWidth }));
    console.log('project detail scroll:', scroll);
  }

  // meeting detail
  await page.goto(BASE + '/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const meetLink = await page.$eval('a[href^="/meetings/"]', a => a.getAttribute('href')).catch(()=>null);
  console.log('meeting link:', meetLink);
  if (meetLink) {
    await page.goto(BASE + meetLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTDIR, '375-meeting-detail.png'), fullPage: false });
  }

  // member profile
  await page.goto(BASE + '/team', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const memberLink = await page.$eval('a[href^="/team/"]', a => a.getAttribute('href')).catch(()=>null);
  console.log('member link:', memberLink);
  if (memberLink && memberLink !== '/team') {
    await page.goto(BASE + memberLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUTDIR, '375-member-detail.png'), fullPage: false });
  }

  // Create task modal test
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Find any button with "New Task" text
  const newBtn = await page.$('button:has-text("New Task"), a:has-text("New Task")');
  if (newBtn) {
    await newBtn.tap();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTDIR, '375-create-task-modal.png'), fullPage: false });
    // Check modal width
    const modal = await page.$('[role="dialog"]');
    if (modal) {
      const box = await modal.boundingBox();
      console.log('modal box:', box);
    }
  } else {
    console.log('no new task button');
  }

  // Meetings detail (split panel) at 768
  await ctx.close();
  const ctx2 = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0)',
  });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + '/meetings', { waitUntil: 'domcontentloaded' });
  await page2.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
  await page2.reload({ waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(2500);
  await page2.screenshot({ path: path.join(OUTDIR, '768-meetings-split.png'), fullPage: false });
  await page2.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(2000);
  await page2.screenshot({ path: path.join(OUTDIR, '768-dashboard.png'), fullPage: false });
  await page2.goto(BASE + '/personal', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(2000);
  await page2.screenshot({ path: path.join(OUTDIR, '768-personal.png'), fullPage: false });

  await browser.close();
})();
