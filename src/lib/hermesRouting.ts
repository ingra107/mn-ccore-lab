// Compose-prefix routing contracts, shared by every compose surface so the
// routing semantics cannot drift between them (ethos #4 — each was inlined
// twice: @hermes in TaskDetailPanel + SmartCompose, @backlog in
// TaskDetailPanel + MorningThoughtCompose).
//
// A typed "@hermes …" PREFIX is a command: it routes to /api/ai-requests
// (source_type='daily_thought', source_id=<task_id>) for a real Hermes
// round-trip, read back by TaskHermesReplies. A mid-text @hermes mention
// ("ask @hermes about X") is NOT a command and stays a team-visible comment.
// Consumers: TaskDetailPanel (OverviewQuickAdd inline composer) + SmartCompose
// task mode (Today drawer, MyTasks InlineDetail).
//
// A typed "@backlog[:] …" PREFIX routes to /api/ai-requests with
// source_type='backlog_idea' — same ai-requests lane, different downstream
// consumer (the improvement backlog, not a Hermes reply thread). The optional
// colon (`@backlog: idea` or `@backlog idea`) is intentional, matching how
// Nick types it. Consumers: TaskDetailPanel (task comment box) +
// MorningThoughtCompose (Today bar).

// #891: widened the same way as api/lib/hermes-mention.ts's HERMES_DETECT_RE
// -- a bare `\b` rejects `@hermes_opus` (`_` is a word char, so no boundary
// follows "hermes"); the optional group makes the underscore spelling
// reachable here too. stripHermesPrefix below is deliberately NOT widened --
// see its own comment.
const HERMES_PREFIX_RE = /^@hermes(?:[_-](?:opus|sonnet|haiku))?\b/i
const BACKLOG_PREFIX_RE = /^@backlog\b[:]?/i

/** True when `text` opens with the @hermes command token (prefix form). */
export function isHermesPrefix(text: string): boolean {
  return HERMES_PREFIX_RE.test(text.trimStart())
}

/** The prompt to send to Hermes: `text` with the leading @hermes token stripped.
 *  Falls back to the trimmed original if stripping leaves nothing (a bare
 *  "@hermes" with no question). Deliberately does NOT strip a `_opus`/
 *  `-opus`-style model-tag suffix (#891) -- that separator+tag rides through
 *  to `/api/ai-requests`' `prompt` field, which is exactly what PB's
 *  select_model() parses off the front to pick the model (#217). Mirrors
 *  HERMES_STRIP_RE in api/lib/hermes-mention.ts; do not widen this together
 *  with HERMES_PREFIX_RE above. */
export function stripHermesPrefix(text: string): string {
  const t = text.trim()
  return t.replace(/^@hermes\s*/i, '').trim() || t
}

/** True when `text` opens with the @backlog command token (prefix form, optional colon). */
export function isBacklogPrefix(text: string): boolean {
  return BACKLOG_PREFIX_RE.test(text.trimStart())
}

/** The idea to send to the improvement backlog: `text` with the leading
 *  @backlog[:] token stripped. Falls back to the trimmed original if
 *  stripping leaves nothing (a bare "@backlog" with no idea). */
export function stripBacklogPrefix(text: string): string {
  const t = text.trim()
  return t.replace(/^@backlog[:]?\s*/i, '').trim() || t
}
