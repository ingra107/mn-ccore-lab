/**
 * Deep audit — Suite 5: Subtasks, handoffs, task-completion ripple.
 *
 * Run: npx tsx scripts/deep-audit/05-subtasks-handoffs.ts
 */
import { openSession, closeSession, section, log, pass, bug, apiGet, apiGetTaskFromList, marker } from './harness'

async function main() {
  const s = await openSession('05-subtasks-handoffs')
  const createdTaskIds: string[] = []

  try {
    section(s, '5.A  Create parent task with 3 subtasks')
    const parentTitle = marker('parent')
    const parentResp = await s.api.post('/api/tasks', {
      data: { title: parentTitle, description: parentTitle, assignee: 'nick', priority: 'high' },
    })
    if (!parentResp.ok()) {
      bug(s, 'PARENT-CREATE', 'P0', '5.A POST parent task', `HTTP ${parentResp.status()}`, '200')
      await closeSession(s)
      return
    }
    const parentId = ((await parentResp.json()) as { data?: { id: string } }).data?.id
    if (!parentId) { await closeSession(s); return }
    createdTaskIds.push(parentId)
    pass(s, `5.A Parent task ${parentId}`)

    const subtasks = ['Design analysis plan', 'Pull + clean data', 'Run primary model']
    const subIds: string[] = []
    for (const text of subtasks) {
      const r = await s.api.post(`/api/tasks/${parentId}/subtasks`, { data: { title: text } })
      if (r.ok()) {
        const j = (await r.json()) as { data?: { id: string } }
        if (j?.data?.id) subIds.push(j.data.id)
      } else {
        bug(s, 'SUBTASK-CREATE-FAIL', 'P1', `5.A POST subtask "${text}"`, `HTTP ${r.status()}`, '200')
      }
    }
    if (subIds.length === subtasks.length) pass(s, `5.A All ${subIds.length} subtasks created`)

    section(s, '5.B  GET subtasks — returns all 3 with order preserved')
    const sublist = await apiGet<Array<{ id: string; title: string; sort_order?: number }>>(s, `/api/tasks/${parentId}/subtasks`)
    if (!sublist) {
      bug(s, 'SUBTASK-GET-FAIL', 'P1', '5.B GET /subtasks', 'null', 'array')
    } else if (sublist.length !== subtasks.length) {
      bug(s, 'SUBTASK-COUNT-DRIFT', 'P1', '5.B GET returns same count', `${sublist.length}`, String(subtasks.length))
    } else {
      pass(s, `5.B GET returns ${sublist.length} subtasks`)
      // Order check — should match insertion order
      const returnedTitles = sublist.map((x) => x.title)
      if (JSON.stringify(returnedTitles) === JSON.stringify(subtasks)) pass(s, '5.B Order matches insertion order')
      else bug(s, 'SUBTASK-ORDER-DRIFT', 'P2', '5.B subtask order', JSON.stringify(returnedTitles), JSON.stringify(subtasks))
    }

    section(s, '5.C  Complete one subtask — state persists')
    if (subIds[0]) {
      const completeResp = await s.api.post(`/api/subtasks/${subIds[0]}/toggle`)
      if (!completeResp.ok()) {
        // Try the alternative path
        const altResp = await s.api.post(`/api/subtasks/${subIds[0]}`, { data: { completed: 1 } })
        if (altResp.ok()) pass(s, '5.C Subtask toggle via POST /:id accepted')
        else bug(s, 'SUBTASK-TOGGLE-FAIL', 'P1', '5.C complete subtask via /toggle or POST /:id', `toggle ${completeResp.status()}, post ${altResp.status()}`, '200')
      } else {
        pass(s, '5.C Subtask /toggle accepted')
      }
      const after = await apiGet<Array<{ id: string; completed?: number }>>(s, `/api/tasks/${parentId}/subtasks`)
      const completed = after?.find((x) => x.id === subIds[0])
      if (completed?.completed === 1) pass(s, '5.C Subtask completed=1 persisted')
      else bug(s, 'SUBTASK-COMPLETED-DRIFT', 'P1', '5.C completed flag persists', String(completed?.completed), '1')
    }

    // ═══════════════════ HANDOFFS ═══════════════════
    section(s, '5.D  Task handoff request — nick → nate')
    const hoTitle = marker('handoff')
    const hoTaskResp = await s.api.post('/api/tasks', {
      data: { title: hoTitle, description: hoTitle, assignee: 'nick', priority: 'medium' },
    })
    const hoTaskId = ((await hoTaskResp.json()) as { data?: { id: string } }).data?.id
    if (hoTaskId) createdTaskIds.push(hoTaskId)
    if (!hoTaskId) {
      bug(s, 'HO-TASK-CREATE', 'P1', '5.D Create task for handoff', 'no id', 'id returned')
    } else {
      const handoffResp = await s.api.post(`/api/tasks/${hoTaskId}/handoffs`, {
        // Handoff uses SBAR fields (situation/background/assessment/recommendation),
        // not free-form 'message'. Situation is the only required field.
        data: {
          to_slug: 'nate',
          situation: `${marker('ho')} please take this over`,
          background: 'Deep-audit automated test — ensures the full SBAR round-trips.',
          assessment: 'Route via task_handoffs + reassign + notification.',
          recommendation: 'Acknowledge + continue as usual.',
        },
      })
      if (handoffResp.ok()) {
        pass(s, '5.D Handoff request POST accepted')
        const handoffs = await apiGet<Array<{ id: string; to_slug: string; from_slug: string; status?: string }>>(s, `/api/tasks/${hoTaskId}/handoffs`)
        if (handoffs && handoffs.length >= 1) {
          pass(s, `5.D Handoff list returns ${handoffs.length} row(s)`)
          const newest = handoffs[0]
          if (newest.to_slug === 'nate') pass(s, '5.D Handoff to_slug=nate')
          else bug(s, 'HO-TO-DRIFT', 'P1', '5.D handoff to_slug', newest.to_slug, 'nate')
        } else {
          bug(s, 'HO-LIST-EMPTY', 'P1', '5.D handoff in list', `${handoffs?.length ?? 0}`, '>=1')
        }
      } else {
        bug(s, 'HO-POST-FAIL', 'P1', '5.D POST /api/tasks/:id/handoffs', `HTTP ${handoffResp.status()}`, '200')
      }

      section(s, '5.E  Acknowledge task (closed-loop CRM pattern)')
      // Re-assign to nate first so ack path is valid
      await s.api.post(`/api/tasks/${hoTaskId}`, { data: { assignee: 'nate' } })
      const ackResp = await s.api.post(`/api/tasks/${hoTaskId}/acknowledge`, { data: { slug: 'nate' } })
      if (ackResp.ok()) {
        pass(s, '5.E Acknowledge POST accepted')
        const row = await apiGetTaskFromList<{ id: string; acknowledged_at: string | null; acknowledged_by: string | null }>(s, hoTaskId)
        if (row?.acknowledged_at) pass(s, `5.E acknowledged_at timestamp set: ${row.acknowledged_at}`)
        else bug(s, 'ACK-TIMESTAMP-DRIFT', 'P1', '5.E acknowledged_at persists', String(row?.acknowledged_at), 'ISO timestamp')
        if (row?.acknowledged_by === 'nate') pass(s, '5.E acknowledged_by=nate')
        else bug(s, 'ACK-BY-DRIFT', 'P1', '5.E acknowledged_by persists', String(row?.acknowledged_by), 'nate')
      } else {
        bug(s, 'ACK-POST-FAIL', 'P1', '5.E POST /acknowledge', `HTTP ${ackResp.status()}`, '200')
      }
    }

    // ═══════════════════ PARENT+SUBTASKS DONE RIPPLE ═══════════════════
    section(s, '5.F  Complete parent — subtasks also marked? (product behavior check)')
    if (parentId) {
      await s.api.post(`/api/tasks/${parentId}/status`, { data: { status: 'done' } })
      await s.page.waitForTimeout(500)
      const subs = await apiGet<Array<{ id: string; completed?: number; status?: string }>>(s, `/api/tasks/${parentId}/subtasks`)
      const doneCount = subs?.filter((x) => x.completed === 1 || x.status === 'done').length ?? 0
      const total = subs?.length ?? 0
      log(s, `  5.F Parent done → ${doneCount}/${total} subtasks auto-done (product decision: current behavior documented)`)
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdTaskIds) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
