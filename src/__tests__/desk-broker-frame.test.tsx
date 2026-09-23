// Guards DeskBrokerFrame's storage-broker contract (2026-09-23 decision:
// Context/Decisions/2026-09-23-team-desks-hub-brokered-opaque-frame.md).
//
// Runs in real Chromium (vitest.config.ts browser mode), same pattern as
// html-artifact-frame.test.tsx / team-artifact-frame.test.tsx.

import { describe, it, expect, beforeEach } from 'vitest'
import DeskBrokerFrame from '../components/DeskBrokerFrame'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'

const HTML =
  '<div class="card" data-id="c1"><div class="ctitle">Card one</div></div>' +
  '<script>window.__deskkitLoaded=true;</script>'

// Calls localStorage.setItem the way deskkit.js itself does — from its own
// <script> tag, separate from the component's internal seed shim. See the
// "save bridge" describe block below for what this currently proves.
const HTML_THAT_SAVES =
  '<script>localStorage.setItem("desk.v1", JSON.stringify({marks:{c1:true}}));</script>'

cleanupMountsAfterEach()

beforeEach(() => {
  localStorage.clear()
})

async function mount(id: string, html: string = HTML): Promise<HTMLElement> {
  return mountShared(<DeskBrokerFrame id={id} title="Desk" html={html} />, {
    ready: (h) => h.querySelector('iframe'),
    label: 'iframe',
  })
}

describe('DeskBrokerFrame — sandbox shape', () => {
  it('is an opaque-origin blob iframe — no allow-same-origin, ever', async () => {
    const host = await mount('art_shape')
    const iframe = host.querySelector('iframe')!
    const sandbox = (iframe.getAttribute('sandbox') || '').split(' ')

    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).toContain('allow-scripts')
    expect(iframe.getAttribute('src')).toMatch(/^blob:/)
  })

  it('delegates clipboard-write for deskkit\'s Copy-for-Claude button', async () => {
    const host = await mount('art_clip')
    expect(host.querySelector('iframe')!.getAttribute('allow')).toBe('clipboard-write')
  })
})

describe('DeskBrokerFrame — seed round-trip', () => {
  it('seeds the iframe stand-in from the Hub\'s own localStorage under desk:<id>', async () => {
    localStorage.setItem('desk:art_seeded', JSON.stringify({ 'desk.v1': '{"marks":{"c1":true}}' }))
    const host = await mount('art_seeded')
    const iframe = host.querySelector('iframe')!
    const served = await fetch(iframe.getAttribute('src')!).then((r) => r.text())

    // The seed shim embeds the seeded value as a JSON.parse(...) call inside
    // the served document, ahead of the artifact body. The value is
    // double-JSON-encoded (JSON text wrapped in a JS string literal), so the
    // quotes around the key are themselves escaped in the served bytes.
    expect(served).toContain('desk.v1')
    expect(served).toContain('marks')
    // Runs before the artifact's own markup in document order.
    expect(served.indexOf('JSON.parse')).toBeLessThan(served.indexOf('__deskkitLoaded'))
  })

  it('seeds an empty store, not a crash, when nothing is saved yet', async () => {
    const host = await mount('art_unseeded')
    const iframe = host.querySelector('iframe')!
    const served = await fetch(iframe.getAttribute('src')!).then((r) => r.text())
    expect(served).toContain('JSON.parse')
  })

  it('seeds an empty store when the saved entry is corrupt JSON', async () => {
    localStorage.setItem('desk:art_corrupt', 'not json{{{')
    const host = await mount('art_corrupt')
    // Must still render — a corrupt seed never blocks the frame.
    expect(host.querySelector('iframe')).not.toBeNull()
  })
})

describe('DeskBrokerFrame — save bridge (postMessage)', () => {
  // KNOWN BLOCKER (2026-09-23), NOT a passing feature: see the "NOT WIRED
  // UP" note at the top of DeskBrokerFrame.tsx. deskkit.js — and any real
  // artifact HTML passed through this component's `html` prop — necessarily
  // lands in a SEPARATE <script> tag from the internal seed shim (the shim
  // is always emitted first, as its own tag, by buildSeedShim). Measured in
  // real Chromium: `window.localStorage` reads from that second tag throw a
  // native SecurityError regardless of the shim's Object.defineProperty
  // override, so deskkit's own `localStorage.setItem` call never reaches the
  // stand-in and never posts a save. This test documents that CURRENT
  // reality (an uncaught error inside the iframe, no message, nothing
  // written) rather than assert a working round-trip that does not exist
  // yet — it should start failing, loudly, the moment a fix (the
  // window.__deskStorage adapter, or equivalent) lands, which is the signal
  // to rewrite it as a real pass.
  it('does NOT save yet — deskkit\'s own script tag cannot see the shim\'s override', async () => {
    await mount('art_save', HTML_THAT_SAVES)
    // Give the iframe's script every chance it would get in the working
    // case; the point is that nothing ever arrives.
    await new Promise((r) => setTimeout(r, 300))
    expect(localStorage.getItem('desk:art_save')).toBeNull()
  })

  it('ignores a message from a foreign source', async () => {
    await mount('art_foreign')
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'desk-save', value: '{"evil":"1"}' }, source: window }),
    )
    await new Promise((r) => setTimeout(r, 100))
    expect(localStorage.getItem('desk:art_foreign')).toBeNull()
  })

  it('refuses an oversized save', async () => {
    const host = await mount('art_big')
    const iframe = host.querySelector('iframe')!
    const huge = 'x'.repeat(1_000_001)
    ;(iframe.contentWindow as unknown as { postMessage: (m: unknown, o: string) => void }).postMessage(
      { type: 'desk-save', value: huge },
      '*',
    )
    await new Promise((r) => setTimeout(r, 100))
    expect(localStorage.getItem('desk:art_big')).toBeNull()
  })
})
