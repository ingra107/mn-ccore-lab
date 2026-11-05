// Visual audit 2's medium defects that a test can hold. Real Chromium, real index.css.
import '../index.css'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CreateProjectModal from '../components/CreateProjectModal'
import CommandPalette from '../components/CommandPalette'
import { WorkflowSection } from '../components/tasks/detail/FieldControls'
import { descriptionIsJustTheTitle } from '../components/today/TaskDetailDrawer'
import { openCommandPalette } from '../lib/platform'
import { mount, cleanupMountsAfterEach, waitFor } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear() })

const stub = () => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
const wrap = (node: React.ReactNode, path = '/portal/projects') => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
  </QueryClientProvider>
)

describe('M10 + M11: the create modal', () => {
  it('says Manuscript when a manuscript is what it makes', async () => {
    stub()
    await mount(wrap(<CreateProjectModal open nounFromKind onClose={() => {}} onCreate={() => {}} />), { ready: () => document.querySelector('#create-project-form'), label: 'modal' })
    const text = document.body.innerText
    expect(text).toContain('New Manuscript')
    expect(text).toContain('Create Manuscript')
    expect(text).not.toContain('New Project')
  })

  it('shows no "required" complaint before anything is typed, and tells a screen reader', async () => {
    stub()
    await mount(wrap(<CreateProjectModal open onClose={() => {}} onCreate={() => {}} />), { ready: () => document.querySelector('#create-project-form'), label: 'modal' })
    expect(document.getElementById('project-submit-hint')!.getBoundingClientRect().width).toBeLessThanOrEqual(1)
  })
})

describe('M7: the drawer workflow fields', () => {
  it('have an edge at rest', async () => {
    const host = await mount(
      <WorkflowSection fields={{ waiting_on: null, next_checkin_date: null, promised_to: null, promise_date: null }} onChange={() => {}} compact />,
      { ready: (h) => h.querySelector('input'), label: 'input' },
    )
    const border = getComputedStyle(host.querySelector('input')!).borderTopColor
    expect(border).not.toBe('rgba(0, 0, 0, 0)')
    expect(border).not.toBe('transparent')
  })
})

describe('M6: a description that repeats the title', () => {
  it('is not shown twice', () => {
    expect(descriptionIsJustTheTitle({ title: 'Upload IRB amendment', description: 'Upload IRB amendment' })).toBe(true)
    expect(descriptionIsJustTheTitle({ title: 'Upload IRB amendment', description: 'Upload it to ETHOS' })).toBe(false)
    expect(descriptionIsJustTheTitle({ title: 'Upload IRB amendment', description: '' })).toBe(false)
  })
})

describe('M8 + M9: the command palette', () => {
  it('names a recent page as the sidebar does, with no raw path and no stat line', async () => {
    stub()
    sessionStorage.setItem('mnccore-cmdk-recent', JSON.stringify(['/portal/dashboard']))
    await mount(wrap(<CommandPalette />), { ready: (h) => h, label: 'palette' })
    // Its key listener attaches in an effect, after the first commit.
    await new Promise((r) => setTimeout(r, 50))
    openCommandPalette()
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('[aria-label="Command palette"]'), 'palette open')
    await expect.poll(() => dialog.innerText).toContain('Today')
    expect(dialog.innerText).not.toContain('Dashboard')
    expect(dialog.innerText).not.toContain('/portal/dashboard')
    expect(dialog.innerText).not.toMatch(/\d+ tasks ·/)
  })
})
