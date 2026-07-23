import type { Publication } from './types'

/**
 * Merge auto-fetched publications (#357, ORCID/Scholar) into the curated set.
 *
 * Curated (hand-maintained) entries are AUTHORITATIVE and ALWAYS preserved in
 * order — their authorSlugs / topics / featured curation must never be dropped.
 * A generated entry is included ONLY when it does not duplicate a curated one
 * (or an earlier-kept generated one). Dedup key precedence, most-specific first:
 * DOI → PubMed id → normalized title+year.
 *
 * With an empty `generated` array the result equals `curated` (same order), so
 * wiring this into src/data/publications.ts is a no-op until the fetch job is
 * run — the curated array can never be shrunk by this function.
 */
export function mergePublications(
  curated: Publication[],
  generated: Publication[],
): Publication[] {
  const seen = new Set<string>()
  for (const p of curated) {
    for (const k of dedupKeys(p)) seen.add(k)
  }
  const merged = [...curated]
  for (const g of generated) {
    const keys = dedupKeys(g)
    if (keys.some((k) => seen.has(k))) continue // duplicate of an already-kept pub
    for (const k of keys) seen.add(k)
    merged.push(g)
  }
  return merged
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
