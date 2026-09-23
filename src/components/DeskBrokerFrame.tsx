// DeskBrokerFrame — renders a content_type='html' artifact for
// /portal/artifacts/:id back on the Hub's own opaque-origin blob iframe
// (the HtmlArtifactFrame pattern: `sandbox="allow-scripts allow-popups
// allow-popups-to-escape-sandbox"`, NEVER allow-same-origin), with the Hub
// itself brokering the working-desk kit's localStorage.
//
// ═══ WHY (2026-09-23 decision, Context/Decisions/2026-09-23-team-desks-hub-brokered-opaque-frame.md) ═══
//
// 0e955794 (earlier today) moved team desks to a genuinely separate SITE
// (mn-ccore-artifacts.pages.dev/a/team/:id, TeamArtifactFrame.tsx) so that
// `allow-same-origin` would be safe — no Hub cookie can cross a Public
// Suffix List boundary. That broke in practice: Safari/ITP and Chrome with
// third-party cookies blocked never send the second Access app's cookie
// inside the iframe, so those browsers loop on "Open to sign in" forever;
// and even where sign-in succeeds, Safari partitions that iframe's
// non-cookie storage and empties it on reload, so desk marks would not
// persist anyway.
//
// This component goes back to the ORIGINAL Level-1 property (#508,
// 9e0f202f): artifact script runs in an opaque origin, with no authority
// over the Hub session, by construction — nothing to check, no sandbox
// token to get right. What it adds on top is a storage BROKER, so deskkit
// still gets working persistence without ever touching real localStorage:
//
//   1. Before the artifact's own script runs, a small shim (buildSeedShim
//      below) defines `window.__deskStorage` — a PLAIN GLOBAL, not an
//      override of the native `localStorage` accessor — seeded from JSON
//      this component reads out of the HUB'S OWN first-party localStorage
//      under `desk:<artifactId>`.
//   2. Every mutation (setItem/removeItem/clear) on that stand-in posts the
//      WHOLE store back to the parent via postMessage — the artifact never
//      picks the storage key or the origin; this component does.
//   3. The parent's message listener accepts a message ONLY when
//      `event.source` is this exact iframe's contentWindow (an opaque-origin
//      iframe's `event.origin` is the literal string "null" for every such
//      frame, so source identity — not origin — is what tells frames apart),
//      the shape matches, and the payload is under DESK_SAVE_MAX_BYTES. It
//      then writes `desk:<artifactId>` in the Hub's real localStorage.
//
// `allow="clipboard-write"` delegates the Clipboard permission across the
// opaque-origin boundary for deskkit's Copy-for-Claude button; opaque-origin
// doesn't change this — it's a Permissions Policy delegation, unrelated to
// same-origin/storage.
//
// ═══ window.__deskStorage, not an override of `localStorage` (2026-09-23) ═══
//
// The first build of this component tried `Object.defineProperty(window,
// "localStorage", {value: standIn, configurable:true})`. Measured in real
// Chromium (vitest.config.ts browser mode, headless), three probes deep:
// that override does NOT throw, and a read of the bare `localStorage`
// identifier immediately afterward, in the SAME <script> tag, DOES return
// the stand-in — but deskkit.js is pasted into its OWN, separate <script>
// tag at the end of the page (its own contract), and a read of `localStorage`
// from THAT tag throws natively:
//
//   SecurityError: Failed to read the 'localStorage' property from
//   'Window': The document is sandboxed and lacks the 'allow-same-origin'
//   flag.
//
// The override does not survive a script-tag boundary. A plain global has
// no such native check attached to it and is visible, unchanged, from every
// subsequent <script> tag — confirmed by the same probe technique — so the
// shim below defines ONLY `window.__deskStorage`; there is no
// `window.localStorage` override left anywhere in this file, not even as a
// fallback. deskkit.js (PB side, orchestrator-owned) now calls `store()`,
// which returns `window.__deskStorage || localStorage`, for both its
// startup read and every save.
//
// The /a/team route, TeamArtifactFrame and the artifacts-site "mn-ccore
// artifacts (team desks)" Access app were retired 2026-09-23 (same day as
// this component shipped) — Nick accepted skipping the cross-browser Safari
// proof rather than carry the dead cross-site path further; see the decision
// doc's "Revisit if" for what would bring a cross-site variant back. Every
// team desk published BEFORE this cutover inlines the OLD deskkit.js (no
// `store()`, calls bare `localStorage` directly) and will hit the same
// SecurityError inside this frame, caught by deskkit's own try/catch —
// silently not persisting, not crashing. Those desks need a rebuild; see the
// enumeration this session's report carries.

import { useEffect, useMemo, useRef, useState } from 'react'
import { artifactBlobUrl, OUTBOUND_LINK_SHIM } from '../lib/artifactBlob'

