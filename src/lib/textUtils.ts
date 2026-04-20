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
  const match = title.match(/^(CLIF|MN-CCORE|UMN|ATS|R01|RO1|K23):\s*(.*)$/i)
  if (match && match[2]) return { clean: match[2], consortium: match[1].toUpperCase() }
  return { clean: title }
}
