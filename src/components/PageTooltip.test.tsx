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
})
