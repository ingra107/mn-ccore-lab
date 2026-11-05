// A Deadlines Timeline row (visual audit 2, H5 + H6), real index.css, real Chromium.
//  - It names the project by its short name, never the slug.
//  - On a phone the title has its own line and shows whole. The chip and face
//    used to crush it to "Upload IRB a...".
import '../index.css'
import { describe, it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import { DeadlineRow } from '../pages/portal/DeadlinesPage'
import type { DeadlineItem } from '../pages/portal/DeadlineList'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const item: DeadlineItem = {
  id: 't1', title: 'Upload IRB amendment and consent', fullTitle: 'Upload IRB amendment and consent',
  due_date: '2026-11-08', type: 'task', assignee: 'nick-ingraham', project: 'sepsis_outcomes_reg',
  status: 'todo', priority: 'urgent', isOverdue: false, daysUntil: 3,
}
const row = () => (
  <MemoryRouter>
    <div style={{ width: 'min(100vw, 1100px)' }}>
      <DeadlineRow item={item} project={{ name: 'Sepsis Outcomes', slug: 'sepsis_outcomes_reg', fullTitle: 'Sepsis Outcomes Registry' }} onOpen={() => {}} />
    </div>
  </MemoryRouter>
)
const ready = { ready: (h: HTMLElement) => h.querySelector('[data-deadline-row]'), label: 'row' }

describe('Deadlines Timeline row', () => {
  it('prints the project name, not the slug, at both widths', async () => {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await page.viewport(w, h)
      const host = await mount(row(), ready)
      expect(host.textContent).toContain('Sepsis Outcomes')
      expect(host.textContent).not.toContain('sepsis_outcomes_reg')
    }
  })

  it('gives the title its own whole line on a phone', async () => {
    await page.viewport(390, 844)
    const host = await mount(row(), ready)
    const title = host.querySelector<HTMLElement>('[title="Upload IRB amendment and consent"]')!
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    expect(title.getBoundingClientRect().width).toBeGreaterThan(250)
  })

  it('keeps one line on desktop', async () => {
    await page.viewport(1440, 900)
    const host = await mount(row(), ready)
    expect(host.querySelector<HTMLElement>('[data-deadline-row]')!.getBoundingClientRect().height).toBeLessThan(44)
  })
})
