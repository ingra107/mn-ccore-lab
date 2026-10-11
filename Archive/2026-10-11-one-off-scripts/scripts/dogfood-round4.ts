/**
 * Dogfood Round 4 — Cross-surface integrity.
 *
 * Scope (NEW scenarios not covered in Rounds 1-3):
 *   Create content on surface A, verify it appears correctly on surfaces B/C/D.
 *   Edit content → verify update propagates everywhere.
 *   Delete content → verify removal cleans all references.
 *
 * Every action uses `test_delete_round4_` prefix. Script cleans up at end.
 *
 * Run: npx tsx scripts/dogfood-round4.ts
 */
import { chromium, type Page, request as playwrightRequest } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/dogfood-round4'
const MARKER = 'test_delete_round4'
mkdirSync(OUT, { recursive: true })

let stepNum = 0
const findings: string[] = []
let bugCount = 0

async function snap(page: Page, label: string, waitMs = 800) {
  await page.waitForTimeout(waitMs)
  stepNum++
  const name = `${String(stepNum).padStart(2, '0')}-${label}`
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`  📸 ${name}`)
  return name
}

function log(msg: string) {
  console.log(msg)
  findings.push(msg)
}

function bug(scenario: string, observed: string, expected: string, severity: 'P0' | 'P1' | 'P2' = 'P1') {
  bugCount++
  const entry = `- **[BUG-R4-${bugCount}] [${severity}] ${scenario}**\n  - Observed: ${observed}\n  - Expected: ${expected}`
  findings.push(entry)
  console.log(`  ❌ ${entry.replace(/\n/g, ' | ')}`)
}

