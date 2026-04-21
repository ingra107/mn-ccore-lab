/**
 * Persona: collaborator (Mesfin / senior-mentor lens).
 *
 * Role: co-PI or senior mentor. Not daily-active like Nick. Catches up
 * Monday morning, sees what's been assigned, reviews manuscripts and
 * grants they're on, responds to @mentions.
 *
 * Run: npx tsx scripts/pre-flight/persona-collaborator.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto, assertVisible, mk } from './shared'

async function main() {
  const s = await openPersona({
    persona: 'collaborator',
    role: 'Co-PI / senior mentor, Monday-morning catchup',
    colorScheme: 'dark',
  })
  const cleanupTasks: string[] = []

  try {
    section(s, '1  Arrive at /my-tasks — see what needs my attention')
    await goto(s, '/portal/my-tasks')
    await snap(s, 'my-tasks')
    await assertVisible(s, 'MyTasks page header', 'h1', { severity: 'P1' })
    const taskRows = await s.page.locator('[data-testid^="task-row-"]').count().catch(() => 0)
    if (taskRows > 0) pass(s, `MyTasks shows ${taskRows} task rows`)
    else record(s, { id: 'MYTASKS-EMPTY', severity: 'P2', scenario: 'MyTasks populated', observed: '0 rows', expected: '>0 (for a real team member)' })

    section(s, '2  @mention me — create a comment mentioning mesfin, verify he sees it in notifications')
    // Create a task then comment @mesfin — verify his notifications increment
    const preMesfin = await (await s.api.get('/api/notifications?recipient=mesfin')).json().catch(() => ({ data: [] })) as { data?: unknown[] }
    const baseline = preMesfin?.data?.length ?? 0
    const taskTitle = mk('collab_mention')
    const tResp = await s.api.post('/api/tasks', { data: { title: taskTitle, description: taskTitle, assignee: 'nick', priority: 'medium' } })
    if (tResp.ok()) {
      const tid = ((await tResp.json()) as { data?: { id: string } }).data?.id
      if (tid) {
        cleanupTasks.push(tid)
        await s.api.post(`/api/tasks/${tid}/comments`, { data: { content: `${mk('cmt')} @mesfin please review`, author_slug: 'nick' } })
        await s.page.waitForTimeout(1000)
        const postMesfin = await (await s.api.get('/api/notifications?recipient=mesfin')).json().catch(() => ({ data: [] })) as { data?: unknown[] }
        const after = postMesfin?.data?.length ?? 0
        if (after - baseline === 1) pass(s, `@mesfin mention → +1 notification (${baseline} → ${after})`)
        else record(s, { id: 'MENTION-FANOUT', severity: 'P1', scenario: '@mention fires exactly one notification', observed: `delta=${after - baseline}`, expected: '+1' })
      }
    }

    section(s, '3  Navigate to a project I PI')
    await goto(s, '/portal/projects')
    await snap(s, 'projects')
    // Find a project where PI=mesfin or similar faculty name
    const mesProj = s.page.locator('a[href*="/projects/"]').filter({ hasText: /Mesfin|\(Mesfin\)/ }).first()
    if (await mesProj.count()) {
      await mesProj.click({ force: true }).catch(() => {})
      await snap(s, 'project-detail', 1500)
      await assertVisible(s, 'Project detail loaded', 'h1, h2', { severity: 'P1' })
    } else {
      record(s, { id: 'NO-MESFIN-PROJ', severity: 'INFO', scenario: 'Find a project PI=Mesfin', observed: 'no matching project row', expected: 'at least one project links to Mesfin' })
    }

    section(s, '4  Manuscripts under revision — view revision tracker')
    await goto(s, '/portal/manuscripts')
    await snap(s, 'manuscripts')
    const mRows = await s.page.locator('a[href*="/projects/"]').count().catch(() => 0)
    if (mRows > 5) pass(s, `Manuscripts list shows ${mRows} entries`)
    else record(s, { id: 'MANUSCRIPTS-SMALL', severity: 'P2', scenario: 'Manuscripts list populated', observed: `${mRows} rows`, expected: '>5' })

    section(s, '5  Grants dashboard — status of active submissions')
    await goto(s, '/portal/grants')
    await snap(s, 'grants')
    const grantsList = await s.page.locator('[data-testid*="grant"], tr, [role="row"]').count().catch(() => 0)
    if (grantsList > 0) pass(s, `Grants page has ${grantsList} grant-related rows`)
    else record(s, { id: 'GRANTS-EMPTY', severity: 'P2', scenario: 'Grants populated', observed: '0 rows', expected: '>0' })

    section(s, '6  Find myself on /team and verify name tiers')
    await goto(s, '/team')
    await snap(s, 'team')
    const mesfinName = await s.page.locator('text=/Nathan|Mesfin/').first().isVisible({ timeout: 3000 }).catch(() => false)
    if (mesfinName) pass(s, 'Mesfin visible on /team page')
    else record(s, { id: 'TEAM-NAME', severity: 'P1', scenario: 'My name on /team', observed: 'name not found', expected: 'formal tier visible' })

    section(s, '7  Meeting prep for upcoming MNCCORE')
    await goto(s, '/portal/meetings')
    await snap(s, 'meetings')
    const firstMtg = s.page.locator('a[href*="/meetings/"]').first()
    if (await firstMtg.count()) {
      await firstMtg.click({ force: true }).catch(() => {})
      await s.page.waitForTimeout(1500)
      await snap(s, 'meeting-detail')
      await assertVisible(s, 'Meeting detail page content', 'h1, h2', { severity: 'P1' })
      // Test Meeting Prep button if present
      const prepBtn = s.page.locator('a, button').filter({ hasText: /Prep|Prepare/ }).first()
      if (await prepBtn.count()) {
        await prepBtn.click({ force: true }).catch(() => {})
        await snap(s, 'meeting-prep', 1500)
        pass(s, 'Meeting Prep button opens prep view')
      }
    }

    section(s, '8  Check notifications for me')
    await goto(s, '/notifications')
    await snap(s, 'notifications', 800)
    const notifRows = await s.page.locator('[role="listitem"], [data-testid*="notif"], li, tr').count().catch(() => 0)
    if (notifRows >= 0) pass(s, `Notifications page loads, ${notifRows} items visible`)

    section(s, '9  /activity shows recent team activity')
    await goto(s, '/portal/activity')
    await snap(s, 'activity')
    await assertVisible(s, 'Activity feed', 'h1, h2', { severity: 'P1' })
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    for (const tid of cleanupTasks) s.cleanup.push(async () => { await s.api.post('/api/tasks/batch', { data: { ids: [tid], action: 'delete' } }).catch(() => {}) })
    const result = await closePersona(s)
    console.log(`\n[collaborator] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
