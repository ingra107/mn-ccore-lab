// The gallery's filter: tag chips AND free-text search.
//
// Kept out of the page component so it can be tested directly — the shelf is
// how Nick finds an artifact weeks later, and "search returns nothing" is a
// silent failure (you assume the artifact was never saved).
//
// Scope: the gallery feed carries metadata only — title, tags, author, dates.
// Bodies are deliberately absent (an html artifact runs to tens of KB; loading
// every one to render a card grid would be wasteful), so the text INSIDE an
// artifact is matched server-side instead (`/api/artifacts/search`, which
// returns ids only) and passed in here as `bodyMatchIds`. Metadata matching
// stays local so it lands on the keystroke; body matches join a beat later.

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
 *
 * `bodyMatchIds` are ids the server matched on title or body text. An artifact
 * shows if its metadata matches locally OR its body matched server-side —
 * either is a real answer to "where's that thing about X".
 */
export function filterArtifacts(
  artifacts: GalleryArtifact[],
  selectedTags: Set<string>,
  query: string,
  bodyMatchIds?: Iterable<string>,
): GalleryArtifact[] {
  const byTag = selectedTags.size === 0
    ? artifacts
    : artifacts.filter((a) => a.tags.some((t) => selectedTags.has(t)))

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return byTag

  const fromBody = new Set(bodyMatchIds ?? [])
  return byTag.filter((a) => {
    if (fromBody.has(a.id)) return true
    const haystack = searchableText(a)
    return terms.every((term) => haystack.includes(term))
  })
}
