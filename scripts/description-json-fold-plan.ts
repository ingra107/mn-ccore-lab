// description-json-fold-plan.ts -- the pure half of the one-off fold of
// tasks.description_json into the plain-markdown tasks.description.
//
// Nick, 2026-11-01: "Yes, one plain-markdown store (Recommended)". The task
// panel now edits `description` directly and no frontend code writes
// description_json; this folds the rows an older panel edit left with text
// only in description_json. Dropping the column is a later, separate change.
//
// Per row with a non-null description_json, classified by the SAME
// descriptionJsonFold() the panel's read fallback uses (src/lib/tiptapToMarkdown.ts):
//   - none         -> every word of it is already in description: description
//                     is left as it is;
//   - fill         -> description was empty: it becomes the JSON markdown;
//   - append       -> the two differ: the JSON markdown goes under a rule, so
//                     neither text is lost;
//   - supersede    -> description's words occur, in order and unbroken, inside
//                     the JSON (the old editor loaded the plain text and the
//                     user added to it). SUGGESTED only: by default it is
//                     appended like any other row. Only an id named in
//                     `replace` takes the JSON markdown alone;
//   - unparseable  -> description is left as it is; the raw JSON is printed.
// So by default the new description holds every word of the stored one: no
// run can delete stored text unless the operator names the row.
// Every outcome keeps the meeting marker the stored description carried, at
// its end, where stripMeetingMarker finds it.
//
// EVERY row also gets description_json = NULL in the same guarded UPDATE, so
// after the fold no row holds JSON and the panel's fallback has nothing left
// to show: a later trim of the description can never bring the old text back.
// The rollback restores both columns. Each UPDATE is guarded on the exact old
// description AND description_json, so a row written since the export is left
// alone (re-export and re-run); the rollback is guarded on the new values the
// same way. A raw UPDATE on tasks bumps seq (trg_tasks_seq_update), so PB's
// pull carries the fold to brain.db.
//
// Why `supersede` is never automatic: from the row alone it cannot tell "the
// user added to the loaded text in the old editor" from "someone later trimmed
// the description" (cold refuter, 2026-11-01). Read the OLD vs PROPOSED block
// before naming a row in --replace.
//
// CLI: scripts/fold-description-json.ts. Tests: api/lib/description-json-fold-plan.test.ts.
// REMOVE WITH THE description_json COLUMN DROP.

import { descriptionJsonFold, tiptapJsonToMarkdown } from '../src/lib/tiptapToMarkdown'
import { stripMeetingMarker, withMeetingMarker } from '../src/lib/textUtils'

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
  /** Rows the apply writes: every row with description_json. */
  count: number
  /** Of those, rows whose description text changes. */
  descriptionChanges: number
  /** One block per row: id, title, outcome, old description, proposed. */
  detail: string[]
}

function lit(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
const RULE = '\n\n---\n\n'

export function planDescriptionJsonFold(
  rows: readonly DescriptionJsonRow[],
  opts: { replace?: readonly string[] } = {},
): FoldPlan {
  const replace = new Set(opts.replace ?? [])
  const apply: string[] = []
  const rollback: string[] = []
  const detail: string[] = []
  let descriptionChanges = 0
  for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!r.description_json) continue
    const parsed = tiptapJsonToMarkdown(r.description_json) !== null
    const fold = descriptionJsonFold(r.description, r.description_json)
    let next = r.description
    let kind: string = parsed ? fold.kind : 'unparseable'
    if (fold.kind !== 'none') {
      // Only an explicit --replace may drop a word of the stored description.
      const swap = fold.kind !== 'fill' && replace.has(r.id)
      const append = fold.kind !== 'fill' && !swap
      if (swap) kind = `${fold.kind}, replaced on --replace`
      else if (fold.kind === 'supersede') kind = `supersede SUGGESTED, appended; pass --replace ${r.id} to take the JSON text alone`
      const body = append ? stripMeetingMarker(r.description ?? '') + RULE + fold.md : fold.md
      next = withMeetingMarker(body, r.description)
      descriptionChanges++
    }
    if (r.deleted_at) kind += `, deleted ${r.deleted_at}`
    // `IS` matches NULL as well as text, so the guards hold for an empty row.
    apply.push(`UPDATE tasks SET description = ${lit(next)}, description_json = NULL, updated_at = ${NOW} WHERE id = ${lit(r.id)} AND description IS ${lit(r.description)} AND description_json IS ${lit(r.description_json)};`)
    rollback.push(`UPDATE tasks SET description = ${lit(r.description)}, description_json = ${lit(r.description_json)}, updated_at = ${NOW} WHERE id = ${lit(r.id)} AND description IS ${lit(next)} AND description_json IS NULL;`)
    const quote = (t: string | null) => (t ?? '(null)').split('\n').map((l) => `    | ${l}`)
    const same = next === r.description
    detail.push([
      `${r.id}  ${r.title ?? ''}  [${kind}]`,
      ...(parsed ? [] : ['  RAW description_json (cleared; kept in the rollback):', ...quote(r.description_json)]),
      '  OLD description:', ...quote(r.description),
      same ? '  description UNCHANGED; description_json -> NULL' : '  PROPOSED description (description_json -> NULL):',
      ...(same ? [] : quote(next)),
    ].join('\n'))
  }
  return { apply: apply.join('\n'), rollback: rollback.join('\n'), count: apply.length, descriptionChanges, detail }
}
