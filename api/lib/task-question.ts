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
// chokepoint, mechanism stated. This is the ONLY judge of a question write
// (L-Q23, 2026-10-08): PB stops pre-judging patches from its cache and reads
// the refusal's `code` (question_rule / question_shape / question_consumer) instead.
//
// THE RULES (questionRowError, on the effective row)
//   spec      a kind='question' row must carry a parseable spec object
//             -> question_spec_missing / question_spec_invalid
//   answer    a non-null answer must parse to an object with a non-empty
//             string `choice`; choice 'other' needs non-empty `text`
//             -> question_answer_invalid
//   unanswered a kind='question' row cannot land at status 'done' or 'deleted'
//             while the answer is NULL. Answered is not done: the CONSUMER
//             closes the row after its durable effect. -> question_unanswered
//   week_plan a source='week_plan' question's spec follows shared/weekPlan.ts
//             weekPlanSpecError -> question_spec_invalid; its answer carries a
//             typed `picks` array that weekPlanPicksError accepts against that
//             spec -> question_answer_invalid. On any other question an answer
//             MAY carry `picks`; when it does, the shape rules apply (no spec).
//             (PB decision 2026-10-30-planning-conversation.md, v1 contract.)
//   telegram  a non-null handle must parse to an object -> question_telegram_invalid
//   non-question  a spec or answer only on a kind='question' row
//             -> question_field_on_non_question
// plus questionPatchError (what the write carries): question_spec_immutable,
// question_choice_unknown, question_choice_is_snooze, question_kind_immutable.
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

import type { RefusalCode } from '../../pb-schema/pb_schema/generated/refusal-codes.generated.ts';
import { WEEK_PLAN_SOURCE, parseWeekPlanSpec, weekPlanExpired, weekPlanFlipError, weekPlanPicksError, weekPlanSpecError } from '../../shared/weekPlan';
import { nowInstant } from './time';

/**
 * Every error code this module returns -> the /api/mutations refusal code
 * (L-Q23, 2026-10-08). Three families, so PB can treat them differently:
 *   question_rule      quiet: the rules PB's cache validator used to pre-refuse
 *                      (so a refusal of them never alerted); now the Hub's alone
 *   question_shape     loud: a malformed spec / answer / handle is a writer bug
 *   question_consumer  loud: a close the consumer rules refuse (#8842 R4)
 * `QuestionError` is a template-literal type over these keys, so a function
 * here cannot return a string whose code has no row in this map.
 */
export const QUESTION_ERROR_CODES = {
  question_field_on_non_question: 'question_rule',
  question_spec_immutable: 'question_rule',
  question_choice_unknown: 'question_rule',
  question_choice_is_snooze: 'question_rule',
  question_answer_frozen: 'question_rule',
  question_expired: 'question_rule',
  week_plan_answered: 'question_rule',
  question_kind_immutable: 'question_rule',
  question_spec_missing: 'question_shape',
  question_spec_invalid: 'question_shape',
  question_answer_invalid: 'question_shape',
  question_telegram_invalid: 'question_shape',
  question_unanswered: 'question_consumer',
  question_consumed_hub_ui: 'question_consumer',
  question_consumed_invalid: 'question_consumer',
  question_unconsumed: 'question_consumer',
} as const satisfies Record<string, RefusalCode>;

export type QuestionErrorCode = keyof typeof QUESTION_ERROR_CODES;
export type QuestionError = `${QuestionErrorCode}: ${string}`;

