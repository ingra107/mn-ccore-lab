// searchPrefix -- "p: dashboard" narrows a search to one kind of thing (#160,
// Nick: "there should be shortcuts so that I can say that I'm looking for a
// project with this p-word"). One parser, read by GET /api/search and the ⌘K
// palette, so the shortcuts mean the same in both.

export const SEARCH_PREFIXES = {
  p: ['project', 'product'],
  project: ['project', 'product'],
  t: ['task'],
  task: ['task'],
  m: ['meeting'],
  meeting: ['meeting'],
  d: ['decision'],
  decision: ['decision'],
  i: ['idea'],
  idea: ['idea'],
  g: ['grant'],
  grant: ['grant'],
} as const satisfies Record<string, readonly string[]>

export interface ParsedSearch {
  /** The result types to keep, or null for every type. */
  types: readonly string[] | null
  /** The words to look for, prefix removed. */
  term: string
}

/** `p: dashboard` and `p:dashboard` narrow; an unknown word before a colon
 *  ("CLIF: quality") is an ordinary search. */
export function parseSearchPrefix(raw: string): ParsedSearch {
  const q = raw.trim()
  const m = /^([a-z]+):\s*(.*)$/i.exec(q)
  if (m) {
    const types = (SEARCH_PREFIXES as Record<string, readonly string[]>)[m[1].toLowerCase()]
    if (types) return { types, term: m[2].trim() }
  }
  return { types: null, term: q }
}
