// api/lib/artifact-url.ts — SSOT for matching Hermes artifact portal URLs in
// free body text. One definition so the at-source comment-path key_link hook
// (activity-entry.ts) and any future consumer can't drift from the pattern PB's
// /process band-aid uses (scripts/process_hub_comments.py::_ARTIFACT_RE).
//
// Pattern mirrors PB exactly: an absolute https URL ending in
// /portal/artifacts/art_<hex>. The leading char class stops the URL at the first
// whitespace or closing bracket so a markdown link `[text](…art_abc)` or a
// trailing `)`/`>`/`]` doesn't get swallowed into the id.
//
// Module-scope so the literal isn't recompiled per call. The /g flag is used by
// matchAllArtifactUrls — callers that need a fresh lastIndex must NOT reuse the
// stateful exec() loop without resetting; matchAll() (used below) is stateless.

/** Matches a single artifact portal URL anywhere in the text (no anchors). */
export const ARTIFACT_URL_RE = /https:\/\/[^\s)>\]]+\/portal\/artifacts\/art_[0-9a-f]+/i;

/** Same pattern, global — for extracting every occurrence in one body. */
const ARTIFACT_URL_RE_G = /https:\/\/[^\s)>\]]+\/portal\/artifacts\/art_[0-9a-f]+/gi;

/**
 * Return every artifact portal URL in `text`, left-to-right, de-duplicated
 * (first occurrence wins) so the same URL pasted twice in one comment yields a
 * single link attempt. Order is preserved (insertion order of the Set).
 */
export function matchAllArtifactUrls(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const m of text.matchAll(ARTIFACT_URL_RE_G)) {
    seen.add(m[0]);
  }
  return [...seen];
}

/**
 * Parse the `art_<hex>` id out of an artifact portal URL. Returns null when the
 * URL doesn't match (defensive — callers should only pass URLs from
 * matchAllArtifactUrls, but a hand-built string shouldn't crash the batch).
 */
export function artifactIdFromUrl(url: string): string | null {
  const m = url.match(/\/portal\/artifacts\/(art_[0-9a-f]+)/i);
  return m ? m[1] : null;
}
