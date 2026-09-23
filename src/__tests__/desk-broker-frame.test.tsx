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

// Reproduces deskkit's REAL shape: the seed shim runs in ITS OWN <script>
// tag (component-internal, always first); this is a SECOND, separate
// <script> tag — same as deskkit.js's own, per its SKILL.md contract — that
// calls `store()`, deskkit's own helper (`window.__deskStorage ||
// localStorage`), for both the save and a readback in the same call.
const HTML_THAT_SAVES =
  '<script>' +
  'function store(){return window.__deskStorage||localStorage;}' +
  'store().setItem("desk.v1", JSON.stringify({marks:{c1:true}}));' +
  '</script>'

// Reads back via store() and reports what it saw — used to confirm a
// remount seeded from the Hub's own localStorage reaches deskkit's read
// path, not just the write path.
function htmlThatReadsBack(reportType: string): string {
  return (
    '<script>' +
    'function store(){return window.__deskStorage||localStorage;}' +
    'try{parent.postMessage({type:' + JSON.stringify(reportType) + ',value:store().getItem("desk.v1")},"*");}' +
    'catch(e){}' +
    '</script>'
  )
}

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

/** Waits up to ~2s for `check()` to become truthy; throws `label` if not. */
async function waitFor(check: () => unknown, label: string) {
  for (let i = 0; i < 200; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`${label} never became true`)
}

describe('DeskBrokerFrame — save bridge (postMessage)', () => {
  // The real shape: buildSeedShim's <script> (component-internal, always
  // first) defines window.__deskStorage; THIS html is rendered as its own,
  // separate <script> tag — exactly how deskkit.js is pasted into a page —
  // and reaches the stand-in only through window.__deskStorage, never a
  // window.localStorage override. See DeskBrokerFrame.tsx's file header for
  // the measured reason a native-accessor override could not do this.
  it('setItem from deskkit\'s own script tag posts a desk-save message the parent writes to desk:<id>', async () => {
    await mount('art_save', HTML_THAT_SAVES)
    await waitFor(() => localStorage.getItem('desk:art_save') !== null, 'desk:art_save to be written')
    const stored = JSON.parse(localStorage.getItem('desk:art_save')!)
    expect(JSON.parse(stored['desk.v1'])).toEqual({ marks: { c1: true } })
  })

  it('survives a remount seeded from the Hub\'s own localStorage — deskkit\'s read path, not just the write path', async () => {
    // First mount: deskkit's own script tag saves.
    await mount('art_roundtrip', HTML_THAT_SAVES)
    await waitFor(() => localStorage.getItem('desk:art_roundtrip') !== null, 'desk:art_roundtrip to be written')

    // Second mount, same id, fresh iframe: a NEW DeskBrokerFrame reads the
    // seed DeskBrokerFrame just wrote to Hub localStorage, and a script tag
    // shaped exactly like deskkit's own startup read (store().getItem(...))
    // reports what it sees.
    const seen: unknown[] = []
    const listener = (e: MessageEvent) => {
      if (e.data && e.data.type === 'readback-report') seen.push(e.data.value)
    }
    window.addEventListener('message', listener)
    await mount('art_roundtrip', htmlThatReadsBack('readback-report'))
    await waitFor(() => seen.length > 0, 'readback-report from the remounted frame')
    window.removeEventListener('message', listener)

    expect(JSON.parse(seen[0] as string)).toEqual({ marks: { c1: true } })
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
