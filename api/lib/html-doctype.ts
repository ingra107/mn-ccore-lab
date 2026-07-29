// api/lib/html-doctype.ts — minimal-document normalization for html artifacts.
//
// WHY (PB backlog #915, 2026-07-29): artifact HTML authored in Claude Artifacts
// is exported as a FRAGMENT — no doctype, no <html>/<head>/<body> — because the
// authoring tool wraps the page in a skeleton at render time, and PB's
// publish_artifact.py posts the file verbatim. A doctype-less document renders
// in QUIRKS MODE (the doctype is the sole standards-mode switch; the implied
// html/head/body elements are spec-defined and harmless), so an artifact can
// look right in the authoring tool and subtly wrong on every Hub sink — the
// public /a/:id origin and the portal blob-URL frame. Measured 2026-07-29:
// 2 of the 4 html artifacts in prod are fragments, one of them public.
//
// The fix is doctype-prepend, applied at TWO chokepoints:
//   - ingest (handleCreateArtifact / handleReviseArtifact, content_type='html')
//     — a stored html artifact without a doctype is unrepresentable going
//     forward, so every current AND future sink gets standards mode;
//   - serve (handleGetPublicArtifact) — retroactive cover for rows stored
//     before the ingest gate existed (until a one-time backfill lands).
//
// ensureDoctype is IDEMPOTENT and passes full documents through byte-identical
// — a body that already carries a doctype (optionally behind a BOM, whitespace,
// or leading HTML comments, all of which browsers tolerate without entering
// quirks mode) is returned unchanged.

const BOM = '\uFEFF';

/**
 * Optional BOM, then whitespace / HTML comments, then a doctype. Comments and
 * whitespace before the doctype do NOT trigger quirks mode, so a document in
 * that shape needs no help.
 */
const LEADING_DOCTYPE_RE = /^\uFEFF?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[\s>]/i;

/** True when the document already opens with a doctype (standards mode). */
export function hasLeadingDoctype(html: string): boolean {
  return LEADING_DOCTYPE_RE.test(html);
}

/**
 * Return `html` guaranteed to open with a doctype. Fragments get a minimal
 * `<!DOCTYPE html>` line prepended (after the BOM when one is present, so the
 * BOM stays a BOM instead of becoming a zero-width space mid-document); full
 * documents come back byte-identical.
 */
export function ensureDoctype(html: string): string {
  if (hasLeadingDoctype(html)) return html;
  if (html.startsWith(BOM)) {
    return BOM + '<!DOCTYPE html>\n' + html.slice(1);
  }
  return '<!DOCTYPE html>\n' + html;
}
