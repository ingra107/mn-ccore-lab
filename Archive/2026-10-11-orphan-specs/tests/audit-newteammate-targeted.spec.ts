import { test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { P } from './helpers/paths'

const BASE = 'https://mn-ccore-lab.pages.dev'
const TS = process.env.AUDIT_TS || new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)
const OUT = path.join(process.cwd(), 'review', 'audit-newteammate', TS + '-targeted')
fs.mkdirSync(OUT, { recursive: true })
const findings: string[] = []
const log = (s: string) => { console.log(s); findings.push(s) }

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

test('targeted', async ({ page, context }) => {
  test.setTimeout(180_000)

  // 1. /team/nick-ingraham — does it actually have portal chrome or just public site?
  await page.goto(`${BASE}${P.publicMember('nick-ingraham')}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const portalSidebar = await page.locator('nav').filter({ hasText: 'Dashboard' }).count()
  const publicNav = await page.locator('nav, header').filter({ hasText: /^Home Research/ }).count()
  log(`/team/nick-ingraham: portal-sidebar=${portalSidebar}, public-nav=${publicNav}`)
  await page.screenshot({ path: path.join(OUT, '01-team-member.png'), fullPage: true })

  // 2. /team in portal context (logged-in user expects portal shell)
  await page.goto(`${BASE}${P.publicTeam}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const teamPortalSidebar = await page.locator('nav').filter({ hasText: 'Dashboard' }).count()
  log(`/team (portal expected): sidebar=${teamPortalSidebar}`)
  await page.screenshot({ path: path.join(OUT, '02-team.png'), fullPage: true })

  // 3. Does /tasks status pill actually open dropdown when clicked correctly?
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2500)
  // Find a real status cell — they're inside table rows
  const statusCells = page.locator('td').filter({ hasText: /^(To Do|In Progress|Done|Blocked|Waiting)$/ })
  const cnt = await statusCells.count()
  log(`status-cell count: ${cnt}`)
  if (cnt > 0) {
    await statusCells.first().click()
    await page.waitForTimeout(500)
    const dd = await page.locator('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]').count()
    log(`Status cell click: dropdowns-open=${dd}`)
    await page.screenshot({ path: path.join(OUT, '03-status-click.png') })
  }

  // 4. Does inline title click open the detail panel?
  await page.goto(`${BASE}${P.myTasks}`)
  await page.waitForTimeout(2500)
  const titleSpan = page.locator('span').filter({ hasText: /^CQODE|^Run CRRT|^Fix dx/ }).first()
  if (await titleSpan.isVisible().catch(() => false)) {
    await titleSpan.click()
    await page.waitForTimeout(700)
    const detail = await page.locator('[role="dialog"], aside, [aria-label*="task" i]').count()
    log(`Click task title: detail-elements=${detail}`)
    await page.screenshot({ path: path.join(OUT, '04-detail-after-title-click.png') })
    await page.keyboard.press('Escape')
  }

  // 5. Quick-add via `q` (S11 — Cmd/Ctrl+N is browser-reserved and never fired)
  await page.goto(`${BASE}${P.dashboard}`)
  await page.waitForTimeout(2000)
  await page.mouse.click(5, 5)
  await page.keyboard.press('q')
  await page.waitForTimeout(500)
  const modal = await page.locator('[role="dialog"], [aria-modal="true"]').count()
  log(`q quick-add: modals=${modal}`)
  await page.screenshot({ path: path.join(OUT, '05-quick-add.png') })
  await page.keyboard.press('Escape')

  // 6. /personal — does Personal/My Hub differ from /my-tasks?
  await page.goto(`${BASE}${P.personal}`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(OUT, '06-personal.png'), fullPage: true })

  // 7. Tooltip — that "Press F to toggle filters" overlay — is it dismissable?
  await page.goto(`${BASE}${P.dashboard}`)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(OUT, '07-dashboard-tooltip.png') })
  // Try press F
  await page.keyboard.press('f')
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '08-after-f.png') })

  // 8. Sidebar Search button tooltip placement
  // 9. Dashboard At-a-glance numbers — check after refresh
  await page.goto(`${BASE}${P.dashboard}`)
  await page.waitForTimeout(3000)
  const glance1 = await page
    .locator('text=/At a Glance/')
    .first()
    .locator('xpath=ancestor::div[1]')
    .innerText()
    .catch(() => '?')
  log(`At-a-Glance #1: "${glance1.replace(/\s+/g, ' ').slice(0, 120)}"`)
  await page.reload()
  await page.waitForTimeout(3000)
  const glance2 = await page
    .locator('text=/At a Glance/')
    .first()
    .locator('xpath=ancestor::div[1]')
    .innerText()
    .catch(() => '?')
  log(`At-a-Glance #2: "${glance2.replace(/\s+/g, ' ').slice(0, 120)}"`)
  if (glance1 !== glance2) log(`!!! At-a-Glance numbers CHANGED across refreshes`)

  // 10. Check API /api/version response
  const ver = await page.request.get(`${BASE}/api/version`).then(async r => ({ s: r.status(), b: await r.text() })).catch(e => ({ s: 0, b: e.message }))
  log(`/api/version: ${ver.s} body=${ver.b.slice(0,200)}`)

  // 11. Does /api/health return reasonable info?
  const h = await page.request.get(`${BASE}/api/health`).then(async r => ({ s: r.status(), b: await r.text() })).catch(e => ({ s: 0, b: e.message }))
  log(`/api/health status=${h.s}, body-len=${h.b.length}, head=${h.b.slice(0,150)}`)

  // 12. Mobile: check if /team/nick-ingraham renders portal or public
  const mobileCtx = await context.browser()!.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2.75,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  })
  const mp = await mobileCtx.newPage()
  await mp.goto(`${BASE}${P.myTasks}`, { waitUntil: 'domcontentloaded' })
  await mp.waitForTimeout(2500)
  await mp.screenshot({ path: path.join(OUT, '09-mobile-my-tasks.png'), fullPage: true })
  await mp.goto(`${BASE}${P.personal}`, { waitUntil: 'domcontentloaded' })
  await mp.waitForTimeout(2500)
  await mp.screenshot({ path: path.join(OUT, '10-mobile-personal.png'), fullPage: true })
  await mp.goto(`${BASE}${P.calendar}`, { waitUntil: 'domcontentloaded' })
  await mp.waitForTimeout(2500)
  await mp.screenshot({ path: path.join(OUT, '11-mobile-calendar.png'), fullPage: true })
  await mp.goto(`${BASE}${P.meetings}`, { waitUntil: 'domcontentloaded' })
  await mp.waitForTimeout(2500)
  await mp.screenshot({ path: path.join(OUT, '12-mobile-meetings.png'), fullPage: true })
  await mp.goto(`${BASE}${P.project('mesfin-k23-ihca-survivability-calculator')}`, { waitUntil: 'domcontentloaded' })
  await mp.waitForTimeout(2500)
  await mp.screenshot({ path: path.join(OUT, '13-mobile-project-detail.png'), fullPage: true })
  await mobileCtx.close()

  fs.writeFileSync(path.join(OUT, 'targeted.log'), findings.join('\n'))
})
