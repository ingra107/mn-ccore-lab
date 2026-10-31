import type { RefusalCode } from '../../pb-schema/pb_schema/generated/refusal-codes.generated.ts';

/**
 * Trigger RAISE rule id -> the /api/mutations refusal code it carries.
 *
 * A SQLite trigger can return only text (RAISE(ABORT, '<rule_id>: <words>')),
 * so a designed refusal and a writer bug both reach applyErrorResult as a
 * constraint failure. This ONE closed table says which is which. PB owns what
 * each code does (business_rule and question_rule: told to the caller, no
 * page; constraint: a writer bug, loud); the Hub owns which rule qualifies.
 *
 * Every executable RAISE in the migration-built schema must have a row, and
 * every row must be raised by a trigger: trigger-rule-codes.test.ts reads
 * sqlite_master and fails on either gap. An id missing here still works at
 * runtime (it reads as 'constraint', loud, the safe direction); the test is
 * what stops it shipping unclassified.
 *
 * Reachability: only tasks, projects, products and links are in the
 * pb-schema TABLE_FIELDS whitelist AND carry triggers, so only their rule ids
 * can arrive on /api/mutations directly. The rest are listed as 'constraint'
 * so a later route that exposes their tables is loud by default. The join
 * request ids (join_not_listed, join_already_member, join_too_soon,
 * join_request_decided) are business rules by content (codex 2026-10-31) but
 * their table is not writable through /api/mutations; promote them here the
 * day a mutation can reach one.
 *
 * task_parent_not_live STAYS 'constraint': one id covers a parent that does
 * not exist (a writer bug) and one retired since it was picked (a business
 * state). Split it in a forward migration before quieting it.
 *
 * Decision: PB Context/Decisions/2026-10-31-business-rule-refusal-code.md.
 */
export type TriggerRuleCode = Extract<RefusalCode, 'business_rule' | 'question_rule' | 'constraint'>;

export const TRIGGER_RULE_CODES: Readonly<Record<string, TriggerRuleCode>> = {
  // ── business rules: a person finishes, releases or chooses, then retries ──
  task_parent_open_steps: 'business_rule',

  task_parent_done: 'business_rule',
  task_parent_depth: 'business_rule',
  task_parent_question: 'business_rule',
  product_last_live: 'business_rule',
  product_home_live: 'business_rule',
  // ── question rules: the same rules task-question.ts throws as question_rule ─
  question_answer_frozen: 'question_rule',
  question_kind_immutable: 'question_rule',
  // ── integrity or not-reachable: loud ──
  task_parent_not_live: 'constraint',
  checkin_title: 'constraint',
  task_product_project_mismatch: 'constraint',
  product_project_immutable: 'constraint',
  link_product_project_mismatch: 'constraint',
  item_product_project_mismatch: 'constraint',
  project_status_missing: 'constraint',
  project_home_seed_missing: 'constraint',
  project_join_question_shape: 'constraint',
  project_join_question_identity: 'constraint',
  listing_hide_forbidden: 'constraint',
  join_note_forbidden: 'constraint',
  join_not_pending: 'constraint',
  join_not_listed: 'constraint',
  join_already_member: 'constraint',
  join_too_soon: 'constraint',
  join_request_immutable: 'constraint',
  join_request_decided: 'constraint',
  watch_run_incomplete: 'constraint',
  task_packet_version_append_only: 'constraint',
  task_packet_anchor: 'constraint',
  task_packet_lifecycle: 'constraint',
  task_packet_nick_authored: 'constraint',
  task_packet_closed: 'constraint',
  receipt_line_immutable: 'constraint',
};

/**
 * Trigger RAISEs written before rule ids existed: their message starts with
 * words, not an id, so the parser finds none and they read as 'constraint'.
 * Each entry is the message's leading text. The list may only shrink: a new
 * RAISE carries an id and a row in TRIGGER_RULE_CODES.
 */
export const UNLABELLED_LEGACY_RAISES: readonly string[] = [
  'tasks completion triad guard',
  'artifact canary is deploy infrastructure',
  'artifact canary must stay visibility',
  'artifact canary id is pinned',
  'project slug may not be a project id',
  'ai_request terminal result is immutable',
  'ai_request terminal history cannot be deleted',
  'ai_request terminal history cannot be replaced',
];

/**
 * The rule id a trigger message leads with, or null. The message is
 * `<id>: <words>` (vitest's SQLite) or `D1_ERROR: <id>: <words>: SQLITE_CONSTRAINT
 * (extended: SQLITE_CONSTRAINT_TRIGGER)` (workerd). Only the LEADING token is
 * read, and only when it ends at a colon or at the end of the text: a message
 * that merely mentions an id further in is not that rule.
 */
export function leadingRuleId(message: string): string | null {
  const m = /^(?:D1_ERROR: )?([a-z][a-z0-9_]*)(?::|$)/.exec(message);
  return m ? m[1] : null;
}

/** The code and rule id for a constraint failure's message; a registered id
 *  maps to its code, anything else is the loud default with no rule id. */
export function classifyTriggerFailure(message: string): { code: TriggerRuleCode; rule_id?: string } {
  const id = leadingRuleId(message);
  if (id === null || !Object.prototype.hasOwnProperty.call(TRIGGER_RULE_CODES, id)) return { code: 'constraint' };
  return { code: TRIGGER_RULE_CODES[id], rule_id: id };
}