/** The refusal code for an error this module returned. */
export function questionRefusalCode(err: QuestionError): RefusalCode {
  return QUESTION_ERROR_CODES[err.slice(0, err.indexOf(':')) as QuestionErrorCode];
}

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
export function questionRowError(effective: Record<string, unknown>): QuestionError | null {
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
  const isWeekPlan = isQuestion && effective.source === WEEK_PLAN_SOURCE;
  if (isWeekPlan) {
    const why = weekPlanSpecError(spec);
    if (why) return `question_spec_invalid: ${why}`;
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
    // picks (v1 contract, 2026-10-30): required on a week_plan answer and
    // judged against its spec; optional elsewhere, shape-judged when present.
    if (isWeekPlan) {
      const why = weekPlanPicksError(parsed.value.picks, parseWeekPlanSpec(spec));
      if (why) return `question_answer_invalid: ${why}`;
    } else if (parsed.value.picks !== undefined) {
      const why = weekPlanPicksError(parsed.value.picks, null);
      if (why) return `question_answer_invalid: ${why}`;
    }
  }

  // telegram: a handle, when present, is an object.
  const telegram = effective.question_telegram_json;
  if (telegram !== null && telegram !== undefined) {
    const parsed = parseJsonCol(telegram);
    if (!parsed.ok) return `question_telegram_invalid: question_telegram_json is not JSON (${parsed.why})`;
    if (!isPlainObject(parsed.value)) return 'question_telegram_invalid: question_telegram_json must be a JSON object';
  }

  // non-question: only a question row holds a spec or an answer (L-Q23,
  // 2026-10-08). Judged on the EFFECTIVE row, so a patch that clears both
  // (NULL) is legal (a kind change on an existing row is questionPatchError's
  // question_kind_immutable, #8842), and the Telegram handle stays allowed on
  // any row (legacy
  // source='meeting_approval' rows that are still kind='task' carry one).
  // PB's BrainDB used to refuse this from its CACHE kind; a NULL cache kind
  // then refused a real answer. The Hub row is the one that knows the kind.
  if (!isQuestion) {
    const stray = (['question_spec_json', 'question_answer_json'] as const).filter(
      (c) => effective[c] !== null && effective[c] !== undefined,
    );
    if (stray.length > 0) {
      return `question_field_on_non_question: ${stray.join(', ')} on a kind=${String(kind)} task; only a kind=question task holds a spec or an answer`;
    }
  }

  // unanswered: a question cannot close with no answer.
  const status = effective.status;
  if (isQuestion && !answered && typeof status === 'string' && CLOSED_STATUSES.has(status)) {
    return `question_unanswered: a kind=question task cannot reach status='${status}' while question_answer_json is NULL (answer it, or op=delete to retire a moot question)`;
  }

  return null;
}

/** The keys a stored spec offers, plus the free-text choice every question
 *  carries (PB's Ask appends `other` by construction). Null when the spec has
 *  no readable choices list: then there is nothing to judge an answer against,
 *  and questionRowError has already judged the spec's own shape. */
function specChoiceKeys(spec: unknown): Set<string> | null {
  if (spec === null || spec === undefined) return null;
  const parsed = parseJsonCol(spec);
  if (!parsed.ok || !isPlainObject(parsed.value)) return null;
  const choices = parsed.value.choices;
  if (!Array.isArray(choices)) return null;
  const keys = new Set<string>([QUESTION_OTHER_CHOICE]);
  for (const c of choices) {
    if (isPlainObject(c) && typeof c.key === 'string') keys.add(c.key);
  }
  return keys;
}

/** The spec's choice object for `key`, or null. */
function specChoice(spec: unknown, key: string): Record<string, unknown> | null {
  if (spec === null || spec === undefined) return null;
  const parsed = parseJsonCol(spec);
  if (!parsed.ok || !isPlainObject(parsed.value) || !Array.isArray(parsed.value.choices)) return null;
  for (const c of parsed.value.choices) {
    if (isPlainObject(c) && c.key === key) return c;
  }
  return null;
}

/**
 * The two question rules that need to know what THIS write carries, not just
 * the row it produces (L-Q23, 2026-10-08; ported from PB's BrainDB, which
 * judged them from its cache copy of the row and so could refuse a write the
 * Hub row allowed):
 *
 *   spec immutable  a non-null spec in the write must equal the stored one
 *                   when one is stored. The buttons Nick saw are the buttons
 *                   the consumer acts on. Clearing (NULL) is not a rewrite;
 *                   questionRowError judges what clearing leaves behind.
 *                                                    -> question_spec_immutable
 *   choice known    an answer in the write names one of the spec's choice
 *                   keys (or `other`). Judged only when the write carries the
 *                   answer, so an old row is never refused for an answer it
 *                   already holds.                   -> question_choice_unknown
 *   snooze is not   an answer naming a choice the spec declares a snooze
 *   an answer       (payload.snooze_days, 2026-10-22: a "Not yet") is
 *                   refused. Picking it writes due_date (Hub card,
 *                   Telegram), never question_answer_json; a "Not yet"
 *                   stored as an answer reads `answered` to every consumer
 *                   and nothing ever asks again (#2079's question sat that
 *                   way from 2026-10-13).            -> question_choice_is_snooze
 *   kind fixed      on an EXISTING row, a write may not move it into or out
 *                   of kind='question' (#8842). questionConsumedError judges
 *                   a close by the effective kind, so a flip question->task
 *                   (one write, or two) would walk a close past the receipt
 *                   rule. task<->milestone stays legal; re-sending the same
 *                   kind is not a change. Retire the row (op=delete) and mint
 *                   a new one instead. schema-v142 refuses the same flip in
 *                   D1 for any writer that bypasses applyPatch.
 *                                                    -> question_kind_immutable
 *
 * `current` is {} on insert; `patch` is the write's own (normalized) fields.
 */
