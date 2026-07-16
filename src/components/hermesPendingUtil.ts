// hermesPendingUtil.ts — the exact placeholder content the backend writes for
// a pending Hermes answer, and the predicate that matches it. Split out of
// HermesPending.tsx (a components-only file) so this non-component pair has
// its own home. Match against isHermesPending() — don't re-type the literal
// at call sites.

/** The exact placeholder content the backend writes for a pending Hermes
 *  answer. Match against this — don't re-type the literal at call sites. */
export const HERMES_PENDING_PLACEHOLDER = 'Thinking about this... (AI response pending)'

/** True when an answer's content is the backend pending placeholder. */
export function isHermesPending(content: string | null | undefined): boolean {
  return (content ?? '').trim() === HERMES_PENDING_PLACEHOLDER
}
