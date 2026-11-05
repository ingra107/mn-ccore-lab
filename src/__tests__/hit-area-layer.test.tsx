// .hit-area sets position: relative on touch so its ::before tap zone anchors to
// the control. That rule must lose to any positioning a site asks for. Unlayered,
// it beat Tailwind's layered .absolute whatever the specificity, so the Search
// clear button fell out of its field on phones (sweep audit H1, 2026-11-05). Runs
// the real index.css in Chromium, because only the real cascade shows layer order.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const position = async (className: string) => {
  const host = await mount(
    <div className="relative" style={{ width: 200, height: 40 }}>
      <button type="button" data-testid="c" className={className}>x</button>
    </div>,
    { ready: (h) => h.querySelector('button'), label: 'hit-area control' },
  )
  return getComputedStyle(host.querySelector('button')!).position
}

describe('.hit-area on a phone', () => {
  it('a bare control is the positioned anchor for its tap zone', async () => {
    await page.viewport(390, 844)
    expect(await position('hit-area')).toBe('relative')
  })

  it.each(['absolute', 'fixed', 'sticky'])('a %s utility wins over it', async (utility) => {
    await page.viewport(390, 844)
    expect(await position(`hit-area ${utility}`)).toBe(utility)
  })
})
