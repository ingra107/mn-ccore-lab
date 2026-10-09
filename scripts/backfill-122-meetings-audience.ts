// backfill-122-meetings-audience.ts -- generate the schema-v122 audience
// backfill from a prod pre-image. Writes SQL files; touches no database.
//
// RUNBOOK (operator; test DB first, then prod; nothing here is automatic):
//   1. DDL: api/schema-v122-meeting-access.sql (pre-checks in its header).
//      Then read <T0>, the window start, in D1's format (UTC 'YYYY-MM-DD HH:MM:SS'):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --command "SELECT datetime(applied_at) AS t0 FROM schema_migrations WHERE version = 122"
//   2. Pre-image export (read-only):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT id, date, title, owner_slug, source_id, created_at, audience FROM meetings ORDER BY id" > pre-meetings.json
//   3. Dry run, read every line, then generate:
//        npx tsx scripts/backfill-122-meetings-audience.ts --meetings pre-meetings.json --dry-run
//        npx tsx scripts/backfill-122-meetings-audience.ts --meetings pre-meetings.json --out <dir>
//      A COLLISION refuses the plan (exit 2, no files). Re-run with
//      --keep-private id1,id2 naming the rows that stay private (recommended:
//      a member's own Prep row; Nick's row with a source_id goes lab).
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/backfill-122-audience.apply.sql
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/backfill-122-series-owner.apply.sql
//      The second file re-owns every series row to Nick (his 2026-10-09
//      ruling: he owns every series row). A row whose date and exact title
//      Nick already owns is listed as BLOCKED and left as it is.
//   4. Deploy: npm run deploy:pages:gated, then npm run deploy:worker.
//   5. Window sweep: re-export pre-meetings.json, then
//        npx tsx scripts/backfill-122-meetings-audience.ts --meetings pre-meetings.json --out <dir2> --window-start "<T0>"
//      Only rows CREATED at or after <T0> are candidates (the old Worker made
//      them all 'private'); a row flipped by hand is not flipped back.
//   ROLLBACK: <dir>/backfill-122-audience.rollback.sql and
//   <dir>/backfill-122-series-owner.rollback.sql (and <dir2>'s). Keep
//   pre-meetings.json with them; it is the pre-image.
//
// The pure planner and its tests: scripts/meetings-122-plan.ts, api/lib/meetings-122-plan.test.ts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { rowsFrom } from './meetings-119-plan'
import { planAudienceBackfill, planSeriesReown, type MeetingAudiencePreImage } from './meetings-122-plan'

function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
function required(name: string): string {
  const v = optional(name)
  if (!v) throw new Error(`--${name} <value> is required`)
  return v
}

const meetings = rowsFrom<MeetingAudiencePreImage>(JSON.parse(readFileSync(required('meetings'), 'utf8')))
if (meetings.length === 0) throw new Error('the meetings export is empty; refusing to write an empty plan')
const dryRun = process.argv.includes('--dry-run')
const plan = planAudienceBackfill(meetings, {
  windowStart: optional('window-start'),
  keepPrivate: (optional('keep-private') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
})

console.log(`meetings read: ${meetings.length}${optional('window-start') ? ` (window from ${optional('window-start')})` : ''}`)
if (plan.collisions.length > 0) {
  console.log(`REFUSED: ${plan.collisions.length} group(s) of lab rows would share one (date, title); name the rows that stay private with --keep-private:`)
  for (const g of plan.collisions) {
    console.log('  group:')
    for (const line of g) console.log(`    ${line}`)
  }
  process.exit(2)
}
console.log(`audience backfill: ${plan.count} meetings -> lab`)
for (const d of plan.detail) console.log(`  ${d}`)
if (plan.keptPrivate.length) console.log(`kept private on --keep-private: ${plan.keptPrivate.join(', ')}`)
const owners = planSeriesReown(meetings, { windowStart: optional('window-start') })
console.log(`series owner: ${owners.count} series meetings -> owner nick-ingraham`)
for (const d of owners.detail) console.log(`  ${d}`)
if (owners.blocked.length) {
  console.log(`series owner BLOCKED (Nick already owns that date + exact title; left as is): ${owners.blocked.length}`)
  for (const b of owners.blocked) console.log(`  ${b}`)
}
console.log('grants: none generated (default = no project granted)')
if (dryRun) {
  console.log('dry run: no files written')
} else {
  const out = required('out')
  mkdirSync(out, { recursive: true })
  const header = (what: string) => `-- ${what}\n-- generated ${new Date().toISOString()} from ${meetings.length} meetings\n`
  writeFileSync(join(out, 'backfill-122-audience.apply.sql'), header('audience backfill: apply') + plan.apply + '\n')
  writeFileSync(join(out, 'backfill-122-audience.rollback.sql'), header('audience backfill: rollback') + plan.rollback + '\n')
  writeFileSync(join(out, 'backfill-122-series-owner.apply.sql'), header('series owner: apply') + owners.apply + '\n')
  writeFileSync(join(out, 'backfill-122-series-owner.rollback.sql'), header('series owner: rollback') + owners.rollback + '\n')
  console.log(`wrote 4 files to ${out}`)
}
