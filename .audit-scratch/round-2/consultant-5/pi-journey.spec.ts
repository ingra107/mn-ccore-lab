import { test, expect } from '@playwright/test';

const BASE = 'https://mn-ccore-lab.pages.dev';

test('PI morning: dashboard loads + regulatory strip visible', async ({ page }) => {
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('DASHBOARD_HAS_OVERDUE:', /overdue/i.test(body || ''));
  console.log('DASHBOARD_HAS_REG:', /regulatory|irb|dua|expir/i.test(body || ''));
  await page.screenshot({ path: '.audit-scratch/round-2/consultant-5/dashboard.png', fullPage: true });
});

test('PI Analytics accessible (coordinator/anon)', async ({ page }) => {
  const resp = await page.goto(`${BASE}/pi-analytics`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('PI_STATUS:', resp?.status());
  console.log('PI_HAS_GATE:', /sign in|unauthorized|access denied/i.test(body || ''));
  console.log('PI_HAS_CONTENT:', /commitment|response time|engagement|mentee|workload/i.test(body || ''));
  await page.screenshot({ path: '.audit-scratch/round-2/consultant-5/pi-analytics.png', fullPage: true });
});

test('Mentee milestones stalled detection', async ({ page }) => {
  await page.goto(`${BASE}/mentee-milestones`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('MENTEE_HAS_STALLED:', /stalled|stale|no update/i.test(body || ''));
  await page.screenshot({ path: '.audit-scratch/round-2/consultant-5/mentees.png', fullPage: true });
});

test('Manuscripts stalled filter + days in stage', async ({ page }) => {
  await page.goto(`${BASE}/manuscripts`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('MS_HAS_STALLED_FILTER:', /stalled/i.test(body || ''));
  console.log('MS_HAS_DAYS_STAGE:', /days in stage|in stage/i.test(body || ''));
  await page.screenshot({ path: '.audit-scratch/round-2/consultant-5/manuscripts.png', fullPage: true });
});

test('Grants timeline + milestones', async ({ page }) => {
  await page.goto(`${BASE}/grants`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('GRANT_HAS_TIMELINE:', /timeline/i.test(body || ''));
  console.log('GRANT_HAS_MILESTONE:', /milestone/i.test(body || ''));
  await page.screenshot({ path: '.audit-scratch/round-2/consultant-5/grants.png', fullPage: true });
});

test('Settings Team Directory link', async ({ page }) => {
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState('networkidle');
  const body = await page.textContent('body');
  console.log('SETTINGS_HAS_TEAM_LINK:', /team directory/i.test(body || ''));
});
