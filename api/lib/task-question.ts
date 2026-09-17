// task-question.ts — the question-row contract, enforced at the ONE write
// path (schema-v111, PB mig 130, 2026-09-17).
//
// A question is a task row with kind='question'. Three TEXT (JSON) columns
// carry the whole contract (see api/schema-v111-tasks-question.sql):
//   question_spec_json      the ask; required on every question row
//   question_answer_json    NULL = unanswered; the ONLY answer store
//   question_telegram_json  the Telegram card handle; the convergence watermark
//
// Why here and not a CHECK: D1 stores JSON as TEXT and cannot type-check it,
// so the wrong state stays constructible at the storage layer. The narrowest
// place that sees every task write — Hub UI, bulk actions, PB's outbox — is
// applyInsert / applyPatch in api/routes/mutations.ts, and both call ONE
// function here on the EFFECTIVE row (current + patch). Level 2, single
// chokepoint, mechanism stated. PB's BrainDB.update_task mirrors the same
// three rules on its side of the wire.
//
// THE THREE RULES
//   spec      a kind='question' row must carry a parseable spec object
//             -> question_spec_missing / question_spec_invalid
//   answer    a non-null answer must parse to an object with a non-empty
//             string `choice`; choice 'other' needs non-empty `text`
//             -> question_answer_invalid
//   unanswered a kind='question' row cannot land at status 'done' or 'deleted'
//             while the answer is NULL. Answered is not done: the CONSUMER
//             closes the row after its durable effect. -> question_unanswered
//   telegram  a non-null handle must parse to an object -> question_telegram_invalid
//
// Every error string opens with its code and a colon, the same shape
// applyPatch's `lmm_invalid:` uses, so a caller can match on the code.
//
// NORMALIZATION. A Hub-UI writer sends these columns as objects
// (mutateTask({fields:{question_answer_json:{choice,...}}})); D1 refuses an
// object binding. normalizeQuestionJsonFields serializes an object to its JSON
// text and leaves a string EXACTLY as sent — PB hashes the bytes it wrote
// (base_row_hash, mutations.ts hashTouched), so re-serializing a string here
// would manufacture a false conflict on the next PB update.

export const QUESTION_JSON_COLS = [
  'question_spec_json',
  'question_answer_json',
  'question_telegram_json',
] as const;

export type QuestionJsonCol = (typeof QUESTION_JSON_COLS)[number];

/** Choice key reserved for the free-text answer; needs non-empty `text`. */
export const QUESTION_OTHER_CHOICE = 'other';

/** Statuses a question may not reach while unanswered. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['done', 'deleted']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Object -> JSON text for the three question columns; strings, null and
 * undefined pass through untouched. Returns a shallow copy only when something
 * changed, so callers can keep their identity checks.
 */
export function normalizeQuestionJsonFields<T extends Record<string, unknown>>(fields: T): T {
  let out: Record<string, unknown> | null = null;
  for (const col of QUESTION_JSON_COLS) {
    if (!Object.prototype.hasOwnProperty.call(fields, col)) continue;
    const v = fields[col];
    if (isPlainObject(v)) {
      out ??= { ...fields };
      out[col] = JSON.stringify(v);
    }
  }
  return (out ?? fields) as T;
}

/** Parse one JSON column. Returns {ok, value} or {ok:false, why}. */
function parseJsonCol(raw: unknown): { ok: true; value: unknown } | { ok: false; why: string } {
  if (typeof raw !== 'string') {
    return { ok: false, why: `expected JSON text, got ${raw === null ? 'null' : typeof raw}` };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, why: (e as Error).message };
  }
}

/**
 * The contract, over the EFFECTIVE row. Returns null when the row is legal,
 * else the first violation as `<code>: <reason>`.
 *
 * `effective` is the row as it would be stored: for an insert the payload
 * (kind defaults to 'task' when absent, matching the column default); for an
 * update `{...current, ...patch}`. Non-question rows are checked only for
 * answer/telegram shape when those columns are present, so a stray JSON
 * string on an ordinary task still fails loud.
 */
export function questionRowError(effective: Record<string, unknown>): string | null {
  const kind = effective.kind ?? 'task';
  const isQuestion = kind === 'question';

  // spec: required and well-formed on a question row.
  const spec = effective.question_spec_json;
  if (isQuestion && (spec === null || spec === undefined || spec === '')) {
    return 'question_spec_missing: a kind=question task requires question_spec_json';
  }
  if (spec !== null && spec !== undefined) {
    const parsed = parseJsonCol(spec);
    if (!parsed.ok) return `question_spec_invalid: question_spec_json is not JSON (${parsed.why})`;
    if (!isPlainObject(parsed.value)) return 'question_spec_invalid: question_spec_json must be a JSON object';
  }

  // answer: NULL = unanswered; non-null must name a choice.
  const answer = effective.question_answer_json;
  const answered = answer !== null && answer !== undefined;
  if (answered) {
    const parsed = parseJsonCol(answer);
    if (!parsed.ok) return `question_answer_invalid: question_answer_json is not JSON (${parsed.why})`;
    if (!isPlainObject(parsed.value)) return 'question_answer_invalid: question_answer_json must be a JSON object';
    const choice = parsed.value.choice;
    if (typeof choice !== 'string' || choice.trim() === '') {
      return 'question_answer_invalid: question_answer_json.choice must be a non-empty string';
    }
    if (choice === QUESTION_OTHER_CHOICE) {
      const text = parsed.value.text;
      if (typeof text !== 'string' || text.trim() === '') {
        return `question_answer_invalid: choice '${QUESTION_OTHER_CHOICE}' requires non-empty question_answer_json.text`;
      }
    }
  }

  // telegram: a handle, when present, is an object.
  const telegram = effective.question_telegram_json;
  if (telegram !== null && telegram !== undefined) {
    const parsed = parseJsonCol(telegram);
    if (!parsed.ok) return `question_telegram_invalid: question_telegram_json is not JSON (${parsed.why})`;
    if (!isPlainObject(parsed.value)) return 'question_telegram_invalid: question_telegram_json must be a JSON object';
  }

  // unanswered: a question cannot close with no answer.
  const status = effective.status;
  if (isQuestion && !answered && typeof status === 'string' && CLOSED_STATUSES.has(status)) {
    return `question_unanswered: a kind=question task cannot reach status='${status}' while question_answer_json is NULL (answer it, or op=delete to retire a moot question)`;
  }

  return null;
}
