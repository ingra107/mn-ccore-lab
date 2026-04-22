/**
 * E2E validation: real-browser interactive edit of test_delete_ task + project.
 *
 * Auth: CF Access service token (CF-Access-Client-Id / -Secret env vars) +
 * PB_API_KEY bearer (so SPA fetch() calls authenticate as well).
 *
 * Usage: npx tsx scripts/e2e-validate.ts <task_id> <project_id_or_slug>
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = 'https://mn-ccore-lab.pages.dev'
const TASK_ID = process.argv[2]
const PROJECT_SLUG = process.argv[3]
const TS = new Date().toISOString().replace(/[-T:]/g, '').slice(0, 13)
const OUT = `review/audit/e2e-validation/${TS}`
mkdirSync(OUT, { recursive: true })

import { requirePbApiKey } from './_lib/load-secrets.js'

const CFID = process.env.CF_ACCESS_CLIENT_ID
const CFSEC = process.env.CF_ACCESS_CLIENT_SECRET
const PBKEY = requirePbApiKey()

if (!CFID || !CFSEC) {
  console.error('FAIL: CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET env required')
  process.exit(2)
}
if (!TASK_ID || !PROJECT_SLUG) {
  console.error('FAIL: usage: tsx scripts/e2e-validate.ts <task_id> <project_slug>')
  process.exit(2)
}

const findings: string[] = []
function log(level: 'PASS' | 'FAIL' | 'INFO', msg: string) {
  const line = `[${level}] ${msg}`
  console.log(line)
  findings.push(line)
}

async function snap(page: Page, name: string, wait = 600) {
  await page.waitForTimeout(wait)
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  console.log('    ' + name)
}

async function apiGet(path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${PBKEY}` },
  })
  return r.ok ? r.json() : null
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    extraHTTPHeaders: {
      'CF-Access-Client-Id': CFID!,
      'CF-Access-Client-Secret': CFSEC!,
      Authorization: `Bearer ${PBKEY}`,
    },
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    if (e.message.includes('WebSocket') || e.message.includes('hub-realtime')) return
    console.log(`  PAGE ERROR: ${e.message.slice(0, 160)}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text()
      if (t.includes('WebSocket') || t.includes('hub-realtime') || t.includes('partysocket')) return
      console.log(`  CONSOLE ERR: ${t.slice(0, 160)}`)
    }
  })

  // ── PART 1: Task interactive edit ──────────────────────────────────────
  log('INFO', `Task target: ${TASK_ID}`)
  await page.goto(`${BASE}/portal/tasks`, { waitUntil: 'networkidle', timeout: 30000 })
  await snap(page, '01-tasks-page')

  // Find our task row
  const row = page.locator(`[data-testid="task-row-${TASK_ID}"]`)
  const rowCount = await row.count()
  log(rowCount > 0 ? 'PASS' : 'FAIL', `Task row visible: ${rowCount}`)

  if (rowCount === 0) {
    // Search if a search box exists
    const searchBox = page.locator('input[type="search"], input[placeholder*="earch" i]').first()
    if (await searchBox.count()) {
      await searchBox.fill('test_delete_e2e')
      await snap(page, '02-after-search')
    }
  }

  // Inline status change
  const statusBtn = page.locator(`[data-testid="task-status-${TASK_ID}"] button`).first()
  if (await statusBtn.count()) {
    await statusBtn.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(150)
    await statusBtn.click({ force: true })
    await snap(page, '03-status-dropdown')

    const listbox = page.getByRole('listbox').first()
    await listbox.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {})
    const inProgress = listbox.getByRole('option').filter({ hasText: /In Progress/i }).first()
    if (await inProgress.count()) {
      await inProgress.click()
      await snap(page, '04-status-changed', 1500)
      log('PASS', 'Clicked In Progress option')
    } else {
      log('FAIL', 'In Progress option not found in dropdown')
    }
  } else {
    log('FAIL', `task-status-${TASK_ID} button not found`)
  }

  // Wait for write, then verify via API
  await page.waitForTimeout(1500)
  const allTasks = await apiGet('/api/tasks?limit=5000')
  const ourTask = allTasks?.data?.find((t: any) => t.id === TASK_ID)
  log(
    ourTask?.status === 'in_progress' ? 'PASS' : 'FAIL',
    `API verifies task status now = ${ourTask?.status} (expected in_progress)`
  )

  // ── PART 2: Project interactive edit on /portal/projects list ─────────
  log('INFO', `Project target: ${PROJECT_SLUG}`)
  await page.goto(`${BASE}/portal/projects`, { waitUntil: 'networkidle', timeout: 30000 })
  await snap(page, '05-projects-page')

  // Sort by Title to find our test row easily — or just search by title text
  // Find any element containing the project title — walk up to its row container.
  const titleNode = page.getByText('test_delete_e2e_proj_', { exact: false }).first()
  const titleVisible = await titleNode.count()
  log(titleVisible > 0 ? 'PASS' : 'FAIL', `Project title visible on list: ${titleVisible}`)

  let stageChanged = false
  if (titleVisible > 0) {
    // The row is the closest ancestor with role=row, or a div with the right structure.
    // InlineSelect button has aria-haspopup="listbox" and shows current value text.
    // For our newly-created project, current stage is "Idea". Find the Idea button
    // closest to our title.
    await titleNode.scrollIntoViewIfNeeded()
    await snap(page, '06-row-in-view', 400)

    // Use XPath: ancestor row, then find button with text "Idea" inside
    const row = titleNode.locator('xpath=ancestor::*[self::tr or contains(@class,"grid") or contains(@class,"row")][1]')
    const rowCount = await row.count()
    log('INFO', `Row container resolved: ${rowCount}`)

    // Find the Idea button — InlineSelect renders a button with aria-haspopup="listbox"
    const ideaBtn = row.locator('button[aria-haspopup="listbox"]').filter({ hasText: /^Idea$/ }).first()
    let btnFound = await ideaBtn.count()

    // Fallback: search whole page for an Idea button near our title
    let targetBtn = ideaBtn
    if (!btnFound) {
      // Look for ALL listbox buttons, find the one closest to our title
      const allIdeaBtns = page.locator('button[aria-haspopup="listbox"]').filter({ hasText: /^Idea$/ })
      const ideaCount = await allIdeaBtns.count()
      log('INFO', `Total Idea buttons on page: ${ideaCount} (looking for one near our row)`)
      // Pick the first one near our title — get our title's bounding box
      if (ideaCount > 0) {
        const titleBox = await titleNode.boundingBox()
        let bestIdx = -1
        let bestDy = 9999
        for (let i = 0; i < ideaCount; i++) {
          const b = await allIdeaBtns.nth(i).boundingBox()
          if (!b || !titleBox) continue
          const dy = Math.abs(b.y - titleBox.y)
          if (dy < bestDy) { bestDy = dy; bestIdx = i }
        }
        if (bestIdx >= 0 && bestDy < 50) {
          targetBtn = allIdeaBtns.nth(bestIdx)
          btnFound = 1
          log('INFO', `Picked Idea button index ${bestIdx} (dy=${bestDy}px)`)
        }
      }
    }

    if (btnFound) {
      await targetBtn.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(150)
      await targetBtn.click({ force: true })
      await snap(page, '07-stage-dropdown', 500)

      const listbox = page.getByRole('listbox').first()
      await listbox.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {})
      // InlineSelect options are <button> children with the option label text
      const dc = listbox.locator('button').filter({ hasText: /^Data Collection$/ }).first()
      if (await dc.count()) {
        await dc.click()
        await snap(page, '08-stage-changed', 1500)
        stageChanged = true
        log('PASS', 'Clicked Data Collection in stage dropdown')
      } else {
        log('FAIL', 'Data Collection option not found in listbox')
        const opts = await listbox.locator('button').allTextContents()
        log('INFO', `Available options: ${opts.join(' | ')}`)
      }
    } else {
      log('FAIL', 'Could not locate Idea button (InlineSelect) for our project row')
    }
  }

  await page.waitForTimeout(1500)
  const allProjects = await apiGet('/api/projects')
  const ourProj = allProjects?.data?.find((p: any) => p.slug === PROJECT_SLUG)
  log(
    ourProj?.stage === 'Data Collection' ? 'PASS' : 'FAIL',
    `API verifies project stage = ${ourProj?.stage} (expected Data Collection)`
  )

  await browser.close()

  writeFileSync(
    join(OUT, 'findings.md'),
    `# E2E Validation — ${TS}\n\nTask: ${TASK_ID}\nProject: ${PROJECT_SLUG}\n\n` +
      findings.map((f) => `- ${f}`).join('\n') + '\n'
  )
  console.log(`\nfindings → ${OUT}/findings.md`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
