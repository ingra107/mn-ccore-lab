// Compose-prefix routing contracts, shared by every compose surface so the
// routing semantics cannot drift between them (ethos #4 — each was inlined
// twice: @hermes in TaskDetailPanel + SmartCompose, @backlog in
// TaskDetailPanel + MorningThoughtCompose).
//
// A typed "@hermes …" PREFIX selects the DEFAULT AUDIENCE (Hermes wave Phase 5,
// owner decision A): the composer posts the body VERBATIM (token intact) to the
// entity's comment endpoint (POST /api/tasks/:id/comments, POST /api/days/:date/
// activity) as a PRIVATE (visibility='author') activity_entries row; the server's
// HERMES_DETECT_RE then fires an in-thread Hermes answer. A mid-text @hermes
// mention ("ask @hermes about X") is NOT a prefix and stays a TEAM-visible
// comment. The prefix/mid-text split no longer selects a STORE (both write
// activity_entries) — it selects private-vs-team default. Consumers:
// TaskDetailPanel + SmartCompose task mode (Today drawer, MyTasks InlineDetail) +
// MorningThoughtCompose (Today bar → day feed). The composers post the body
// verbatim (token intact), so there is no strip step on this half — only
// isHermesPrefix (routing) is exported below.
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
// reachable here too.
const HERMES_PREFIX_RE = /^@hermes(?:[_-](?:opus|sonnet|haiku))?\b/i
const BACKLOG_PREFIX_RE = /^@backlog\b[:]?/i

/** True when `text` opens with the @hermes command token (prefix form). */
export function isHermesPrefix(text: string): boolean {
  return HERMES_PREFIX_RE.test(text.trimStart())
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