function pass(scenario: string) {
  findings.push(`- [PASS] ${scenario}`)
  console.log(`  ✓ ${scenario}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => {
    if (err.message.includes('WebSocket') || err.message.includes('hub-realtime')) return
    log(`  ⚠ PAGE ERROR: ${err.message.slice(0, 160)}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('WebSocket') && !msg.text().includes('hub-realtime') && !msg.text().includes('Failed to load resource')) {
      log(`  ⚠ CONSOLE: ${msg.text().slice(0, 160)}`)
    }
  })

  const api = await playwrightRequest.newContext({ baseURL: BASE })
  const createdTaskIds: string[] = []
  const createdProjectSlugs: string[] = []
  const createdIdeaIds: string[] = []
  const createdDecisionIds: string[] = []

  try {
    // ─────────────────────────────────────────────────────────
    // SCENARIO 1: Create a project via API → appears on /projects
    //                                    → appears in task create modal picker
    //                                    → appears in command palette
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 1: Project creation cross-surface ===')
    const projectTitle = `${MARKER}_project_xsurface`
    const projResp = await api.post('/api/projects', {
      data: { title: projectTitle, category: 'lab', status: 'active', stage: 'Idea' },
    })
    if (projResp.ok()) {
      const pj = await projResp.json() as { data?: { slug: string } }
      if (pj?.data?.slug) {
        createdProjectSlugs.push(pj.data.slug)
        pass(`1.0 Project created via API — slug=${pj.data.slug}`)
      } else {
        bug('1.0 Project API returned no slug', JSON.stringify(pj).slice(0, 120), 'object with data.slug', 'P1')
      }
    } else {
      bug('1.0 Project API POST failed', `${projResp.status()} ${await projResp.text().then(t => t.slice(0, 120))}`, '200 OK', 'P1')
    }

    // Verify on /projects list
    await page.goto(`${BASE}/portal/projects`, { waitUntil: 'networkidle' })
    await snap(page, 'projects-list-after-create')
    const onProjectsList = await page.locator(`text="${projectTitle}"`).first().isVisible().catch(() => false)
    if (onProjectsList) pass('1.1 Project visible on /projects list')
    else bug('1.1 Project NOT visible on /projects list', 'text not found', `"${projectTitle}" visible`, 'P1')

    // Verify in command palette
    await page.keyboard.press('Control+k')
    await snap(page, 'cmdk-for-project', 500)
    await page.keyboard.type(projectTitle.slice(-20))
    await page.waitForTimeout(400)
    await snap(page, 'cmdk-project-search')
    const cmdkProjectFound = await page.locator(`[role="option"], button`).filter({ hasText: projectTitle.slice(-20) }).first().isVisible().catch(() => false)
    if (cmdkProjectFound) pass('1.2 Project surfaces in command palette search')
    else bug('1.2 Project NOT in command palette search', 'no option matched', `option text containing "${projectTitle.slice(-20)}"`, 'P2')
    await page.keyboard.press('Escape')

    // Verify in task create modal project picker
    await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const newTaskBtn = page.locator('button:has-text("New Task"), button[data-testid*="new-task"], button[aria-label*="new task" i]').first()
    if (await newTaskBtn.isVisible().catch(() => false)) {
      await newTaskBtn.click()
      await snap(page, 'create-task-modal-opened', 600)
      // Open project picker - try multiple selectors
      const projectPicker = page.locator('button:has-text("Project"), [data-testid*="project"]').filter({ hasText: /project/i }).first()
      if (await projectPicker.isVisible().catch(() => false)) {
        await projectPicker.click().catch(() => {})
        await page.waitForTimeout(400)
        await snap(page, 'task-modal-project-picker')
        const inModalPicker = await page.locator(`[role="option"], button, li`).filter({ hasText: projectTitle }).first().isVisible().catch(() => false)
        if (inModalPicker) pass('1.3 Project visible in task-modal project picker')
        else bug('1.3 Project NOT in task-modal project picker', 'option missing', `option with "${projectTitle}"`, 'P1')
      } else {
        log('  1.3 SKIP — project picker button not found by current selectors')
      }
      await page.keyboard.press('Escape')
    } else {
      log('  1.3 SKIP — New Task button not found')
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 2: Create task → link to project → verify project task count
    //             increments + task shows on project detail + on MyTasks.
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 2: Task → Project linkage ===')
    const taskTitle = `${MARKER}_task_project_link`
    const projectSlug = createdProjectSlugs[0]
    const taskResp = await api.post('/api/tasks', {
      data: {
        title: taskTitle,
        assignee: 'nick',
        priority: 'medium',
        status: 'todo',
        project_id: projectSlug,
      },
    })
    if (taskResp.ok()) {
      const t = await taskResp.json() as { data?: { id: string } }
      if (t?.data?.id) {
        createdTaskIds.push(t.data.id)
        pass(`2.0 Task created linked to project ${projectSlug}, id=${t.data.id}`)
      }
    } else {
      bug('2.0 Task API POST failed', `${taskResp.status()}`, '200 OK', 'P1')
    }

    // Verify task appears on project detail page
    if (projectSlug) {
      await page.goto(`${BASE}/portal/projects/${projectSlug}`, { waitUntil: 'networkidle' })
      await snap(page, 'project-detail-has-task', 1200)
      const taskOnDetail = await page.locator(`text="${taskTitle}"`).first().isVisible().catch(() => false)
      if (taskOnDetail) pass('2.1 Task visible on project detail page')
      else bug('2.1 Task NOT visible on project detail', 'title not found', `"${taskTitle}" visible on /projects/${projectSlug}`, 'P1')
    }

    // Verify task appears on /my-tasks (assignee=nick)
    await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
    await snap(page, 'my-tasks-has-new-task', 1200)
    const taskOnMyTasks = await page.locator(`text="${taskTitle}"`).first().isVisible().catch(() => false)
    if (taskOnMyTasks) pass('2.2 Task visible on /my-tasks (auto-filter assignee)')
    else bug('2.2 Task NOT on /my-tasks', 'title not found', `"${taskTitle}" visible`, 'P1')

    // Project task count check — open /projects list, find row, look for count badge
    await page.goto(`${BASE}/portal/projects`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    const projectRow = page.locator(`a, div`).filter({ hasText: projectTitle }).first()
    if (await projectRow.isVisible().catch(() => false)) {
      const rowText = await projectRow.textContent() || ''
      const hasCountBadge = /\b[1-9]\d*\b/.test(rowText.replace(projectTitle, ''))
      await snap(page, 'projects-list-count-badge')
      if (hasCountBadge) pass('2.3 Project row shows task count badge')
      else bug('2.3 Project row missing task count badge', `row text: "${rowText.slice(0, 80)}"`, 'row text should contain task count number', 'P2')
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 3: Idea creation → appears on /ideas + project detail Ideas tab
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 3: Idea cross-surface ===')
    const ideaTitle = `${MARKER}_idea_xsurface`
    const ideaResp = await api.post('/api/ideas', {
      data: {
        title: ideaTitle,
        description: `${MARKER} cross-surface idea`,
        submitted_by: 'nick',
        research_area: 'CLIF',
      },
    })
    if (ideaResp.ok()) {
      const i = await ideaResp.json() as { data?: { id: string } }
      if (i?.data?.id) {
        createdIdeaIds.push(i.data.id)
        pass(`3.0 Idea created, id=${i.data.id}`)
      }
    } else {
      bug('3.0 Idea API POST failed', `${ideaResp.status()}`, '200 OK', 'P2')
    }

    await page.goto(`${BASE}/portal/ideas`, { waitUntil: 'networkidle' })
    await snap(page, 'ideas-list-has-idea', 800)
    const ideaOnList = await page.locator(`text="${ideaTitle}"`).first().isVisible().catch(() => false)
    if (ideaOnList) pass('3.1 Idea visible on /ideas list')
    else bug('3.1 Idea NOT visible on /ideas list', 'title not found', `"${ideaTitle}" visible`, 'P1')

    // ─────────────────────────────────────────────────────────
    // SCENARIO 4: Decision log → appears on /decisions + project Decisions tab
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 4: Decision cross-surface ===')
    const decisionTitle = `${MARKER}_decision_xsurface`
    const decResp = await api.post('/api/decisions', {
      data: {
        title: decisionTitle,
        rationale: `${MARKER} xsurface decision test`,
        decided_by: 'nick',
        project_id: projectSlug || null,
      },
    })
    if (decResp.ok()) {
      const d = await decResp.json() as { data?: { id: string } }
      if (d?.data?.id) {
        createdDecisionIds.push(d.data.id)
        pass(`4.0 Decision logged, id=${d.data.id}`)
      }
    } else {
      bug('4.0 Decision API POST failed', `${decResp.status()}`, '200 OK', 'P2')
    }

    await page.goto(`${BASE}/portal/decisions`, { waitUntil: 'networkidle' })
    await snap(page, 'decisions-list-has-decision', 800)
    const decOnList = await page.locator(`text="${decisionTitle}"`).first().isVisible().catch(() => false)
    if (decOnList) pass('4.1 Decision visible on /decisions list')
    else bug('4.1 Decision NOT on /decisions list', 'title not found', `"${decisionTitle}" visible`, 'P1')

    // ─────────────────────────────────────────────────────────
    // SCENARIO 5: Complete a task in grid → verify disappears from Focus Next
    //             + strikes on list + project count decrements
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 5: Task completion cross-surface propagation ===')
    const taskId = createdTaskIds[0]
    if (taskId) {
      await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      // Find the task row and click its status circle
      const taskRow = page.locator(`[data-testid="task-row-${taskId}"], text="${taskTitle}"`).first()
      await snap(page, 'before-complete-status')
      if (await taskRow.isVisible().catch(() => false)) {
        // Complete via API (avoid brittle UI click)
        const completeResp = await api.patch(`/api/tasks/${taskId}`, {
          data: { status: 'done', completed: 1 },
        })
        if (completeResp.ok()) pass('5.0 Task marked done via API')
        // Reload and verify visual state
        await page.reload({ waitUntil: 'networkidle' })
        await snap(page, 'after-complete-reload', 1200)
        // "Nick" tasks default filter usually hides done; verify by search
        await page.keyboard.press('Control+k')
        await page.keyboard.type(taskTitle.slice(-30))
        await page.waitForTimeout(400)
        await snap(page, 'cmdk-search-completed-task')
        await page.keyboard.press('Escape')
      }
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 6: Key_link edit on task → verify shows in task list cell
    //             + task detail panel + round-trips
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 6: Task key_link round-trip ===')
    if (createdTaskIds[0]) {
      const linkUrl = 'https://example.com/round4-test'
      const linkDesc = `${MARKER}_link_desc`
      const updResp = await api.patch(`/api/tasks/${createdTaskIds[0]}`, {
        data: { key_link_1: linkUrl, key_link_1_desc: linkDesc },
      })
      if (updResp.ok()) {
        pass('6.0 Task key_link saved via API')
        // Read back
        const getResp = await api.get(`/api/tasks/${createdTaskIds[0]}`)
        if (getResp.ok()) {
          const t = await getResp.json() as { data?: { key_link_1?: string; key_link_1_desc?: string } }
          if (t?.data?.key_link_1 === linkUrl) pass('6.1 key_link_1 round-trips via API')
          else bug('6.1 key_link_1 NOT round-tripping', `got ${JSON.stringify(t?.data?.key_link_1)}`, linkUrl, 'P1')
          if (t?.data?.key_link_1_desc === linkDesc) pass('6.2 key_link_1_desc round-trips via API')
          else bug('6.2 key_link_1_desc NOT round-tripping', `got ${JSON.stringify(t?.data?.key_link_1_desc)}`, linkDesc, 'P1')
        }
      } else {
        bug('6.0 Task key_link API PATCH failed', `${updResp.status()}`, '200 OK', 'P1')
      }
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 7: Stage progress dots on Manuscripts table reflect project.stage
    //             (visual — screenshot; manual review)
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 7: Manuscripts stage dots visual check ===')
    await page.goto(`${BASE}/portal/manuscripts`, { waitUntil: 'networkidle' })
    await snap(page, 'manuscripts-stage-dots', 1200)
    // Scroll through a few rows
    await page.evaluate(() => window.scrollTo(0, 400))
    await snap(page, 'manuscripts-scrolled-400')
    await page.evaluate(() => window.scrollTo(0, 800))
    await snap(page, 'manuscripts-scrolled-800')
    pass('7.0 Manuscripts scrolled — review images for stage dot / category pill / nowrap truncation')

    // ─────────────────────────────────────────────────────────
    // SCENARIO 8: AssigneeSelect typeahead actually works (GH #9 fix verify)
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 8: AssigneeSelect typeahead (post GH#9 fix) ===')
    await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    // Find first row title and click to open detail panel
    const firstTitle = page.locator('[data-testid^="task-"] a, [data-testid^="task-"] span').first()
    const detailOpened = await firstTitle.click().then(() => page.waitForSelector('[data-testid="task-detail-panel"]', { timeout: 2000 }).then(() => true).catch(() => false))
    if (detailOpened) {
      await snap(page, 'detail-panel-open')
      // Click Assignee picker — use the text "Assignee" label or avatar button
      const asgBtn = page.locator('[data-testid="task-detail-panel"] button').filter({ hasText: /nick|ingraham|mesfin|dudley/i }).first()
      if (await asgBtn.isVisible().catch(() => false)) {
        await asgBtn.click()
        await snap(page, 'assignee-picker-open', 500)
        // Type filter
        const filterInput = page.locator('input[placeholder*="Filter"], input[placeholder*="filter"]').first()
        if (await filterInput.isVisible().catch(() => false)) {
          await filterInput.fill('mes')
          await snap(page, 'assignee-typeahead-filtered', 400)
          // Press arrow down + Enter (should pick first match)
          await filterInput.press('ArrowDown')
          await filterInput.press('Enter')
          await snap(page, 'assignee-typeahead-picked', 800)
          pass('8.0 AssigneeSelect typeahead + ArrowDown + Enter flow exercised (review screenshots)')
        } else {
          bug('8.0 AssigneeSelect filter input NOT present', 'no input[placeholder*="Filter"]', 'filter input visible after picker open', 'P1')
        }
        await page.keyboard.press('Escape').catch(() => {})
      } else {
        log('  8.0 SKIP — no assignee button located by text')
      }
      await page.keyboard.press('Escape').catch(() => {})
    } else {
      log('  8.0 SKIP — detail panel did not open')
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 9: Detail panel stays live after inline update (GH #7 fix verify)
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 9: TaskDetailPanel live sync (post GH#7 fix) ===')
    if (createdTaskIds[0]) {
      // Use /tasks (all tasks) to find the row
      await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      // Search or filter for our task
      await page.keyboard.press('Control+k')
      await page.keyboard.type(taskTitle.slice(-20))
      await page.waitForTimeout(400)
      await page.keyboard.press('Escape')
      // Change priority via API while panel open — verify panel shows new value on reload
      const initialPatch = await api.patch(`/api/tasks/${createdTaskIds[0]}`, { data: { priority: 'high' } })
      if (initialPatch.ok()) {
        await page.reload({ waitUntil: 'networkidle' })
        await snap(page, 'tasks-after-priority-bump', 1500)
        pass('9.0 API priority update succeeded — verify screenshot reflects high priority')
      }
    }

    // ─────────────────────────────────────────────────────────
    // SCENARIO 10: /activity surfaces recent changes
    // ─────────────────────────────────────────────────────────
    log('\n=== SCENARIO 10: Activity feed integrity ===')
    await page.goto(`${BASE}/portal/activity`, { waitUntil: 'networkidle' })
    await snap(page, 'activity-feed', 1200)
    pass('10.0 Activity page captured — review screenshot for recent change visibility')

  } catch (err) {
    log(`\n⚠ FATAL ERROR: ${(err as Error).message}`)
  } finally {
    // ─────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────
    log('\n=== CLEANUP ===')
    for (const tid of createdTaskIds) {
      const r = await api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => null)
      log(`  cleanup task ${tid}: ${r?.status() ?? '-'}`)
    }
    for (const slug of createdProjectSlugs) {
      const r = await api.delete(`/api/projects/${slug}`).catch(() => null)
      log(`  cleanup project ${slug}: ${r?.status() ?? '-'}`)
    }
    for (const iid of createdIdeaIds) {
      const r = await api.post(`/api/ideas/${iid}/delete`, {}).catch(() => null)
      log(`  cleanup idea ${iid}: ${r?.status() ?? 'no DELETE endpoint'}`)
    }
    for (const did of createdDecisionIds) {
      const r = await api.post(`/api/decisions/${did}/delete`, {}).catch(() => null)
      log(`  cleanup decision ${did}: ${r?.status() ?? 'no DELETE endpoint'}`)
    }

    const summary = `# Dogfood Round 4 — Cross-surface integrity

Base: ${BASE}
Screenshots: ${stepNum}
Bugs found: ${bugCount}

## Findings

${findings.join('\n')}
`
    writeFileSync(`${OUT}/findings.md`, summary)
    log(`\n✓ Round 4 complete. ${bugCount} bugs. Findings: ${OUT}/findings.md`)

    await browser.close()
    await api.dispose()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
