// Manuscripts (cold audit 2, 2026-11-05):
//   G03  the page's stage controls stop at Writing, and New Manuscript starts there;
//        abstracts and talks keep their own ladders
//   G24  a filter with no matches says so and offers Clear
//   G25  the undo toast says a label, not a field name and a slug
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthUser } from '../../hooks/useAuth'
import { UndoToastProvider } from '../../components/UndoToast'
import ManuscriptsPage from './ManuscriptsPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER: AuthUser = {
  email: 'dan-shyu@umn.edu', slug: 'dan-shyu', isAuthenticated: true, isPi: false, isMember: true, canShowAllProjects: false, piResolved: true,
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const rung = (stage: string, label: string, ordinal: number) => ({ stage, label, ordinal, is_terminal: 0 })
const KINDS = [
  { kind: 'manuscript', label: 'Manuscript', plural_label: 'Manuscripts', has_page: 1, can_fund: 0, sort_order: 10, stages: [
    rung('idea', 'Idea', 10), rung('data_collection', 'Data collection', 20), rung('data_analysis', 'Data analysis', 30),
    rung('writing', 'Writing', 40), rung('submitted', 'Submitted', 50), rung('revisions', 'Revisions', 60), rung('accepted', 'Accepted', 70), rung('published', 'Published', 80),
  ] },
  { kind: 'abstract', label: 'Abstract', plural_label: 'Abstracts', has_page: 1, can_fund: 0, sort_order: 20, stages: [
    rung('idea', 'Abstract idea', 10), rung('drafting', 'Drafting', 20), rung('presented', 'Presented', 30),
  ] },
]
const product = (id: string, projectId: string, kind: string, stage: string, label: string, ordinal: number) => ({
  id, project_id: projectId, kind, kind_label: kind, stage, stage_label: label, stage_ordinal: ordinal, stage_is_terminal: 0, title: null, short_name: null,
  waiting_on: null, venue: null, due_date: null, deadline: null, folder: null, repo_url: null, stage_entered_at: null, stage_notes: null,
  sort_order: 0, is_home: 1, lineage_rank: 0, grew_from_id: null, seq: 1, created_at: '', updated_at: '',
})

let mounted: { host: HTMLElement; root: Root }[] = []
let posts: { url: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  posts = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(String(init.body ?? '{}')) })
      return json({ data: { slug: 'x' } })
    }
    if (url.startsWith('/api/manuscripts/attention')) return json({ data: { revisions_overdue: [], awaiting_review: [], stale_drafts: [] } })
    if (url.startsWith('/api/projects/products')) {
      return json({
        byProject: {
          proj_w: [product('prd_w', 'proj_w', 'manuscript', 'writing', 'Writing', 40)],
          proj_a: [product('prd_a', 'proj_a', 'abstract', 'drafting', 'Drafting', 20)],
        },
        kinds: KINDS,
      })
    }
    if (url.startsWith('/api/projects') && !url.includes('publications')) {
      return json({ data: [
        { id: 'proj_w', slug: 'write-me', title: 'A paper in writing', status: 'active', category: 'CLIF', pi: 'nate-mesfin' },
        { id: 'proj_a', slug: 'abs-me', title: 'An abstract project', status: 'active', category: 'CLIF', pi: 'nate-mesfin' },
        { id: 'proj_d', slug: 'dan-proj', title: 'A project of Dan', status: 'active', category: 'CLIF', pi: 'dan-shyu' },
      ] })
    }
    if (url === '/api/team') return json({ data: [{ id: 'tm', slug: 'nate-mesfin', name: 'Nate Mesfin', email: 'mesfin@umn.edu', member_type: 'director' }] })
    return json({ data: [] })
  }))
})

afterEach(() => {
  mounted.forEach(({ host, root }) => { act(() => root.unmount()); host.remove() })
  mounted = []
  vi.unstubAllGlobals()
})

async function mount(path = '/portal/manuscripts'): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthContext.Provider value={{ user: USER, isAuthenticated: true, isLoading: false }}>
          <UndoToastProvider>
            <MemoryRouter initialEntries={[path]}><ManuscriptsPage /></MemoryRouter>
          </UndoToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  mounted.push({ host, root })
  return host
}

const buttonNamed = (h: ParentNode, name: string | RegExp) =>
  [...h.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''))) as HTMLButtonElement | undefined
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => o.textContent?.trim())
const row = (h: HTMLElement) => h.querySelector('[data-slug="write-me"]') as HTMLElement

