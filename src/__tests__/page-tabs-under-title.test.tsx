// Page titles (Nick's mock, 2026-11-05): tabs sit below the title, and the title
// stays put when the tab changes. A tab whose page has no header still gets the tray.
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import PageTabs from '../components/PageTabs'
import PageHeader from '../components/PageHeader'
import { mount, cleanupMountsAfterEach } from './testMount'
import notesSource from '../pages/portal/MeetingNotesPage.tsx?raw'

cleanupMountsAfterEach()

const tabs = [
  { key: 'a', label: 'All', render: () => <PageHeader title="Projects" subtitle="tab a" /> },
  { key: 'b', label: 'Ideas', render: () => <PageHeader title="Projects" subtitle="tab b" /> },
]
const setup = (t = tabs, at = '/x') => mount(
  <MemoryRouter initialEntries={[at]}><PageTabs title="Projects" ariaLabel="Projects views" tabs={t} /></MemoryRouter>,
  { ready: (h) => h.querySelector('[data-testid="page-tabs"]'), label: 'PageTabs', width: '900px' },
)

describe('PageTabs under the title', () => {
  it('draws the tray once, below the title and its rule', async () => {
    const host = await setup()
    const trays = host.querySelectorAll('[data-testid="page-tabs"]')
    expect(trays.length).toBe(1)
    const h1 = host.querySelector('h1')!
    expect(h1.compareDocumentPosition(trays[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(trays[0].getBoundingClientRect().top).toBeGreaterThanOrEqual(h1.getBoundingClientRect().bottom)
  })

  it('keeps the title and the tray in place when the tab changes, and keeps focus on the tray', async () => {
    const host = await setup()
    const trayTop = () => host.querySelector('[data-testid="page-tabs"]')!.getBoundingClientRect().top
    const before = trayTop()
    const ideas = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === 'Ideas')!
    ideas.focus()
    ideas.click()
    await vi.waitFor(() => expect(host.textContent).toContain('tab b'))
    expect(host.querySelector('h1')!.textContent).toBe('Projects')
    expect(trayTop()).toBe(before)
    expect(document.activeElement?.textContent).toBe('Ideas')
  })

  it('still offers the tabs when the page in the tab draws no header', async () => {
    const host = await setup([
      { key: 'a', label: 'All', render: () => <p>no header here</p> },
      { key: 'b', label: 'Ideas', render: () => <PageHeader title="Projects" /> },
    ])
    expect(host.querySelectorAll('[data-testid="page-tabs"]').length).toBe(1)
    expect(host.querySelector('h1')).toBeNull()
  })

  it('draws no tray for one tab', async () => {
    const host = await mount(
      <MemoryRouter><PageTabs title="Projects" ariaLabel="x" tabs={[tabs[0]]} /></MemoryRouter>,
      { ready: (h) => h.querySelector('h1'), label: 'one tab' },
    )
    expect(host.querySelector('[data-testid="page-tabs"]')).toBeNull()
  })
})

// Review, 2026-11-05: its loading branch had no header, so on a cold load the title
// vanished and the tray jumped to the top of the page, then back. The branch only runs
// in a production build (DEV seeds initialData), so this reads the source.
describe('Transcripts while it loads', () => {
  it('keeps the header in the loading branch', () => {
    const branch = /if \(isLoading\)[\s\S]*?<TableSkeleton/.exec(notesSource)?.[0] ?? ''
    expect(branch).toContain('{header}')
    expect(notesSource).toMatch(/const header = \(\s*<PageHeader\s+title="Meetings"/)
  })
})
