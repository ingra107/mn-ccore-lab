// The Projects list on the sleek row (components/project/ProjectSleekList):
// what a row shows (short name, no "Active", Waiting keeps its word, the PI
// face, the health bar only when poor, no stage dots) and the keyboard / click
// contract it keeps (j/k cursor, Enter opens, p pins, Esc clears, a row click
// opens the project, a click on an inline editor or the pin star does not).
//
// Real Chromium (vitest.config.ts browser mode), react-dom directly.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectSleekList from '../components/project/ProjectSleekList'
import type { ProductKind, ProductRow } from '../lib/products'
import { isPoorHealth, projectRowName, type ProjectHealth } from '../lib/projectListOptions'
import type { SleekSort } from '../components/table/SleekRows'
import type { Project } from '../data/types'
import type { StoredLink } from '../hooks/useApiData'
import { PATHS } from '../constants/paths'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { vi.unstubAllGlobals() })

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
// useProjectKeyboardNav listens on document.
const key = (k: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

const project = (slug: string, extra: Partial<Project> = {}) => ({
  id: `id-${slug}`, slug, title: `Full title of ${slug}`, short_name: slug.toUpperCase(), status: 'active',
  home_kind: 'manuscript', home_stage: 'analysis', pi: 'nick-ingraham', category: 'MNCCORE', type: null, lastActivity: null, primary_folder: null,
  ...extra,
}) as unknown as Project

const projects = [
  project('alpha'),
  project('bravo', { status: 'waiting_external' }),
  project('charlie', { short_name: undefined,title: 'CLIF: Charlie the long title' }),
]
const health = new Map<string, ProjectHealth>([['alpha', { score: 80, status: 'Healthy' }], ['bravo', { score: 35, status: 'Critical' }]])

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname}</output>
}

const link = (id: string): StoredLink => ({ id, role: 'key', type: 'google_doc', canonical_url: `https://docs.google.com/${id}`, short_title: id, sort_order: 0 })

interface Opts { projects?: Project[]; links?: Record<string, StoredLink[]>; sort?: SleekSort }

// Products: alpha and bravo hold one manuscript each (a ladder), charlie two (chips).
const KINDS: ProductKind[] = [{
  kind: 'manuscript', label: 'Manuscript', plural_label: 'Manuscripts', has_page: 1, can_fund: 0, sort_order: 10,
  stages: [
    { stage: 'data_analysis', label: 'Data analysis', ordinal: 30, is_terminal: 0 },
    { stage: 'writing', label: 'Writing', ordinal: 40, is_terminal: 0 },
  ],
}]
const prd = (id: string, project_id: string, extra: Partial<ProductRow> = {}): ProductRow => ({
  id, project_id, kind: 'manuscript', kind_label: 'Manuscript', stage: 'data_analysis', stage_label: 'Data analysis',
  stage_ordinal: 30, stage_is_terminal: 0, title: null, short_name: null, waiting_on: null, venue: null,
  due_date: null, deadline: null, folder: null, repo_url: null, stage_entered_at: null, stage_notes: null,
  sort_order: 0, is_home: 1, lineage_rank: 0, grew_from_id: null, seq: 1, created_at: '', updated_at: '', ...extra,
})
const PRODUCTS: Record<string, ProductRow[]> = {
  'id-alpha': [prd('prd_a', 'id-alpha')],
  'id-bravo': [prd('prd_b', 'id-bravo')],
  'id-charlie': [prd('prd_c1', 'id-charlie', { short_name: 'Paper' }), prd('prd_c2', 'id-charlie', { is_home: 0, short_name: 'Poster', stage: 'writing', stage_label: 'Writing' })],
}
const stageOf = (p: Project) => ({ key: p.home_stage || '', label: p.home_stage ? p.home_stage[0].toUpperCase() + p.home_stage.slice(1) : 'No stage' })

function Harness({ togglePin, onField, onSort, opts }: { togglePin: (s: string) => void; onField: (s: string, f: Record<string, string>) => void; onSort: (s: SleekSort) => void; opts: Opts }) {
  const [focused, setFocused] = useState(-1)
  return (
    <ProjectSleekList
      projects={opts.projects ?? projects}
      sort={opts.sort ?? null}
      onSort={onSort}
      focusedIndex={focused}
      setFocusedIndex={setFocused}
      keyboardEnabled
      healthBySlug={health}
      taskCountByProject={new Map([['alpha', 3]])}
      linksByProjectId={opts.links ?? {}}
      pinnedSlugs={new Set(['alpha'])}
      togglePin={togglePin}
      categoryOptions={[{ value: 'MNCCORE', label: 'MN-CCORE' }, { value: 'CLIF', label: 'CLIF' }]}
      onFieldChange={onField}
      productsByProject={PRODUCTS}
      kinds={KINDS}
      stageOf={stageOf}
    />
  )
}

