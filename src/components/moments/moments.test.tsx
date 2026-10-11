// Color-back picks 2, 4 and 10 as shared primitives: the hero number is a link
// only when it has somewhere real to go, every PageHeader carries the heartbeat
// line (and the hero beside its title), and the now marker is one object.
import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import HeroNumber from './HeroNumber'
import { NowMarker, NowMarkerSvg } from './NowMarker'
import PageHeader from '../PageHeader'

let mounted: { host: HTMLElement; root: Root }[] = []
const tick = () => new Promise((r) => setTimeout(r, 20))

async function mount(ui: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(<MemoryRouter>{ui}</MemoryRouter>)
  mounted.push({ host, root })
  await tick()
  return host
}

afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
})

describe('HeroNumber', () => {
  it('is plainly static without a destination', async () => {
    const h = await mount(<HeroNumber value={90} label="projects" />)
    const hero = h.querySelector('[data-testid="hero-number"]')!
    expect(hero.tagName).toBe('SPAN')
    expect(h.querySelector('a')).toBeNull()
    expect(hero.textContent).toBe('90projects')
  })

  it('is a real link when it has one', async () => {
    const h = await mount(<HeroNumber value={697} label="published" to="/publications?status=Published" dest="Publications" />)
    const a = h.querySelector('a[data-testid="hero-number"]') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('/publications?status=Published')
    expect(a.getAttribute('aria-label')).toBe('697 published: open Publications')
  })
})

describe('PageHeader', () => {
  it('draws the heartbeat line as its rule and the hero beside the title', async () => {
    const h = await mount(<PageHeader title="Research Digest" hero={{ value: 41, label: 'new' }} />)
    expect(h.querySelector('[data-testid="page-heartbeat"]')).not.toBeNull()
    const hero = h.querySelector('[data-testid="hero-number"]')!
    expect(hero.previousElementSibling?.tagName).toBe('H1')
  })

  it('keeps the heartbeat with no hero', async () => {
    const h = await mount(<PageHeader title="Calendar" />)
    expect(h.querySelector('[data-testid="page-heartbeat"]')).not.toBeNull()
    expect(h.querySelector('[data-testid="hero-number"]')).toBeNull()
  })
})

describe('NowMarker', () => {
  it('draws dot, hairline and label in the accent', async () => {
    const h = await mount(<NowMarker />)
    const m = h.querySelector('[data-testid="now-marker"]')!
    expect(m.querySelector('.now-mk-dot')).not.toBeNull()
    expect(m.querySelector('.now-mk-line')).not.toBeNull()
    expect(m.querySelector('.now-mk-lbl')?.textContent).toBe('Today')
    expect(m.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the same object vertically in an SVG chart', async () => {
    const h = await mount(<svg><NowMarkerSvg x={100} y1={10} y2={200} /></svg>)
    const g = h.querySelector('g[data-testid="now-marker"]')!
    expect(g.querySelectorAll('circle')).toHaveLength(2)
    expect(g.querySelector('text')?.textContent).toBe('Today')
  })
})
