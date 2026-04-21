/**
 * Parse "[Carried forward]" or "[Carried forward Nd]" prefix from action
 * item descriptions or task titles. Returns the clean text + flag + optional
 * age in days, so UIs can render a compact `↻ 5d` chip instead of 17+
 * characters of meta-noise in every row.
 */
export function parseCarriedForward(description: string): {
  isCarried: boolean
  clean: string
  daysCarried?: number
} {
  const match = description.match(/^\[Carried forward(?:\s+(\d+)d)?\]\s*(.*)$/i)
  if (match) {
    return {
      isCarried: true,
      clean: match[2],
      daysCarried: match[1] ? parseInt(match[1], 10) : undefined,
    }
  }
  return { isCarried: false, clean: description }
}

/**
 * Strip a leading consortium prefix like "CLIF: " or "MN-CCORE: " from a
 * project title. The prefix duplicates the category-dot affordance — every
 * CLIF row also has a maroon dot and lives in the CLIF group filter — so
 * the literal prefix is pure noise. Returns the clean title and the
 * detected consortium key (uppercased) when present (P2-02).
 */
export function stripConsortiumPrefix(title: string): { clean: string; consortium?: string } {
  // "CLIF: foo", "CLIF foo", "MN-CCORE: foo", "C-QODE foo", "CQODE foo",
  // "(Mesfin) foo", "(CLIF) foo", "ATS foo", etc. P2-R2-01 — round-1 regex
  // missed the no-colon and parens variants.
  const patterns: RegExp[] = [
    /^(CLIF|C-?QODE|MN-?CCORE|UMN|ATS|R0?1|K23):?\s+(.*)$/i,
    /^\((Mesfin|CLIF|MN-?CCORE|C-?QODE)\)\s+(.*)$/i,
  ]
  for (const re of patterns) {
    const m = title.match(re)
    if (m && m[2]) {
      return {
        clean: m[2].trim(),
        consortium: m[1].toUpperCase().replace(/-/g, ''),
      }
    }
  }
  return { clean: title }
}
