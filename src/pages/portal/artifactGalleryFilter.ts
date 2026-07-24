// The gallery's filter: tag chips AND free-text search.
//
// Kept out of the page component so it can be tested directly — the shelf is
// how Nick finds an artifact weeks later, and "search returns nothing" is a
// silent failure (you assume the artifact was never saved).
//
// Scope: the gallery feed carries metadata only — title, tags, author, dates.
// Bodies are deliberately absent (an html artifact runs to tens of KB; loading
// every one to render a card grid would be wasteful), so this does NOT search
// the text inside an artifact. That needs a server-side index.

import type { GalleryArtifact } from '../../hooks/useArtifacts'
import { getPersonInfo } from '../../data/team'

/** Everything about an artifact a search term may legitimately match. */
function searchableText(a: GalleryArtifact): string {
  return [
    a.title,
    ...a.tags,
    getPersonInfo(a.created_by).name,
    // Hermes-authored artifacts show as "Hermes" on the card, so let people
    // search the word they can actually see.
    a.created_by === 'claude-ai' ? 'Hermes' : '',
  ]
    .join(' ')
    .toLowerCase()
}

/**
 * Tag filter is union (an artifact shows if it carries ANY selected tag);
 * search is AND across whitespace-separated terms, so "aims grant" finds the
 * grant-writing Aims Funnel regardless of word order. The two compose: search
 * runs within the selected shelf.
 */
export function filterArtifacts(
  artifacts: GalleryArtifact[],
  selectedTags: Set<string>,
  query: string,
): GalleryArtifact[] {
  const byTag = selectedTags.size === 0
    ? artifacts
    : artifacts.filter((a) => a.tags.some((t) => selectedTags.has(t)))

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return byTag

  return byTag.filter((a) => {
    const haystack = searchableText(a)
    return terms.every((term) => haystack.includes(term))
  })
}
