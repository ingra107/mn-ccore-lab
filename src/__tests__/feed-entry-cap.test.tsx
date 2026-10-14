// #8635 review (2026-10-14): the feed collapses each entry to 3 lines with
// CollapsibleBody, whose cap is 3 x line-height. The entry's first line carries
// an inline initials badge; if that badge is taller than the line, every line
// below shifts down and the third line's descenders fall past the cap. This
// measures the REAL row (FeedEntryText + index.css) in Chromium: the third
// line's text must end inside the cap, and no part of a fourth line may start
// inside it. A badge resize that breaks either fails here.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { FeedEntryText } from '../components/dashboard/ActivityFeedCard'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const DESC = 'updated the description of the project with a long sentence that wraps several times in the narrow column of the feed card on a phone'

/** Distinct text line boxes (top, bottom) relative to the box, in px. */
function textLines(box: HTMLElement): { top: number; bottom: number }[] {
  const origin = box.getBoundingClientRect().top
  const range = document.createRange()
  const lines = new Map<number, { top: number; bottom: number }>()
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement?.closest('.tk-face')) continue // the initials inside the badge
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) {
      const key = Math.round(r.bottom - origin)
      const prev = lines.get(key)
      lines.set(key, { top: Math.min(prev?.top ?? Infinity, r.top - origin), bottom: Math.max(prev?.bottom ?? 0, r.bottom - origin) })
    }
  }
  return [...lines.values()].sort((a, b) => a.bottom - b.bottom)
}

describe('feed entry 3-line cap', () => {
  it.each([
    ['with an actor badge', 'Nick', 'NI'],
    ['without an actor', null, null],
  ])('%s: line 3 ends inside the cap and line 4 starts below it', async (_label, actorName, actorInitials) => {
    const host = await mount(
      <FeedEntryText actorName={actorName} actorInitials={actorInitials} description={DESC} />,
      { ready: (h) => h.querySelector('[data-collapsible-body]'), label: 'FeedEntryText', width: '200px' },
    )
    const box = host.querySelector<HTMLElement>('[data-collapsible-body]')!
    await expect.poll(() => host.querySelector('button')?.textContent).toBe('more')
    const cap = box.clientHeight
    const lines = textLines(box)
    expect(lines.length).toBeGreaterThanOrEqual(4)
    expect(lines[2].bottom).toBeLessThanOrEqual(cap)
    expect(lines[3].top).toBeGreaterThanOrEqual(cap)
  })
})
