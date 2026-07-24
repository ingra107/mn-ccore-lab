// HtmlArtifactFrame — renders an interactive (content_type='html') artifact.
//
// An interactive artifact needs a REAL document URL, not srcDoc.
//
// With srcDoc the frame's document URL is `about:srcdoc`, which has no base to
// resolve a fragment against. Clicking any in-page anchor (a table of contents,
// a "jump to section" link, a <details> deep link) therefore navigates the frame
// to `about:blank#hash` — a cross-document navigation that throws the artifact
// away and leaves a blank panel. Nick hit this on the Aims Funnel artifact
// 2026-07-24; reproduced in Chromium: 8029 chars of body -> 0 after one click.
//
// A blob: URL gives the document a real URL, so the same click is an ordinary
// same-document jump and the content stays put. The sandbox is unchanged —
// "allow-scripts" without "allow-same-origin" still means an opaque origin, so
// the artifact still cannot read the Hub session (cookies, storage, parent DOM).
//
// The URL lives in this component so creation and revocation share one
// lifecycle; a caller cannot hold the frame without also freeing the URL.
//
// Outbound links are the same bug wearing a different hat. A plain <a href>
// to another site navigates the FRAME, so the artifact is replaced by that
// site rendered in a small box with no way back (measured 2026-07-24: 3592
// chars of artifact -> 13). target="_blank" alone is worse — without
// allow-popups the click silently does nothing. So the frame permits popups
// AND retargets outbound links itself: an artifact author cannot get this
// wrong, and no artifact needs rewriting. In-page fragment links are left
// alone — those must stay same-document, which is the whole point above.

import { useMemo, useEffect } from 'react'

/** Sends off-site links to a new tab. Capture-phase + delegated, so it also
 *  covers links an artifact's own script adds later. */
const OUTBOUND_LINK_SHIM =
  '<script>document.addEventListener("click",function(e){' +
  'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;' +
  'if(a&&/^https?:/i.test(a.getAttribute("href")||"")){a.target="_blank";a.rel="noopener noreferrer";}' +
  '},true);</script>'

export default function HtmlArtifactFrame({ title, html }: { title: string; html: string }) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([OUTBOUND_LINK_SHIM + html], { type: 'text/html' })),
    [html],
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <iframe
      title={`${title} (interactive artifact)`}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      src={url}
      style={{
        width: '100%',
        minHeight: '70vh',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        background: '#fff',
      }}
    />
  )
}
