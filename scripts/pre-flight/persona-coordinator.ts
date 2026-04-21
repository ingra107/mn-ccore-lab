/**
 * Persona: research coordinator.
 *
 * Role: data entry lens. Creates tasks, logs decisions, answers questions,
 * adds comments. Typical day = heavy mutations + lots of text input.
 * Tests the "actually get work done" path that notification + sync paths
 * depend on.
 *
 * Run: npx tsx scripts/pre-flight/persona-coordinator.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto, mk } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'coordinator',
    role: 'Research coordinator, heavy data-entry',
    colorScheme: 'dark',
  })
  const cleanupTasks: string[] = []
  const cleanupIdeas: string[] = []
  const cleanupDecisions: string[] = []
  const cleanupQuestions: string[] = []

  try {
    section(s, '1  Create three tasks via API (simulate clicking New Task 3x)')
    const baseTitle = mk('coord_task')
    for (let i = 1; i <= 3; i++) {
      const title = `${baseTitle}_${i}`
      const due = new Date(); due.setDate(due.getDate() + i * 2)
      const dueIso = due.toISOString().slice(0, 10)
      const r = await s.api.post('/api/tasks', {
        data: { title, description: title, assignee: 'nick', priority: ['low', 'medium', 'high'][i - 1], due_date: dueIso },
      })
      if (r.ok()) {
        const tid = ((await r.json()) as { data?: { id: string } }).data?.id
        if (tid) {
          cleanupTasks.push(tid)
          pass(s, `Task ${i} created (priority=${['low', 'medium', 'high'][i - 1]}, due +${i * 2}d)`)
        }
      } else {
        record(s, { id: `TASK-CREATE-${i}`, severity: 'P1', scenario: `Create task ${i}`, observed: `HTTP ${r.status()}`, expected: '200/201' })
      }
    }

    section(s, '2  Open one of the tasks, add a comment, add a note, mark in progress')
    await goto(s, '/portal/my-tasks')
    await snap(s, 'my-tasks-after-create', 1500)
    if (cleanupTasks.length > 0) {
      const tid = cleanupTasks[0]
      const commentResp = await s.api.post(`/api/tasks/${tid}/comments`, {
        data: { content: `${mk('cmt')} started working on this today`, author_slug: 'nick' },
      })
      if (commentResp.ok()) pass(s, 'Comment posted on task')
      else record(s, { id: 'CMT-FAIL', severity: 'P1', scenario: 'Post comment', observed: `HTTP ${commentResp.status()}`, expected: '200' })

      const noteResp = await s.api.post(`/api/tasks/${tid}/updates`, {
        data: { content: `${mk('note')} initial analysis done, sending to Mesfin`, update_type: 'progress' },
      })
      if (noteResp.ok()) pass(s, 'Note posted on task /updates')
      else record(s, { id: 'NOTE-FAIL', severity: 'P1', scenario: 'Post note', observed: `HTTP ${noteResp.status()}`, expected: '200' })

      const statResp = await s.api.post(`/api/tasks/${tid}/status`, { data: { status: 'in_progress' } })
      if (statResp.ok()) pass(s, 'Status → in_progress')
    }

    section(s, '3  Log a decision with rationale + outcome')
    const decTitle = mk('coord_decision')
    const dResp = await s.api.post('/api/decisions', {
      data: {
        title: decTitle,
        rationale: 'Coordinator audit scenario — decided to use X over Y because Z',
        context: 'Deep audit pre-flight persona run',
        decided_by: 'nick',
        tags: 'methodology,tools',
      },
    })
    if (dResp.ok()) {
      const did = ((await dResp.json()) as { data?: { id: string } }).data?.id
      if (did) {
        cleanupDecisions.push(did)
        pass(s, `Decision logged id=${did}`)
        // Record outcome
        const outcomeResp = await s.api.post(`/api/decisions/${did}/outcome`, {
          data: { outcome: 'Worked well — using X in production now', outcome_status: 'recorded', outcome_sentiment: 'positive' },
        })
        if (outcomeResp.ok()) pass(s, 'Outcome recorded on decision')
        else record(s, { id: 'DEC-OUTCOME', severity: 'P1', scenario: 'Record outcome', observed: `HTTP ${outcomeResp.status()}`, expected: '200' })
      }
    } else {
      record(s, { id: 'DEC-CREATE', severity: 'P1', scenario: 'Create decision', observed: `HTTP ${dResp.status()}`, expected: '200' })
    }

    section(s, '4  Submit an idea with research_area')
    const ideaTitle = mk('coord_idea')
    const iResp = await s.api.post('/api/ideas', {
      data: { title: ideaTitle, description: 'What if we cross-reference X with Y', submitted_by: 'nick', research_area: 'CLIF' },
    })
    if (iResp.ok()) {
      const iid = ((await iResp.json()) as { data?: { id: string } }).data?.id
      if (iid) {
        cleanupIdeas.push(iid)
        pass(s, 'Idea submitted')
        // Vote
        const vResp = await s.api.post(`/api/ideas/${iid}/vote`, { data: { voter_slug: 'mesfin' } })
        if (vResp.ok()) pass(s, 'Vote recorded')
      }
    }

    section(s, '5  Ask a question in AskTheLab, provide an answer')
    const qText = `${mk('coord_q')} how do we handle CLIF respiratory transitions?`
    const qResp = await s.api.post('/api/questions', { data: { question: qText, asked_by: 'nick' } })
    if (qResp.ok()) {
      const qid = ((await qResp.json()) as { data?: { id: string } }).data?.id
      if (qid) {
        cleanupQuestions.push(qid)
        pass(s, `Question posted id=${qid}`)
        const aResp = await s.api.post(`/api/questions/${qid}/answers`, {
          data: { content: `${mk('a')} CLIF v3 adds hospital_transitions table`, author_slug: 'mesfin' },
        })
        if (aResp.ok()) pass(s, 'Answer submitted')
      }
    }

    section(s, '6  Navigate to Deadlines, verify due dates lined up')
    await goto(s, '/portal/deadlines')
    await snap(s, 'deadlines', 1500)
    const dueRows = await s.page.locator('[data-testid^="task-due-"]').count().catch(() => 0)
    if (dueRows > 0) pass(s, `${dueRows} due-date cells rendered (from our 3 tasks + existing)`)
    else record(s, { id: 'DEADLINES-EMPTY', severity: 'P1', scenario: 'Deadlines shows task due cells', observed: '0 rows', expected: '>0' })

    section(s, '7  UI flow — open one of our tasks via title click')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(1500)
    const ourTask = s.page.locator(`text=${JSON.stringify(baseTitle)}`).first()
    if (await ourTask.count()) {
      await ourTask.click({ force: true }).catch(() => {})
      await s.page.waitForTimeout(1200)
      await snap(s, 'coord-task-detail')
      const panelOpen = await s.page.locator('[data-testid="task-detail-panel"]').isVisible({ timeout: 3000 }).catch(() => false)
      if (panelOpen) pass(s, 'Task detail panel opens from title click')
      else record(s, { id: 'DETAIL-PANEL', severity: 'P1', scenario: 'Title click → detail panel', observed: 'panel not visible', expected: 'visible' })
      await s.page.keyboard.press('Escape').catch(() => {})
    }

    section(s, '8  Digest — save a paper + comment on it')
    await goto(s, '/portal/digest')
    await snap(s, 'digest')
    // Try to save the first visible paper
    const saveBtn = s.page.locator('button').filter({ hasText: /Save|save paper/i }).first()
    if (await saveBtn.count()) {
      await saveBtn.click({ force: true }).catch(() => {})
      await s.page.waitForTimeout(500)
      pass(s, 'Clicked Save on first digest paper')
    } else {
      record(s, { id: 'DIGEST-NO-SAVE', severity: 'P2', scenario: 'Save paper button on digest', observed: 'no Save button visible', expected: 'save button per paper' })
    }

    section(s, '9  Activity feed — recent changes visible')
    await goto(s, '/portal/activity')
    await snap(s, 'activity')
    const actRows = await s.page.locator('li, [role="listitem"], [data-testid*="activity"]').count().catch(() => 0)
    if (actRows > 3) pass(s, `Activity feed has ${actRows} entries`)
    else record(s, { id: 'ACTIVITY-SPARSE', severity: 'P2', scenario: 'Activity feed populated', observed: `${actRows} entries`, expected: '>3' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    for (const iid of cleanupIdeas) s.cleanup.push(async () => { await s.api.post(`/api/ideas/${iid}/delete`).catch(() => {}) })
    for (const did of cleanupDecisions) s.cleanup.push(async () => { await s.api.post(`/api/decisions/${did}/delete`).catch(() => {}) })
    for (const qid of cleanupQuestions) s.cleanup.push(async () => { await s.api.post(`/api/questions/${qid}/delete`).catch(() => {}) })
    const result = await closePersona(s)
    console.log(`\n[coordinator] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
