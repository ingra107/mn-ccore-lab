/**
 * Deep audit — Suite 8: Overlap traps.
 *
 * Confirm the system behaves sanely when data collides:
 *   - Duplicate project title → different slug? or rejected?
 *   - Duplicate project with same slug → reject or upsert?
 *   - Create task referencing a nonexistent project_id → silent store or reject?
 *   - Reassign task to nonexistent assignee slug → silent store or reject?
 *   - Delete project with tasks still linked → tasks orphaned or rejected?
 *   - Post comment with blank content → 400?
 *   - Very long title (500+ chars) → stored in full? truncated? rejected?
 *   - Unicode title with emoji → preserved through API + UI reload?
 *
 * Run: npx tsx scripts/deep-audit/08-overlap-traps.ts
 */
import { openSession, closeSession, section, log, pass, bug, UNIQ, marker, apiGetProjectFromList } from './harness'

async function main() {
  const s = await openSession('08-overlap-traps')
  const cleanupTasks: string[] = []
  const cleanupProjects: string[] = []

  try {
    // ─────────────────────────────────────────────────────────
    // Trap 1: duplicate project TITLE — should get unique slug (suffix, number, etc.)
    // ─────────────────────────────────────────────────────────
    section(s, '8.A  Duplicate project title gets distinct slug')
    const sharedTitle = `Overlap Trap ${UNIQ()}`
    const r1 = await s.api.post('/api/projects', { data: { title: sharedTitle, category: 'lab', status: 'active', stage: 'Idea' } })
    const r2 = await s.api.post('/api/projects', { data: { title: sharedTitle, category: 'lab', status: 'active', stage: 'Idea' } })
    if (!r1.ok() || !r2.ok()) {
      bug(s, 'DUP-PROJ-CREATE-FAIL', 'P1', '8.A Two creates with same title both succeed', `r1=${r1.status()} r2=${r2.status()}`, '200 + 200 (second gets unique slug)')
    } else {
      const s1 = ((await r1.json()) as { data?: { slug: string } }).data?.slug
      const s2 = ((await r2.json()) as { data?: { slug: string } }).data?.slug
      if (s1) cleanupProjects.push(s1)
      if (s2) cleanupProjects.push(s2)
      if (s1 && s2 && s1 !== s2) pass(s, `8.A Distinct slugs generated: ${s1} vs ${s2}`)
      else if (s1 === s2) bug(s, 'DUP-PROJ-SAME-SLUG', 'P0', '8.A Distinct slugs for duplicate title', `both got ${s1}`, 's1 !== s2')
      else bug(s, 'DUP-PROJ-NO-SLUG', 'P0', '8.A Both projects have slugs', JSON.stringify([s1, s2]), 'two non-null distinct strings')
    }

    // ─────────────────────────────────────────────────────────
    // Trap 2: Attempt to create with EXPLICIT duplicate slug
    // ─────────────────────────────────────────────────────────
    section(s, '8.B  Explicit duplicate slug in payload — server must prevent collision')
    const firstSlug = cleanupProjects[0]
    if (firstSlug) {
      const r3 = await s.api.post('/api/projects', { data: { title: `Collider ${UNIQ()}`, slug: firstSlug, category: 'lab', status: 'active', stage: 'Idea' } })
      if (r3.ok()) {
        // Read back — did it actually use our requested slug (overwriting the first) or make a new one?
        const body = ((await r3.json()) as { data?: { slug: string } }).data
        const returnedSlug = body?.slug
        if (returnedSlug === firstSlug) {
          bug(s, 'DUP-SLUG-ACCEPTED', 'P0', '8.B Explicit slug collision prevented', `second create stored slug=${firstSlug}, may have overwritten first`, 'reject OR generate distinct slug')
          if (returnedSlug) cleanupProjects.push(returnedSlug)
        } else if (returnedSlug) {
          pass(s, `8.B Server side-stepped collision: returned slug=${returnedSlug} instead of ${firstSlug}`)
          cleanupProjects.push(returnedSlug)
        }
      } else {
        pass(s, `8.B Server rejected duplicate slug with HTTP ${r3.status()}`)
      }
    }

    // ─────────────────────────────────────────────────────────
    // Trap 3: Task with nonexistent project_id — accepted silently or rejected?
    // ─────────────────────────────────────────────────────────
    section(s, '8.C  Task referencing nonexistent project_id')
    const bogusProject = `project-does-not-exist-${UNIQ()}`
    const r4 = await s.api.post('/api/tasks', {
      data: {
        title: marker('dangling_ref'),
        description: 'dangling ref test',
        assignee: 'nick',
        priority: 'medium',
        project_id: bogusProject,
      },
    })
    if (r4.ok()) {
      const t = ((await r4.json()) as { data?: { id: string; project_id: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.project_id === bogusProject) {
        bug(s, 'TASK-DANGLING-PROJECT', 'P1', '8.C task with bogus project_id', 'accepted and stored', 'reject OR set project_id=null')
      } else {
        pass(s, `8.C Server dropped bogus project_id → stored as ${JSON.stringify(t?.project_id)}`)
      }
    } else {
      pass(s, `8.C Server rejected bogus project_id with HTTP ${r4.status()}`)
    }

    // ─────────────────────────────────────────────────────────
    // Trap 4: Task with nonexistent assignee
    // ─────────────────────────────────────────────────────────
    section(s, '8.D  Task assigned to nonexistent user')
    const r5 = await s.api.post('/api/tasks', {
      data: {
        title: marker('bogus_assignee'),
        description: 'bogus assignee test',
        assignee: 'not_a_real_person_xyz',
        priority: 'low',
      },
    })
    if (r5.ok()) {
      const t = ((await r5.json()) as { data?: { id: string; assignee: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.assignee === 'not_a_real_person_xyz') {
        bug(s, 'TASK-BOGUS-ASSIGNEE', 'P2', '8.D task with bogus assignee stored', 'accepted as-is', 'reject OR map to default')
      } else {
        pass(s, `8.D Server normalized bogus assignee → ${JSON.stringify(t?.assignee)}`)
      }
    } else {
      pass(s, `8.D Server rejected bogus assignee with HTTP ${r5.status()}`)
    }

    // ─────────────────────────────────────────────────────────
    // Trap 5: Delete project with tasks still linked — tasks become orphans?
    // ─────────────────────────────────────────────────────────
    section(s, '8.E  Delete project that has linked tasks')
    if (firstSlug) {
      // Ensure at least one task is linked
      const linkTaskResp = await s.api.post('/api/tasks', {
        data: { title: marker('linked_at_delete'), description: 'linked task', assignee: 'nick', priority: 'medium', project_id: firstSlug },
      })
      const linkedTaskId = ((await linkTaskResp.json()) as { data?: { id: string } }).data?.id
      if (linkedTaskId) cleanupTasks.push(linkedTaskId)

      const delResp = await s.api.post(`/api/projects/${firstSlug}/delete`)
      if (!delResp.ok()) {
        bug(s, 'PROJ-DELETE-WITH-TASKS', 'P1', '8.E delete project with linked tasks', `HTTP ${delResp.status()}`, '200 (tasks orphan) or 409 (reject)')
      } else {
        pass(s, '8.E Project delete accepted despite linked tasks')
        // Now check the orphan task — does it still exist? with what project_id?
        if (linkedTaskId) {
          const after = await s.api.get('/api/tasks')
          const list = ((await after.json()) as { data?: Array<{ id: string; project_id: string | null }> }).data ?? []
          const orphan = list.find((t) => t.id === linkedTaskId)
          if (!orphan) pass(s, '8.E Linked task auto-deleted with its project')
          else if (orphan.project_id === firstSlug) bug(s, 'TASK-ORPHAN-DANGLING-REF', 'P1', '8.E deleted-project task has dangling project_id', `project_id=${orphan.project_id}`, 'null (project gone) OR task deleted')
          else if (orphan.project_id === null) pass(s, '8.E Task retained, project_id reset to null (good orphan handling)')
          else pass(s, `8.E Task retained with project_id=${orphan.project_id} (remapped)`)
        }
      }
      // Remove from cleanup list since already deleted
      const idx = cleanupProjects.indexOf(firstSlug)
      if (idx >= 0) cleanupProjects.splice(idx, 1)
    }

    // ─────────────────────────────────────────────────────────
    // Trap 6: Blank content comment
    // ─────────────────────────────────────────────────────────
    section(s, '8.F  Blank content comment should reject')
    // Need a fresh project
    const pTemp = await s.api.post('/api/projects', { data: { title: `BlankCmt ${UNIQ()}`, category: 'lab', status: 'active', stage: 'Idea' } })
    const pTempSlug = ((await pTemp.json()) as { data?: { slug: string } }).data?.slug
    if (pTempSlug) cleanupProjects.push(pTempSlug)
    if (pTempSlug) {
      const blank = await s.api.post(`/api/projects/${pTempSlug}/comments`, { data: { content: '   ' } })
      if (blank.status() === 400) pass(s, '8.F Blank comment rejected with 400')
      else if (blank.ok()) bug(s, 'BLANK-COMMENT-ACCEPTED', 'P1', '8.F blank-whitespace comment rejected', `HTTP ${blank.status()}`, '400')
      else log(s, `  INFO: 8.F blank comment returned ${blank.status()} (not 400, not success)`)
    }

    // ─────────────────────────────────────────────────────────
    // Trap 7: Very long title (500 chars)
    // ─────────────────────────────────────────────────────────
    section(s, '8.G  Very long title — stored intact?')
    const longTitle = marker('longtitle') + 'A'.repeat(500)
    const rLong = await s.api.post('/api/tasks', {
      data: { title: longTitle, description: longTitle, assignee: 'nick', priority: 'low' },
    })
    if (rLong.ok()) {
      const t = ((await rLong.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.title === longTitle) pass(s, `8.G Long title stored intact (${longTitle.length} chars)`)
      else bug(s, 'LONG-TITLE-TRUNCATED', 'P2', '8.G long title round-trips', `length=${t?.title?.length}`, String(longTitle.length))
    } else {
      bug(s, 'LONG-TITLE-REJECTED', 'P2', '8.G long title accepted', `HTTP ${rLong.status()}`, '200')
    }

    // ─────────────────────────────────────────────────────────
    // Trap 8: Unicode + emoji in title — preserved?
    // ─────────────────────────────────────────────────────────
    section(s, '8.H  Unicode + emoji in task title')
    const emojiTitle = `${marker('emoji')} 🧬 ICU outcome — α/β/γ model (α=0.05) 日本語`
    const rEmo = await s.api.post('/api/tasks', {
      data: { title: emojiTitle, description: emojiTitle, assignee: 'nick', priority: 'low' },
    })
    if (rEmo.ok()) {
      const t = ((await rEmo.json()) as { data?: { id: string; title: string } }).data
      if (t?.id) cleanupTasks.push(t.id)
      if (t?.title === emojiTitle) pass(s, '8.H Unicode+emoji title round-trips exactly')
      else bug(s, 'UNICODE-TITLE-DRIFT', 'P1', '8.H unicode+emoji round-trip', String(t?.title), emojiTitle)
    }

    // ─────────────────────────────────────────────────────────
    // Trap 9: Rapid fire updates — no orphan state
    // ─────────────────────────────────────────────────────────
    section(s, '8.I  Rapid-fire status cycle (todo→in_progress→done→todo)')
    const rapidTask = await s.api.post('/api/tasks', {
      data: { title: marker('rapid'), description: 'rapid cycle test', assignee: 'nick', priority: 'medium' },
    })
    if (rapidTask.ok()) {
      const rt = ((await rapidTask.json()) as { data?: { id: string } }).data
      const rid = rt?.id
      if (rid) {
        cleanupTasks.push(rid)
        // Fire 4 status changes in immediate succession
        const p1 = s.api.post(`/api/tasks/${rid}/status`, { data: { status: 'in_progress' } })
        const p2 = s.api.post(`/api/tasks/${rid}/status`, { data: { status: 'done' } })
        const p3 = s.api.post(`/api/tasks/${rid}/status`, { data: { status: 'todo' } })
        const p4 = s.api.post(`/api/tasks/${rid}/status`, { data: { status: 'blocked' } })
        const results = await Promise.all([p1, p2, p3, p4])
        const allOk = results.every((r) => r.ok())
        if (allOk) pass(s, '8.I All 4 rapid status changes accepted')
        else bug(s, 'RAPID-STATUS-FAIL', 'P2', '8.I rapid status changes all accepted', results.map(r => r.status()).join(','), '200,200,200,200')

        // Read back — which status "won"?
        await s.page.waitForTimeout(500)
        const after = await s.api.get('/api/tasks')
        const row = ((await after.json()) as { data?: Array<{ id: string; status: string }> }).data?.find((t) => t.id === rid)
        log(s, `  8.I final status: ${row?.status} (any of in_progress/done/todo/blocked acceptable)`)
      }
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    for (const slug of cleanupProjects) s.cleanup.push(async () => { await s.api.post(`/api/projects/${slug}/delete`).catch(() => {}) })
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
