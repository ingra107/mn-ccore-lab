// PageTooltip is a line in the page flow on the content band, never an overlay
// (site audit 2026-10-10: on Meetings it sat outside the band, over the list).
import { describe, it, expect, beforeEach } from 'vitest'
import PageTooltip from './PageTooltip'
import { mount, cleanupMountsAfterEach } from '../__tests__/testMount'

cleanupMountsAfterEach()
beforeEach(() => { try { localStorage.removeItem('mnccore-tooltip-seen-pt-test') } catch { /* ok */ } })

describe('PageTooltip placement', () => {
  it('renders on the band, in flow, without a delay', async () => {
    const host = await mount(<PageTooltip id="pt-test" text="Click a meeting" />, {
      ready: (h) => h.querySelector('.page-tooltip'), label: 'PageTooltip', width: '800px',
    })
    const tip = host.querySelector<HTMLElement>('.page-tooltip')!
    const slot = tip.parentElement!
    expect(slot.classList.contains('band-anchored-wide')).toBe(true)
    for (const el of [tip, slot]) {
      expect(['static', 'relative']).toContain(getComputedStyle(el).position)
    }
  })

  // Nick's mock, 2026-11-05: the bright bubble was the loudest thing on Meetings.
  // It is now Today's plain hint line: no fill, no shadow, muted text.
  it('is a plain line, not a bubble', async () => {
    const host = await mount(<PageTooltip id="pt-test" text="Click a meeting" />, {
      ready: (h) => h.querySelector('.page-tooltip'), label: 'PageTooltip', width: '800px',
    })
    const tip = host.querySelector<HTMLElement>('.page-tooltip')!
    const cs = getComputedStyle(tip)
    expect(cs.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(cs.boxShadow).toBe('none')
    expect(tip.style.color).toBe('var(--sk-t3)')
  })
})
