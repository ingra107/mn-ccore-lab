// shared/blockedBy.ts -- the one reader of tasks.blocked_by, used by the Worker
// (the "who does X block" SQL in api/routes/tasks.ts) and by the task UI.
//
// The column is free text and holds two shapes: a comma list ("a, b") and a
// JSON array ('["a","b"]'). Every parser and every SQL predicate goes through
// this file, so the two shapes can never be read differently in two places.

/** Ids in a stored blocked_by value, in order, without blanks or repeats. */
export function parseBlockedBy(raw: string | null | undefined): string[] {
  if (!raw) return []
  const text = raw.trim()
  let parts: string[]
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      parts = Array.isArray(parsed) ? parsed.map((v) => String(v)) : []
    } catch {
      // Not valid JSON after all: fall back to the comma reading below.
      parts = text.replace(/[[\]"]/g, '').split(',')
    }
  } else {
    parts = text.split(',')
  }
  const seen = new Set<string>()
  const ids: string[] = []
  for (const p of parts) {
    const id = p.trim()
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** The value to store: a comma list, or null when empty. */
export function serializeBlockedBy(ids: string[]): string | null {
  return ids.length === 0 ? null : ids.join(',')
}

/** True when the stored value names at least one blocker. */
export function hasBlockers(raw: string | null | undefined): boolean {
  return parseBlockedBy(raw).length > 0
}

/**
 * SQL predicate, true when `column` lists a task id (one bound `?`), whichever
 * shape it holds. Exact-token match: LIKE would take '_' as a wildcard and
 * match id substrings. The caller binds the id once.
 */
export function blockedByContainsSql(column: string): string {
  const flat = `REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '"', ''), '[', ''), ']', '')`
  return `(${column} IS NOT NULL AND instr(',' || ${flat} || ',', ',' || ? || ',') > 0)`
}
