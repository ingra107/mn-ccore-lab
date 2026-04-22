/**
 * Section C — entity CRUD via real UI interaction.
 *
 * 14 sub-sections (C1 task .. C14 answer). MVP iteration: C1 task.
 * Each sub creates a _TEST_DELETE_-prefixed entity, mutates every mutable
 * field via the actual UI primitives, verifies UI + API + reload, registers
 * cleanup, then triggers per-section sync chat.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson, BASE } from '../lib/harness'
import { changeInlineSelect, openInlineSelect, pickOption, setInlineDate, findInlineSelectByCurrentValue, verifyStickyDropdown, pickAssignee, clickViaDispatch } from '../lib/inline-helpers'
import { makeMarker, deleteTaskIds } from '../lib/cleanup'

interface SubResult {
  name: string
  passes: number
  bugs: number
  createdIds: string[]
}

export async function runSectionC(runId: string, rootDir: string) {
  const subResults: SubResult[] = []

  // C1 — task lifecycle (full)
  subResults.push(await runC1Task(runId, rootDir))

  // C2 — project lifecycle (full)
  subResults.push(await runC2Project(runId, rootDir))

  // C3-C14 — lightweight create + API-verify (modal trigger + list-appearance)
  for (const ent of LIGHTWEIGHT_ENTITIES) {
    subResults.push(await runLightweight(runId, rootDir, ent))
  }

  const totalPasses = subResults.reduce((acc, r) => acc + r.passes, 0)
  const totalBugs = subResults.reduce((acc, r) => acc + r.bugs, 0)
  return { name: 'C-entities', passes: totalPasses, bugs: totalBugs }
}

// ─────────────────────────────────────────────────────────────────────────
// Lightweight entity definitions (C3-C14)
// ─────────────────────────────────────────────────────────────────────────

interface LightweightEntity {
  code: string                  // C3, C4, etc
  label: string                 // human-readable
  page: string                  // /portal/x
  newButtonText: RegExp         // pattern for "New X" button
  modalTitleSelector?: string   // optional textbox for the title field
  apiList: string               // /api/x
  titleField: string            // 'title' | 'question' | etc
  bodyField?: string            // optional 'description' / 'rationale'
  deleteEndpoint?: (id: string) => string  // POST /api/x/:id/delete
}

const LIGHTWEIGHT_ENTITIES: LightweightEntity[] = [
  {
    code: 'C3',
    label: 'idea',
    page: '/portal/ideas',
    newButtonText: /^New Idea|^Submit Idea|^Add Idea/i,
    apiList: '/api/ideas',
    titleField: 'title',
    bodyField: 'description',
    deleteEndpoint: (id) => `/api/ideas/${id}/delete`,
  },
  {
    code: 'C4',
    label: 'decision',
    page: '/portal/decisions',
    newButtonText: /^Log a Decision|^New Decision|^Record Decision/i,
    apiList: '/api/decisions',
    titleField: 'title',
    bodyField: 'rationale',
    deleteEndpoint: (id) => `/api/decisions/${id}/delete`,
  },
  {
    code: 'C13',
    label: 'lab_question',
    page: '/portal/ask',
    newButtonText: /^Ask|^New Question/i,
    apiList: '/api/questions',
    titleField: 'question',
    deleteEndpoint: (id) => `/api/questions/${id}/delete`,
  },
]

async function runLightweight(runId: string, rootDir: string, ent: LightweightEntity): Promise<SubResult> {
  const sectionName = `C-entities/${ent.code}-${ent.label}`
  const s = await openSession({ section: sectionName, runId, rootDir, viewport: 'desktop', theme: 'dark' })
  const createdIds: string[] = []
  try {
    log(s, `${ent.code} — ${ent.label} create + API verify`)
    await goto(s, ent.page)
    await snap(s, `${ent.label}-page`)
    const newBtn = s.page.locator('button').filter({ hasText: ent.newButtonText }).first()
    if (!(await newBtn.count())) {
      bug(s, `${ent.code}.0`, 'P1', `${ent.label} New button visible`, 'no button matched', `button matching ${ent.newButtonText.source}`)
      return { name: sectionName, passes: 0, bugs: 1, createdIds }
    }
    await newBtn.click()
    await snap(s, `${ent.label}-modal-open`, 500)
    const marker = makeMarker(ent.label.replace(/\W/g, ''))
    // Fill title (look for textarea or input)
    const titleInput = s.page.locator('textarea, input[type="text"]').first()
    if (await titleInput.count()) {
      await titleInput.fill(marker)
    }
    if (ent.bodyField) {
      const bodyInput = s.page.locator('textarea').nth(1)
      if (await bodyInput.count()) {
        await bodyInput.fill(`massive-audit ${ent.code} probe — describes the test ${ent.label}`)
      }
    }
    await snap(s, `${ent.label}-modal-filled`)
    // Submit via Ctrl+Enter
    await s.page.keyboard.press('Control+Enter')
    await snap(s, `${ent.label}-after-submit`, 1800)
    // Verify in API
    const list = await s.api.get(ent.apiList)
    const items = (await list.json())?.data ?? []
    const ours = items.find((x: any) => x[ent.titleField] === marker)
    if (ours) {
      pass(s, `${ent.code} ${ent.label} created via modal + appears in API`)
      createdIds.push(ours.id)
      // Schedule cleanup
      s.cleanup.push(async () => {
        if (ent.deleteEndpoint && createdIds.length) {
          for (const id of createdIds) {
            await s.api.post(ent.deleteEndpoint!(id), { data: {} }).catch(() => {})
          }
        }
      })
    } else {
      bug(s, `${ent.code}.1`, 'P1', `${ent.label} reachable in API after create`, `not in ${ent.apiList} after submit`, `entity present`)
    }
  } catch (e) {
    bug(s, `${ent.code}.thrown`, 'P0', `${ent.label} sub-test threw`, (e as Error).message.slice(0, 200), 'no exception')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: sectionName, passes, bugs, createdIds }
}

// ─────────────────────────────────────────────────────────────────────────
// C2 — project lifecycle
// ─────────────────────────────────────────────────────────────────────────

async function runC2Project(runId: string, rootDir: string): Promise<SubResult> {
  const s = await openSession({ section: 'C-entities/C2-project', runId, rootDir, viewport: 'desktop', theme: 'dark' })
  const createdIds: string[] = []

  try {
    log(s, 'C2 — project lifecycle')
    await goto(s, '/portal/projects')
    await snap(s, 'projects-pre-create')

    // C2.1 Create via CreateProjectModal
    log(s, 'C2.1 Create project via CreateProjectModal')
    const newBtn = s.page.locator('button').filter({ hasText: /^New Project|^Add Project/i }).first()
    if (!(await newBtn.count())) {
      bug(s, 'C2.1.0', 'P0', 'New Project button visible', 'not found', 'button labeled New Project')
      await closeSession(s)
      return { name: 'C2-project', passes: 0, bugs: 1, createdIds }
    }
    await newBtn.click()
    await snap(s, 'projects-modal-open', 500)
    const marker = makeMarker('c2proj')
    // Title
    const titleInput = s.page.locator('input[type="text"], textarea').first()
    if (await titleInput.count()) {
      await titleInput.fill(marker)
    }
    await snap(s, 'projects-modal-filled')
    // Submit via Ctrl+Enter
    await s.page.keyboard.press('Control+Enter')
    await snap(s, 'projects-after-submit', 1800)

    // Verify in API
    const list = await s.api.get('/api/projects')
    const proj = (await list.json())?.data?.find((p: any) => p.title === marker)
    if (!proj) {
      bug(s, 'C2.1.1', 'P0', 'project appears in API after create', `not in /api/projects (looked for title=${marker})`, 'entity present')
      await closeSession(s)
      return { name: 'C2-project', passes: 0, bugs: 1, createdIds }
    }
    const projectId = proj.id
    const projectSlug = proj.slug
    createdIds.push(projectId)
    pass(s, `C2.1 project created (${projectId.slice(0, 12)}…, slug=${projectSlug})`)

    // Cleanup callback
    s.cleanup.push(async () => {
      for (const id of createdIds) {
        await s.api.post(`/api/projects/${id}/delete`, { data: {} }).catch(() => {})
      }
    })

    // C2.2 Inline edit stage on /portal/projects list
    log(s, 'C2.2 inline edit stage')
    // Find row containing our title
    await goto(s, '/portal/projects') // refresh to ensure new project visible
    await snap(s, 'projects-after-reload', 800)
    const titleNode = s.page.getByText(marker, { exact: false }).first()
    if (await titleNode.count()) {
      await titleNode.scrollIntoViewIfNeeded()
      // Find the row's stage InlineSelect button (currently shows "Idea")
      // InlineSelect buttons have aria-haspopup="listbox"
      const rowAncestor = titleNode.locator('xpath=ancestor::*[descendant::button[@aria-haspopup="listbox"]][1]')
      const stageBtn = rowAncestor.locator('button[aria-haspopup="listbox"]').filter({ hasText: /^Idea$/ }).first()
      if (await stageBtn.count()) {
        await clickViaDispatch(stageBtn)
        await s.page.waitForTimeout(300)
        await snap(s, 'stage-dropdown-open')
        const dataCollOpt = s.page.locator('[role="listbox"] button').filter({ hasText: /^Data Collection$/i }).first()
        if (await dataCollOpt.count()) {
          await clickViaDispatch(dataCollOpt)
          await snap(s, 'stage-edited', 2500)
          const after = (await (await s.api.get('/api/projects')).json())?.data?.find((p: any) => p.id === projectId)
          if (after?.stage === 'Data Collection') pass(s, 'C2.2 API reflects stage=Data Collection')
          else bug(s, 'C2.2.1', 'P1', 'project stage API readback', `actual=${after?.stage}`, 'Data Collection')
        } else {
          bug(s, 'C2.2.2', 'P1', 'Data Collection option in listbox', 'option not found', 'option button visible')
        }
      } else {
        bug(s, 'C2.2.3', 'P1', 'project row stage InlineSelect (currently Idea)', 'button not found in row scope', 'button[aria-haspopup=listbox] with text Idea')
      }
    } else {
      bug(s, 'C2.2.4', 'P0', 'project visible in list', `text "${marker}" not found`, 'project title visible on /portal/projects')
    }

    // C2.3 Reload persistence
    log(s, 'C2.3 reload persistence')
    await s.page.reload({ waitUntil: 'networkidle' })
    await s.page.waitForTimeout(800)
    const titleAfter = s.page.getByText(marker, { exact: false }).first()
    if (await titleAfter.count()) pass(s, 'C2.3 project visible after reload')
    else bug(s, 'C2.3.1', 'P0', 'project survives reload', 'title missing after reload', 'visible')

    // C2.4 Soft-delete via API
    log(s, 'C2.4 soft-delete via POST :id/delete')
    const del = await s.api.post(`/api/projects/${projectId}/delete`, { data: {} })
    if (del.ok()) {
      pass(s, 'C2.4 soft-delete returned ok')
      const after = (await (await s.api.get('/api/projects')).json())?.data?.find((p: any) => p.id === projectId)
      if (!after) pass(s, 'C2.4 project absent from default list after delete')
      else bug(s, 'C2.4.1', 'P1', 'soft-deleted project hidden', 'still visible', 'absent')
      createdIds.length = 0 // already deleted
    } else {
      bug(s, 'C2.4.2', 'P1', 'soft-delete API call', `status=${del.status()}`, 'ok')
    }
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }

  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'C2-project', passes, bugs, createdIds }
}

async function runC1Task(runId: string, rootDir: string): Promise<SubResult> {
  const s = await openSession({ section: 'C-entities/C1-task', runId, rootDir, viewport: 'desktop', theme: 'dark' })
  const createdIds: string[] = []

  try {
    log(s, 'C1 — task lifecycle')

    // --- C1.1 Create via real CreateTaskModal ---
    log(s, 'C1.1 Create task via CreateTaskModal')
    await goto(s, '/portal/my-tasks')
    await snap(s, 'mytasks-pre-create')

    const newBtn = s.page.locator('button').filter({ hasText: /New Task/i }).first()
    if (!(await newBtn.count())) {
      bug(s, 'C1.1.1', 'P0', 'New Task button visible', 'not found', 'visible button labeled New Task')
      await closeSession(s)
      return { name: 'C1-task', passes: 0, bugs: 1, createdIds }
    }
    await newBtn.click()
    await snap(s, 'mytasks-modal-open')

    const modal = s.page.locator('[data-testid="create-task-modal"]')
    if (await modal.count()) {
      pass(s, 'C1.1 modal opens with data-testid')
    } else {
      bug(s, 'C1.1.2', 'P1', 'modal data-testid', 'modal element without create-task-modal id', 'data-testid="create-task-modal"')
    }

    const marker = makeMarker('c1task')
    await s.page.locator('[data-testid="task-title-input"]').fill(marker)
    // Fill description (required per A5 finding)
    const descBox = s.page.locator('textarea').first()
    if (await descBox.count()) {
      await descBox.fill('massive-audit C1 probe — describes the test task')
    }
    // Pick assignee from native select
    const assigneeSel = s.page.locator('#task-assignee')
    if (await assigneeSel.count()) {
      await assigneeSel.selectOption('nick-ingraham').catch(async () => {
        // Some modals render slug differently; fall back to first option containing "Ingraham"
        await assigneeSel.selectOption({ label: /Ingraham/i }).catch(() => {})
      })
    }
    await snap(s, 'mytasks-modal-filled')
    await s.page.locator('[data-testid="task-submit"]').click()
    await snap(s, 'mytasks-after-submit', 1500)

    // Verify in list — find by title text in any task-row
    const rowByTitle = s.page.locator('[data-testid^="task-row-"]').filter({ hasText: marker }).first()
    if (await rowByTitle.count()) {
      pass(s, `C1.1 task row appears in list (${marker})`)
    } else {
      bug(s, 'C1.1.3', 'P0', 'task appears in list without reload', 'no row matched title', 'row visible')
    }

    // Get id from API
    const list = await s.api.get('/api/tasks?limit=5000')
    const taskId = (await list.json())?.data?.find((t: any) => t.title === marker)?.id
    if (!taskId) {
      bug(s, 'C1.1.4', 'P0', 'API readback of created task', 'not present in /api/tasks list', 'present')
      await closeSession(s)
      return { name: 'C1-task', passes: s.findings.filter(f=>f.level==='PASS').length, bugs: s.findings.filter(f=>f.level==='BUG').length, createdIds }
    }
    createdIds.push(taskId)
    log(s, `  created task id=${taskId.slice(0,12)}…`)

    // Cleanup callback
    s.cleanup.push(async () => {
      if (createdIds.length) await deleteTaskIds(s.api, createdIds)
    })

    // --- C1.2 Inline edit status ---
    log(s, 'C1.2 inline edit status')
    const statusBtn = s.page.locator(`[data-testid="task-status-${taskId}"] button`).first()
    if (await statusBtn.count()) {
      const ok = await changeInlineSelect(s.page, statusBtn, /In Progress/i)
      await snap(s, 'status-edited', 1200)
      if (ok) {
        pass(s, 'C1.2 status InlineSelect change succeeded')
        await s.page.waitForTimeout(800)
        await s.page.waitForTimeout(2500) // give optimistic mutation time to flush
    const after = (await (await s.api.get('/api/tasks?limit=5000')).json())?.data?.find((t: any) => t.id === taskId)
        if (after?.status === 'in_progress') pass(s, `C1.2 API reflects status=in_progress`)
        else bug(s, 'C1.2.1', 'P1', 'status API readback', `actual=${after?.status}`, 'in_progress')
      } else {
        bug(s, 'C1.2.2', 'P1', 'status InlineSelect change', 'pickOption returned false', 'option clicked + dropdown closed')
      }
    } else {
      bug(s, 'C1.2.3', 'P1', `task-status-${taskId} cell exists`, 'cell not found', 'inline-editable status cell')
    }

    // --- C1.3 Inline edit priority ---
    log(s, 'C1.3 inline edit priority')
    const prioBtn = s.page.locator(`[data-testid="task-priority-${taskId}"] button`).first()
    if (await prioBtn.count()) {
      const ok = await changeInlineSelect(s.page, prioBtn, /^High$/i)
      await snap(s, 'priority-edited', 1200)
      if (ok) {
        pass(s, 'C1.3 priority InlineSelect change succeeded')
        await s.page.waitForTimeout(2500) // give optimistic mutation time to flush
    const after = (await (await s.api.get('/api/tasks?limit=5000')).json())?.data?.find((t: any) => t.id === taskId)
        if (after?.priority === 'high') pass(s, 'C1.3 API reflects priority=high')
        else bug(s, 'C1.3.1', 'P1', 'priority API readback', `actual=${after?.priority}`, 'high')
      } else {
        bug(s, 'C1.3.2', 'P1', 'priority InlineSelect change', 'pickOption returned false', 'option clicked')
      }
    } else {
      bug(s, 'C1.3.3', 'P1', 'priority cell exists', 'cell not found', 'inline-editable priority cell')
    }

    // --- C1.4 Inline edit due_date — dispatch click on Tomorrow preset ---
    // The trigger button must be opened via direct event dispatch (rows in
    // virtualized list visually overlap, force:true clicks at coordinate
    // get caught by the row, opening the detail panel — preventing the
    // picker from opening). Then Tomorrow preset's onMouseDown fires.
    log(s, 'C1.4 inline edit due_date (Tomorrow preset, dispatched mousedown)')
    const dueCell = s.page.locator(`[data-testid="task-due-${taskId}"]`).first()
    const dueBtn = dueCell.locator('button').first()
    if (await dueBtn.count()) {
      await dueBtn.scrollIntoViewIfNeeded().catch(() => {})
      await clickViaDispatch(dueBtn)
      await snap(s, 'due-picker-open', 500)
      const tomorrowBtn = dueCell.locator('button').filter({ hasText: /^Tomorrow$/i }).first()
      if (await tomorrowBtn.count()) {
        await clickViaDispatch(tomorrowBtn)
        await snap(s, 'due-edited', 2500)
        // Match picker's local-tz tomorrow (uses getDate/getMonth/getFullYear)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tmrw = new Date(today.getTime() + 86400000)
        const tomorrow = `${tmrw.getFullYear()}-${String(tmrw.getMonth() + 1).padStart(2, '0')}-${String(tmrw.getDate()).padStart(2, '0')}`
        const after = (await (await s.api.get('/api/tasks?limit=5000')).json())?.data?.find((t: any) => t.id === taskId)
        if (after?.due_date === tomorrow) pass(s, `C1.4 API reflects due_date=${tomorrow}`)
        else bug(s, 'C1.4.1', 'P1', 'due_date API readback', `actual=${after?.due_date}`, tomorrow)
      } else {
        bug(s, 'C1.4.2', 'P1', 'Tomorrow preset visible after picker open', 'no button matched /^Tomorrow$/', 'preset button visible')
      }
    } else {
      bug(s, 'C1.4.3', 'P1', 'due_date cell exists', 'cell not found', 'inline-editable due cell')
    }

    // Close any auto-opened detail panel between sub-tests
    await s.page.keyboard.press('Escape').catch(() => {})
    await s.page.waitForTimeout(300)

    // --- C1.5 Inline edit assignee — clickViaDispatch on trigger + option ---
    log(s, 'C1.5 inline edit assignee (dispatched click)')
    const assCell = s.page.locator(`[data-testid="task-assignee-${taskId}"]`).first()
    const assBtn = assCell.locator('button.inline-assignee-btn, button[aria-label^="Assignee:"]').first()
    if (await assBtn.count()) {
      const team = (await (await s.api.get('/api/team')).json())?.data ?? []
      const target = team.find((m: any) => m.slug && m.slug !== 'nick-ingraham' && (m.full_name || m.preferred_name))
      if (target) {
        // The dropdown shows full_name (Nathan Mesfin), not preferred_name (Nate)
        const targetName: string = target.full_name || target.preferred_name
        await assBtn.scrollIntoViewIfNeeded().catch(() => {})
        await clickViaDispatch(assBtn)
        await snap(s, 'assignee-picker-open', 700)
        // Find option for target — listbox attaches with options
        const opt = s.page.locator('[role="option"]').filter({ hasText: new RegExp(targetName, 'i') }).first()
        if (await opt.count()) {
          await clickViaDispatch(opt)
          await snap(s, 'assignee-edited', 2500)
          const after = (await (await s.api.get('/api/tasks?limit=5000')).json())?.data?.find((t: any) => t.id === taskId)
          if (after?.assignee === target.slug) pass(s, `C1.5 API reflects assignee=${target.slug}`)
          else bug(s, 'C1.5.1', 'P1', 'assignee API readback', `actual=${after?.assignee}`, target.slug)
        } else {
          bug(s, 'C1.5.2', 'P1', 'assignee option in listbox', `no [role=option] matched ${targetName}`, 'option button visible')
        }
      } else {
        bug(s, 'C1.5.3', 'P2', 'team list has alternate member', 'no alt found', 'team list with at least 2 members')
      }
    } else {
      bug(s, 'C1.5.4', 'P1', 'assignee trigger button', 'button.inline-assignee-btn not found', 'trigger visible')
    }

    // Close any auto-opened detail panel between sub-tests
    await s.page.keyboard.press('Escape').catch(() => {})
    await s.page.waitForTimeout(300)

    // --- C1.6 Open + remain-open stability ---
    // Open status dropdown, immediately verify the listbox attaches to DOM.
    // (Note: scroll IS designed to close — InlineSelect:47-50. We don't
    // simulate scroll. We verify the listbox is in DOM without auto-close
    // during its settle.)
    log(s, 'C1.6 status dropdown opens + remains in DOM')
    const statusBtn2 = s.page.locator(`[data-testid="task-status-${taskId}"] button`).first()
    if (await statusBtn2.count()) {
      await statusBtn2.scrollIntoViewIfNeeded().catch(() => {})
      await statusBtn2.click({ force: true })
      // Listbox should attach within 800ms
      const listboxAttached = await s.page.getByRole('listbox').first().waitFor({ state: 'attached', timeout: 1500 }).then(() => true).catch(() => false)
      if (!listboxAttached) {
        bug(s, 'C1.6.1', 'P1', 'status dropdown attaches', 'listbox not in DOM after click', 'role=listbox in DOM')
      } else {
        pass(s, 'C1.6 status listbox attached to DOM after click')
        // Now verify it stays attached (doesn't auto-close from layout race)
        await s.page.waitForTimeout(800)
        const stillAttached = await s.page.getByRole('listbox').first().count() > 0
        if (stillAttached) pass(s, 'C1.6 listbox still in DOM after 800ms (no auto-close race)')
        else bug(s, 'C1.6.2', 'P1', 'listbox stays open through settle', 'detached before user input', 'remains in DOM')
        await s.page.keyboard.press('Escape').catch(() => {})
      }
    }

    // --- C1.7 Reload persistence ---
    log(s, 'C1.7 reload persistence check')
    await s.page.reload({ waitUntil: 'networkidle' })
    await s.page.waitForTimeout(800)
    const rowAfterReload = s.page.locator('[data-testid^="task-row-"]').filter({ hasText: marker }).first()
    if (await rowAfterReload.count()) {
      pass(s, 'C1.7 task row visible after reload')
      // Verify the cells show the new values
      const statusCellTxt = await s.page.locator(`[data-testid="task-status-${taskId}"]`).first().textContent().catch(() => '')
      if (/in.progress/i.test(statusCellTxt || '')) pass(s, 'C1.7 status cell shows In Progress after reload')
      else bug(s, 'C1.7.1', 'P1', 'status persists through reload', `cell text=${statusCellTxt}`, 'In Progress')
    } else {
      bug(s, 'C1.7.2', 'P0', 'task survives reload', 'row missing after reload', 'row visible')
    }

    // --- C1.8 Soft-delete via batch API (tests cleanup path) ---
    // (UI delete not always available; using API delete is what the user
    // would experience via context-menu Archive in many places.)
    log(s, 'C1.8 soft-delete via batch')
    const del = await s.api.post('/api/tasks/batch', { data: { ids: [taskId], action: 'delete' } })
    if (del.ok()) {
      pass(s, 'C1.8 batch soft-delete returned ok')
      await s.page.waitForTimeout(2500) // give optimistic mutation time to flush
    const after = (await (await s.api.get('/api/tasks?limit=5000')).json())?.data?.find((t: any) => t.id === taskId)
      if (!after) pass(s, 'C1.8 task no longer in default list (filtered by deleted_at)')
      else bug(s, 'C1.8.1', 'P1', 'soft-deleted task hidden from default list', 'still visible', 'absent')
      // Don't double-delete in cleanup
      createdIds.length = 0
    } else {
      bug(s, 'C1.8.2', 'P1', 'soft-delete API call', `status=${del.status()}`, 'ok')
    }
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }

  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'C1-task', passes, bugs, createdIds }
}
