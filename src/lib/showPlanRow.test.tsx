// The Re-plan note's link unfolds Needs you when folded and scrolls the
// "Plan your week" row into view.
//
// Run: npx vitest run --config vitest.config.ts src/lib/showPlanRow.test.tsx

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { requestShowPlanRow, useShowPlanRowRequests } from './showPlanRow'
import { mount, cleanupMountsAfterEach, waitFor } from '../__tests__/testMount'

cleanupMountsAfterEach()

function Harness({ startFolded, restore }: { startFolded: boolean; restore: () => void }) {
  const [folded, setFolded] = useState(startFolded)
  useShowPlanRowRequests(folded, () => { restore(); setFolded(false) })
  return <div>{!folded && <div data-testid="q-week-plan" />}</div>
}

describe('requestShowPlanRow', () => {
  it('folded: restores the card, then scrolls to the plan row', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const restore = vi.fn()
    const host = await mount(<Harness startFolded restore={restore} />, { ready: (h) => h.firstElementChild, label: 'h' })
    expect(host.querySelector('[data-testid="q-week-plan"]')).toBeNull()
    await new Promise((r) => setTimeout(r, 50)) // let the effect subscribe
    requestShowPlanRow()
    await waitFor(() => scroll.mock.calls.length === 1, 'scrolled')
    expect(restore).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[data-testid="q-week-plan"]')).not.toBeNull()
  })

  it('unfolded: just scrolls', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const restore = vi.fn()
    await mount(<Harness startFolded={false} restore={restore} />, { ready: (h) => h.firstElementChild, label: 'h' })
    await new Promise((r) => setTimeout(r, 50)) // let the effect subscribe
    requestShowPlanRow()
    await waitFor(() => scroll.mock.calls.length === 1, 'scrolled')
    expect(restore).not.toHaveBeenCalled()
  })
})
