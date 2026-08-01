import type { Publication } from './types'

/**
 * Merge auto-fetched publications (#357, ORCID/Scholar) into the curated set.
 *
 * Curated (hand-maintained) entries are AUTHORITATIVE and ALWAYS preserved in
 * order — their topics / featured curation must never be dropped. A generated
 * entry is included ONLY when it does not duplicate a curated one (or an
 * earlier-kept generated one). Dedup key precedence, most-specific first:
 * DOI → PubMed id → normalized title+year.
 *
 * #1126: a duplicate generated entry is not simply discarded — its
 * `authorSlugs` are UNIONED into the entry that is kept (see
 * `unionAuthorSlugs`). Each per-member fetch tags a pub `authorSlugs:
 * [member.slug]` (fetch-publications.ts), so a paper co-authored by two lab
 * members is fetched once per member and arrives here as two near-identical
 * copies; dropping the duplicate outright silently lost every co-author but
 * whichever copy (curated, or first-seen generated) was kept.
 *
 * With an empty `generated` array the result equals `curated` (same order), so
 * wiring this into src/data/publications.ts is a no-op until the fetch job is
 * run — the curated array can never be shrunk by this function.
 */
export function mergePublications(
  curated: Publication[],
  generated: Publication[],
): Publication[] {
  const keyToIndex = new Map<string, number>()
  const merged: Publication[] = [...curated]
  merged.forEach((p, i) => {
    for (const k of dedupKeys(p)) keyToIndex.set(k, i)
  })
  for (const g of generated) {
    const keys = dedupKeys(g)
    const dupIndex = keys.map((k) => keyToIndex.get(k)).find((i) => i !== undefined)
    if (dupIndex !== undefined) {
      merged[dupIndex] = unionAuthorSlugs(merged[dupIndex], g)
      continue
    }
    for (const k of keys) keyToIndex.set(k, merged.length)
    merged.push(g)
  }
  return merged
}

/**
 * Union `b`'s `authorSlugs` into `a`: keeps `a`'s existing order, appends any
 * slug `b` carries that `a` does not already have. Returns `a` BY REFERENCE
 * (no new object) when `b` adds nothing new, so a no-op union never disturbs
 * an unrelated `Object.is` check on the kept entry.
 */
export function unionAuthorSlugs(a: Publication, b: Publication): Publication {
  const incoming = b.authorSlugs
  if (!incoming || incoming.length === 0) return a
  const existing = a.authorSlugs ?? []
  const combined = [...existing]
  const seen = new Set(existing)
  for (const slug of incoming) {
    if (!seen.has(slug)) {
      seen.add(slug)
      combined.push(slug)
    }
  }
  if (combined.length === existing.length) return a
  return { ...a, authorSlugs: combined }
}

/** Candidate identity keys for a publication, most-specific first. */
export function dedupKeys(p: Publication): string[] {
  const keys: string[] = []
  const doi = normalizeDoi(p.doi)
  if (doi) keys.push(`doi:${doi}`)
  const pmid = normalizePubmed(p.pubmed)
  if (pmid) keys.push(`pmid:${pmid}`)
  const title = normalizeTitle(p.title)
  if (title) keys.push(`ty:${title}:${p.year ?? ''}`)
  // Base title (strip a ": subtitle") under the SAME `ty:` namespace, so a short
  // ORCID title ("Federation, not centralization") matches the base of a curated
  // entry with the full subtitle ("Federation, Not Centralization: A New ...").
  const base = normalizeTitle((p.title || '').split(':')[0])
  if (base && base !== title) keys.push(`ty:${base}:${p.year ?? ''}`)
  return keys
}

function normalizeDoi(doi?: string): string {
  if (!doi) return ''
  return doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
}

function normalizePubmed(pubmed?: string): string {
  if (!pubmed) return ''
  const m = pubmed.match(/(\d{5,})/) // strip a pubmed URL down to the numeric id
  return m ? m[1] : ''
}

function normalizeTitle(title?: string): string {
  if (!title) return ''
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
