// One place that turns artifact HTML plus the Hub's shims into the blob an
// opaque-origin iframe loads (HtmlArtifactFrame, DeskBrokerFrame).
//
// Two properties of that blob used to be wrong, and both are fixed here by
// construction rather than by each caller remembering them:
//
// 1. Shims go AFTER a leading doctype, never before it. Anything ahead of
//    `<!DOCTYPE html>` makes the parser ignore the doctype, so a page that
//    declares standards mode renders in quirks mode (box model, table sizing
//    and line-height all change). The nightly desk pages open with a doctype.
// 2. The blob's type carries `charset=utf-8`. Without it the browser sniffs
//    for a `<meta charset>` in the first 1024 bytes, and the seeded desk
//    store is inlined ahead of that meta: once a desk's marks outgrow ~1 KB,
//    the meta falls outside the window and non-ASCII text can render as
//    mojibake. The artifact bodies are UTF-8 strings, so the header is simply
//    true.

/** Rewrites absolute http(s) links to open in a new tab so a click never
 *  navigates the artifact frame away from the artifact. */
export const OUTBOUND_LINK_SHIM =
  '<script>document.addEventListener("click",function(e){' +
  'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;' +
  'if(a&&/^https?:/i.test(a.getAttribute("href")||"")){a.target="_blank";a.rel="noopener noreferrer";}' +
  '},true);</script>'

const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i

/** `html` with `shims` placed after its doctype, or at the start when it has none. */
export function withShims(html: string, shims: string): string {
  const m = LEADING_DOCTYPE.exec(html)
  if (!m) return shims + html
  return html.slice(0, m[0].length) + shims + html.slice(m[0].length)
}

/** An object URL for the artifact document; the caller revokes it. */
export function artifactBlobUrl(html: string, shims: string): string {
  return URL.createObjectURL(
    new Blob([withShims(html, shims)], { type: 'text/html;charset=utf-8' }),
  )
}
