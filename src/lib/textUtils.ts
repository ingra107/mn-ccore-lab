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
  //
  // 2026-07-23: `R0?1|K23` REMOVED from the alternation. It only ever
  // matched R01/K23 — R03/R21/K99/U01 grant prefixes silently kept their
  // literal text prefix while R01 stripped cleanly (the visible symptom:
  // "R01: Foo" rendered "Foo" but "R03: Bar" rendered "R03: Bar"). Grant
  // mechanisms are no longer handled by pattern-matching title text at all;
  // see `stripGrantTypePrefix` below, driven off the structured
  // `projects.type` field instead.
  const patterns: RegExp[] = [
    /^(CLIF|C-?QODE|MN-?CCORE|UMN|ATS):?\s+(.*)$/i,
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
 * Grant-mechanism values in the `projects.type` enum (schema-v73,
 * api/schema-v73-projects-type.sql). `type` also carries non-grant buckets
 * (CLIF, Nick_Lab, Friends, Mentees, Admin, Personal) — those never get a
 * grant badge or a prefix strip.
 */
export const GRANT_PROJECT_TYPES = new Set(['R01', 'R03', 'K'])

/** True when `type` is one of the grant-mechanism values above. */
export function isGrantProjectType(type: string | null | undefined): type is string {
  return !!type && GRANT_PROJECT_TYPES.has(type)
}

/**
 * Strip a leading grant-mechanism prefix (e.g. "R01: ") from a project title
 * — driven entirely by the project's own `type` field, never by pattern-
 * matching the title text. This is deliberately the opposite shape of the
 * old `stripConsortiumPrefix` R0?1|K23 branch it replaces: that branch had
 * to enumerate every grant-prefix spelling in a regex and missed most of
 * them; this one asks the structured field "is this a grant, and which
 * one," then strips exactly that literal prefix if present. Pairs with the
 * grant-type badge (Projects pipeline row) — the badge already shows the
 * mechanism, so a literal "R01: " in the title would stutter next to it.
 * Non-grant types and titles that don't carry the prefix pass through
 * unchanged.
 */
export function stripGrantTypePrefix(title: string, type: string | null | undefined): string {
  if (!isGrantProjectType(type)) return title
  const re = new RegExp(`^${type}:?\\s+`, 'i')
  return title.replace(re, '')
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
