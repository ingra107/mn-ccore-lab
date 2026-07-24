// Guards the fix for the blank-artifact bug (2026-07-24).
//
// An interactive artifact used to render via srcDoc, which leaves the frame's
// document URL as `about:srcdoc`. One click on an in-page anchor navigated the
// frame to `about:blank#hash` and the artifact vanished — a blank panel.
// The frame must therefore hand the document a REAL url, and must keep the
// opaque-origin sandbox that stops an artifact reading the Hub session.
//
// Runs in real Chromium (vitest.config.ts browser mode), so URL.createObjectURL
// and the iframe are the real thing, not a jsdom stand-in. Mounts with
// react-dom directly — the repo carries no testing-library.

import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import HtmlArtifactFrame from '../components/HtmlArtifactFrame'

const HTML = '<h1>Aims</h1><nav><a href="#shape">Shape</a></nav><details id="shape"><summary>Shape</summary><p>body</p></details>'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLIFrameElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  // React 19 commits asynchronously; poll rather than assume one tick is enough
  for (let i = 0; i < 100; i++) {
    const el = host.querySelector('iframe')
    if (el) return el
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('iframe never rendered')
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
})

describe('HtmlArtifactFrame', () => {
  it('gives the document a real url so in-page anchors do not blank it', async () => {
    const iframe = await mount(<HtmlArtifactFrame title="Aims Funnel" html={HTML} />)

    expect(iframe.getAttribute('src')).toMatch(/^blob:/)
    // srcdoc is the regression: it yields about:srcdoc, where a fragment click
    // is a cross-document navigation to about:blank#hash.
    expect(iframe.hasAttribute('srcdoc')).toBe(false)
  })

  it('keeps the artifact in an opaque origin', async () => {
    const iframe = await mount(<HtmlArtifactFrame title="Aims Funnel" html={HTML} />)
    const sandbox = iframe.getAttribute('sandbox') || ''

    // Scripts run, popups may open — but no allow-same-origin, so the frame can
    // never reach the Hub session. Adding it here would undo that.
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox.split(' ')).toContain('allow-scripts')
  })

  it('lets an outbound link leave for a new tab instead of eating the artifact', async () => {
    const iframe = await mount(<HtmlArtifactFrame title="Aims Funnel" html={HTML} />)
    const sandbox = (iframe.getAttribute('sandbox') || '').split(' ')

    // Without allow-popups a retargeted link silently does nothing; without the
    // retarget the link replaces the artifact in the frame. Both halves needed.
    expect(sandbox).toContain('allow-popups')
    const served = await fetch(iframe.getAttribute('src')!).then((r) => r.text())
    expect(served).toContain('a.target="_blank"')
    expect(served).toContain(HTML)
  })

  it('mints a distinct url per artifact body', async () => {
    const a = await mount(<HtmlArtifactFrame title="A" html="<p>one</p>" />)
    const b = await mount(<HtmlArtifactFrame title="B" html="<p>two</p>" />)

    expect(a.getAttribute('src')).not.toBe(b.getAttribute('src'))
  })
})
