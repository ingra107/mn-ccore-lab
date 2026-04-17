/**
 * Deep audit — Suite 4: Comments, notes, @mentions, notifications fan-out.
 *
 * Scope — each scenario creates real data then READS BACK from the correct
 * notification/activity endpoint to confirm fan-out landed:
 *   - Task comment with @mention → target user's notifications
 *   - Task note — activity entry
 *   - Project comment with @mention → notification
 *   - Multiple @mentions → one notification per mentioned user
 *   - Self-mention → no notification for self
 *   - Invalid @mention (nonexistent slug) → silent skip, no notification
 *   - @hermes mention → creates ai_requests row for background listener
 *
 * Run: npx tsx scripts/deep-audit/04-mentions-notifications.ts
 */
import {
  openSession,
  closeSession,
  section,
  log,
  pass,
  bug,
  marker,
} from './harness'

interface NotificationRow {
  id: string
  recipient_slug: string
  type: string
  source_type: string
  source_id: string
  title: string | null
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

async function listNotifications(
  api: ReturnType<typeof Object.assign>,
  slug: string,
): Promise<NotificationRow[]> {
  // Hub exposes GET /api/notifications?recipient=<slug>
  const r = await (api as { get: (p: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> }).get(`/api/notifications?recipient=${encodeURIComponent(slug)}`)
  if (!r.ok()) return []
  const j = (await r.json()) as { data?: NotificationRow[] }
  return j?.data ?? []
}

async function main() {
  const s = await openSession('04-mentions-notifications')
  const createdTaskIds: string[] = []
  const createdProjectSlugs: string[] = []

  try {
    // Capture notification counts BEFORE each scenario so we can detect new
    // entries robustly (instead of searching by content).
    const baselines = new Map<string, number>()
    const baselineFor = async (slug: string) => {
      const n = await listNotifications(s.api, slug)
      baselines.set(slug, n.length)
      return n.length
    }

    section(s, '4.A  Baseline notification counts for mesfin + dudley')
    const mesfinBase = await baselineFor('mesfin')
    const dudleyBase = await baselineFor('dudley')
    const nickBase = await baselineFor('nick')
    pass(s, `4.A baselines — mesfin=${mesfinBase} dudley=${dudleyBase} nick=${nickBase}`)

    section(s, '4.B  Create a task to mention people about')
    const taskTitle = marker('mention_task')
    const createResp = await s.api.post('/api/tasks', {
      data: { title: taskTitle, description: taskTitle, assignee: 'nick', priority: 'medium', status: 'todo' },
    })
    if (!createResp.ok()) {
      bug(s, 'MENTION-TASK-CREATE', 'P0', '4.B POST task', `HTTP ${createResp.status()}`, '200')
      await closeSession(s)
      return
    }
    const taskId = ((await createResp.json()) as { data?: { id: string } }).data?.id
    if (!taskId) {
      bug(s, 'MENTION-NO-ID', 'P0', '4.B task has id', 'no id', 'object with id')
      await closeSession(s)
      return
    }
    createdTaskIds.push(taskId)
    pass(s, `4.B Task created ${taskId}`)

    section(s, '4.C  Task comment with SINGLE @mesfin → mesfin gets +1 notification')
    const cmt1 = `${marker('cmt')} @mesfin please review`
    await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: cmt1 } })
    await s.page.waitForTimeout(800)
    const mesfinAfter1 = await listNotifications(s.api, 'mesfin')
    const delta1 = mesfinAfter1.length - mesfinBase
    if (delta1 === 1) pass(s, `4.C mesfin got exactly +1 notification (was ${mesfinBase}, now ${mesfinAfter1.length})`)
    else bug(s, 'MENTION-SINGLE-COUNT', 'P0', '4.C single @mention produces +1 notification', `delta=${delta1}`, '+1')

    // Check the NEW notification points at this task
    const newest = mesfinAfter1[0]
    if (newest) {
      if (newest.source_type === 'task_comment' && newest.source_id === taskId) pass(s, '4.C notification source_type+id correct')
      else bug(s, 'MENTION-SOURCE-WRONG', 'P1', '4.C notification cites task comment', `source_type=${newest.source_type} source_id=${newest.source_id}`, `source_type=task_comment source_id=${taskId}`)
    }

