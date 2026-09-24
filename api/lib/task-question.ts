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
  'question_consumed_json',
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

/** Origin prefix applyMutation stamps on every Hub-UI write (mutations.ts). */
export const HUB_UI_ORIGIN_PREFIX = 'hub_ui:';

/**
 * #8842 R4 interim containment (Level 2; the Level-1 fix, a consumer-only
 * receipt column, is planned separately). "Answered is not done: the CONSUMER
 * closes the row" was a rule nothing enforced: a person could tick Done on an
 * answered question in the Hub and PB's question_state would then read it as
 * `consumed`, so /process would never build what the answer approved.
 *
 * Refuses a Hub-UI write that moves a question from any open status to
 * 'done'. Retiring a moot question stays allowed through op=delete (and
 * through status 'deleted' once it is answered; questionRowError refuses
 * that on an unanswered one).
 *
 * What it trusts: `origin_machine` is `hub_ui:<route>` for every Hub-UI
 * write, because Hub routes write tasks only through applyMutation, which
 * stamps it server-side (route_no_raw_writes.test.ts bans raw task writes in
 * the routes). What it cannot stop: /api/mutations takes origin_machine from
 * the caller. That endpoint is PI / API-key only (handleMutations
 * isPiRequest), so only PB or Nick's own key can send a non-hub_ui origin,
 * and PB is the consumer. A PI caller that labels a Hub-UI close as 'home'
 * gets through; so does a raw D1 write.
 */
export function questionConsumerCloseError(
  current: Record<string, unknown>,
  effective: Record<string, unknown>,
  originMachine: string | undefined,
): string | null {
  if (!(originMachine ?? '').startsWith(HUB_UI_ORIGIN_PREFIX)) return null;
  const isQuestion = (current.kind ?? 'task') === 'question' || effective.kind === 'question';
  if (!isQuestion) return null;
  if (current.status === 'done' || effective.status !== 'done') return null;
  // Names only what works from every state: op=delete (the Hub's Delete
  // button). status='deleted' is refused on an UNANSWERED question by
  // questionRowError, so it is not offered here.
  return "question_consumer_close_only: a question is closed by the PB consumer after it acts on the answer; to retire it instead, delete the task (op=delete)";
}

/** The consumer-receipt column (schema-v114, PB mig 135, #8842 R4). */
export const QUESTION_CONSUMED_COL = 'question_consumed_json';

/**
 * #8842 R4, the construction that replaces questionConsumerCloseError's
 * inference. PB reads a question as `consumed` only from a receipt the
 * consumer wrote in the same patch as the close (PB scripts/questions/
 * state.py question_state), never from `status`. This keeps the receipt
 * honest at the one write path:
 *
 *   1. a hub_ui: write may not carry the column at all -- the Hub UI is never
 *      the consumer (belt to TASK_ALLOWED_FIELDS, which already excludes it
 *      from the REST route);                          -> question_consumed_hub_ui
 *   2. a receipt rides only on a kind='question' row, only WITH status 'done',
 *      parses to {v:1, consumer, at, answer_at, evidence} with non-empty
 *      strings, and its answer_at equals the effective answer's `at`, so a
 *      receipt cannot vouch for an answer it never saw -> question_consumed_invalid
 *   3. `enforceClose` (lab_settings hub_validate_question_consumed): a
 *      question may ENTER 'done' only when the same write carries a receipt.
 *                                                       -> question_unconsumed
 *
 * `current` is {} on insert. `patch` is the mutation's own fields (not the
 * effective row): rules 1 and 3 are about what THIS write carries.
 * Deletion (status 'deleted', op=delete) is untouched: retiring is not
 * consuming, and PB reads a deleted question as `anomaly`, never `consumed`.
 *
 * What it trusts: the same as questionConsumerCloseError -- origin_machine
 * is stamped server-side for Hub-UI writes; /api/mutations is PI / API-key
 * only. A PI caller that labels itself 'home' and fabricates a receipt gets
 * through, and so does a raw D1 write. Level 2 (one chokepoint); Level 1
 * would need per-writer authorization in D1, which does not exist.
 */
export function questionConsumedError(
  current: Record<string, unknown>,
  effective: Record<string, unknown>,
  patch: Record<string, unknown>,
  originMachine: string | undefined,
  enforceClose: boolean,
): string | null {
  const carries = Object.prototype.hasOwnProperty.call(patch, QUESTION_CONSUMED_COL);
  if (carries && (originMachine ?? '').startsWith(HUB_UI_ORIGIN_PREFIX)) {
    return `question_consumed_hub_ui: ${QUESTION_CONSUMED_COL} is written only by the PB consumer that acted on the answer, never from the Hub UI`;
  }
  const isQuestion = (effective.kind ?? 'task') === 'question';
  const receipt = carries ? patch[QUESTION_CONSUMED_COL] : undefined;
  const hasReceipt = receipt !== null && receipt !== undefined;
  if (hasReceipt) {
    if (!isQuestion) {
      return `question_consumed_invalid: ${QUESTION_CONSUMED_COL} is only for a kind=question row`;
    }
    if (effective.status !== 'done') {
      return `question_consumed_invalid: a receipt is written only with the close (status='done' in the same write)`;
    }
    const parsed = parseJsonCol(receipt);
    if (!parsed.ok) return `question_consumed_invalid: ${QUESTION_CONSUMED_COL} is not JSON (${parsed.why})`;
    const r = parsed.value;
    if (!isPlainObject(r) || r.v !== 1) {
      return `question_consumed_invalid: ${QUESTION_CONSUMED_COL} must be an object with v=1`;
    }
    for (const k of ['consumer', 'at', 'answer_at', 'evidence']) {
      const val = r[k];
      if (typeof val !== 'string' || val.trim() === '') {
        return `question_consumed_invalid: ${QUESTION_CONSUMED_COL}.${k} must be a non-empty string`;
      }
    }
    const ans = parseJsonCol(effective.question_answer_json);
    const answerAt = ans.ok && isPlainObject(ans.value) ? ans.value.at : undefined;
    if (r.answer_at !== answerAt) {
      return `question_consumed_invalid: ${QUESTION_CONSUMED_COL}.answer_at does not match the answer's at (a receipt binds the answer it acted on)`;
    }
  }
  if (
    enforceClose &&
    isQuestion &&
    effective.status === 'done' &&
    current.status !== 'done' &&
    !hasReceipt
  ) {
    return "question_unconsumed: a question enters 'done' only with the PB consumer's receipt in the same write (question_consumed_json); to retire it instead, delete the task (op=delete)";
  }
  return null;
}
