// description-json-fold-plan.ts -- the pure half of the one-off fold of
// tasks.description_json into the plain-markdown tasks.description.
//
// Nick, 2026-11-01: "Yes, one plain-markdown store (Recommended)". The task
// panel now edits `description` directly and no frontend code writes
// description_json; this folds the rows an older panel edit left with text
// only in description_json. Dropping the column is a later, separate change.
//
// Per row with a non-null description_json:
//   - unparseable           -> listed, never planned;
//   - deleted               -> listed, never planned;
//   - words already inside description (the editor merely loaded the plain
//     text, or the row was folded before) -> listed as nothing to fold;
//   - description empty     -> description := the JSON as markdown;
//   - description non-empty -> APPEND the JSON markdown under a rule, so
//     neither text is lost (which one is newer is not knowable from the row);
//     `replace` ids instead take the JSON markdown alone, keeping any meeting
//     marker the stored description carried.
// Each UPDATE is guarded on the exact old description, so a row written since
// the export is left alone; the rollback is guarded on the new value the same
// way. description_json itself is not touched (the column drop removes it).
// A raw UPDATE on tasks bumps seq (trg_tasks_seq_update), so PB's pull
// carries the fold to brain.db.
//
// CLI: scripts/fold-description-json.ts. Tests: api/lib/description-json-fold-plan.test.ts.
// REMOVE WITH THE description_json COLUMN DROP.

import { tiptapJsonToMarkdown, unfoldedDescriptionJson } from '../src/lib/tiptapToMarkdown'
import { withMeetingMarker } from '../src/lib/textUtils'

export interface DescriptionJsonRow {
  id: string
  title?: string | null
  description: string | null
  description_json: string | null
  deleted_at?: string | null
}

export interface FoldPlan {
  apply: string
  rollback: string
  count: number
  /** One block per planned row: id, title, old description, proposed. */
  detail: string[]
  /** "<id>  <why>" per row with description_json that is not planned. */
  skipped: string[]
}

function lit(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function planDescriptionJsonFold(
  rows: readonly DescriptionJsonRow[],
  opts: { replace?: readonly string[] } = {},
): FoldPlan {
  const replace = new Set(opts.replace ?? [])
  const apply: string[] = []
  const rollback: string[] = []
  const detail: string[] = []
  const skipped: string[] = []
  for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!r.description_json) continue
    const md = tiptapJsonToMarkdown(r.description_json)
    if (md === null) { skipped.push(`${r.id}  description_json is not a parseable document`); continue }
    if (r.deleted_at) { skipped.push(`${r.id}  deleted (${r.deleted_at})`); continue }
    if (!unfoldedDescriptionJson(r.description, r.description_json)) {
      skipped.push(`${r.id}  nothing to fold: description already holds its text`)
      continue
    }
    const old = r.description && r.description.trim() ? r.description : null
    const next = old === null ? md
      : replace.has(r.id) ? withMeetingMarker(md, old)
      : `${old.trimEnd()}\n\n---\n\n${md}`
    // `IS` matches NULL as well as text, so the guard holds for an empty row.
    apply.push(`UPDATE tasks SET description = ${lit(next)}, updated_at = ${NOW} WHERE id = ${lit(r.id)} AND description IS ${lit(r.description)};`)
    rollback.push(`UPDATE tasks SET description = ${lit(r.description)}, updated_at = ${NOW} WHERE id = ${lit(r.id)} AND description IS ${lit(next)};`)
    detail.push([
      `${r.id}  ${r.title ?? ''}  [${old === null ? 'empty description' : replace.has(r.id) ? 'replace' : 'append'}]`,
      '  OLD description:',
      ...(r.description ?? '(null)').split('\n').map((l) => `    | ${l}`),
      '  PROPOSED description:',
      ...next.split('\n').map((l) => `    | ${l}`),
    ].join('\n'))
  }
  return { apply: apply.join('\n'), rollback: rollback.join('\n'), count: apply.length, detail, skipped }
}