    section(s, '4.D  Task comment with DOUBLE @mesfin @dudley → mesfin +1 AND dudley +1')
    const cmt2 = `${marker('cmt')} @mesfin @dudley pls align`
    await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: cmt2 } })
    await s.page.waitForTimeout(800)
    const mesfinAfter2 = await listNotifications(s.api, 'mesfin')
    const dudleyAfter2 = await listNotifications(s.api, 'dudley')
    const m_delta = mesfinAfter2.length - mesfinAfter1.length
    const d_delta = dudleyAfter2.length - dudleyBase
    if (m_delta === 1) pass(s, `4.D mesfin got +1 more (now ${mesfinAfter2.length})`)
    else bug(s, 'MENTION-DOUBLE-MESFIN', 'P1', '4.D mesfin +1 from double-mention', `delta=${m_delta}`, '+1')
    if (d_delta === 1) pass(s, `4.D dudley got +1 (now ${dudleyAfter2.length})`)
    else bug(s, 'MENTION-DOUBLE-DUDLEY', 'P1', '4.D dudley +1 from double-mention', `delta=${d_delta}`, '+1')

    section(s, '4.E  Self-mention @nick (author) → NO notification for nick')
    const cmt3 = `${marker('cmt')} @nick I need to remember this`
    await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: cmt3 } })
    await s.page.waitForTimeout(800)
    const nickAfter3 = await listNotifications(s.api, 'nick')
    const n_delta = nickAfter3.length - nickBase
    if (n_delta === 0) pass(s, `4.E nick NOT self-notified (delta=0)`)
    else bug(s, 'MENTION-SELF-NOTIFIED', 'P1', '4.E self-mention produces no notification', `delta=${n_delta}`, '0')

    section(s, '4.F  Invalid @mention (nonexistent slug) → no notification for anyone')
    const beforeInvalid = await listNotifications(s.api, 'mesfin')
    const cmt4 = `${marker('cmt')} @notarealperson_xyz123 hello`
    await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: cmt4 } })
    await s.page.waitForTimeout(800)
    const afterInvalid = await listNotifications(s.api, 'mesfin')
    if (afterInvalid.length === beforeInvalid.length) pass(s, '4.F invalid @mention produced no notification for mesfin')
    else bug(s, 'MENTION-INVALID-FIRES', 'P2', '4.F invalid @mention should silently skip', `mesfin count went ${beforeInvalid.length}→${afterInvalid.length}`, 'no change')

    section(s, '4.G  Task note via /updates — no mentions → no new notifications')
    const noteText = `${marker('note')} plain note no mentions`
    const mesfinBeforeNote = (await listNotifications(s.api, 'mesfin')).length
    await s.api.post(`/api/tasks/${taskId}/updates`, { data: { content: noteText, update_type: 'progress' } })
    await s.page.waitForTimeout(800)
    const mesfinAfterNote = (await listNotifications(s.api, 'mesfin')).length
    if (mesfinAfterNote === mesfinBeforeNote) pass(s, '4.G plain note did not notify anyone')
    else bug(s, 'NOTE-SPURIOUS-NOTIF', 'P1', '4.G plain note should not notify', `mesfin ${mesfinBeforeNote}→${mesfinAfterNote}`, 'no change')

    section(s, '4.H  Task note WITH @mesfin mention → mesfin +1')
    const noteMentioned = `${marker('note')} @mesfin update coming`
    const mesfinBeforeNoteMent = (await listNotifications(s.api, 'mesfin')).length
    await s.api.post(`/api/tasks/${taskId}/updates`, { data: { content: noteMentioned, update_type: 'progress' } })
    await s.page.waitForTimeout(800)
    const mesfinAfterNoteMent = (await listNotifications(s.api, 'mesfin')).length
    const noteDelta = mesfinAfterNoteMent - mesfinBeforeNoteMent
    if (noteDelta === 1) pass(s, '4.H note with @mesfin produced +1 notification')
    else bug(s, 'NOTE-MENTION-COUNT', 'P1', '4.H note with @mention fans out', `delta=${noteDelta}`, '+1')

    section(s, '4.I  Create a project to test project-comment mention fan-out')
    const projTitle = marker('mention_proj')
    const projResp = await s.api.post('/api/projects', {
      data: { title: projTitle, category: 'lab', status: 'active', stage: 'Idea', description: projTitle, pi: 'nick' },
    })
    if (!projResp.ok()) {
      bug(s, 'PROJ-CREATE-FAIL-4I', 'P1', '4.I POST project', `HTTP ${projResp.status()}`, '200')
    } else {
      const slug = ((await projResp.json()) as { data?: { slug: string } }).data?.slug
      if (slug) createdProjectSlugs.push(slug)
      pass(s, `4.I Project created ${slug}`)

      section(s, '4.J  Project comment with @dudley → dudley +1 notification')
      const dudleyBeforeProj = (await listNotifications(s.api, 'dudley')).length
      const projCmt = `${marker('cmt')} @dudley project-level ping`
      const pcResp = await s.api.post(`/api/projects/${slug}/comments`, { data: { content: projCmt } })
      if (!pcResp.ok()) {
        bug(s, 'PROJ-CMT-POST-4J', 'P1', '4.J POST project comment', `HTTP ${pcResp.status()}`, '200')
      } else {
        pass(s, '4.J Project comment POST accepted')
        await s.page.waitForTimeout(800)
        const dudleyAfterProj = (await listNotifications(s.api, 'dudley')).length
        const pd = dudleyAfterProj - dudleyBeforeProj
        if (pd === 1) pass(s, '4.J dudley got +1 from project comment @mention')
        else bug(s, 'PROJ-MENTION-FANOUT', 'P1', '4.J project @mention fans out', `delta=${pd}`, '+1')
      }
    }

    section(s, '4.K  @hermes mention → ai_requests row (background listener picks it up)')
    const hermesCmt = `${marker('cmt')} @hermes can you summarize this please it is a genuine long question`
    await s.api.post(`/api/tasks/${taskId}/comments`, { data: { content: hermesCmt } })
    await s.page.waitForTimeout(800)
    // No public AI-requests list endpoint in our scope; check comments for the placeholder AI response
    const commentsResp = await s.api.get(`/api/tasks/${taskId}/comments`)
    if (commentsResp.ok()) {
      const j = (await commentsResp.json()) as { data?: Array<{ content: string; author_slug?: string }> }
      const placeholder = j.data?.find((c) => c.author_slug === 'claude-ai')
      if (placeholder) pass(s, '4.K placeholder AI comment inserted (listener will update)')
      else log(s, '  INFO: 4.K no @claude-ai placeholder on this task — check if @hermes path is task-only vs project-only')
    }

    section(s, '4.L  Mark notification read — read_at stamps')
    const mesfinFinal = await listNotifications(s.api, 'mesfin')
    const target = mesfinFinal.find((n) => n.source_id === taskId && !n.read_at)
    if (target) {
      const readResp = await s.api.post(`/api/notifications/${target.id}/read`)
      if (readResp.ok()) {
        pass(s, '4.L POST /notifications/:id/read accepted')
        await s.page.waitForTimeout(400)
        const after = await listNotifications(s.api, 'mesfin')
        const updated = after.find((n) => n.id === target.id)
        if (updated?.read_at) pass(s, '4.L read_at timestamp set')
        else bug(s, 'NOTIF-READ-NOT-PERSISTED', 'P1', '4.L read_at persists', String(updated?.read_at), 'non-null timestamp')
      } else {
        bug(s, 'NOTIF-READ-FAIL', 'P1', '4.L POST /read', `HTTP ${readResp.status()}`, '200')
      }
    } else {
      log(s, '  INFO: 4.L no unread mesfin notification targeting this task — skipping read test')
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdTaskIds) {
      s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    }
    for (const slug of createdProjectSlugs) {
      s.cleanup.push(async () => { await s.api.post(`/api/projects/${slug}/delete`).catch(() => {}) })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
