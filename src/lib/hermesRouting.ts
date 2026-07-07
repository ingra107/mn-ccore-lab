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

const HERMES_PREFIX_RE = /^@hermes\b/i
const BACKLOG_PREFIX_RE = /^@backlog\b[:]?/i

/** True when `text` opens with the @hermes command token (prefix form). */
export function isHermesPrefix(text: string): boolean {
  return HERMES_PREFIX_RE.test(text.trimStart())
}

/** The prompt to send to Hermes: `text` with the leading @hermes token stripped.
 *  Falls back to the trimmed original if stripping leaves nothing (a bare
 *  "@hermes" with no question). */
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
