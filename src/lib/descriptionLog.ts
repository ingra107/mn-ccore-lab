// src/lib/descriptionLog.ts
// Parse a project description into a leading undated-prose block + a list of
// dated log entries.
//
// Stored descriptions accumulate a running log: a (usually) short static summary
// sentence on top, followed by machine-dated lines of the form
//   [YYYY-MM-DD] ...free text, may include a second human [Jan 22] tag + URLs...
// A single entry can span multiple physical lines — continuation lines (e.g.
// bulleted detail) belong to the [YYYY-MM-DD] line directly above them until the
// next [YYYY-MM-DD] line starts a new entry.
//
// This is a PURE DISPLAY transform. It never mutates the stored description. The
// future M5 build will split description into static-summary + an Activity
// timeline; until then this lets ProjectDetail render the dated log
// newest-first while keeping any undated leading prose pinned at the top.

/** A `[YYYY-MM-DD]` tag at the very start of a line (the machine date). */
const DATED_LINE_RE = /^\[(\d{4}-\d{2}-\d{2})\]/

export interface DatedEntry {
  /** The machine date `YYYY-MM-DD` that opened this entry. */
  date: string
  /** The full entry text, including its `[YYYY-MM-DD]` prefix and any
   *  continuation lines. Trailing whitespace trimmed; internal newlines kept. */
  text: string
}

export interface ParsedDescriptionLog {
  /** Everything before the first `[YYYY-MM-DD]` line, verbatim (order kept).
   *  Empty string when the description opens directly with a dated entry. */
  lead: string
  /** Dated entries in the order they appear in the source (oldest-first as
   *  stored). Callers reverse for newest-first display. */
  entries: DatedEntry[]
}

/**
 * Split a description into its leading undated prose and ordered dated entries.
 *
 * - No `[YYYY-MM-DD]` lines at all → `{ lead: <whole text>, entries: [] }`,
 *   so plain descriptions render unchanged.
 * - Lines before the first dated line (the static summary, blank lines, or an
 *   undated `[Jan 14]`-style tag that is NOT `YYYY-MM-DD`) collect into `lead`.
 */
export function parseDescriptionLog(text: string): ParsedDescriptionLog {
  if (!text) return { lead: '', entries: [] }
  const lines = text.split('\n')
  const leadLines: string[] = []
  const entries: DatedEntry[] = []
  let current: { date: string; lines: string[] } | null = null

  for (const line of lines) {
    const m = line.match(DATED_LINE_RE)
    if (m) {
      if (current) entries.push({ date: current.date, text: current.lines.join('\n').replace(/\s+$/, '') })
      current = { date: m[1], lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else {
      leadLines.push(line)
    }
  }
  if (current) entries.push({ date: current.date, text: current.lines.join('\n').replace(/\s+$/, '') })

  return { lead: leadLines.join('\n').replace(/\s+$/, ''), entries }
}
