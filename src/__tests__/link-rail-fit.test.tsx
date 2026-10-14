// The project page's right-rail Links list (O2B, 2026-10-14): a link chip with
// a long title kept its full 240px, so in the ~270px rail it pushed its own
// date and archive button past the rail edge ('Aug 1, 202', no button), while
// shorter rows below showed both. The chip now gives way (minWidth 0) and
// ellipsizes its title.
//
// Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ProjectLinkLibrary from '../components/ProjectLinkLibrary'
import type { StoredLink } from '../hooks/useApiData'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// Tailwind is not compiled in browser-mode tests: inject the few utilities the
// row's layout rests on, so the flex row measures as it does in the app.
const style = document.createElement('style')
style.textContent = '.flex{display:flex}.inline-flex{display:inline-flex}.flex-col{flex-direction:column}' +
  '.items-center{align-items:center}.justify-between{justify-content:space-between}.self-start{align-self:flex-start}' +
  '.gap-2{gap:.5rem}.gap-1\\.5{gap:.375rem}'
document.head.appendChild(style)

const LONG = 'Federated meta-analysis method for the consortium sites and their pooled estimates'

const links: StoredLink[] = [
  { id: 'l1', role: 'key', type: 'web', canonical_url: 'https://example.com/a', short_title: LONG, sort_order: 1, created_at: '2026-08-01 12:00:00' } as StoredLink,
  { id: 'l2', role: 'key', type: 'web', canonical_url: 'https://example.com/b', short_title: 'Short', sort_order: 2, created_at: '2026-10-09 12:00:00' } as StoredLink,
]

describe('right-rail Links fit a narrow rail', () => {
  it('a long chip leaves room for its date and archive button', async () => {
    const h = await mount(
      <MemoryRouter><div style={{ width: 260 }} data-rail><ProjectLinkLibrary links={links} onSetRole={() => {}} /></div></MemoryRouter>,
      { ready: (x) => x.querySelectorAll('button[aria-label^="Archive link"]').length === 2, label: 'ProjectLinkLibrary' },
    )
    const rail = (h.querySelector('[data-rail]') as HTMLElement).getBoundingClientRect()
    const archive = [...h.querySelectorAll('button[aria-label^="Archive link"]')] as HTMLElement[]
    for (const b of archive) expect(b.getBoundingClientRect().right).toBeLessThanOrEqual(rail.right + 0.5)
    const chip = h.querySelector('a[title]') as HTMLElement
    expect(chip.getBoundingClientRect().width).toBeLessThan(240)
  })
})
