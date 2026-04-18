/**
 * Deep audit — Suite 3: Content entity lifecycles.
 *
 * Meetings (with action items), grants (read + milestones), questions
 * (AskTheLab), paper revisions, digest.
 *
 * Pattern: create → readback → edit fields → verify persist → delete.
 *
 * Run: npx tsx scripts/deep-audit/03-content-entities.ts
 */
import { openSession, closeSession, section, log, pass, bug, apiGet, marker } from './harness'

async function main() {
  const s = await openSession('03-content-entities')
  const cleanupMeetings: string[] = []
  const cleanupQuestions: string[] = []

  try {
    // ═══════════════════ MEETINGS ═══════════════════
    section(s, '3.A  Meeting lifecycle — create + action items')
    const mTitle = marker('mtg')
    const mResp = await s.api.post('/api/meetings', {
      data: { title: mTitle, date: '2026-05-01', summary: 'deep audit meeting' },
    })
    if (!mResp.ok()) {
      bug(s, 'MTG-CREATE-FAIL', 'P1', '3.A POST /api/meetings', `HTTP ${mResp.status()}`, '200')
    } else {
      const mb = (await mResp.json()) as { data?: { id: string; title: string; date: string; summary: string } }
      const meeting = mb.data
      if (!meeting?.id) {
        bug(s, 'MTG-NO-ID', 'P1', '3.A meeting has id', JSON.stringify(mb).slice(0, 120), 'data.id present')
      } else {
        cleanupMeetings.push(meeting.id)
        pass(s, `3.A Meeting ${meeting.id} created`)
        if (meeting.title === mTitle) pass(s, '3.A title echoed')
        else bug(s, 'MTG-TITLE-ECHO', 'P1', '3.A title echo', meeting.title, mTitle)
        if (meeting.date === '2026-05-01') pass(s, '3.A date echoed')
        else bug(s, 'MTG-DATE-ECHO', 'P1', '3.A date echo', meeting.date, '2026-05-01')

        const allMtgs = await apiGet<Array<{ id: string; title: string }>>(s, '/api/meetings')
        const found = allMtgs?.find((x) => x.id === meeting.id)
        if (found?.title === mTitle) pass(s, '3.A Meeting appears in /api/meetings list')
        else bug(s, 'MTG-LIST-MISSING', 'P1', '3.A meeting in list', `found=${!!found}`, `title=${mTitle}`)

        // Action item — linked task
        section(s, '3.B  Meeting action item creates linked task')
        const aTitle = marker('action')
        const aResp = await s.api.post('/api/tasks', {
          data: {
            title: aTitle, description: aTitle, assignee: 'nick', priority: 'medium',
            meeting_id: meeting.id, source: 'meeting',
          },
        })
        if (aResp.ok()) {
          const ab = (await aResp.json()) as { data?: { id: string; meeting_id: string; source: string } }
          if (ab?.data?.meeting_id === meeting.id) pass(s, '3.B Action-item task linked via meeting_id')
          else bug(s, 'MTG-ACTION-LINK-DRIFT', 'P1', '3.B action task meeting_id=meeting.id', String(ab?.data?.meeting_id), meeting.id)
          if (ab?.data?.source === 'meeting') pass(s, '3.B source=meeting on action task')
          else bug(s, 'MTG-ACTION-SOURCE', 'P2', '3.B action task source=meeting', String(ab?.data?.source), 'meeting')

          const filtered = await apiGet<Array<{ id: string }>>(s, `/api/tasks?meeting=${meeting.id}`)
          if (filtered?.some((t) => t.id === ab?.data?.id)) pass(s, '3.B /api/tasks?meeting filter returns action item')
          else bug(s, 'MTG-TASK-FILTER', 'P1', '3.B tasks meeting filter', `${filtered?.length ?? 0} tasks for this meeting`, 'includes action task')

          if (ab?.data?.id) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [ab.data!.id], action: 'delete' } }).catch(() => {}) })
        }
      }
    }

    // ═══════════════════ GRANTS (read-only on Hub) ═══════════════════
    section(s, '3.C  Grant endpoint responds (no POST /api/grants by design)')
    const existingGrants = await apiGet<Array<{ id: string; status: string }>>(s, '/api/grants')
    if (!existingGrants) {
      bug(s, 'GRANT-READ-FAIL', 'P1', '3.C GET /api/grants', 'null', 'array (possibly empty)')
    } else {
      pass(s, `3.C /api/grants returned ${existingGrants.length} rows`)
    }

    // ═══════════════════ QUESTIONS (AskTheLab) ═══════════════════
    section(s, '3.F  Ask-the-lab question lifecycle')
    const qText = `${marker('question')} how does CLIF v3.0 handle respiratory support transitions?`
    const qResp = await s.api.post('/api/questions', { data: { question: qText, asked_by: 'nick' } })
    if (!qResp.ok()) {
      bug(s, 'QUESTION-CREATE', 'P1', '3.F POST /api/questions', `HTTP ${qResp.status()}`, '200')
    } else {
      const qb = (await qResp.json()) as { data?: { id: string } }
      if (qb?.data?.id) {
        cleanupQuestions.push(qb.data.id)
        pass(s, `3.F Question ${qb.data.id} created`)

        section(s, '3.G  Answer the question (body uses "content", not "answer")')
        const aResp = await s.api.post(`/api/questions/${qb.data.id}/answers`, {
          data: { content: `${marker('answer')} CLIF v3 introduces a new hospital_transitions table`, author_slug: 'nate' },
        })
        if (aResp.ok()) pass(s, '3.G Answer POST accepted')
        else bug(s, 'QUESTION-ANSWER-POST', 'P1', '3.G POST /api/questions/:id/answers', `HTTP ${aResp.status()}`, '200')

        const answers = await apiGet<Array<{ id: string; content: string }>>(s, `/api/questions/${qb.data.id}/answers`)
        if (answers && answers.length > 0) pass(s, `3.G GET /answers returns ${answers.length} row(s)`)
        else bug(s, 'QUESTION-ANSWER-GET', 'P1', '3.G GET /answers after POST', `${answers?.length ?? 0}`, '>=1')
      }
    }

    // ═══════════════════ REVISIONS ═══════════════════
    section(s, '3.H  Paper revision tracking — POST /api/revisions (not /api/projects/:slug/revisions)')
    const projects = await apiGet<Array<{ slug: string; title: string; stage?: string }>>(s, '/api/projects')
    const writingProj = projects?.find((p) => p.stage === 'Writing') || projects?.[0]
    if (!writingProj) {
      log(s, '  3.H SKIP — no project available to test revisions against')
    } else {
      const revResp = await s.api.post('/api/revisions', {
        data: {
          project_slug: writingProj.slug,
          round: 1,
          journal: 'Critical Care Medicine',
          reviewer_comments: `${marker('rev')} focal point: statistics`,
        },
      })
      if (revResp.ok()) {
        const rb = (await revResp.json()) as { data?: { id: string } }
        if (rb?.data?.id) {
          pass(s, `3.H Revision ${rb.data.id} created on ${writingProj.slug}`)
          const all = await apiGet<Array<{ id: string; round: number }>>(s, `/api/projects/${writingProj.slug}/revisions`)
          if (all?.some((r) => r.id === rb.data?.id)) pass(s, '3.H Revision in /projects/:slug/revisions list')
          else bug(s, 'REV-LIST-MISSING', 'P1', '3.H revision in list', `${all?.length ?? 0} revisions`, 'includes new')
        }
      } else {
        bug(s, 'REV-CREATE-FAIL', 'P2', '3.H POST /api/revisions', `HTTP ${revResp.status()}`, '200')
      }
    }

    // ═══════════════════ DIGEST ═══════════════════
    section(s, '3.I  Digest papers endpoint — save/dismiss (uses POST /:id/status)')
    const digest = await apiGet<Array<{ id: string; status: string }>>(s, '/api/digest')
    if (!digest || digest.length === 0) {
      log(s, '  3.I SKIP — no digest papers available')
    } else {
      const sample = digest[0]
      const baselineStatus = sample.status
      const saveResp = await s.api.post(`/api/digest/${sample.id}/status`, { data: { status: 'saved' } })
      if (saveResp.ok()) {
        const after = await apiGet<Array<{ id: string; status: string }>>(s, '/api/digest')
        const updated = after?.find((d) => d.id === sample.id)
        if (updated?.status === 'saved') pass(s, '3.I Digest save persisted')
        else bug(s, 'DIGEST-SAVE-DRIFT', 'P1', '3.I digest save persists', String(updated?.status), 'saved')
        // Restore
        await s.api.post(`/api/digest/${sample.id}/status`, { data: { status: baselineStatus } })
      } else {
        bug(s, 'DIGEST-SAVE-FAIL', 'P1', '3.I POST /api/digest/:id/status', `HTTP ${saveResp.status()}`, '200')
      }

      section(s, '3.J  Digest comment round-trip')
      const cmtText = `${marker('digest_cmt')} quick audit comment`
      const cmtResp = await s.api.post(`/api/digest/${sample.id}/comments`, { data: { content: cmtText, author_slug: 'nick' } })
      if (cmtResp.ok()) {
        const cmts = await apiGet<Array<{ content: string }>>(s, `/api/digest/${sample.id}/comments`)
        if (cmts?.some((c) => c.content === cmtText)) pass(s, '3.J Digest comment round-trips')
        else bug(s, 'DIGEST-CMT-DRIFT', 'P1', '3.J digest comment round-trip', `${cmts?.length ?? 0} comments`, 'comment with text present')
      } else {
        bug(s, 'DIGEST-CMT-FAIL', 'P1', '3.J POST /api/digest/:id/comments', `HTTP ${cmtResp.status()}`, '200')
      }
    }
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const mid of cleanupMeetings) s.cleanup.push(async () => { await s.api.post(`/api/meetings/${mid}/delete`).catch(() => {}) })
    for (const qid of cleanupQuestions) s.cleanup.push(async () => { await s.api.post(`/api/questions/${qid}/delete`).catch(() => {}) })
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
