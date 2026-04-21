// Deep interactive audit — actually click, type, edit. Capture friction.
import { test, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { P } from './helpers/paths'

const BASE = 'https://mn-ccore-lab.pages.dev'
const TS = process.env.AUDIT_TS || new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)
const OUT = path.join(process.cwd(), 'review', 'audit-newteammate', TS + '-deep')
fs.mkdirSync(OUT, { recursive: true })

const findings: string[] = []
const log = (s: string) => {
  console.log(s)
  findings.push(s)
}

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})

test('deep desktop interactions', async ({ page }) => {
  test.setTimeout(300_000)
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) log(`[console.error] ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}`))

  // 1) Cmd+K palette — try multiple ways
  await page.goto(`${BASE}${P.dashboard}`)
  await page.waitForTimeout(2000)
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  let dlg = await page.locator('[role="dialog"], [aria-modal="true"]').count()
  log(`After Ctrl+K on /dashboard: dialogs=${dlg}`)
  await page.screenshot({ path: path.join(OUT, '01-after-ctrl-k.png') })
  if (dlg === 0) {
    // try clicking the body first to ensure focus
    await page.locator('body').click()
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(400)
    dlg = await page.locator('[role="dialog"], [aria-modal="true"]').count()
    log(`After body-click + Ctrl+K: dialogs=${dlg}`)
    await page.screenshot({ path: path.join(OUT, '01b-after-body-ctrl-k.png') })
  }
  if (dlg === 0) {
    // try clicking the sidebar Search button
    const searchBtn = page.locator('text=Search').first()
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click()
      await page.waitForTimeout(400)
      dlg = await page.locator('[role="dialog"], [aria-modal="true"]').count()
      log(`After sidebar Search click: dialogs=${dlg}`)
      await page.screenshot({ path: path.join(OUT, '01c-after-search-click.png') })
    }
  }
  await page.keyboard.press('Escape')

  // 2) Tasks page — click a task title, open detail panel
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, '02-tasks-loaded.png') })

  // Find first task title cell
  const firstTitle = page.locator('table tbody tr td').filter({ hasText: /[a-z]{4}/i }).first()
  if (await firstTitle.isVisible().catch(() => false)) {
    await firstTitle.click()
    await page.waitForTimeout(800)
    const panel = await page.locator('[role="dialog"], [aria-label*="task" i], [data-testid*="detail"]').count()
    log(`After click task title: detail-panels=${panel}`)
    await page.screenshot({ path: path.join(OUT, '03-after-task-click.png') })

    // Test ESC closes
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const panelAfterEsc = await page.locator('[role="dialog"], [aria-label*="task" i], [data-testid*="detail"]').count()
    log(`After Escape: detail-panels=${panelAfterEsc}`)
  } else {
    log(`No first task title found on /tasks`)
  }

  // 3) Inline edit — try clicking a Status pill
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2500)
  const statusPill = page
    .locator('button, [role="button"]')
    .filter({ hasText: /^(To Do|In Progress|Done|Blocked|Waiting)/ })
    .first()
  if (await statusPill.isVisible().catch(() => false)) {
    const before = await statusPill.innerText()
    await statusPill.click()
    await page.waitForTimeout(500)
    const dropdownOpen = await page.locator('[role="listbox"], [role="menu"]').count()
    log(`Click status pill (was "${before}"): dropdowns-open=${dropdownOpen}`)
    await page.screenshot({ path: path.join(OUT, '04-status-dropdown.png') })
    await page.keyboard.press('Escape')
  }

  // 4) Quick capture box — does it autosave? does it require explicit click?
  await page.goto(`${BASE}${P.dashboard}`)
  await page.waitForTimeout(2000)
  const quickAdd = page.locator('input[placeholder*="Quick capture" i]').first()
  if (await quickAdd.isVisible().catch(() => false)) {
    await quickAdd.click()
    await quickAdd.fill('test_delete_audit_quickadd')
    await page.screenshot({ path: path.join(OUT, '05-quickadd-typed.png') })
    // Tab away and check if anything saved
    await page.keyboard.press('Tab')
    await page.waitForTimeout(500)
    const stillHasText = (await quickAdd.inputValue()) !== ''
    log(`Quick capture: after Tab, input still has text? ${stillHasText} (expectation: maybe hint to press Enter)`)
    // Now press Enter to actually submit
    await quickAdd.click()
    await quickAdd.fill('test_delete_audit_quickadd_2')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const afterEnter = await quickAdd.inputValue()
    log(`Quick capture: after Enter, input value = "${afterEnter}" (expect empty if submitted)`)
    await page.screenshot({ path: path.join(OUT, '06-quickadd-after-enter.png') })
  }

  // 5) Visit a project detail page
  await page.goto(`${BASE}${P.projects}`)
  await page.waitForTimeout(2500)
  const projectLink = page.locator('a[href*="/projects/"]').first()
  if (await projectLink.isVisible().catch(() => false)) {
    const href = await projectLink.getAttribute('href')
    log(`First project link: ${href}`)
    await projectLink.click()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(OUT, '07-project-detail.png'), fullPage: true })
    log(`After project click: url=${page.url()}`)
  }

  // 6) Open a meeting detail page
  await page.goto(`${BASE}${P.meetings}`)
  await page.waitForTimeout(2500)
  const meetingLink = page.locator('a[href*="/meeting"]').first()
  if (await meetingLink.isVisible().catch(() => false)) {
    await meetingLink.click()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(OUT, '08-meeting-detail.png'), fullPage: true })
    log(`After meeting click: url=${page.url()}`)
  }

  // 7) Check what % of /ideas rows are test_delete_*
  await page.goto(`${BASE}${P.ideas}`)
  await page.waitForTimeout(2500)
  const ideaRowsAll = await page.locator('tr, [role="row"]').count()
  const ideaTestRows = await page.getByText(/test_delete/i).count()
  log(`/ideas: total-rows=${ideaRowsAll}, test_delete-text-occurrences=${ideaTestRows}`)
  await page.screenshot({ path: path.join(OUT, '09-ideas.png'), fullPage: true })

  // 8) Same for decisions
  await page.goto(`${BASE}${P.decisions}`)
  await page.waitForTimeout(2500)
  const decRowsAll = await page.locator('tr, [role="row"]').count()
  const decTestRows = await page.getByText(/test_delete/i).count()
  log(`/decisions: total-rows=${decRowsAll}, test_delete-text-occurrences=${decTestRows}`)
  await page.screenshot({ path: path.join(OUT, '10-decisions.png'), fullPage: true })

  // 9) Calendar — what date is "today" highlighted on, and how much test_delete
  await page.goto(`${BASE}${P.calendar}`)
  await page.waitForTimeout(2500)
  const todayCell = await page
    .locator('[aria-current="date"], [class*="today" i]')
    .first()
    .innerText()
    .catch(() => '?')
  log(`/calendar today highlight: "${todayCell}"`)
  const calTestEvents = await page.getByText(/test_delete/i).count()
  log(`/calendar test_delete event-count: ${calTestEvents}`)
  await page.screenshot({ path: path.join(OUT, '11-calendar.png'), fullPage: true })

  // 10) /my-tasks vs /tasks parity check
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2500)
  const myUrl = page.url()
  const myH = await page
    .locator('h1, h2')
    .first()
    .innerText()
    .catch(() => '?')
  const myCount = await page
    .locator('header, [data-testid="page-header"]')
    .first()
    .innerText()
    .catch(() => '?')
  log(`/my-tasks resolved-url=${myUrl}, h1="${myH}", header-blob="${myCount.slice(0, 80)}"`)
  await page.screenshot({ path: path.join(OUT, '12-my-tasks.png') })

  // 11) Check that GROUP BY dropdown actually opens on /tasks
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2000)
  const groupBy = page.locator('button, [role="button"]').filter({ hasText: /Group by/i }).first()
  if (await groupBy.isVisible().catch(() => false)) {
    await groupBy.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT, '13-group-by-open.png') })
    log(`Group by dropdown opened`)
    await page.keyboard.press('Escape')
  }

  // 12) Test Show Completed toggle
  const showCompleted = page.locator('text=Show 548 done').first()
  if (await showCompleted.isVisible().catch(() => false)) {
    await showCompleted.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, '14-show-completed.png') })
  }

  // 13) Realtime — check version polling header
  const ver = await page
    .request.get(`${BASE}/api/version`)
    .then(async (r) => ({ status: r.status(), body: (await r.text()).slice(0, 200) }))
    .catch((e) => ({ status: 0, body: e.message }))
  log(`/api/version: status=${ver.status}, body=${ver.body}`)

  fs.writeFileSync(path.join(OUT, 'deep-findings.log'), findings.join('\n'))
})