export function questionPatchError(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): QuestionError | null {
  const has = (c: string) => Object.prototype.hasOwnProperty.call(patch, c);

  // An insert passes current = {}; only an existing row has a kind to keep.
  if (has('kind') && Object.keys(current).length > 0) {
    const wasQuestion = (current.kind ?? 'task') === 'question';
    const isQuestion = (patch.kind ?? 'task') === 'question';
    if (wasQuestion !== isQuestion) {
      return `question_kind_immutable: a task's question-ness is fixed when it is created (kind ${String(current.kind ?? 'task')} -> ${String(patch.kind ?? 'task')} refused); retire it (op=delete) and mint a new row instead`;
    }
  }

  const storedSpec = current.question_spec_json;
  if (
    has('question_spec_json') &&
    patch.question_spec_json !== null && patch.question_spec_json !== undefined &&
    storedSpec !== null && storedSpec !== undefined &&
    patch.question_spec_json !== storedSpec
  ) {
    return 'question_spec_immutable: question_spec_json cannot change once set';
  }

  if (has('question_answer_json')) {
    const answer = parseJsonCol(patch.question_answer_json);
    const choice = answer.ok && isPlainObject(answer.value) ? answer.value.choice : undefined;
    if (typeof choice === 'string') {
      const spec = has('question_spec_json') ? patch.question_spec_json : storedSpec;
      const keys = specChoiceKeys(spec);
      if (keys && !keys.has(choice)) {
        return `question_choice_unknown: answer choice '${choice}' is not one of the spec's choices (${[...keys].join(', ')})`;
      }
      const picked = specChoice(spec, choice);
      const payload = picked && isPlainObject(picked.payload) ? picked.payload : null;
      if (payload && payload.snooze_days !== undefined && payload.snooze_days !== null) {
        return `question_choice_is_snooze: choice '${choice}' is a snooze (payload.snooze_days=${String(payload.snooze_days)}), not an answer; write due_date instead`;
      }
    }
  }
  return null;
}

/**
 * A project_join Approve or Decline IS the decision (schema-v139): the database
 * turned it into a membership or a decline in the same transaction, so it
 * cannot be undone or re-answered, and neither can a closed question. An
 * 'Other' is a note, not a decision; the database clears it at once. applyPatch checks this FIRST, so a late Telegram tap after Nate
 * decided on Today, or the card's Undo, is refused with the quiet
 * question_rule code rather than whichever loud rule the cleared answer would
 * break next. The schema-v139 trigger is the backstop for any writer that
 * bypasses applyPatch.                                -> question_answer_frozen
 */
export function questionAnswerFrozenError(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): QuestionError | null {
  if (!Object.prototype.hasOwnProperty.call(patch, 'question_answer_json')) return null;
  // A week plan's answer is the work it started (v1 contract, 2026-10-30): the
  // same write created one ai_request per started pick, so a second answer
  // (or an Undo then a re-answer) would start them again. One answer per
  // offer; Re-plan mints a new offer. Same refusal as a decided join request.
  //
  // One follow-up shape is allowed (2026-10-31): a start flip, the stored
  // answer with saved picks flipped start false -> true and nothing else
  // (shared/weekPlan.ts weekPlanFlipError). It starts only the flipped picks,
  // through the same cap and batch as a first Start.
  //
  // An offer past its expires_at takes no answer and no flip: its options were
  // written for a week that is over (question_expired, quiet). An Undo to null
  // is still refused as frozen when an answer is stored.
  if (current.source === WEEK_PLAN_SOURCE) {
    const storedPlan = current.question_answer_json;
    const next = patch.question_answer_json;
    if (next === storedPlan) return null;
    const spec = parseWeekPlanSpec(current.question_spec_json);
    if (next !== null && next !== undefined && spec && weekPlanExpired(spec, nowInstant())) {
      return `question_expired: this week plan expired at ${spec.expires_at}; a new one is offered Sunday`;
    }
    if (storedPlan === null || storedPlan === undefined) return null;
    if (spec && next !== null && next !== undefined && weekPlanFlipError(storedPlan, next, spec) === null) return null;
    return 'question_answer_frozen: this week plan was already answered; only starting saved picks may follow (Re-plan asks again)';
  }
  if (current.source !== 'project_join') return null;
  const stored = current.question_answer_json;
  if (stored === null || stored === undefined) return null;
  if (patch.question_answer_json === stored) return null;
  // Only a decision freezes (Nick 2026-10-13, "Stays pending"): an 'Other'
  // note never stays stored on an open question, so a stored answer that is
  // not approve/decline on an open row is not a decision.
  const parsed = parseJsonCol(stored);
  const choice = parsed.ok && isPlainObject(parsed.value) ? parsed.value.choice : undefined;
  if (choice !== 'approve' && choice !== 'decline' && current.status !== 'done') return null;
  return 'question_answer_frozen: this join request was already decided; its answer cannot change';
}

