// backfill-119-meetings-owner.ts -- generate the #145 Lane A meeting data
// steps from a prod pre-image. Writes SQL files; touches no database.
//
// RUNBOOK (operator; test DB first, then prod; nothing here is automatic).
// Strict order. The new Worker adopts owner-less rows only for the PB key and
// a PI, so a member's write in the window lands as their own row, never Nick's.
//
//   1. DDL: api/schema-v119-meetings-owner.sql. Then read <T0>, the window
//      start, IN D1's created_at FORMAT (UTC, 'YYYY-MM-DD HH:MM:SS'; the
//      comparison is textual):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --command "SELECT datetime('now') AS t0"
//   2. Pre-image export (read-only):
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT id, owner_slug, attendees, created_at, date, title FROM meetings ORDER BY id" > pre-meetings.json
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT slug, email FROM team_members WHERE slug IS NOT NULL ORDER BY auto_created ASC, created_at ASC, slug ASC" > pre-team.json
//   3. Generate, then apply backfill + re-normalization:
//        npx tsx scripts/backfill-119-meetings-owner.ts --meetings pre-meetings.json --team pre-team.json --out <dir>
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/backfill-119-owner.apply.sql
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/renorm-119-attendees.apply.sql
//   4. Deploy (Pages, then Worker).
//   5. Final NULL-owner sweep: re-export pre-meetings.json, then
//        npx tsx scripts/backfill-119-meetings-owner.ts ... --out <dir2> --window-start "<T0>"
//      Rows created at or after <T0> are printed as HELD, by created_at, and
//      are NOT in the apply file. Read each one. Re-run with
//      --include-window-ids id1,id2 for the ones that really are Nick's; a
//      member's Prep row is left for its owner to be set by hand.
//   ROLLBACK: the matching .rollback.sql files, reverse order. Keep pre-*.json
//   with them; they are the pre-image.
//
// The pure planner and its tests: scripts/meetings-119-plan.ts,
// api/lib/meetings-119-plan.test.ts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { planOwnerBackfill, planAttendeeRenorm, rowsFrom, type MeetingPreImage, type TeamRow } from './meetings-119-plan'

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  const v = i === -1 ? undefined : process.argv[i + 1]
  if (!v) throw new Error(`--${name} <path> is required`)
  return v
}

const meetings = rowsFrom<MeetingPreImage>(JSON.parse(readFileSync(arg('meetings'), 'utf8')))
const team = rowsFrom<TeamRow>(JSON.parse(readFileSync(arg('team'), 'utf8')))
const out = arg('out')
if (meetings.length === 0) throw new Error('the meetings export is empty; refusing to write an empty plan')
if (team.length === 0) throw new Error('the team export is empty; refusing to write an empty plan')
mkdirSync(out, { recursive: true })

function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const owner = planOwnerBackfill(meetings, {
  windowStart: optional('window-start'),
  includeIds: (optional('include-window-ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
})
const renorm = planAttendeeRenorm(meetings, team)
const header = (what: string) => `-- ${what}\n-- generated ${new Date().toISOString()} from ${meetings.length} meetings, ${team.length} team rows\n`
writeFileSync(join(out, 'backfill-119-owner.apply.sql'), header('owner backfill: apply') + owner.apply + '\n')
writeFileSync(join(out, 'backfill-119-owner.rollback.sql'), header('owner backfill: rollback') + owner.rollback + '\n')
writeFileSync(join(out, 'renorm-119-attendees.apply.sql'), header('attendee re-normalization: apply') + renorm.apply + '\n')
writeFileSync(join(out, 'renorm-119-attendees.rollback.sql'), header('attendee re-normalization: rollback') + renorm.rollback + '\n')

console.log(`owner backfill: ${owner.count} of ${meetings.length} meetings -> nick-ingraham`)
for (const id of owner.detail) console.log(`  ${id}`)
if (owner.held.length) {
  console.log(`HELD for review (owner-less, created in the window; NOT stamped): ${owner.held.length}`)
  for (const h of owner.held) console.log(`  ${h}`)
}
console.log(`attendee re-normalization: ${renorm.count} meetings change`)
for (const d of renorm.detail) console.log(`  ${d}`)
if (renorm.skipped.length) {
  console.log(`skipped (left as stored): ${renorm.skipped.length}`)
  for (const s of renorm.skipped) console.log(`  ${s}`)
}
console.log(`wrote 4 files to ${out}`)