// The sleek row's inline select for the value showing in that cell.
const openCell = async (h: HTMLElement, shows: RegExp) => {
  const trigger = [...row(h).querySelectorAll('button')].find((b) => shows.test(b.textContent ?? ''))!
  await act(async () => { trigger.click() })
}
const choose = async (label: string) => {
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === label)!
  await act(async () => { option.click() })
}

describe('ManuscriptsPage stage controls', () => {
  it('the List stage select starts at Writing', async () => {
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await openCell(h, /^Writing/)
    expect(options()).toEqual(['Writing', 'Submitted', 'Revisions', 'Accepted', 'Published'])
  })

  it('the Pipeline has no column a card would vanish into', async () => {
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await act(async () => { buttonNamed(h, /Pipeline/)!.click() })
    await expect.poll(() => [...h.querySelectorAll('h3')].map((x) => x.textContent)).toContain('Submitted')
    const heads = [...h.querySelectorAll('h3')].map((x) => x.textContent)
    expect(heads).not.toContain('Idea')
    expect(heads).not.toContain('Data collection')
    expect(heads).not.toContain('Data analysis')
    expect(heads).toContain('Writing')
  })

  it('New Manuscript opens at Writing, and the kind picker still gets a kind its own ladder', async () => {
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await act(async () => { buttonNamed(h, /New Manuscript/)!.click() })
    await expect.poll(() => buttonNamed(document.body, 'Create Project')).toBeTruthy()
    const form = document.getElementById('create-project-form')!
    expect(form.textContent).toContain('Writing')
    expect(form.textContent).not.toContain('Idea')
    // Switching the first product to an abstract offers the abstract ladder, in full.
    const kindTrigger = [...form.querySelectorAll('button')].find((b) => /Manuscript/.test(b.textContent ?? ''))!
    await act(async () => { kindTrigger.click() })
    await choose('Abstract')
    const stageTrigger = [...form.querySelectorAll('button')].find((b) => /Abstract idea/.test(b.textContent ?? ''))!
    await act(async () => { stageTrigger.click() })
    expect(options()).toEqual(['Abstract idea', 'Drafting', 'Presented'])
  })

  it("the Abstracts tab keeps its own ladder, none of it cut", async () => {
    const h = await mount('/portal/manuscripts?kind=abstract')
    await expect.poll(() => h.textContent).toContain('An abstract project')
    const trigger = [...h.querySelectorAll('button')].find((b) => /Drafting/.test(b.textContent ?? ''))
    expect(trigger).toBeTruthy()
    await act(async () => { trigger!.click() })
    expect(options()).toEqual(['Abstract idea', 'Drafting', 'Presented'])
  })
})

describe('ManuscriptsPage filters and toasts', () => {
  it('a filter with no matches says so, and Clear brings the row back', async () => {
    const h = await mount('/portal/manuscripts?category=MNCCORE')
    await expect.poll(() => h.textContent).toContain('No manuscripts match')
    expect(h.textContent).not.toContain('The shelf is empty')
    await act(async () => { buttonNamed(h, 'Clear filters')!.click() })
    await expect.poll(() => row(h)).not.toBeNull()
  })

  it('a status change says the status in words', async () => {
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await openCell(h, /Active/)
    await choose('Waiting')
    await expect.poll(() => document.body.textContent).toContain('Status: Waiting')
    expect(document.body.textContent).not.toContain('status →')
    expect(document.body.textContent).not.toContain('waiting_external')
  })

  it('a PI change says who, not a slug', async () => {
    // The PI cell is a face with no menu on a phone-width row.
    await page.viewport(1280, 800)
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await openCell(h, /Nate|Nathan/)
    const name = options().find((o) => /Shyu/.test(o ?? ''))!
    await choose(name)
    await expect.poll(() => document.body.textContent).toContain(`PI: ${name}`)
    expect(document.body.textContent).not.toContain('dan-shyu')
    expect(document.body.textContent).not.toContain('pi →')
  })

  it('a group change names the group, not the raw category', async () => {
    const h = await mount()
    await expect.poll(() => row(h)).not.toBeNull()
    await openCell(h, /^CLIF/)
    await choose('PB')
    await expect.poll(() => document.body.textContent).toContain('Group: PB')
    expect(document.body.textContent).not.toContain('category →')
  })
})
