// A fitted app-shell page (My Tasks) ends at the phone tab bar, not 127px above it.
//
// Overnight 2026-10-14 probe (390x844): after the <=420px .portal-content rule
// stopped cutting main's bottom padding to 12px, useFitViewportHeight
// subtracted all 184px of it (the window-scroll clearance for the tab bar and
// floaters). The tab bar is only ~57px, so the shell's inner scroller ended at
// y 660 with a blank band down to the bar at 787. The shell scrolls inside
// itself (.fab-clear carries the end padding), so its room ends at the bar.
//
// Fix-pass falsifier (same night): fitting the shell to the bar while main kept
// its 184px left the DOCUMENT 127px taller than the viewport. The window then
// scrolled and lifted the shell's bottom back off the bar. So the hook also sets
// main's bottom padding to the bar's height, and the document must fit.

import { describe, it, expect } from 'vitest'
import { useRef } from 'react'
import { useFitViewportHeight } from '../hooks/useFitViewportHeight'
import { mount, cleanupMountsAfterEach, unmountAll } from './testMount'

cleanupMountsAfterEach()
// The app's preflight zeroes body margin; the default 8px would add to the
// document height and is not what the hook is fitting against.
document.body.style.margin = '0'

function Shell() {
  const ref = useRef<HTMLDivElement>(null)
  useFitViewportHeight(ref, { minHeight: 50 })
  return <div ref={ref} id="shell" />
}

function Frame({ bar }: { bar: boolean }) {
  return (
    <div>
      <main id="portal-main" style={{ paddingTop: 20, paddingBottom: 184 }}>
        <Shell />
      </main>
      {bar && <nav data-bottom-bar style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 57 }} />}
    </div>
  )
}

describe('useFitViewportHeight with a bottom tab bar', () => {
  it('the shell ends at the tab bar top, ignoring main\'s window-scroll padding', async () => {
    const host = await mount(<Frame bar />, { ready: (h) => h.querySelector('#shell'), label: 'shell' })
    const shell = host.querySelector<HTMLElement>('#shell')!
    const bar = host.querySelector<HTMLElement>('[data-bottom-bar]')!
    await expect.poll(() => Math.round(shell.getBoundingClientRect().bottom)).toBe(Math.round(bar.getBoundingClientRect().top))
  })

  it('the document fits the viewport, so no window scroll lifts the shell off the bar', async () => {
    const host = await mount(<Frame bar />, { ready: (h) => h.querySelector('#shell'), label: 'shell' })
    const main = host.querySelector<HTMLElement>('#portal-main')!
    const bar = host.querySelector<HTMLElement>('[data-bottom-bar]')!
    await expect.poll(() => main.style.paddingBottom).toBe(`${Math.round(bar.getBoundingClientRect().height)}px`)
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight)
  })

  it('unmounting the shell gives main back its window-scroll padding', async () => {
    const host = await mount(<Frame bar />, { ready: (h) => h.querySelector('#shell'), label: 'shell' })
    const main = host.querySelector<HTMLElement>('#portal-main')!
    await expect.poll(() => main.style.paddingBottom).toBe('57px')
    // Keep main, drop the shell's hook: unmount the React tree and check the
    // cleanup restored the inline value the Frame set.
    const kept = main
    unmountAll()
    expect(kept.style.paddingBottom).toBe('184px')
  })

  it('without a tab bar (desktop) main\'s bottom padding still counts', async () => {
    const host = await mount(<Frame bar={false} />, { ready: (h) => h.querySelector('#shell'), label: 'shell' })
    const shell = host.querySelector<HTMLElement>('#shell')!
    await expect.poll(() => Math.round(shell.getBoundingClientRect().bottom)).toBe(window.innerHeight - 184)
  })
})
