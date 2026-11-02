// fold-description-json.ts -- fold tasks.description_json into the plain
// markdown tasks.description (Nick, 2026-11-01: one plain-markdown store).
// DRY RUN BY DEFAULT. Touches no database: it reads, prints, and only with
// --emit <dir> writes the apply + rollback SQL for an operator to run.
// REMOVE WITH THE description_json COLUMN DROP.
//
// RUNBOOK (operator; nothing here is automatic):
//   1. Dry run against prod, read-only (one guarded SELECT through
//      scripts/_lib/d1-readonly.ts -> scripts/wrangler-d1):
//        npx tsx scripts/fold-description-json.ts
//      or from an export taken with
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
//          --command "SELECT id, title, description, description_json, deleted_at FROM tasks WHERE description_json IS NOT NULL ORDER BY id" > pre-desc-json.json
//        npx tsx scripts/fold-description-json.ts --rows pre-desc-json.json
//      Read every OLD vs PROPOSED block. A row whose description is
//      non-empty is APPENDED to under a rule by default; name the ids that
//      should take the JSON text alone with --replace id1,id2.
//   2. Emit, right before applying:
//        npx tsx scripts/fold-description-json.ts --rows pre-desc-json.json --emit <dir>
//        scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=<dir>/fold-description-json.apply.sql
//      Each UPDATE is guarded on the exact old description; a row written
//      since the export is left alone (re-export and re-run).
//   3. Verify: re-run step 1; every row reports "nothing to fold".
//   ROLLBACK: <dir>/fold-description-json.rollback.sql (keep the export with it).
//
// The pure planner and its tests: scripts/description-json-fold-plan.ts,
// api/lib/description-json-fold-plan.test.ts.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { rowsFrom } from './meetings-119-plan'
import { d1Select } from './_lib/d1-readonly'
import { planDescriptionJsonFold, type DescriptionJsonRow } from './description-json-fold-plan'

function optional(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const SELECT = 'SELECT id, title, description, description_json, deleted_at FROM tasks WHERE description_json IS NOT NULL ORDER BY id'
const file = optional('rows')
const rows = file
  ? rowsFrom<DescriptionJsonRow>(JSON.parse(readFileSync(file, 'utf8')))
  : d1Select<DescriptionJsonRow>(SELECT)
const plan = planDescriptionJsonFold(rows, {
  replace: (optional('replace') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
})

console.log(`tasks with description_json: ${rows.length} (${file ? `from ${file}` : 'prod, read-only SELECT'})`)
console.log(`to fold: ${plan.count}`)
for (const d of plan.detail) console.log(`\n${d}`)
if (plan.skipped.length) {
  console.log(`\nnot folded: ${plan.skipped.length}`)
  for (const s of plan.skipped) console.log(`  ${s}`)
}
const out = optional('emit')
if (!out) {
  console.log('\ndry run: no SQL written (pass --emit <dir> to write the apply + rollback files)')
} else if (plan.count === 0) {
  console.log('\nnothing to fold: no SQL written')
} else {
  mkdirSync(out, { recursive: true })
  const header = (what: string) => `-- fold description_json -> description: ${what}\n-- ${plan.count} task(s); source ${file ?? 'prod SELECT'}\n`
  writeFileSync(join(out, 'fold-description-json.apply.sql'), header('apply') + plan.apply + '\n')
  writeFileSync(join(out, 'fold-description-json.rollback.sql'), header('rollback') + plan.rollback + '\n')
  console.log(`\nwrote 2 files to ${out} (NOT applied)`)
}
