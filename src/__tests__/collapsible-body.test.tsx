// #126: a long comment on any activity feed collapses to a few lines with a
// "more" control; a short one shows no control at all. The premise was
// measured on prod: the report landed 37s after a 3,587-character update was
// posted from the Today drawer, which rendered every character.
//
// Runs in real Chromium (vitest.config.ts browser mode) because the collapse
// decision is a MEASUREMENT (scrollHeight vs clientHeight), not a string rule.

import { describe, it, expect } from 'vitest'
import type { ReactElement } from 'react'
import { CollapsibleBody } from '../components/activity/CollapsibleBody'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = await mountShared(node, { ready: (h) => h.querySelector('[data-collapsible-body]'), label: 'CollapsibleBody', width: '320px' })
  // one more frame so the layout measurement has run
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  await new Promise((r) => setTimeout(r, 20))
  return host
}

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
    await expect.poll(() => host.querySelector('button')?.textContent).toBe('less')
    const box = host.querySelector<HTMLElement>('[data-collapsible-body]')!
    await expect.poll(() => box.scrollHeight - box.clientHeight).toBe(0)
  })

  // #8635: the drawer, feed and project-page sites cap at 3 lines with their own
  // line-height. The cap must be exactly 3 of THOSE lines, or a 1.6 body cuts
  // its third line and a 1.375 body shows a sliver of a fourth.
  it.each([1.375, 1.5, 1.6])('caps at exactly 3 lines at line-height %s', async (lh) => {
    const host = await mount(
      <CollapsibleBody maxLines={3} fontSize="14px" lineHeight={lh}>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{LONG}</p>
      </CollapsibleBody>,
    )
    const box = host.querySelector<HTMLElement>('[data-collapsible-body]')!
    expect(Math.abs(box.clientHeight - 14 * lh * 3)).toBeLessThanOrEqual(1)
    expect(host.querySelector('button')?.textContent).toBe('more')
  })

  it('shows no control on a short body', async () => {
    const host = await mount(<CollapsibleBody maxLines={5}><p style={{ margin: 0 }}>two words</p></CollapsibleBody>)
    expect(host.querySelector('button')).toBeNull()
  })

  // A body of exactly maxLines lines fits: no "more" that expands to nothing.
  // Padding or a border on the child counts against the cap, which is why
  // ProjectDetail keeps its click-to-edit chrome on the wrapper (#8635 review).
  it.each([1.375, 1.5, 1.6])('shows no control on a body of exactly 3 lines at line-height %s', async (lh) => {
    const host = await mount(
      <CollapsibleBody maxLines={3} fontSize="14px" lineHeight={lh}>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{'one\ntwo\nthree'}</p>
      </CollapsibleBody>,
    )
    expect(host.querySelector('button')).toBeNull()
  })
})
