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
