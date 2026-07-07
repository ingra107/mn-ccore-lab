// The @hermes prefix contract, shared by every task compose surface so the
// routing semantics cannot drift between them (ethos #4 — was inlined twice).
//
// A typed "@hermes …" PREFIX is a command: it routes to /api/ai-requests
// (source_type='daily_thought', source_id=<task_id>) for a real Hermes
// round-trip, read back by TaskHermesReplies. A mid-text @hermes mention
// ("ask @hermes about X") is NOT a command and stays a team-visible comment.
//
// Consumers: TaskDetailPanel (OverviewQuickAdd inline composer) + SmartCompose
// task mode (Today drawer, MyTasks InlineDetail).

const HERMES_PREFIX_RE = /^@hermes\b/i

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