async function render(width = 1100, opts: Opts = {}) {
  const n = (opts.projects ?? projects).length
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  const fns = { togglePin: vi.fn(), onField: vi.fn(), onSort: vi.fn() }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/list']}>
        <div style={{ width }}>
          <Routes>
            <Route path="/list" element={<Harness {...fns} opts={opts} />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('.sr-row').length === n, label: 'ProjectSleekList' },
  )
  const row = (slug: string) => host.querySelector(`.sr-row[data-project-slug="${slug}"]`)!
  const where = () => host.querySelector('[data-testid="where"]')?.textContent ?? null
  return { host, row, where, ...fns }
}

describe('Projects list on sleek rows', () => {
  it('isPoorHealth is the one threshold (below 50)', () => {
    expect(isPoorHealth({ score: 49, status: 'At Risk' })).toBe(true)
    expect(isPoorHealth({ score: 50, status: 'At Risk' })).toBe(false)
    expect(isPoorHealth(undefined)).toBe(false)
  })

  it('projectRowName (the Title sort key) is the text the row shows', () => {
    expect(projectRowName({ title: 'CQODE Backbone / UMN CLIF', short_name: 'CQODE-CLIF ETL' })).toBe('CQODE-CLIF ETL')
    expect(projectRowName({ title: 'CLIF: Zeta study', short_name: null })).toBe('Zeta study')
  })

  it('leads with the short name, hides Active, keeps Waiting, shows the PI face and a poor health bar only', async () => {
    const { row } = await render()
    expect(row('alpha').querySelector('.pj-name')!.textContent).toBe('ALPHA')
    expect(row('alpha').querySelector('.pj-name')!.getAttribute('data-tip')).toBe('Full title of alpha')
    // No short name: the cleaned title (consortium tag stripped) leads.
    expect(row('charlie').querySelector('.pj-name')!.textContent).toBe('Charlie the long title')
    const status = (slug: string) => row(slug).querySelector('[data-col="status"]')!
    expect(status('alpha').querySelector('.sr-m')).toBeNull()
    expect(status('bravo').textContent).toContain('Waiting (External)')
    expect(row('alpha').querySelector('[data-col="pi"] .tk-face')).not.toBeNull()
    expect(row('alpha').querySelector('.pj-health')).toBeNull()
    expect(row('bravo').querySelector('.pj-health')).not.toBeNull()
    // Stage is the products (Nick 2026-10-11): one product -> a small ladder, 2+ -> chips.
    expect(row('alpha').querySelector('[aria-label="Stage: Data analysis"] .psc-d.is-on')).not.toBeNull()
    expect(row('charlie').querySelector('.psc-chips')!.textContent).toContain('Paper')
    expect(row('charlie').querySelector('.psc-chips')!.textContent).toContain('+1')
    expect(row('charlie').querySelector('.psc-chips')!.getAttribute('data-tip')).toContain('Poster: Writing')
    expect(row('alpha').querySelector('[data-col="title"]')!.textContent).toContain('3')
  })

  it('j / k move the cursor ring, p pins, Esc clears, Enter opens the project', async () => {
    const { row, where, togglePin } = await render()
    key('j')
    await expect.poll(() => row('alpha').className).toContain('sr-cur')
    key('j')
    await expect.poll(() => row('bravo').className).toContain('sr-cur')
    key('p')
    expect(togglePin).toHaveBeenCalledWith('bravo')
    key('k')
    await expect.poll(() => row('alpha').className).toContain('sr-cur')
    key('Escape'); await tick()
    await expect.poll(() => row('alpha').className).not.toContain('sr-cur')
    key('j')
    await expect.poll(() => row('alpha').className).toContain('sr-cur')
    key('Enter')
    await expect.poll(() => where()).toBe(PATHS.project('alpha'))
  })

  it('a row click opens the project; the pin star and an inline editor keep their clicks', async () => {
    const { host, row, where, togglePin, onSort } = await render()
    click(row('bravo').querySelector('.pj-pin')!)
    expect(togglePin).toHaveBeenCalledWith('bravo')
    click(row('bravo').querySelector('[data-col="stage"] .sr-trig')!)
    await expect.poll(() => document.querySelector('[role="listbox"]')).not.toBeNull()
    await tick() // floor for the did-not-navigate check
    expect(where()).toBeNull()
    click(host.querySelector('[role="columnheader"] button')!)
    expect(onSort).toHaveBeenCalledWith({ key: 'title', dir: 'asc' })
    click(row('charlie').querySelector('[data-col="moved"]')!)
    await expect.poll(() => where()).toBe(PATHS.project('charlie'))
  })

  it('the phone layout keeps the face and drops the quiet Active status', async () => {
    const { row } = await render(390)
    expect(row('alpha').className).toContain('sr-ph')
    expect(row('alpha').querySelector('.sr-ph-trail .tk-face')).not.toBeNull()
    expect(row('alpha').querySelector('.sr-ph-l')!.textContent).not.toContain('Active')
    expect(row('bravo').querySelector('.sr-ph-l')!.textContent).toContain('Waiting')
  })

  it('every title carries its full-title tip, even with no short name', async () => {
    const { row } = await render()
    const name = row('charlie').querySelector('.pj-name')!
    expect(name.classList.contains('tip')).toBe(true)
    expect(name.getAttribute('data-tip')).toBe('Charlie the long title')
  })

  it('the phone layout keeps links, Work on, "Nd ago" and the Stage / Group / PI / Waiting editors', async () => {
    const old = new Date(Date.now() - 20 * 86400000).toISOString()
    const { row, where } = await render(390, {
      projects: [project('alpha', { primary_folder: 'C:/x/alpha', lastActivity: old }), project('bravo', { status: 'waiting_external' })],
      links: { 'id-alpha': [link('l1'), link('l2'), link('l3')] },
    })
    const line = row('alpha').querySelector('.sr-ph-l')!
    expect(line.querySelectorAll('.pj-lk').length).toBe(2)
    expect(line.querySelector('.pj-more')!.textContent).toBe('+1')
    expect(line.querySelector('[data-col="links"] .sr-wk')).not.toBeNull()
    expect(line.textContent).toContain('20d ago')
    for (const col of ['stage', 'category']) expect(line.querySelector(`[data-col="${col}"] .sr-trig`)).not.toBeNull()
    expect(row('alpha').querySelector('.sr-ph-trail .sr-trig .tk-face')).not.toBeNull()
    expect(row('bravo').querySelector('[data-col="status"] .sr-trig')).not.toBeNull()
    click(row('alpha').querySelector('[data-col="stage"] .sr-trig')!)
    await expect.poll(() => document.querySelector('[role="listbox"]')).not.toBeNull()
    await tick() // floor for the did-not-navigate check
    expect(where()).toBeNull()
  })

  it('column widths follow the rows: narrow Status when nobody waits, no Links column with no links or folders', async () => {
    const { host } = await render(1100, { projects: [project('alpha'), project('delta', { status: 'blocked' })] })
    const cols = (host.querySelector('.sr') as HTMLElement).style.getPropertyValue('--sr-cols')
    expect(cols.split(' ')).toContain('76px')
    expect(cols).not.toContain('124px')
    expect(host.querySelector('[data-col="links"]')).toBeNull()
  })

  it('no Status column when every visible row is Active; screen readers still hear Active', async () => {
    const { host, row } = await render(1100, { projects: [project('alpha'), project('golf')] })
    const heads = [...host.querySelectorAll('[role="columnheader"]')].map((e) => e.textContent)
    expect(heads).not.toContain('Status')
    expect(host.querySelector('[data-col="status"]')).toBeNull()
    expect(row('alpha').querySelector('[data-col="title"] .sr-only')!.textContent).toBe('Active')
  })

  it('stage group headers come from the page\'s stageOf (one header per run)', async () => {
    const { host } = await render(1100, { projects: [project('alpha', { home_stage: 'idea' }), project('echo', { home_stage: '' })], sort: { key: 'stage', dir: 'asc' } })
    const heads = [...host.querySelectorAll('.pj-stage-h > span:first-child')].map((e) => e.textContent)
    expect(heads).toEqual(['Idea', 'No stage'])
  })
})
