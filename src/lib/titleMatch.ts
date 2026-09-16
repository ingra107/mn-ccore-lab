/**
 * titleMatch — "Is this the paper?" (#129).
 *
 * When a project moves to stage=published or status=done and has no linked
 * publication, we look for its paper among the lab's `publications` rows by
 * title. Token Jaccard over the same normalization `mergePublications.ts` uses
 * for dedup: lowercase, non-alphanumerics to spaces. Stopwords are dropped so
 * "the epidemiology of ICU readmissions across ten health systems" and
 * "ICU readmissions across ten health systems (CLIF)" still score high.
 *
 * Pure. No I/O. Cheap enough to run over 700 rows on the client.
 */

const STOP = new Set([
  'a', 'an', 'and', 'the', 'of', 'in', 'on', 'for', 'to', 'with', 'at', 'by',
  'from', 'as', 'or', 'vs', 'versus', 'among', 'across', 'using', 'study',
])

export function titleTokens(title: string | null | undefined): Set<string> {
  if (!title) return new Set()
  const out = new Set<string>()
  for (const t of title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')) {
    if (t.length > 1 && !STOP.has(t)) out.add(t)
  }
  return out
}

export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = titleTokens(a)
  const tb = titleTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

export interface TitleMatchCandidate { id: string; title: string }

export const TITLE_MATCH_THRESHOLD = 0.6

/**
 * Best candidate above the threshold, or null. Ties go to the first candidate
 * in input order (callers pass newest-first lists).
 */
export function bestPublicationMatch<T extends TitleMatchCandidate>(
  title: string | null | undefined,
  candidates: readonly T[],
  threshold = TITLE_MATCH_THRESHOLD,
): { pub: T; score: number } | null {
  let best: { pub: T; score: number } | null = null
  for (const pub of candidates) {
    const score = titleSimilarity(title, pub.title)
    if (score >= threshold && (best === null || score > best.score)) best = { pub, score }
  }
  return best
}
