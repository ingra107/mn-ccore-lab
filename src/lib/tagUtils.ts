/**
 * Parse a tags field that may be stored as either:
 *   - comma-separated string ("grants, design, architecture")
 *   - JSON-stringified array ('["grants","design","architecture"]')
 *
 * D1 rows from older write paths stored JSON-arrays; newer rows store CSV.
 * Readers must handle both to avoid rendering literal bracket/quote syntax.
 */
export function parseTagsString(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((t) => String(t).trim()).filter(Boolean)
      }
    } catch {
      /* fall through to CSV parse */
    }
  }
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Normalize a tags input value to the canonical CSV form for storage. */
export function normalizeTagsForStorage(raw: string | null | undefined): string | null {
  const parsed = parseTagsString(raw)
  return parsed.length > 0 ? parsed.join(',') : null
}