/** The postMessage payload shape the shim posts to the parent. */
interface DeskSaveMessage {
  type: 'desk-save'
  value: string
}

const DESK_SAVE_TYPE = 'desk-save' as const
/** Refuses an oversized save rather than let a runaway desk fill localStorage
 *  (which is usually capped around 5-10MB per origin, shared by everything
 *  else the Hub keeps there). Generous for a card-based desk: even a few
 *  hundred cards' worth of marks/notes lands nowhere near this. */
const DESK_SAVE_MAX_BYTES = 1_000_000

function deskStorageKey(id: string): string {
  return `desk:${id}`
}

/** Reads the Hub's own first-party seed for this artifact. Never throws —
 *  a missing/corrupt/oversized entry seeds an empty store instead of
 *  blocking the frame from rendering at all. */
function readSeed(id: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(deskStorageKey(id))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Escapes a JSON-text-wrapped-in-a-JS-string-literal for safe embedding
 *  inside an inline <script> block: a literal `</script` inside the payload
 *  would otherwise close the tag early, and pre-ES2019 engines treat raw
 *  U+2028/U+2029 inside a string literal as line terminators. */
function escapeForInlineScript(jsStringLiteral: string): string {
  // String.fromCharCode, not a regex literal containing the raw codepoint --
  // U+2028/U+2029 are themselves illegal, unescaped, inside a JS regex
  // literal (the very thing this function exists to keep out of the SHIM),
  // so building the search string at runtime via .split/.join sidesteps
  // that entirely rather than fighting the parser with an escape sequence.
  const lineSeparator = String.fromCharCode(0x2028)
  const paragraphSeparator = String.fromCharCode(0x2029)
  return jsStringLiteral
    .replace(/<\/script/gi, '<\\/script')
    .split(lineSeparator)
    .join('\\u2028')
    .split(paragraphSeparator)
    .join('\\u2029')
}

/** Builds the <script> that must run before anything else in the artifact
 *  body: it defines `window.__deskStorage` — a plain global, seeded from
 *  `seed` — for deskkit.js's `store()` helper to find on its startup read.
 *  Deliberately does NOT touch `window.localStorage`: see the file header
 *  for why an override of the native accessor cannot reach a second
 *  <script> tag, which is exactly where deskkit.js always runs. */
function buildSeedShim(seed: Record<string, string>): string {
  // Double-stringify: the inner JSON.stringify produces the JSON text; the
  // outer wraps that text as a JS string literal (escaping quotes,
  // backslashes and control chars) so it can be dropped straight into
  // `JSON.parse(<literal>)` below.
  const literal = escapeForInlineScript(JSON.stringify(JSON.stringify(seed)))
  return (
    '<script>(function(){' +
    'var SEED=JSON.parse(' + literal + ');' +
    'var data={};' +
    'try{if(SEED&&typeof SEED==="object"){for(var k in SEED){' +
    'if(Object.prototype.hasOwnProperty.call(SEED,k))data[k]=String(SEED[k]);' +
    '}}}catch(e){}' +
    'function post(){try{parent.postMessage({type:' + JSON.stringify(DESK_SAVE_TYPE) + ',value:JSON.stringify(data)},"*");}catch(e){}}' +
    'window.__deskStorage={' +
    'getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},' +
    'setItem:function(k,v){data[k]=String(v);post();},' +
    'removeItem:function(k){delete data[k];post();},' +
    'clear:function(){data={};post();}' +
    '};' +
    '})();</script>'
  )
}

function isDeskSaveMessage(data: unknown): data is DeskSaveMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as { type?: unknown }).type === DESK_SAVE_TYPE &&
    typeof (data as { value?: unknown }).value === 'string'
  )
}

export default function DeskBrokerFrame({ id, title, html }: { id: string; title: string; html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Seed is read once per artifact id — a save from THIS session flows back
  // out to localStorage directly (see the message listener below); it does
  // not need to round-trip back into `url` to be reflected on screen.
  const [seed] = useState(() => readSeed(id))

  const url = useMemo(() => {
    return artifactBlobUrl(html, buildSeedShim(seed) + OUTBOUND_LINK_SHIM)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed is captured once at mount (see useState initializer above); re-seeding on every parent re-render would fight the iframe's own in-memory store
  }, [html])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!isDeskSaveMessage(event.data)) return
      if (event.data.value.length > DESK_SAVE_MAX_BYTES) return
      try {
        localStorage.setItem(deskStorageKey(id), event.data.value)
      } catch {
        // localStorage full/unavailable — the desk still works for the rest
        // of this session (the in-memory stand-in inside the iframe is
        // unaffected); it just won't survive a reload. Silent on purpose:
        // this is a best-effort persistence layer, not a data path Nick
        // depends on to not lose work mid-session.
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [id])

  return (
    <iframe
      ref={iframeRef}
      title={`${title} (interactive artifact)`}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      allow="clipboard-write"
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
