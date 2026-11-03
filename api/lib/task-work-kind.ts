// task-work-kind.ts -- who may place a task's kind of work (schema-v157, 2026-11-03).
//
// tasks.work_kind (review | writing | analysis | admin; NULL = the Today Sort
// strip) places a task in a Today section; tasks.work_kind_set says who placed
// it: 'auto' (a machine, or nobody yet) or 'hand' (Nick, through the sort
// route). Nick, 2026-11-03: "Hand placement beats everything (Recommended)",
// and a nightly fill "never moves a hand placement". Decision: PB
// Context/Decisions/2026-11-03-today-sections-and-checkin-prefix.md; the
// transition table is codex round 3 (PB Scratch/consults/2026-11-03-today-
// sections/round3/codex-last.md, Q1).
//
// THE AUTH PATH DECIDES, never the caller. `isPbKey` is originOf(env) !== null:
// the receipts middleware stamps env.RECEIPT_ORIGIN only for a valid PB_API_KEY
// (api/lib/receipts.ts), which is PB itself and the Gmail Apps Script. A browser
// session never has it. work_kind_set is not in pb-schema TABLE_FIELDS, so no
// caller can send it at all (unknown_field); only this module stamps it.
//
//   generic door (/api/mutations, applyMutation):
//     PB key  -> a FILL of a (NULL, auto) row, or a CLEAR of an auto kind. A
//                hand placement is refused (work_kind_hand_set) and so is one
//                machine kind over another (work_kind_fill_only), both
//                business_rule: told to the caller, never retried or paged.
//     session -> refused (work_kind_writer): a hand placement goes only
//                through POST /api/tasks/:id/sort, which logs it. A receipt
//                Undo runs with RECEIPT_ORIGIN cleared, so an undo of a PB fill
//                is refused here too; `fill_work_kind.py --rollback` clears it.
//   insert:
//     PB key  -> the column default 'auto'.
//     session -> a create carrying a kind is a placement: 'hand'. No event:
//                the sort log counts sorting, not creating (RULING, lane A).
//   sort route (applyWorkKindSort in mutations.ts): the only door to 'hand'
//     and to Reset; refused under the PB key. Its event row rides the same
//     batch and is what lets trg_tasks_work_kind_transition pass the write.
//
// Level 2 here (one chokepoint, applyInsert + applyPatch), Level 1 for the
// value (FK) and the transition (trigger) at the store; why Level 1 is
// unreachable for the WHO: D1 has no per-writer authorization.

export const WORK_KIND_COL = 'work_kind';
export const WORK_KIND_SET_COL = 'work_kind_set';

export type SortOp = 'sort' | 'unsort' | 'reset';
export const SORT_OPS: readonly SortOp[] = ['sort', 'unsort', 'reset'];

/** A hand sort, unsort or Reset, as the sort route hands it to the mutation door. */
export interface SortCommand {
  op: SortOp;
  /** Required for 'sort'; must be null for 'unsort' and 'reset'. */
  work_kind: string | null;
  /** The Today section the row sat in when Nick acted (the UI's resolver output). */
  from_section: string | null;
  /** Optional "a category is missing" note from the Sort strip. */
  missing_category_note: string | null;
  /** The signed-in person (their slug). */
  actor: string;
}

export interface WorkKindRefusal {
  code: 'business_rule' | 'value_invalid';
  message: string;
}

/** The pair a sort command produces. */
export function sortTarget(cmd: SortCommand): { work_kind: string | null; work_kind_set: 'auto' | 'hand' } {
  if (cmd.op === 'sort') return { work_kind: cmd.work_kind, work_kind_set: 'hand' };
  if (cmd.op === 'unsort') return { work_kind: null, work_kind_set: 'hand' };
  return { work_kind: null, work_kind_set: 'auto' };
}

const MAX_SECTION = 64;
const MAX_NOTE = 500;

/**
 * The sort route's body -> a command, or the reason it is malformed. The kind
 * itself is checked against work_kinds later, by the mutation door.
 */
