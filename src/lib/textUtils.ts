import type { RefObject } from 'react'

/**
 * Append a character to an input/textarea, focus it, and park the caret at
 * the end. Mobile affordance for compose surfaces where `@`/`:` buttons
 * insert the character so users don't have to know the shortcut. If the
 * current content doesn't end in whitespace, inserts a leading space so
 * `@name` parses cleanly even when the user was mid-sentence.
 */
export function appendCharToInput(
  ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  ch: string,
  setValue: (next: string | ((prev: string) => string)) => void,
) {
  setValue((t) => (t.endsWith(' ') || t.length === 0 ? t + ch : t + ' ' + ch))
  requestAnimationFrame(() => {
    const el = ref.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  })
}

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

/**
 * S21: render-time typographic cleanup for titles that carry a literal `--`
 * double-hyphen (e.g. "Biweekly Meeting -- April 07"). Collapses ` -- ` (and
 * bare `--`) to a proper em-dash for display ONLY — never mutate the stored
 * value (no data migration). Idempotent.
 */
export function emDashifyTitle(title: string): string {
  if (!title) return title
  return title.replace(/\s*--\s*/g, ' — ')
}

/**
 * Strip the machine dedup key `[meeting:cal-...:hash]` from display text.
 * The token MUST stay in the stored value (dedup + backlink); it should
 * render as invisible in the Hub UI. Strips any trailing separator (". "
 * or " . ") left after removing the token, and trims whitespace.
 *
 * Examples:
 *   "From the MNCCORE meeting. Source: [[...]]. [meeting:cal-20260616T1500-mnccore:abc]"
 *   → "From the MNCCORE meeting. Source: [[...]]."
 *
 * Safe to call on strings without the token (no-op).
 */
export function stripMeetingMarker(text: string): string {
  if (!text) return text
  // Remove `. [meeting:...]` (with optional leading period+space) and trim.
  return text.replace(/\s*\[meeting:[^\]]+\]\s*\.?\s*$/i, '').trimEnd()
}
