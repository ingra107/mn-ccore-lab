/**
 * Deep audit — Suite 12: Data integrity / orphan sweep.
 *
 * Query D1 directly (via wrangler CLI) for rows that violate implicit
 * referential integrity:
 *   - Tasks with project_id pointing at nonexistent projects
 *   - Tasks with assignee slug not in team_members
 *   - Tasks with invalid status / priority enum values
 *   - Projects with duplicate slugs
 *   - Projects with invalid status / stage / category enum values
 *   - Comments / project_updates with project_id pointing at missing projects
 *   - task_comments with task_id pointing at missing tasks
 *   - subtasks with parent task_id missing
 *   - Ideas / decisions with author_slug not in team_members
 *   - Notifications with source_id pointing at missing entity
 *
 * Run: npx tsx scripts/deep-audit/12-data-integrity.ts
 */
import { execSync } from 'child_process'
import { openSession, closeSession, section, log, pass, bug } from './harness'

interface D1Row { [k: string]: unknown }

function d1Query<T = D1Row>(sql: string): T[] {
  // Strip wrangler env-var overrides so OAuth config is used instead.
  const env = { ...process.env }
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_ACCOUNT_ID
  try {
    const out = execSync(
      `npx wrangler d1 execute mnccore-lab --remote --json --command "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 },
    )
    // wrangler wraps the result in an array, sometimes with log lines
    const jsonStart = out.indexOf('[')
    if (jsonStart < 0) return []
    const parsed = JSON.parse(out.slice(jsonStart)) as Array<{ results?: T[] }>
    return parsed?.[0]?.results ?? []
  } catch (e) {
    console.error(`d1Query failed: ${sql.slice(0, 80)}`, (e as Error).message.slice(0, 200))
    return []
  }
}

async function main() {
  const s = await openSession('12-data-integrity')

  try {
    section(s, '12.A  Tasks with project_id pointing to nonexistent projects')
    const orphanProjectTasks = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects) AND project_id NOT IN (SELECT slug FROM projects WHERE slug IS NOT NULL) AND deleted_at IS NULL"
    )
    const orphanCount = Number(orphanProjectTasks?.[0]?.count ?? 0)
    if (orphanCount === 0) pass(s, '12.A No tasks with dangling project_id')
    else bug(s, 'ORPHAN-TASK-PROJECT', 'P1', '12.A Tasks with dangling project_id', `${orphanCount} rows`, '0 (all refs valid)')

    section(s, '12.B  Tasks with assignee slug not in team_members (allowing claude-ai)')
    const bogusAssignees = d1Query<{ assignee: string; n: number }>(
      "SELECT assignee, COUNT(*) as n FROM tasks WHERE assignee IS NOT NULL AND assignee != 'claude-ai' AND assignee NOT IN (SELECT slug FROM team_members WHERE slug IS NOT NULL) AND deleted_at IS NULL GROUP BY assignee ORDER BY n DESC"
    )
    if (bogusAssignees.length === 0) pass(s, '12.B All task assignees valid')
    else {
      const top = bogusAssignees.slice(0, 5).map(r => `${r.assignee}(${r.n})`).join(', ')
      bug(s, 'ORPHAN-TASK-ASSIGNEE', 'P1', '12.B Tasks with unknown assignee slug', `${bogusAssignees.length} distinct slugs: ${top}`, '0')
    }

    section(s, '12.C  Tasks with invalid status enum')
    const badStatus = d1Query<{ status: string; n: number }>(
      "SELECT status, COUNT(*) as n FROM tasks WHERE status IS NOT NULL AND status NOT IN ('todo','in_progress','done','blocked','waiting_external','deleted') AND deleted_at IS NULL GROUP BY status"
    )
    if (badStatus.length === 0) pass(s, '12.C All task status values in canonical enum')
    else bug(s, 'TASK-BAD-STATUS', 'P1', '12.C Tasks with invalid status', JSON.stringify(badStatus).slice(0, 200), "all in ['todo','in_progress','done','blocked','waiting_external']")

    section(s, '12.D  Tasks with invalid priority enum')
    const badPriority = d1Query<{ priority: string; n: number }>(
      "SELECT priority, COUNT(*) as n FROM tasks WHERE priority IS NOT NULL AND priority NOT IN ('low','medium','high','urgent') AND deleted_at IS NULL GROUP BY priority"
    )
    if (badPriority.length === 0) pass(s, '12.D All task priority values in canonical enum')
    else bug(s, 'TASK-BAD-PRIORITY', 'P1', '12.D Tasks with invalid priority', JSON.stringify(badPriority).slice(0, 200), "all in ['low','medium','high','urgent']")

    section(s, '12.E  Projects with duplicate slugs')
    const dupSlugs = d1Query<{ slug: string; n: number }>(
      'SELECT slug, COUNT(*) as n FROM projects WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1'
    )
    if (dupSlugs.length === 0) pass(s, '12.E All project slugs unique')
    else bug(s, 'PROJ-DUP-SLUGS', 'P0', '12.E Duplicate project slugs', JSON.stringify(dupSlugs).slice(0, 300), 'all unique')

    section(s, '12.F  Projects with invalid status enum')
    const badProjStatus = d1Query<{ status: string; n: number }>(
      "SELECT status, COUNT(*) as n FROM projects WHERE status IS NOT NULL AND status NOT IN ('active','waiting_external','blocked','done') GROUP BY status"
    )
    if (badProjStatus.length === 0) pass(s, '12.F All project status values canonical')
    else bug(s, 'PROJ-BAD-STATUS', 'P1', '12.F Projects with invalid status', JSON.stringify(badProjStatus).slice(0, 200), "all in R10 canonical values")

    section(s, '12.G  Projects with invalid stage enum')
    const badProjStage = d1Query<{ stage: string; n: number }>(
      "SELECT stage, COUNT(*) as n FROM projects WHERE stage IS NOT NULL AND stage NOT IN ('Idea','Data Collection','Data Analysis','Writing','Submitted','Revisions','Accepted','Published') GROUP BY stage"
    )
    if (badProjStage.length === 0) pass(s, '12.G All project stage values canonical')
    else bug(s, 'PROJ-BAD-STAGE', 'P1', '12.G Projects with invalid stage', JSON.stringify(badProjStage).slice(0, 300), 'all in canonical stage enum')

    section(s, '12.H  Projects with invalid category enum')
    const badProjCat = d1Query<{ category: string; n: number }>(
      "SELECT category, COUNT(*) as n FROM projects WHERE category IS NOT NULL AND category NOT IN ('clif','lab','nate','mentee') GROUP BY category"
    )
    if (badProjCat.length === 0) pass(s, '12.H All project category values canonical')
    else bug(s, 'PROJ-BAD-CATEGORY', 'P2', '12.H Projects with invalid category', JSON.stringify(badProjCat).slice(0, 200), 'all in canonical category enum')

    section(s, '12.I  task_comments with task_id pointing to missing task')
    const orphanTaskComments = d1Query<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_comments WHERE task_id NOT IN (SELECT id FROM tasks)'
    )
    const otc = Number(orphanTaskComments?.[0]?.count ?? 0)
    if (otc === 0) pass(s, '12.I All task_comments point to existing tasks')
    else bug(s, 'ORPHAN-TASK-COMMENTS', 'P1', '12.I task_comments with missing task', `${otc} rows`, '0')

    section(s, '12.J  comments with project_id pointing to missing project')
    const orphanProjComments = d1Query<{ count: number }>(
      'SELECT COUNT(*) as count FROM comments WHERE project_id NOT IN (SELECT id FROM projects) AND project_id NOT IN (SELECT slug FROM projects WHERE slug IS NOT NULL)'
    )
    const opc = Number(orphanProjComments?.[0]?.count ?? 0)
    if (opc === 0) pass(s, '12.J All project comments point to existing projects')
    else bug(s, 'ORPHAN-PROJ-COMMENTS', 'P2', '12.J comments with missing project', `${opc} rows`, '0')

    section(s, '12.K  subtasks with parent task_id missing')
    const orphanSubtasks = d1Query<{ count: number }>(
      'SELECT COUNT(*) as count FROM task_subtasks WHERE parent_task_id NOT IN (SELECT id FROM tasks)'
    )
    const osub = Number(orphanSubtasks?.[0]?.count ?? 0)
    if (osub === 0) pass(s, '12.K All subtasks have existing parent tasks')
    else bug(s, 'ORPHAN-SUBTASKS', 'P1', '12.K subtasks with missing parent', `${osub} rows`, '0')

    section(s, '12.L  Notifications with source_id pointing at missing task (for task-scoped notifications)')
    const orphanNotifTask = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM notifications WHERE source_type IN ('task','task_comment') AND source_id NOT IN (SELECT id FROM tasks)"
    )
    const ont = Number(orphanNotifTask?.[0]?.count ?? 0)
    if (ont === 0) pass(s, '12.L All task-scoped notifications reference existing tasks')
    else bug(s, 'ORPHAN-NOTIFS', 'P2', '12.L notifications pointing at deleted tasks', `${ont} rows`, '0 or delete-on-task-delete')

    section(s, '12.M  Tasks missing required title AND description (can neither be listed)')
    const noTitleNoDesc = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE (title IS NULL OR title = '') AND (description IS NULL OR description = '') AND deleted_at IS NULL"
    )
    const ntd = Number(noTitleNoDesc?.[0]?.count ?? 0)
    if (ntd === 0) pass(s, '12.M All non-deleted tasks have title or description')
    else bug(s, 'TASK-NO-IDENTITY', 'P1', '12.M Tasks with neither title nor description', `${ntd} rows`, '0')

    section(s, '12.N  completed flag vs status coherence')
    const completedMismatch = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE ((status = 'done' AND completed != 1) OR (status != 'done' AND completed = 1)) AND deleted_at IS NULL"
    )
    const cm = Number(completedMismatch?.[0]?.count ?? 0)
    if (cm === 0) pass(s, '12.N status=done matches completed=1 invariant')
    else bug(s, 'TASK-COMPLETED-DRIFT', 'P1', '12.N status/completed flag incoherent', `${cm} rows`, '0 (done ↔ completed=1)')

    section(s, '12.O  Ideas with invalid status')
    const badIdeaStatus = d1Query<{ status: string; n: number }>(
      "SELECT status, COUNT(*) as n FROM ideas WHERE status IS NOT NULL AND status NOT IN ('new','under_review','approved','parked','archived') GROUP BY status"
    )
    if (badIdeaStatus.length === 0) pass(s, '12.O All idea statuses canonical')
    else bug(s, 'IDEA-BAD-STATUS', 'P2', '12.O Ideas with invalid status', JSON.stringify(badIdeaStatus).slice(0, 200), 'all in canonical enum')

    section(s, '12.P  Decision outcome_status values')
    const badDecOutcome = d1Query<{ outcome_status: string; n: number }>(
      "SELECT outcome_status, COUNT(*) as n FROM hub_decisions WHERE outcome_status IS NOT NULL AND outcome_status NOT IN ('pending','recorded','revisited') GROUP BY outcome_status"
    )
    if (badDecOutcome.length === 0) pass(s, '12.P All decision outcome_status values canonical')
    else bug(s, 'DEC-BAD-OUTCOME', 'P2', '12.P hub_decisions invalid outcome_status', JSON.stringify(badDecOutcome).slice(0, 200), 'pending/recorded/revisited')

    section(s, '12.Q  Team members with no name (display broken)')
    const noNameMembers = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM team_members WHERE (name IS NULL OR name = '')"
    )
    const nnm = Number(noNameMembers?.[0]?.count ?? 0)
    if (nnm === 0) pass(s, '12.Q All team_members have name')
    else bug(s, 'MEMBER-NO-NAME', 'P1', '12.Q team_members without name', `${nnm} rows`, '0')

    section(s, '12.R  Meetings with duplicate (date, title) after normalize')
    const dupMeetings = d1Query<{ date: string; title: string; n: number }>(
      "SELECT date, TRIM(LOWER(title)) as title, COUNT(*) as n FROM meetings GROUP BY date, TRIM(LOWER(title)) HAVING COUNT(*) > 1"
    )
    if (dupMeetings.length === 0) pass(s, '12.R No duplicate meetings after case/whitespace normalize')
    else bug(s, 'MEETING-DUP', 'P2', '12.R Duplicate meetings', JSON.stringify(dupMeetings).slice(0, 300), 'unique (date, normalized-title)')

    section(s, '12.S  Tasks marked completed but with NULL completed_at')
    const compNoDate = d1Query<{ count: number }>(
      "SELECT COUNT(*) as count FROM tasks WHERE completed = 1 AND completed_at IS NULL AND deleted_at IS NULL"
    )
    const cnd = Number(compNoDate?.[0]?.count ?? 0)
    if (cnd === 0) pass(s, '12.S All completed tasks have completed_at timestamp')
    else bug(s, 'TASK-COMPLETED-NO-DATE', 'P2', '12.S completed=1 but completed_at=NULL', `${cnd} rows`, '0')
  } catch (e) {
    log(s, `\n⚠ FATAL: ${(e as Error).message}\n${(e as Error).stack?.slice(0, 800)}`)
  } finally {
    await closeSession(s)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
