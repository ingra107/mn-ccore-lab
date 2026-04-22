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

  // C1 — task lifecycle
  subResults.push(await runC1Task(runId, rootDir))

  // C2-C14 — pending. Stubbed here so the runner reports them.
  // Will fold in incrementally as patterns prove out.

  const totalPasses = subResults.reduce((acc, r) => acc + r.passes, 0)
  const totalBugs = subResults.reduce((acc, r) => acc + r.bugs, 0)
  return { name: 'C-entities', passes: totalPasses, bugs: totalBugs }
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
