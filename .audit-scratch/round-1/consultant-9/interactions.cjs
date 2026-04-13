// C-09 task tap, hamburger flow, deadlines pill, welcome banner, modal fits
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const SCREEN = path.join(__dirname, 'screenshots-interactions');
fs.mkdirSync(SCREEN, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const log = [];

  // ----- Welcome banner -----
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const banner = await page.evaluate(() => {
    const el = document.querySelector('[class*="WelcomeBanner"], [class*="welcome"]') || document.querySelector('h1, h2');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.innerText.slice(0, 200), w: Math.round(r.width), h: Math.round(r.height) };
  });
  log.push({ check: 'WelcomeBanner', result: banner });
  await page.screenshot({ path: path.join(SCREEN, 'dashboard-welcome.png'), fullPage: false });

  // ----- Hamburger flow -----
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const hamburger = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]').first();
  let hamburgerOk = false;
  try {
    await hamburger.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    hamburgerOk = true;
    await page.screenshot({ path: path.join(SCREEN, 'hamburger-open.png') });
    // Check for my-tasks link
    const myTasksLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const found = links.find(l => l.getAttribute('href') === '/my-tasks' || l.innerText.toLowerCase().includes('my tasks'));
      return found ? { href: found.getAttribute('href'), text: found.innerText } : null;
    });
    log.push({ check: 'sidebar /my-tasks link', result: myTasksLink });
    // close
    await page.keyboard.press('Escape');
  } catch (e) {
    log.push({ check: 'hamburger', error: e.message });
  }
  log.push({ check: 'hamburger-click', result: hamburgerOk });

  // ----- C-09: task row tap opens detail panel -----
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREEN, 'my-tasks-before-tap.png'), fullPage: false });

  // Find first task row title
  let c09 = { found: false };
  try {
    // Try multiple selectors
    const taskTitle = page.locator('[role="row"] [class*="title"], [class*="taskTitle"], [data-testid*="task"]').first();
    const count = await page.locator('[role="row"]').count();
    c09.rowCount = count;
    if (count > 0) {
      // Click first row title
      const firstRow = page.locator('[role="row"]').nth(1); // skip header
      await firstRow.click({ timeout: 5000 });
      await page.waitForTimeout(800);
      // Check if a detail panel/sidepanel appeared
      const panelOpen = await page.evaluate(() => {
        const candidates = document.querySelectorAll('[class*="DetailPanel"], [class*="detailPanel"], [class*="TaskDetail"], [role="dialog"], [class*="peek"]');
        for (const c of candidates) {
          const r = c.getBoundingClientRect();
          if (r.width > 100 && r.height > 100) return { sel: c.className.toString().slice(0,80), w: Math.round(r.width), h: Math.round(r.height) };
        }
        return null;
      });
      c09.panelOpen = panelOpen;
      c09.found = !!panelOpen;
      await page.screenshot({ path: path.join(SCREEN, 'my-tasks-after-tap.png'), fullPage: false });
    }
  } catch (e) {
    c09.error = e.message;
  }
  log.push({ check: 'C-09 task row tap', result: c09 });

  // ----- Deadlines pill overlap -----
  await page.goto(BASE + '/deadlines', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREEN, 'deadlines.png'), fullPage: false });
  const deadlineCheck = await page.evaluate(() => {
    // Look for urgent banner
    const banners = document.querySelectorAll('[class*="urgent"], [class*="banner"], [class*="alert"]');
    const items = [];
    for (const b of banners) {
      const r = b.getBoundingClientRect();
      if (r.width > 100) items.push({ cls: b.className.toString().slice(0,80), w: Math.round(r.width) });
    }
    return items;
  });
  log.push({ check: 'Deadlines banner', result: deadlineCheck });

  // ----- Personal page (was 222px overflow in R0) -----
  await page.goto(BASE + '/personal', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const personalScroll = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
  }));
  log.push({ check: 'Personal scroll', result: personalScroll });
  await page.screenshot({ path: path.join(SCREEN, 'personal.png'), fullPage: false });

  // ----- Meeting detail full-screen -----
  await page.goto(BASE + '/meetings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREEN, 'meetings-list.png'), fullPage: false });
  // Try to tap first meeting
  try {
    const firstMeeting = page.locator('[class*="meeting"]').first();
    await firstMeeting.click({ timeout: 3000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREEN, 'meeting-detail.png'), fullPage: false });
    const hasBack = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.some(b => /back|close|←/i.test(b.innerText || b.getAttribute('aria-label') || ''));
    });
    log.push({ check: 'meeting back button', result: hasBack });
  } catch (e) {
    log.push({ check: 'meeting', error: e.message });
  }

  // ----- ProjectDetail tab strip -----
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  try {
    const firstProject = page.locator('a[href*="/projects/"]').first();
    await firstProject.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREEN, 'project-detail.png'), fullPage: false });
    const tabsScrollable = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"], [class*="tab"]');
      for (const t of tabs) {
        const parent = t.parentElement;
        if (parent) {
          const ps = getComputedStyle(parent);
          if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') return true;
        }
      }
      return false;
    });
    log.push({ check: 'project tabs scrollable', result: tabsScrollable });
  } catch (e) {
    log.push({ check: 'project detail', error: e.message });
  }

  // ----- Create Task modal fits -----
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  try {
    const newBtn = page.locator('button:has-text("New Task"), button:has-text("New")').first();
    await newBtn.click({ timeout: 3000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREEN, 'create-task-modal.png'), fullPage: false });
    const modalFit = await page.evaluate(() => {
      const m = document.querySelector('[role="dialog"], [class*="modal"]');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), winW: window.innerWidth, winH: window.innerHeight, fits: r.width <= window.innerWidth + 1 };
    });
    log.push({ check: 'create task modal fits', result: modalFit });
  } catch (e) {
    log.push({ check: 'modal', error: e.message });
  }

  fs.writeFileSync(path.join(__dirname, 'interactions.json'), JSON.stringify(log, null, 2));
  await browser.close();
  console.log(JSON.stringify(log, null, 2));
})();
