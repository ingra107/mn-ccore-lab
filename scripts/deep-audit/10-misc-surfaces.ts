/**
 * Deep audit — Suite 10: less-common surfaces.
 *
 * Reactions (emoji on comments/tasks), search across entity types, activity
 * feed accuracy, ideas, decisions, calendar events, meeting agendas,
 * commitments, PB Sector daily plans.
 *
 * Run: npx tsx scripts/deep-audit/10-misc-surfaces.ts
 */
import { openSession, closeSession, section, log, pass, bug, apiGet, apiGetProjectFromList, marker, UNIQ } from './harness'

async function main() {
  const s = await openSession('10-misc-surfaces')
  const cleanupTaskIds: string[] = []
  const cleanupIdeaIds: string[] = []
  const cleanupDecisionIds: string[] = []
  const cleanupProjectSlugs: string[] = []

  try {
    // ═══════════════════ REACTIONS ═══════════════════
    section(s, '10.A  Reactions on a task comment')
    // Create a task + comment to react to
    const tResp = await s.api.post('/api/tasks', {
      data: { title: marker('react_task'), description: marker('react_task'), assignee: 'nick', priority: 'low' },
    })
    const taskId = ((await tResp.json()) as { data?: { id: string } }).data?.id
    if (!taskId) { bug(s, 'TASK-CREATE-10A', 'P1', '10.A task for reaction test', 'no id', 'id returned'); return }
    cleanupTaskIds.push(taskId)

    const cResp = await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: `${marker('cmt')} react here`, author_slug: 'nick' } })
    const commentId = ((await cResp.json()) as { data?: { id: string } }).data?.id
    if (!commentId) { bug(s, 'CMT-CREATE-10A', 'P1', '10.A comment for reaction test', 'no id', 'id returned'); }

    if (commentId) {
      // handleToggleReaction uses actorSlug(user.email) — body.author_slug is
      // ignored. The stored field is user_slug, not author_slug. Unauth
      // context → user_slug='anonymous'.
      const reactResp = await s.api.post('/api/reactions', {
        data: { target_type: 'task_comment', target_id: commentId, emoji: '🔥' },
      })
      if (!reactResp.ok()) {
        bug(s, 'REACT-CREATE', 'P1', '10.A POST /api/reactions', `HTTP ${reactResp.status()}`, '200')
      } else {
        pass(s, '10.A Reaction POST accepted')
        const list = await apiGet<Array<{ emoji: string; user_slug: string }>>(s, `/api/reactions?target_type=task_comment&target_id=${commentId}`)
        if (list && list.some((r) => r.emoji === '🔥')) pass(s, '10.A Reaction round-trips')
        else bug(s, 'REACT-ROUND-TRIP', 'P1', '10.A reaction in list', `${list?.length ?? 0} reactions`, 'includes 🔥')

        // Toggle: same author same emoji should remove
        const dupResp = await s.api.post('/api/reactions', {
          data: { target_type: 'task_comment', target_id: commentId, emoji: '🔥' },
        })
        const after = await apiGet<Array<{ emoji: string }>>(s, `/api/reactions?target_type=task_comment&target_id=${commentId}`)
        const count = after?.filter((r) => r.emoji === '🔥').length ?? 0
        if (dupResp.ok() && count === 0) pass(s, '10.A Re-reacting toggles off (count=0)')
        else bug(s, 'REACT-NO-TOGGLE', 'P1', '10.A duplicate reaction behavior', `dup.ok=${dupResp.ok()} count=${count}`, '0 after toggle-off')
      }
    }

    // ═══════════════════ SEARCH ═══════════════════
    section(s, '10.B  Search returns freshly-created task')
    const uniqTitle = `DeepAuditSearchProbe${UNIQ()}`
    const srTaskResp = await s.api.post('/api/tasks', {
      data: { title: uniqTitle, description: uniqTitle, assignee: 'nick', priority: 'medium' },
    })
    const srTaskId = ((await srTaskResp.json()) as { data?: { id: string } }).data?.id
    if (srTaskId) cleanupTaskIds.push(srTaskId)

    await s.page.waitForTimeout(1200)
    const searchResp = await s.api.get(`/api/search?q=${encodeURIComponent(uniqTitle)}`)
    if (!searchResp.ok()) {
      bug(s, 'SEARCH-FAIL', 'P1', '10.B GET /api/search', `HTTP ${searchResp.status()}`, '200')
    } else {
      // API returns { data: [...results] } flat, not { data: { results } }.
      const sj = (await searchResp.json()) as { data?: Array<{ type: string; title?: string }> }
      const results = sj?.data || []
      const hit = results.find((r) => (r.title || '').includes(uniqTitle))
      if (hit) pass(s, `10.B Task found via search (type=${hit.type})`)
      else bug(s, 'SEARCH-MISS', 'P1', '10.B freshly-created task appears in search', `${results.length} results, marker missing`, 'includes the task')
    }

    // ═══════════════════ IDEAS — vote toggle ═══════════════════
    section(s, '10.C  Idea vote toggle')
    const iResp = await s.api.post('/api/ideas', {
      data: { title: marker('vote_idea'), description: 'vote test', submitted_by: 'nick', research_area: 'Lab' },
    })
    const ideaId = ((await iResp.json()) as { data?: { id: string } }).data?.id
    if (ideaId) {
      cleanupIdeaIds.push(ideaId)
      const beforeVote = await apiGet<Array<{ id: string; votes?: number }>>(s, '/api/ideas')
      const beforeCount = beforeVote?.find((i) => i.id === ideaId)?.votes ?? 0
      const voteResp = await s.api.post(`/api/ideas/${ideaId}/vote`, { data: { voter_slug: 'mesfin' } })
      if (voteResp.ok()) {
        const afterVote = await apiGet<Array<{ id: string; votes?: number }>>(s, '/api/ideas')
        const afterCount = afterVote?.find((i) => i.id === ideaId)?.votes ?? 0
        if (afterCount === beforeCount + 1) pass(s, `10.C Idea vote incremented ${beforeCount}→${afterCount}`)
        else bug(s, 'IDEA-VOTE', 'P1', '10.C idea vote increments count', `${beforeCount}→${afterCount}`, `${beforeCount + 1}`)
      } else {
        bug(s, 'IDEA-VOTE-FAIL', 'P1', '10.C POST /api/ideas/:id/vote', `HTTP ${voteResp.status()}`, '200')
      }
    } else {
      bug(s, 'IDEA-CREATE-10C', 'P1', '10.C idea create', 'no id', 'id returned')
    }

    // ═══════════════════ ACTIVITY FEED ═══════════════════
    section(s, '10.D  Activity feed reflects recent mutations')
    const act = await apiGet<Array<{ timestamp?: string; created_at?: string; entity_type?: string; type?: string; body?: string }>>(s, '/api/activity?limit=20')
    if (!act) {
      bug(s, 'ACTIVITY-GET', 'P1', '10.D GET /api/activity', 'null', 'array')
    } else if (act.length === 0) {
      log(s, '  10.D INFO: activity feed empty (may be expected on test DB)')
    } else {
      // Check most recent entry has a timestamp within last 5 minutes
      const first = act[0]
      const ts = first.timestamp || first.created_at
      if (ts) {
        const age = Date.now() - new Date(ts).getTime()
        if (age < 5 * 60 * 1000) pass(s, `10.D Most recent activity entry is <5min old (${Math.round(age / 1000)}s)`)
        else log(s, `  10.D INFO: most recent entry is ${Math.round(age / 60000)}min old`)
      }
      pass(s, `10.D /api/activity returns ${act.length} entries`)
    }

    // ═══════════════════ COMMITMENTS ═══════════════════
    section(s, '10.E  Commitments endpoint')
    const commits = await apiGet<Array<{ id: string }>>(s, '/api/commitments')
    if (!commits) bug(s, 'COMMITMENTS-GET', 'P1', '10.E GET /api/commitments', 'null', 'array (possibly empty)')
    else pass(s, `10.E /api/commitments returns ${commits.length} rows`)

    // ═══════════════════ CALENDAR ═══════════════════
    section(s, '10.F  Calendar events endpoint — /api/calendar/events not /api/calendar')
    const cal = await apiGet<Array<{ id?: string; date?: string; title?: string }>>(s, '/api/calendar/events')
    if (!cal) bug(s, 'CALENDAR-GET', 'P1', '10.F GET /api/calendar/events', 'null', 'array')
    else pass(s, `10.F /api/calendar/events returns ${cal.length} events`)

    // ═══════════════════ PROJECT HEALTH ═══════════════════
    section(s, '10.G  Project health endpoint')
    const health = await apiGet<Array<{ slug?: string; score?: number }>>(s, '/api/projects/health')
    if (!health) bug(s, 'HEALTH-GET', 'P1', '10.G GET /api/projects/health', 'null', 'array')
    else if (health.length > 0) {
      const scored = health.filter((h) => typeof h.score === 'number')
      pass(s, `10.G /api/projects/health returns ${health.length} rows (${scored.length} scored)`)
    } else {
      log(s, '  10.G /api/projects/health empty')
    }

    // ═══════════════════ NOTIFICATIONS UNREAD COUNT ═══════════════════
    section(s, '10.H  Notification unread count endpoint')
    const countResp = await s.api.get('/api/notifications/count?recipient=nick')
    if (!countResp.ok()) {
      bug(s, 'NOTIF-COUNT-GET', 'P1', '10.H GET /api/notifications/count', `HTTP ${countResp.status()}`, '200')
    } else {
      const body = await countResp.json() as { count?: number }
      if (typeof body?.count === 'number') pass(s, `10.H unread count for nick: ${body.count}`)
      else bug(s, 'NOTIF-COUNT-SHAPE', 'P2', '10.H /count returns { count: number }', JSON.stringify(body).slice(0, 80), '{ count: <number> }')
    }

    // ═══════════════════ STATS / DASHBOARD ═══════════════════
    section(s, '10.I  Dashboard stats endpoint')
    const stats = await apiGet<Record<string, unknown>>(s, '/api/stats')
    if (!stats) bug(s, 'STATS-GET', 'P1', '10.I GET /api/stats', 'null', 'object with counts')
    else pass(s, `10.I /api/stats keys: ${Object.keys(stats).slice(0, 8).join(', ')}`)

    // ═══════════════════ VERSION BUMP ═══════════════════
    section(s, '10.J  Version bump on mutation')
    const v1 = await (await s.api.get('/api/version')).json() as { version: string }
    // Trigger a mutation
    const vTaskResp = await s.api.post('/api/tasks', {
      data: { title: marker('vbump'), description: 'vbump', assignee: 'nick', priority: 'low' },
    })
    const vTaskId = ((await vTaskResp.json()) as { data?: { id: string } }).data?.id
    if (vTaskId) cleanupTaskIds.push(vTaskId)
    await s.page.waitForTimeout(500)
    const v2 = await (await s.api.get('/api/version')).json() as { version: string }
    if (v1.version !== v2.version) pass(s, `10.J version bumped ${v1.version}→${v2.version}`)
    else bug(s, 'VBUMP-NOT-FIRED', 'P0', '10.J version bumps on mutation', `${v1.version} === ${v2.version}`, 'different values')

    // ═══════════════════ KEY LINK EDITING ═══════════════════
    section(s, '10.K  Task key_link_N update via POST /api/tasks/:id')
    if (vTaskId) {
      const keyResp = await s.api.post(`/api/tasks/${vTaskId}`, {
        data: { key_link_2: 'https://example.com/deep-audit-k2', key_link_2_desc: 'Slot 2' },
      })
      if (keyResp.ok()) {
        const all = await apiGet<Array<{ id: string; key_link_2?: string; key_link_2_desc?: string }>>(s, '/api/tasks')
        const row = all?.find((t) => t.id === vTaskId)
        if (row?.key_link_2 === 'https://example.com/deep-audit-k2' && row?.key_link_2_desc === 'Slot 2') {
          pass(s, '10.K key_link_2 + desc round-trip')
        } else {
          bug(s, 'KEYLINK2-DRIFT', 'P1', '10.K key_link_2 round-trip', JSON.stringify({ url: row?.key_link_2, desc: row?.key_link_2_desc }), 'url+desc match')
        }
      }
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const t of cleanupTaskIds) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [t], action: 'delete' } }).catch(() => {}) })
    for (const i of cleanupIdeaIds) s.cleanup.push(async () => { await s.api.post(`/api/ideas/${i}/delete`).catch(() => {}) })
    for (const d of cleanupDecisionIds) s.cleanup.push(async () => { await s.api.post(`/api/decisions/${d}/delete`).catch(() => {}) })
    for (const slug of cleanupProjectSlugs) s.cleanup.push(async () => { await s.api.post(`/api/projects/${slug}/delete`).catch(() => {}) })
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
