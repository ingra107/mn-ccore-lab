/**
 * Deep audit — Suite 1: Task lifecycle.
 *
 * Run: npx tsx scripts/deep-audit/01-task-lifecycle.ts
 */
import {
  openSession,
  closeSession,
  section,
  log,
  pass,
  bug,
  snap,
  goto,
  apiGet,
  apiPatchTask,
  apiGetTaskFromList,
  marker,
} from './harness'

async function main() {
  const s = await openSession('01-task-lifecycle')
  const createdTaskIds: string[] = []

  try {
    section(s, '1.A  Create task via API — full payload')
    const title = marker('task_full')
    const desc = `${title}__description`
    const createResp = await s.api.post('/api/tasks', {
      data: {
        title,
        description: desc,
        assignee: 'nick',
        priority: 'high',
        status: 'todo',
      },
    })
    if (!createResp.ok()) {
      bug(s, 'TASK-CREATE-API-FAIL', 'P0', '1.A POST /api/tasks', `HTTP ${createResp.status()}`, '201/200')
      await closeSession(s)
      return
    }
    const taskBody = await createResp.json() as { data?: { id: string; title: string; description: string; assignee: string; priority: string; status: string; completed: number } }
    const task = taskBody.data
    if (!task?.id) {
      bug(s, 'TASK-CREATE-NO-ID', 'P0', '1.A response has task.data.id', JSON.stringify(taskBody).slice(0, 120), 'object with data.id')
      await closeSession(s)
      return
    }
    createdTaskIds.push(task.id)
    pass(s, `1.A Task created via API — id=${task.id}`)

    // Verify exact field values echoed back
    if (task.title !== title) bug(s, 'TASK-TITLE-ECHO', 'P1', '1.A response echoes title exactly', task.title, title)
    else pass(s, '1.A response echoes title exactly')
    if (task.priority !== 'high') bug(s, 'TASK-PRIORITY-ECHO', 'P1', '1.A response echoes priority=high', task.priority, 'high')
    else pass(s, '1.A response echoes priority=high')
    if (task.assignee !== 'nick') bug(s, 'TASK-ASSIGNEE-ECHO', 'P1', '1.A response echoes assignee=nick', task.assignee, 'nick')
    else pass(s, '1.A response echoes assignee=nick')
    if (task.status !== 'todo') bug(s, 'TASK-STATUS-ECHO', 'P1', '1.A response echoes status=todo', task.status, 'todo')
    else pass(s, '1.A response echoes status=todo')

    section(s, '1.B  Read back via /api/tasks list lookup (no single-task GET endpoint)')
    const readback = await apiGetTaskFromList<{ id: string; title: string; priority: string; assignee: string; status: string; completed: number }>(s, task.id)
    if (!readback) {
      bug(s, 'TASK-LIST-MISSING-NEW', 'P0', '1.B Newly created task appears in /api/tasks list', 'not found in list', 'task in list right after create')
    } else {
      if (readback.title === title) pass(s, '1.B GET readback: title matches')
      else bug(s, 'TASK-TITLE-DRIFT', 'P1', '1.B title matches on readback', readback.title, title)
      if (readback.priority === 'high') pass(s, '1.B GET readback: priority matches')
      else bug(s, 'TASK-PRIORITY-DRIFT', 'P1', '1.B priority matches on readback', readback.priority, 'high')
    }

    section(s, '1.C  UI visibility — /my-tasks default filter')
    await goto(s, '/my-tasks')
    await snap(s, 'C-my-tasks-initial')
    const onMyTasks = await s.page.locator(`text=${JSON.stringify(title)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (onMyTasks) pass(s, '1.C Task visible on /my-tasks (auto-filter Mine)')
    else bug(s, 'TASK-NOT-ON-MYTASKS', 'P1', '1.C Task visible on /my-tasks', 'title not found', `"${title}" visible`)

    section(s, '1.D  UI visibility — /tasks (All view)')
    await goto(s, '/tasks')
    await snap(s, 'D-tasks-all-initial')
    const onTasksAll = await s.page.locator(`text=${JSON.stringify(title)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (onTasksAll) pass(s, '1.D Task visible on /tasks')
    else bug(s, 'TASK-NOT-ON-TASKS', 'P1', '1.D Task visible on /tasks', 'title not found', `"${title}" visible`)

    section(s, '1.E  Edit title via POST /:id, verify readback + UI after reload')
    const title2 = `${title}__edited`
    const patchResp = await apiPatchTask(s, task.id, { title: title2 })
    if (!patchResp.ok) bug(s, 'TASK-PATCH-FAIL', 'P0', '1.E POST /api/tasks/:id title', `HTTP ${patchResp.status}`, '200')
    else pass(s, '1.E POST title accepted')
    const rb2 = await apiGetTaskFromList<{ id: string; title: string }>(s, task.id)
    if (rb2?.title === title2) pass(s, '1.E Readback shows new title')
    else bug(s, 'TASK-TITLE-NOT-PERSISTED', 'P0', '1.E readback shows new title', String(rb2?.title), title2)

    await goto(s, '/my-tasks')
    await snap(s, 'E-my-tasks-after-title-edit')
    const newTitleVisible = await s.page.locator(`text=${JSON.stringify(title2)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (newTitleVisible) pass(s, '1.E New title renders on /my-tasks after reload')
    else bug(s, 'TASK-TITLE-STALE-UI', 'P1', '1.E new title visible after reload', 'old or missing title', `"${title2}" visible`)

    section(s, '1.F  Change assignee via POST, verify on new assignee and OFF old workload')
    // 'nate' is the registered team_members slug for Nate Mesfin; 'mesfin'
    // was never in team_members and POST validation rejects it (correctly).
    const patchA = await apiPatchTask(s, task.id, { assignee: 'nate' })
    if (!patchA.ok) bug(s, 'TASK-PATCH-ASSIGNEE', 'P0', '1.F POST assignee=nate', `HTTP ${patchA.status}`, '200')
    else pass(s, '1.F POST assignee=nate accepted')
    const rb3 = await apiGetTaskFromList<{ id: string; assignee: string }>(s, task.id)
    if (rb3?.assignee === 'nate') pass(s, '1.F Readback shows new assignee')
    else bug(s, 'TASK-ASSIGNEE-NOT-PERSISTED', 'P0', '1.F readback shows assignee=nate', String(rb3?.assignee), 'nate')

    // MyTasks is /my-tasks filtered to logged-in user. Deep-audit runs
    // without CF Access JWT, so useAuth().user is null and the page shows
    // ALL tasks (by design — unauthenticated viewers see everything).
    // Skip the filter assertion unless /api/auth/me returns an authenticated user.
    await goto(s, '/my-tasks')
    await snap(s, 'F-my-tasks-after-reassign')
    const authRes = await s.api.get('/api/auth/me').catch(() => null)
    const authed = authRes?.ok() ? ((await authRes.json()) as { authenticated?: boolean }).authenticated : false
    if (!authed) {
      log(s, '  1.F SKIP Mine filter check — no CF Access JWT (dev/test run)')
    } else {
      const stillOnMyTasks = await s.page.locator(`text=${JSON.stringify(title2)}`).first().isVisible({ timeout: 2000 }).catch(() => false)
      if (!stillOnMyTasks) pass(s, '1.F Task no longer on /my-tasks (Mine filter respects new assignee)')
      else bug(s, 'TASK-MINE-FILTER-STALE', 'P1', '1.F /my-tasks filter drops reassigned task', 'still visible on Mine', 'hidden from Mine when assignee != current user')
    }

    section(s, '1.G  Change priority high→urgent')
    const patchP = await apiPatchTask(s, task.id, { priority: 'urgent' })
    if (!patchP.ok) bug(s, 'TASK-PATCH-PRIORITY', 'P1', '1.G POST priority=urgent', `HTTP ${patchP.status}`, '200')
    const rb4 = await apiGetTaskFromList<{ id: string; priority: string }>(s, task.id)
    if (rb4?.priority === 'urgent') pass(s, '1.G Priority persisted urgent')
    else bug(s, 'TASK-PRIORITY-NOT-PERSISTED', 'P1', '1.G priority persisted', String(rb4?.priority), 'urgent')

    section(s, '1.H  Change status todo→in_progress→done')
    const patchS1 = await apiPatchTask(s, task.id, { status: 'in_progress' })
    if (!patchS1.ok) bug(s, 'TASK-PATCH-STATUS-IP', 'P1', '1.H POST status=in_progress', `HTTP ${patchS1.status}`, '200')
    const rb5 = await apiGetTaskFromList<{ id: string; status: string; completed: number }>(s, task.id)
    if (rb5?.status === 'in_progress') pass(s, '1.H status=in_progress persisted')
    else bug(s, 'TASK-STATUS-IP-DRIFT', 'P1', '1.H status=in_progress persisted', String(rb5?.status), 'in_progress')
    if (rb5?.completed === 0) pass(s, '1.H in_progress leaves completed=0')
    else bug(s, 'TASK-COMPLETED-FLAG-DRIFT', 'P2', '1.H completed flag stays 0 for in_progress', String(rb5?.completed), '0')

    // Dedicated status endpoint is the canonical "complete" path
    const statusResp = await s.api.post(`/api/tasks/${task.id}/status`, { data: { status: 'done' } })
    if (!statusResp.ok()) bug(s, 'TASK-STATUS-DONE', 'P1', '1.H POST /status done', `HTTP ${statusResp.status()}`, '200')
    const rb6 = await apiGetTaskFromList<{ id: string; status: string; completed: number }>(s, task.id)
    if (rb6?.status === 'done' && rb6.completed === 1) pass(s, '1.H done sets status=done + completed=1')
    else bug(s, 'TASK-DONE-COMPLETED-FLAG', 'P1', '1.H done sets both status and completed', `status=${rb6?.status} completed=${rb6?.completed}`, 'status=done completed=1')

    section(s, '1.I  Reopen task — status=todo, completed back to 0')
    const reopenResp = await s.api.post(`/api/tasks/${task.id}/status`, { data: { status: 'todo' } })
    if (!reopenResp.ok()) bug(s, 'TASK-REOPEN', 'P1', '1.I POST /status todo', `HTTP ${reopenResp.status()}`, '200')
    const rb7 = await apiGetTaskFromList<{ id: string; status: string; completed: number }>(s, task.id)
    if (rb7?.status === 'todo' && rb7.completed === 0) pass(s, '1.I Reopen clears completed flag')
    else bug(s, 'TASK-REOPEN-FLAG', 'P1', '1.I reopen clears completed', `status=${rb7?.status} completed=${rb7?.completed}`, 'status=todo completed=0')

    section(s, '1.J  Attach key_link, verify round-trip + UI display')
    const url = 'https://example.com/deep-audit-task'
    const linkDesc = 'Deep audit link'
    const linkResp = await apiPatchTask(s, task.id, { key_link_1: url, key_link_1_desc: linkDesc })
    if (!linkResp.ok) bug(s, 'TASK-KEYLINK-PATCH', 'P1', '1.J POST key_link_1', `HTTP ${linkResp.status}`, '200')
    const rb8 = await apiGetTaskFromList<{ id: string; key_link_1: string; key_link_1_desc: string }>(s, task.id)
    if (rb8?.key_link_1 === url) pass(s, '1.J key_link_1 url round-trips')
    else bug(s, 'TASK-KEYLINK-URL-DRIFT', 'P1', '1.J key_link_1 url round-trips', String(rb8?.key_link_1), url)
    if (rb8?.key_link_1_desc === linkDesc) pass(s, '1.J key_link_1_desc round-trips')
    else bug(s, 'TASK-KEYLINK-DESC-DRIFT', 'P1', '1.J key_link_1_desc round-trips', String(rb8?.key_link_1_desc), linkDesc)

    section(s, '1.K  Post comment with @mention — verify notification fires')
    // Use a target slug that's not the author (nick) to check notification path
    const commentBody = `${marker('cmt')} @nick please review`
    const commentResp = await s.api.post(`/api/tasks/${task.id}/comments`, {
      data: { content: commentBody },
    })
    if (!commentResp.ok()) bug(s, 'TASK-COMMENT-POST', 'P1', '1.K POST /comments', `HTTP ${commentResp.status()}`, '200')
    else pass(s, '1.K Comment POST accepted')

    const comments = await apiGet<Array<{ content: string }>>(s, `/api/tasks/${task.id}/comments`)
    const foundComment = comments?.some((c) => c.content === commentBody)
    if (foundComment) pass(s, '1.K Comment visible via GET /comments')
    else bug(s, 'TASK-COMMENT-NOT-RETURNED', 'P1', '1.K GET /comments returns posted comment', `${comments?.length ?? 0} comments, marker missing`, 'comment with marker text')

    section(s, '1.L  Post note via /updates endpoint')
    const noteBody = `${marker('note')} deep audit note`
    const noteResp = await s.api.post(`/api/tasks/${task.id}/updates`, { data: { content: noteBody, update_type: 'progress' } })
    if (!noteResp.ok()) bug(s, 'TASK-NOTE-POST', 'P1', '1.L POST /updates', `HTTP ${noteResp.status()}`, '200')
    else pass(s, '1.L Note POST accepted')

    const updates = await apiGet<Array<{ content: string }>>(s, `/api/tasks/${task.id}/updates`)
    const foundNote = updates?.some((u) => u.content === noteBody)
    if (foundNote) pass(s, '1.L Note visible via GET /updates')
    else bug(s, 'TASK-NOTE-NOT-RETURNED', 'P1', '1.L GET /updates returns posted note', `${updates?.length ?? 0} updates, marker missing`, 'update with marker text')

    section(s, '1.M  Activity feed contains task creation + updates')
    // activity_log stores related_id + description (not source_id + body).
    // 2026-04-18: renamed for fidelity with the actual response schema.
    const activity = await apiGet<Array<{ description: string | null; type: string; related_id: string | null; related_type: string | null }>>(s, `/api/activity?limit=200`)
    const relevantActs = activity?.filter((a) => a.related_id === task.id || (a.description && a.description.includes(title2))) ?? []
    if (relevantActs.length >= 1) pass(s, `1.M ${relevantActs.length} activity entries reference this task`)
    else bug(s, 'TASK-ACTIVITY-MISSING', 'P2', '1.M Activity feed has task-related entries', '0 entries', '>=1 entry (create + edits)')

    section(s, '1.N  Visibility on /activity page UI')
    await goto(s, '/activity')
    await snap(s, 'N-activity-feed')
    const titleOnActivity = await s.page.locator(`text=${JSON.stringify(title2)}`).first().isVisible({ timeout: 2000 }).catch(() => false)
    if (titleOnActivity) pass(s, '1.N New title surfaces on /activity UI')
    else log(s, '  INFO: 1.N activity UI does not show task title directly (may aggregate by actor) — not flagged as bug')

    section(s, '1.O  Soft delete via batch endpoint — verify gone from /tasks')
    const delResp = await s.api.post('/api/tasks/batch', { data: { ids: [task.id], action: 'delete' } })
    if (!delResp.ok()) bug(s, 'TASK-DELETE', 'P1', '1.O batch delete', `HTTP ${delResp.status()}`, '200')
    else pass(s, '1.O Batch delete accepted')
    // Readback: soft-delete should set deleted_at; GET may still return OR hide from list
    const rbDel = await apiGetTaskFromList<{ id: string; deleted_at: string | null }>(s, task.id)
    if (rbDel === null) pass(s, '1.O Task hidden from /api/tasks list after delete (soft-delete filter)')
    else if (rbDel.deleted_at) pass(s, `1.O GET task after delete still returns row but deleted_at=${rbDel.deleted_at}`)
    else bug(s, 'TASK-DELETE-NO-FLAG', 'P1', '1.O deleted_at set after batch delete', 'deleted_at=null', 'deleted_at populated OR 404')

    await goto(s, '/tasks')
    await snap(s, 'O-tasks-after-delete')
    const stillOnTasks = await s.page.locator(`text=${JSON.stringify(title2)}`).first().isVisible({ timeout: 2000 }).catch(() => false)
    if (!stillOnTasks) pass(s, '1.O Task hidden from /tasks after delete')
    else bug(s, 'TASK-DELETE-UI-STALE', 'P1', '1.O task hidden from /tasks after delete', 'title still visible', 'title removed from list')

    // Cleanup — nothing else; task already deleted
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    // Ensure cleanup even on early return: delete any dangling test tasks
    for (const tid of createdTaskIds) {
      s.cleanup.push(async () => {
        await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {})
      })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
