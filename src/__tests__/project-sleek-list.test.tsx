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
import { isPoorHealth, type ProjectHealth } from '../lib/projectListOptions'
import type { SleekSort } from '../components/table/SleekRows'
import type { Project } from '../data/types'
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
  stage: 'analysis', pi: 'nick-ingraham', category: 'MNCCORE', type: null, lastActivity: null, primary_folder: null,
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

function Harness({ togglePin, onField, onSort }: { togglePin: (s: string) => void; onField: (s: string, f: Record<string, string>) => void; onSort: (s: SleekSort) => void }) {
  const [focused, setFocused] = useState(-1)
  return (
    <ProjectSleekList
      projects={projects}
      sort={null}
      onSort={onSort}
      focusedIndex={focused}
      setFocusedIndex={setFocused}
      keyboardEnabled
      healthBySlug={health}
      taskCountByProject={new Map([['alpha', 3]])}
      linksByProjectId={{}}
      pinnedSlugs={new Set(['alpha'])}
      togglePin={togglePin}
      stageOptions={[{ value: 'analysis', label: 'Analysis' }, { value: 'writing', label: 'Writing' }]}
      categoryOptions={[{ value: 'MNCCORE', label: 'MN-CCORE' }, { value: 'CLIF', label: 'CLIF' }]}
      onFieldChange={onField}
      onStageChange={() => {}}
    />
  )
}

async function render(width = 1100) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
  const fns = { togglePin: vi.fn(), onField: vi.fn(), onSort: vi.fn() }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const host = await mount(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/list']}>
        <div style={{ width }}>
          <Routes>
            <Route path="/list" element={<Harness {...fns} />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
    { ready: (h) => h.querySelectorAll('.sr-row').length === 3, label: 'ProjectSleekList' },
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
    expect(row('alpha').querySelector('[aria-label^="Stage:"]')).toBeNull()
    expect(row('alpha').querySelector('[data-col="title"]')!.textContent).toContain('3')
  })

  it('j / k move the cursor ring, p pins, Esc clears, Enter opens the project', async () => {
    const { row, where, togglePin } = await render()
    key('j'); await tick()
    expect(row('alpha').className).toContain('sr-cur')
    key('j'); await tick()
    expect(row('bravo').className).toContain('sr-cur')
    key('p')
    expect(togglePin).toHaveBeenCalledWith('bravo')
    key('k'); await tick()
    expect(row('alpha').className).toContain('sr-cur')
    key('Escape'); await tick()
    expect(row('alpha').className).not.toContain('sr-cur')
    key('j'); await tick()
    key('Enter'); await tick()
    expect(where()).toBe(PATHS.project('alpha'))
  })

  it('a row click opens the project; the pin star and an inline editor keep their clicks', async () => {
    const { host, row, where, togglePin, onSort } = await render()
    click(row('bravo').querySelector('.pj-pin')!)
    expect(togglePin).toHaveBeenCalledWith('bravo')
    click(row('bravo').querySelector('[data-col="stage"] .sr-trig')!); await tick()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    expect(where()).toBeNull()
    click(host.querySelector('[role="columnheader"] button')!)
    expect(onSort).toHaveBeenCalledWith({ key: 'title', dir: 'asc' })
    click(row('charlie').querySelector('[data-col="moved"]')!); await tick()
    expect(where()).toBe(PATHS.project('charlie'))
  })

  it('the phone layout keeps the face and drops the quiet Active status', async () => {
    const { row } = await render(390)
    expect(row('alpha').className).toContain('sr-ph')
    expect(row('alpha').querySelector('.sr-ph-trail .tk-face')).not.toBeNull()
    expect(row('alpha').querySelector('.sr-ph-l')!.textContent).not.toContain('Active')
    expect(row('bravo').querySelector('.sr-ph-l')!.textContent).toContain('Waiting')
  })
})
