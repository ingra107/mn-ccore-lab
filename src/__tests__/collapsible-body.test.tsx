// #126: a long comment on any activity feed collapses to a few lines with a
// "more" control; a short one shows no control at all. The premise was
// measured on prod: the report landed 37s after a 3,587-character update was
// posted from the Today drawer, which rendered every character.
//
// Runs in real Chromium (vitest.config.ts browser mode) because the collapse
// decision is a MEASUREMENT (scrollHeight vs clientHeight), not a string rule.

import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CollapsibleBody } from '../components/activity/CollapsibleBody'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.style.width = '320px'
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  for (let i = 0; i < 100; i++) {
    if (host.querySelector('[data-collapsible-body]')) break
    await new Promise((r) => setTimeout(r, 10))
  }
  // one more frame so the layout measurement has run
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 20))
  return host
}

afterEach(() => {
  for (const { host, root } of mounted) { root.unmount(); host.remove() }
  mounted = []
})

const LONG = Array.from({ length: 40 }, (_, i) => `line ${i + 1} of a very long comment body`).join('\n')

describe('CollapsibleBody', () => {
  it('collapses a long body and offers "more"', async () => {
    const host = await mount(<CollapsibleBody maxLines={5}><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{LONG}</p></CollapsibleBody>)
    const box = host.querySelector<HTMLElement>('[data-collapsible-body]')!
    expect(box.scrollHeight).toBeGreaterThan(box.clientHeight)
    const btn = host.querySelector<HTMLButtonElement>('button')
    expect(btn?.textContent).toBe('more')
  })

  it('expands on click and can collapse again', async () => {
    const host = await mount(<CollapsibleBody maxLines={5}><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{LONG}</p></CollapsibleBody>)
    host.querySelector<HTMLButtonElement>('button')!.click()
    await new Promise((r) => setTimeout(r, 30))
    const box = host.querySelector<HTMLElement>('[data-collapsible-body]')!
    expect(box.scrollHeight).toBe(box.clientHeight)
    expect(host.querySelector('button')?.textContent).toBe('less')
  })

  it('shows no control on a short body', async () => {
    const host = await mount(<CollapsibleBody maxLines={5}><p style={{ margin: 0 }}>two words</p></CollapsibleBody>)
    expect(host.querySelector('button')).toBeNull()
  })
})
