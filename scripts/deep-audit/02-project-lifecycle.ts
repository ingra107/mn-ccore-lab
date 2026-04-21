/**
 * Deep audit — Suite 2: Project lifecycle.
 *
 * Run: npx tsx scripts/deep-audit/02-project-lifecycle.ts
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
  apiGetProjectFromList,
  apiPatchProject,
  marker,
} from './harness'

async function main() {
  const s = await openSession('02-project-lifecycle')
  const createdSlugs: string[] = []
  const createdTaskIds: string[] = []

  try {
    section(s, '2.A  Create project via API')
    const title = marker('proj')
    const createResp = await s.api.post('/api/projects', {
      data: {
        title,
        category: 'lab',
        status: 'active',
        stage: 'Idea',
        description: `${title} description`,
        pi: 'nick',
      },
    })
    if (!createResp.ok()) {
      bug(s, 'PROJ-CREATE-FAIL', 'P0', '2.A POST /api/projects', `HTTP ${createResp.status()}`, '201/200')
      await closeSession(s)
      return
    }
    const pj = (await createResp.json()) as { data?: { slug: string; title: string; status: string; stage: string; category: string; pi: string; description: string } }
    if (!pj?.data?.slug) {
      bug(s, 'PROJ-CREATE-NO-SLUG', 'P0', '2.A response has slug', JSON.stringify(pj).slice(0, 120), 'object with slug')
      await closeSession(s)
      return
    }
    createdSlugs.push(pj.data.slug)
    pass(s, `2.A Project created — slug=${pj.data.slug}`)

    // Field echo checks
    const p = pj.data
    if (p.title === title) pass(s, '2.A response echoes title')
    else bug(s, 'PROJ-TITLE-ECHO', 'P1', '2.A title echo', p.title, title)
    if (p.status === 'active') pass(s, '2.A response echoes status=active')
    else bug(s, 'PROJ-STATUS-ECHO', 'P1', '2.A status echo', p.status, 'active')
    if (p.stage === 'Idea') pass(s, '2.A response echoes stage=Idea')
    else bug(s, 'PROJ-STAGE-ECHO', 'P1', '2.A stage echo', p.stage, 'Idea')
    if (p.category === 'lab') pass(s, '2.A response echoes category=lab')
    else bug(s, 'PROJ-CATEGORY-ECHO', 'P1', '2.A category echo', p.category, 'lab')

    section(s, '2.B  Readback via /api/projects list (no single GET endpoint)')
    const rb = await apiGetProjectFromList<{ slug: string; title: string; status: string; stage: string; category: string; pi: string; description: string }>(s, p.slug)
    if (!rb) {
      bug(s, 'PROJ-LIST-MISSING-NEW', 'P0', '2.B Newly created project appears in /api/projects list', 'not found in list', 'project in list right after create')
    } else {
      if (rb.title === title) pass(s, '2.B Readback title matches')
      else bug(s, 'PROJ-TITLE-DRIFT', 'P1', '2.B readback title', rb.title, title)
      if (rb.status === 'active') pass(s, '2.B Readback status=active')
      else bug(s, 'PROJ-STATUS-DRIFT', 'P1', '2.B readback status', rb.status, 'active')
    }

    section(s, '2.C  Appears on /projects list')
    await goto(s, '/portal/projects')
    await snap(s, 'C-projects-list')
    const onList = await s.page.locator(`text=${JSON.stringify(title)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (onList) pass(s, '2.C Project visible on /projects list')
    else bug(s, 'PROJ-LIST-MISSING', 'P1', '2.C Project on /projects list', 'title not found', `"${title}" visible`)

    section(s, '2.D  Project detail page loads')
    await goto(s, `/portal/projects/${p.slug}`)
    await snap(s, 'D-project-detail')
    const onDetail = await s.page.locator(`h1:has-text("${title}"), h2:has-text("${title}")`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (onDetail) pass(s, '2.D Project detail heading renders title')
    else bug(s, 'PROJ-DETAIL-NO-TITLE', 'P1', '2.D detail page has title in heading', 'h1/h2 text missing', `heading with "${title}"`)

    section(s, '2.E  Edit project fields via POST /api/projects/:slug')
    const newStage = 'Data Collection'
    const newStatus = 'active'
    const newDescription = `${title} updated description`
    const updResp = await apiPatchProject(s, p.slug, { stage: newStage, status: newStatus, description: newDescription })
    if (!updResp.ok) bug(s, 'PROJ-UPDATE-FAIL', 'P0', '2.E POST /api/projects/:slug', `HTTP ${updResp.status}`, '200')
    else pass(s, '2.E Project update accepted')
    const rb2 = await apiGetProjectFromList<{ slug: string; stage: string; status: string; description: string }>(s, p.slug)
    if (rb2?.stage === newStage) pass(s, '2.E Stage persisted')
    else bug(s, 'PROJ-STAGE-NOT-PERSISTED', 'P0', '2.E stage persisted', String(rb2?.stage), newStage)
    if (rb2?.description === newDescription) pass(s, '2.E Description persisted')
    else bug(s, 'PROJ-DESC-NOT-PERSISTED', 'P1', '2.E description persisted', String(rb2?.description), newDescription)

    section(s, '2.F  Attach key_link (all 3 slots)')
    const url1 = 'https://example.com/deep-audit/link1'
    const url2 = 'https://example.com/deep-audit/link2'
    const url3 = 'https://example.com/deep-audit/link3'
    const klResp = await apiPatchProject(s, p.slug, {
      key_link_1: url1, key_link_1_desc: 'Repo',
      key_link_2: url2, key_link_2_desc: 'Docs',
      key_link_3: url3, key_link_3_desc: 'Data',
    })
    if (!klResp.ok) bug(s, 'PROJ-KEYLINKS-FAIL', 'P1', '2.F POST project key_links', `HTTP ${klResp.status}`, '200')
    const rb3 = await apiGetProjectFromList<{ slug: string; key_link_1: string; key_link_2: string; key_link_3: string; key_link_1_desc: string; key_link_2_desc: string; key_link_3_desc: string }>(s, p.slug)
    const allLinksOk = rb3?.key_link_1 === url1 && rb3?.key_link_2 === url2 && rb3?.key_link_3 === url3
    if (allLinksOk) pass(s, '2.F All 3 key_links round-trip')
    else bug(s, 'PROJ-KEYLINKS-DRIFT', 'P1', '2.F all 3 key_links round-trip', JSON.stringify({ k1: rb3?.key_link_1, k2: rb3?.key_link_2, k3: rb3?.key_link_3 }).slice(0, 200), 'all 3 urls match')
    const allDescOk = rb3?.key_link_1_desc === 'Repo' && rb3?.key_link_2_desc === 'Docs' && rb3?.key_link_3_desc === 'Data'
    if (allDescOk) pass(s, '2.F All 3 key_link descs round-trip')
    else bug(s, 'PROJ-KEYLINKS-DESC-DRIFT', 'P1', '2.F all 3 key_link descs round-trip', JSON.stringify({ d1: rb3?.key_link_1_desc, d2: rb3?.key_link_2_desc, d3: rb3?.key_link_3_desc }).slice(0, 200), 'all 3 descs match')

    section(s, '2.G  key_links render on /projects list row')
    await goto(s, '/portal/projects')
    await snap(s, 'G-projects-list-with-link')
    // Look for any link icon or href matching our project slug row
    const rowHasLinkHref = await s.page.evaluate((targetUrl) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      return anchors.some((a) => (a as HTMLAnchorElement).href.includes(targetUrl))
    }, url1).catch(() => false)
    if (rowHasLinkHref) pass(s, '2.G key_link_1 URL present somewhere on /projects page')
    else log(s, '  INFO: 2.G key_link_1 URL not found on /projects list — may only render on detail page (document behavior)')

    section(s, '2.H  Link a task to project, verify task count badge')
    const taskTitle = marker('proj_task')
    const taskResp = await s.api.post('/api/tasks', {
      data: { title: taskTitle, description: taskTitle, assignee: 'nick', priority: 'medium', project_id: p.slug },
    })
    if (taskResp.ok()) {
      const tb = (await taskResp.json()) as { data?: { id: string } }
      if (tb?.data?.id) createdTaskIds.push(tb.data.id)
      pass(s, `2.H Task created linked to project, id=${tb?.data?.id}`)
    } else {
      bug(s, 'PROJ-TASK-CREATE', 'P1', '2.H Task with project_id creates', `HTTP ${taskResp.status()}`, '200')
    }

    // Wait for sync + reload. Overview tab shows task COUNTS, not titles
    // — click the Tasks tab to surface the linked task's title.
    await s.page.waitForTimeout(800)
    await goto(s, `/portal/projects/${p.slug}`)
    await s.page.getByRole('button', { name: /^Tasks(\s|\()/ }).first().click({ timeout: 5000 }).catch(() => {})
    await s.page.waitForTimeout(800)
    await snap(s, 'H-project-detail-with-task')
    const taskOnDetail = await s.page.locator(`text=${JSON.stringify(taskTitle)}`).first().isVisible({ timeout: 3000 }).catch(() => false)
    if (taskOnDetail) pass(s, '2.H Task appears on project detail Tasks tab')
    else bug(s, 'PROJ-TASK-NOT-ON-DETAIL', 'P1', '2.H linked task on project detail Tasks tab', 'title not found', `"${taskTitle}" visible`)

    section(s, '2.I  Reassign task project_id to a DIFFERENT project — verify count decrements')
    // Use admin-tasks (known existing project) as the new target
    if (createdTaskIds[0]) {
      const reassignResp = await s.api.post(`/api/tasks/${createdTaskIds[0]}`, {
        data: { project_id: 'admin-tasks' },
      })
      if (!reassignResp.ok()) bug(s, 'PROJ-TASK-REASSIGN', 'P1', '2.I reassign project', `HTTP ${reassignResp.status()}`, '200')
      else pass(s, '2.I Task reassigned project_id=admin-tasks')
      // Verify disappeared from original project detail
      await s.page.waitForTimeout(800)
      await goto(s, `/portal/projects/${p.slug}`)
      await snap(s, 'I-project-detail-after-reassign')
      const stillOnOld = await s.page.locator(`text=${JSON.stringify(taskTitle)}`).first().isVisible({ timeout: 2000 }).catch(() => false)
      if (!stillOnOld) pass(s, '2.I Task removed from old project detail after reassign')
      else bug(s, 'PROJ-TASK-STALE-OLD', 'P1', '2.I task removed from old project', 'still visible on old detail', 'hidden (moved to admin-tasks)')
    }

    section(s, '2.J  Project status pivot — active → waiting_external')
    const pivotResp = await apiPatchProject(s, p.slug, { status: 'waiting_external' })
    if (!pivotResp.ok) bug(s, 'PROJ-STATUS-PIVOT', 'P1', '2.J status waiting_external', `HTTP ${pivotResp.status}`, '200')
    const rb4 = await apiGetProjectFromList<{ slug: string; status: string }>(s, p.slug)
    if (rb4?.status === 'waiting_external') pass(s, '2.J status=waiting_external persisted')
    else bug(s, 'PROJ-STATUS-NOT-PERSISTED', 'P1', '2.J status pivot persisted', String(rb4?.status), 'waiting_external')

    section(s, '2.K  Invalid enum values rejected')
    const invalidResp = await s.api.post(`/api/projects/${p.slug}`, { data: { status: 'bogus_value' } })
    if (invalidResp.status() === 400 || invalidResp.status() === 422) {
      pass(s, `2.K Invalid status rejected with ${invalidResp.status()}`)
    } else if (invalidResp.ok()) {
      const rbInv = await apiGetProjectFromList<{ slug: string; status: string }>(s, p.slug)
      if (rbInv?.status === 'bogus_value') {
        bug(s, 'PROJ-ENUM-NOT-VALIDATED', 'P1', '2.K Invalid enum is rejected', `accepted and stored "bogus_value"`, '400/422 error OR ignored')
      } else {
        pass(s, `2.K Invalid status silently ignored (stored value=${rbInv?.status})`)
      }
    } else {
      log(s, `  INFO: 2.K invalid status returned ${invalidResp.status()} — not 400/422 but not success either`)
    }

    section(s, '2.L  Add a project comment')
    const commentResp = await s.api.post(`/api/projects/${p.slug}/comments`, {
      data: { content: `${marker('proj_cmt')} audit project comment` },
    })
    if (!commentResp.ok()) bug(s, 'PROJ-COMMENT-POST', 'P1', '2.L POST project comment', `HTTP ${commentResp.status()}`, '200')
    else pass(s, '2.L Project comment accepted')

    section(s, '2.M  Restore status to active, then delete project via POST /:id/delete')
    await apiPatchProject(s, p.slug, { status: 'active' })
    const delResp = await s.api.post(`/api/projects/${p.slug}/delete`)
    if (delResp.ok()) pass(s, '2.M Project POST /delete succeeded')
    else bug(s, 'PROJ-DELETE-FAIL', 'P1', '2.M POST /api/projects/:slug/delete', `HTTP ${delResp.status()}`, '200')
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    for (const tid of createdTaskIds) {
      s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    }
    for (const slug of createdSlugs) {
      s.cleanup.push(async () => { await s.api.post(`/api/projects/${slug}/delete`).catch(() => {}) })
    }
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