export function parseSortBody(body: unknown, actor: string): SortCommand | string {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const b = body as Record<string, unknown>;
  const op = b.op;
  if (typeof op !== 'string' || !(SORT_OPS as readonly string[]).includes(op)) {
    return `op must be one of ${SORT_OPS.join(', ')}`;
  }
  const kind = b.work_kind ?? null;
  if (op === 'sort' && (typeof kind !== 'string' || !kind)) return "op 'sort' needs work_kind";
  if (op !== 'sort' && kind !== null) return `op '${op}' takes no work_kind`;
  const text = (v: unknown, max: number, name: string): string | null | Error => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string') return new Error(`${name} must be a string`);
    return v.length > max ? new Error(`${name} is longer than ${max} characters`) : v;
  };
  const from = text(b.from_section, MAX_SECTION, 'from_section');
  if (from instanceof Error) return from.message;
  const note = text(b.missing_category_note, MAX_NOTE, 'missing_category_note');
  if (note instanceof Error) return note.message;
  return { op: op as SortOp, work_kind: kind as string | null, from_section: from, missing_category_note: note, actor };
}

/** Refusal message when `code` is not an ACTIVE work_kinds row, else null. */
export async function unknownWorkKind(db: D1Database, code: unknown): Promise<string | null> {
  if (code === null || code === undefined) return null;
  if (typeof code !== 'string') return `work_kind_unknown: work_kind must be a string or null`;
  const row = await db.prepare('SELECT active FROM work_kinds WHERE code = ?').bind(code).first<{ active: number }>();
  if (!row) return `work_kind_unknown: '${code}' is not a kind of work (work_kinds)`;
  if (Number(row.active) !== 1) return `work_kind_unknown: '${code}' is retired (work_kinds.active = 0)`;
  return null;
}

/**
 * The generic door's rule for a patch that names work_kind (no sort command).
 * `current` is the committed row. Returns a refusal or null. A patch that
 * carries the stored value unchanged (a whole-row echo) is no change and passes.
 */
export function workKindPatchRefusal(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  isPbKey: boolean,
): WorkKindRefusal | null {
  if (!Object.prototype.hasOwnProperty.call(patch, WORK_KIND_COL) || patch[WORK_KIND_COL] === undefined) return null;
  const next = patch[WORK_KIND_COL] ?? null;
  const stored = current[WORK_KIND_COL] ?? null;
  if (next === stored) return null;
  if (!isPbKey) {
    return {
      code: 'value_invalid',
      message: 'work_kind_writer: a hand placement goes through POST /api/tasks/:id/sort (logged); this door takes only a PB fill',
    };
  }
  if ((current[WORK_KIND_SET_COL] ?? 'auto') === 'hand') {
    return {
      code: 'business_rule',
      message: `work_kind_hand_set: placed by hand (${stored ?? 'Sort'}); an automatic write does not move it`,
    };
  }
  if (next !== null && stored !== null) {
    return {
      code: 'business_rule',
      message: `work_kind_fill_only: already ${stored}; an automatic write fills only an unsorted task`,
    };
  }
  return null;
}

/**
 * The sort event row, inserted BEFORE the row write in the same batch (the
 * transition trigger looks for it by this write's mutation id). A retry of the
 * same mutation id after a landed write is a no-op (ON CONFLICT DO NOTHING).
 */
export function sortEventInsert(
  db: D1Database, cmd: SortCommand, taskId: string, mutationId: string,
  current: Record<string, unknown>, at: string,
): D1PreparedStatement {
  const to = sortTarget(cmd);
  return db.prepare(
    `INSERT INTO task_sort_events
       (mutation_id, task_id, actor, at, op, from_kind, from_set, to_kind, to_set, from_section, missing_category_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(mutation_id) DO NOTHING`,
  ).bind(
    mutationId, taskId, cmd.actor, at, cmd.op,
    (current[WORK_KIND_COL] ?? null) as string | null,
    (current[WORK_KIND_SET_COL] ?? 'auto') as string,
    to.work_kind, to.work_kind_set, cmd.from_section, cmd.missing_category_note,
  );
}

/**
 * Runs AFTER the receipt insert in the same batch: when the row write did not
 * land (a compare-and-swap miss) this mutation has no terminal receipt, so its
 * event is taken back and the log holds only placements that happened. When a
 * duplicate of an already-landed mutation id runs, the earlier receipt exists
 * and the earlier event stays.
 */
export function sortEventCleanup(db: D1Database, mutationId: string): D1PreparedStatement {
  return db.prepare(
    `DELETE FROM task_sort_events WHERE mutation_id = ?
       AND NOT EXISTS (SELECT 1 FROM processed_mutations WHERE mutation_id = ? AND outcome != 'dependency_failed')`,
  ).bind(mutationId, mutationId);
}