/** Origin prefix applyMutation stamps on every Hub-UI write (mutations.ts). */
export const HUB_UI_ORIGIN_PREFIX = 'hub_ui:';

/** The consumer-receipt column (schema-v114, PB mig 135, #8842 R4). */
export const QUESTION_CONSUMED_COL = 'question_consumed_json';

/**
 * #8842 R4: consumption is a written fact, not an inference from `status`.
 * PB reads a question as `consumed` only from a receipt the
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
 *   3. a question may ENTER 'done' only when the same write carries a
 *      receipt. Unconditional since Hub v142 (it was behind lab_settings
 *      hub_validate_question_consumed, which a flag-read failure turned
 *      off); it subsumes the Hub-UI-close refusal it replaced, because a
 *      hub_ui: write can never carry a receipt (rule 1).
 *                                                       -> question_unconsumed
 *
 * `current` is {} on insert. `patch` is the mutation's own fields (not the
 * effective row): rules 1 and 3 are about what THIS write carries. Rule 3
 * reads `effective.kind`, which is the stored kind on an existing row:
 * questionPatchError refuses a write that moves a row into or out of
 * 'question' (question_kind_immutable), so a kind flip cannot get a close
 * past this rule, and schema-v142 refuses the flip in D1 too.
 * Deletion (status 'deleted', op=delete) is untouched: retiring is not
 * consuming, and PB reads a deleted question as `anomaly`, never `consumed`.
 *
 * What it trusts: origin_machine is `hub_ui:<route>` for every Hub-UI write,
 * stamped server-side by applyMutation (route_no_raw_writes.test.ts bans raw
 * task writes in the routes); /api/mutations is PI / API-key only. A PI
 * caller that labels itself 'home' and fabricates a receipt gets through,
 * and so does a raw D1 write. Level 2 (one chokepoint); Level 1 would need
 * per-writer authorization in D1, which does not exist.
 */
export function questionConsumedError(
  current: Record<string, unknown>,
  effective: Record<string, unknown>,
  patch: Record<string, unknown>,
  originMachine: string | undefined,
): QuestionError | null {
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
    isQuestion &&
    effective.status === 'done' &&
    current.status !== 'done' &&
    !hasReceipt
  ) {
    return "question_unconsumed: a question enters 'done' only with the PB consumer's receipt in the same write (question_consumed_json); to retire it instead, delete the task (op=delete)";
  }
  return null;
}

/**
 * A week plan is minted unanswered (2026-10-31): an answer born with the row
 * would skip the Start path (week-plan-start.ts acts on updates only), so its
 * started picks would never become requests. Checked on the insert arm only.
 */
export function weekPlanInsertError(payload: Record<string, unknown>): QuestionError | null {
  if (payload.source !== WEEK_PLAN_SOURCE) return null;
  const a = payload.question_answer_json;
  return a === null || a === undefined ? null : 'question_answer_invalid: a week plan is minted unanswered';
}

/**
 * An answered week plan is the week's plan (2026-10-31): its picks are This
 * week on Today and its started requests point back at it
 * (plan_question_id), so it is never deleted. PB's Sunday supersede deletes
 * only unanswered offers, but it reads before it writes; this refusal closes
 * that race on every path (applyPatch for a status 'deleted' / deleted_at
 * patch, decideAndCommitDelete for op=delete). The CAS on the evaluated row
 * means an answer landing between the read and the delete makes the delete
 * re-read and refuse.
 */
export function weekPlanDeleteError(
  current: Record<string, unknown>,
  patch: Record<string, unknown> | null,
): QuestionError | null {
  if (current.source !== WEEK_PLAN_SOURCE || (current.kind ?? 'task') !== 'question') return null;
  const a = current.question_answer_json;
  if (a === null || a === undefined) return null;
  const deleting = patch === null
    || patch.status === 'deleted'
    || (patch.deleted_at !== undefined && patch.deleted_at !== null);
  return deleting ? 'week_plan_answered: an answered week plan is the week\'s plan and cannot be deleted' : null;
}
