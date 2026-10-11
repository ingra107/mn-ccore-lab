import { chromium } from '@playwright/test'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/visual-audit'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  })
  const page = await ctx.newPage()
  page.on('pageerror', () => {})

  async function snap(name: string, waitMs = 2000) {
    await page.waitForTimeout(waitMs)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
    console.log(`  ${name}`)
  }

  // === WORKFLOW 1: PI Morning ===
  console.log('\n=== Workflow 1: PI Morning ===')
  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'load' })
  await snap('01-dashboard-dark')

  await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'load' })
  await snap('02-my-tasks-list')

  // Click first task title -> detail panel
  const titleCell = page.locator('[data-testid^="task-title-"]').first()
  if (await titleCell.isVisible({ timeout: 5000 }).catch(() => false)) {
    await titleCell.click()
    await snap('03-task-detail-panel')
    await page.locator('[data-testid="close-detail-panel"]').click()
    await page.waitForTimeout(500)
  }

  // Open status dropdown
  const statusBtn = page.locator('[data-testid^="task-status-"]').first()
  if (await statusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await statusBtn.click({ force: true })
    await snap('04-status-dropdown-open')
    await page.keyboard.press('Escape')
  }

  // === WORKFLOW 2: Projects ===
  console.log('\n=== Workflow 2: Projects ===')
  await page.goto(`${BASE}/portal/projects`, { waitUntil: 'load' })
  await snap('05-projects-pipeline')

  const projRow = page.locator('tr').filter({ has: page.locator('td') }).first()
  if (await projRow.isVisible({ timeout: 5000 }).catch(() => false)) {
    await projRow.click()
    await snap('06-project-detail')
  }

  // === WORKFLOW 3: Grants ===
  console.log('\n=== Workflow 3: Grants ===')
  await page.goto(`${BASE}/portal/grants`, { waitUntil: 'load' })
  await snap('07-grants-list')

  const grantRow = page.locator('[role="button"]').first()
  if (await grantRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await grantRow.click()
    await page.waitForTimeout(1000)
    await snap('08-grant-detail-expanded')
  }

  const timelineBtn = page.locator('button').filter({ hasText: /Timeline/ })
  if (await timelineBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await timelineBtn.first().click()
    await snap('09-grants-timeline')
  }

  // === WORKFLOW 4: Ideas ===
  console.log('\n=== Workflow 4: Ideas ===')
  await page.goto(`${BASE}/portal/ideas`, { waitUntil: 'load' })
  await snap('10-ideas-page')

  const ideaRow = page.locator('[role="button"], tr, div').filter({ hasText: /journal club|office hours/ }).first()
  if (await ideaRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await ideaRow.click()
    await page.waitForTimeout(1000)
    await snap('11-idea-expanded')
  }

  // === WORKFLOW 5: Decisions ===
  console.log('\n=== Workflow 5: Decisions ===')
  await page.goto(`${BASE}/portal/decisions`, { waitUntil: 'load' })
  await snap('12-decisions-page')

  const decRow = page.locator('[role="button"], tr, div').filter({ hasText: /design pivot|D1 as cloud/ }).first()
  if (await decRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await decRow.click()
    await page.waitForTimeout(1000)
    await snap('13-decision-expanded')
  }

  // === WORKFLOW 6: Meetings ===
  console.log('\n=== Workflow 6: Meetings ===')
  await page.goto(`${BASE}/portal/meetings`, { waitUntil: 'load' })
  await snap('14-meetings-hub')

  const meetingItem = page.locator('button, div').filter({ hasText: /Biweekly/ }).first()
  if (await meetingItem.isVisible({ timeout: 3000 }).catch(() => false)) {
    await meetingItem.click()
    await page.waitForTimeout(1500)
    await snap('15-meeting-detail-split')
  }

  // === WORKFLOW 7: Digest ===
  console.log('\n=== Workflow 7: Digest ===')
  await page.goto(`${BASE}/portal/digest`, { waitUntil: 'load' })
  await snap('16-digest-page')

  // === WORKFLOW 8: Deadlines ===
  console.log('\n=== Workflow 8: Deadlines ===')
  await page.goto(`${BASE}/portal/deadlines`, { waitUntil: 'load' })
  await snap('17-deadlines')

  // === WORKFLOW 9: Team ===
  console.log('\n=== Workflow 9: Team ===')
  await page.goto(`${BASE}/team`, { waitUntil: 'load' })
  await snap('18-team-expertise')

  // === WORKFLOW 10: Publications ===
  console.log('\n=== Workflow 10: Publications ===')
  await page.goto(`${BASE}/publications`, { waitUntil: 'load' })
  await snap('19-publications')

  // === WORKFLOW 11: Analytics ===
  console.log('\n=== Workflow 11: Analytics ===')
  await page.goto(`${BASE}/portal/analytics`, { waitUntil: 'load' })
  await snap('20-analytics')

  // === WORKFLOW 12: Light Mode ===
  console.log('\n=== Workflow 12: Light Mode ===')
  const lightCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })
  const lightPage = await lightCtx.newPage()
  lightPage.on('pageerror', () => {})

  await lightPage.goto(`${BASE}/portal/dashboard`, { waitUntil: 'load' })
  await lightPage.waitForTimeout(2500)
  await lightPage.screenshot({ path: `${OUT}/21-dashboard-light.png` })
  console.log('  21-dashboard-light')

  await lightPage.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'load' })
  await lightPage.waitForTimeout(2000)
  await lightPage.screenshot({ path: `${OUT}/22-my-tasks-light.png` })
  console.log('  22-my-tasks-light')

  await lightPage.goto(`${BASE}/portal/projects`, { waitUntil: 'load' })
  await lightPage.waitForTimeout(2000)
  await lightPage.screenshot({ path: `${OUT}/23-projects-light.png` })
  console.log('  23-projects-light')

  // === WORKFLOW 13: Mobile ===
  console.log('\n=== Workflow 13: Mobile (375x812) ===')
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  })
  const mobilePage = await mobileCtx.newPage()
  mobilePage.on('pageerror', () => {})

  for (const [path, name] of [
    ['/portal/dashboard', '24-mobile-dashboard'],
    ['/portal/my-tasks', '25-mobile-tasks'],
    ['/portal/ideas', '26-mobile-ideas'],
    ['/portal/grants', '27-mobile-grants'],
    ['/portal/meetings', '28-mobile-meetings'],
    ['/portal/decisions', '29-mobile-decisions'],
  ] as const) {
    await mobilePage.goto(`${BASE}${path}`, { waitUntil: 'load' })
    await mobilePage.waitForTimeout(2000)
    await mobilePage.screenshot({ path: `${OUT}/${name}.png` })
    console.log(`  ${name}`)
  }

  // === WORKFLOW 14: Modals & Overlays ===
  console.log('\n=== Workflow 14: Modals & Overlays ===')
  await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)

  // Command palette
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(800)
  await snap('30-command-palette', 500)
  await page.keyboard.type('grants')
  await snap('31-command-search', 500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Create task modal
  await page.keyboard.press('c')
  await page.waitForTimeout(800)
  await snap('32-create-task-modal', 500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Shortcut help
  await page.keyboard.press('?')
  await page.waitForTimeout(800)
  await snap('33-shortcut-help', 500)
  await page.keyboard.press('Escape')

  await browser.close()
  console.log('\nDone. 33 screenshots in review/visual-audit/')
}

main().catch(console.error)
