// backfill-120-project-members.ts -- generate the #145 Lane B membership seed
// from a prod pre-image. Writes SQL files and prints the per-person list Nick
// reviews; touches no database.
//
// RUNBOOK (operator; prod is applied by hand, test DB first):
//
//   0. schema-v120 applied (api/schema-v120-project-members.sql).
//   1. Export the pre-image (read-only):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT id, slug, title, category, pi, deleted_at FROM projects ORDER BY id" > pre-projects.json
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT DISTINCT project_id, assignee FROM tasks WHERE deleted_at IS NULL AND COALESCE(status, '') <> 'deleted' AND project_id IS NOT NULL ORDER BY 1, 2" > pre-assignments.json
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT slug, email, name FROM team_members WHERE slug IS NOT NULL ORDER BY auto_created ASC, created_at ASC, slug ASC" > pre-team.json
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT project_id, member_slug, added_by FROM project_members ORDER BY 1, 2" > pre-project-members.json
//      (the last is the table's pre-image: empty right after v120, or the
//      rows the triggers added between the DDL and the seed.)
//   2. Generate:
//        npx tsx scripts/backfill-120-project-members.ts --projects pre-projects.json \
//          --assignments pre-assignments.json --team pre-team.json --out <dir>
//      It prints the per-person list (Nick approves the LIST, not a count),
//      every value it could not resolve, and every Peripheral Brain pair it
//      skipped. It writes <dir>/seed-120-members.list.txt with the same text.
//   3. Apply (test, then prod):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/seed-120-members.apply.sql
//      Nick's rows are ONE statement over the projects live at apply time
//      (INSERT OR IGNORE ... SELECT id ... WHERE deleted_at IS NULL), so a
//      project created after the export is covered too.
//   ROLLBACK: <dir>/seed-120-members.rollback.sql (deletes Nick's rows by
//   added_by='backfill-v120', and every other exact pair by its own added_by:
//   'backfill-v120' or 'backfill-v120-title'). It carries the export-time
//   project list as a comment. Keep the pre-*.json files with it.
//   4. After the deploy, the WINDOW SWEEP (projects created between the DDL
//      and the deploy got no creator row from the old code):
//        npx tsx scripts/backfill-120-project-members.ts --window-since "YYYY-MM-DD HH:MM:SS" --out <dir>
//      (the DDL apply time, UTC), then apply <dir>/window-120.apply.sql.
//      Rollback: <dir>/window-120.rollback.sql (added_by='window-v120').
//
// The pure planner and its tests: scripts/project-members-120-plan.ts,
// api/lib/project-members-120-plan.test.ts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { rowsFrom } from './meetings-119-plan'
import { planProjectMembers, windowSweep, type AssignmentPreImage, type ProjectPreImage, type TeamPreImage } from './project-members-120-plan'

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const windowSince = opt('window-since')
if (windowSince) {
  const out = opt('out')
  if (!out) throw new Error('--out <dir> is required')
  mkdirSync(out, { recursive: true })
  const w = windowSweep(windowSince)
  writeFileSync(join(out, 'window-120.apply.sql'), `-- project_members window sweep since ${windowSince} UTC: apply\n${w.apply}\n`)
  writeFileSync(join(out, 'window-120.rollback.sql'), `-- project_members window sweep: rollback\n${w.rollback}\n`)
  console.log(`wrote window-120.apply.sql and window-120.rollback.sql to ${out}`)
  process.exit(0)
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const v = i === -1 ? undefined : process.argv[i + 1]
  if (!v) throw new Error(`--${name} <path> is required`)
  return v
}

const projects = rowsFrom<ProjectPreImage>(JSON.parse(readFileSync(arg('projects'), 'utf8')))
const assignments = rowsFrom<AssignmentPreImage>(JSON.parse(readFileSync(arg('assignments'), 'utf8')))
const team = rowsFrom<TeamPreImage>(JSON.parse(readFileSync(arg('team'), 'utf8')))
const out = arg('out')
if (projects.length === 0) throw new Error('the projects export is empty; refusing to write an empty plan')
if (team.length === 0) throw new Error('the team export is empty; refusing to write an empty plan')
mkdirSync(out, { recursive: true })

const plan = planProjectMembers(projects, assignments, team)
const stamp = `generated ${new Date().toISOString()} from ${projects.length} projects, ${assignments.length} assignment pairs, ${team.length} team rows`
const list = [
  `#145 project membership seed: ${plan.pairs.length} rows (${stamp})`,
  'Source after each project: nick (Nick, every live project), pi (projects.pi), assignee (a live task), title ("Topic (LastName)").',
  '',
  ...plan.perPerson,
  '',
  `Not seeded, value is not a team member (${plan.unresolved.length}):`,
  ...plan.unresolved.map((s) => `    ${s}`),
  '',
  `Not seeded, Peripheral Brain project (${plan.skippedPb.length}):`,
  ...plan.skippedPb.map((s) => `    ${s}`),
  '',
  `Title "(LastName)" not used, no single member matches (${plan.titleSkipped.length}):`,
  ...plan.titleSkipped.map((s) => `    ${s}`),
].join('\n')
writeFileSync(join(out, 'seed-120-members.apply.sql'), `-- project_members seed: apply\n-- ${stamp}\n${plan.apply}\n`)
writeFileSync(join(out, 'seed-120-members.rollback.sql'), `-- project_members seed: rollback\n-- ${stamp}\n${plan.rollback}\n`)
writeFileSync(join(out, 'seed-120-members.list.txt'), `${list}\n`)
console.log(list)
console.log(`\nwrote 3 files to ${out}`)
