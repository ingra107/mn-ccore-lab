// Color back, depth picks (Nick 2026-10-11, mock 2026-10-11-color-back.html):
//  1  every leaf card wears Today's card material (lit top, tone, soft shadow)
//  3  section heads by weight: bold head, dim count, a short gray fading line
//  6  a sleek row lifts on hover (material + faint teal rim), nothing moves
//  7  data bars run teal, dim to bright
// Each is ONE shared rule in index.css; these tests read the real stylesheet.
// Real Chromium (vitest.config.ts browser mode).

import { describe, it, expect, afterEach } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MemoryRouter } from 'react-router-dom'
import SectionHead from '../components/ui/SectionHead'
import { SleekTable, SleekRow, type SleekColumn } from '../components/table/SleekRows'
import { tealRamp } from '../lib/tealRamp'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { document.documentElement.classList.remove('dark') })

// The whole stylesheet minus the Tailwind import (the browser cannot resolve it).
const style = document.createElement('style')
style.textContent = css.replace('@import "tailwindcss";', '')
document.head.appendChild(style)

const cs = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo)

describe('pick 1: one card material', () => {
  async function cards() {
    const host = await mount(
      <div>
        <div className="tk"><div className="tk-card" data-k="today">a</div></div>
        <div className="card" data-k="card">b</div>
        <div className="detail-card" data-k="detail">c</div>
        <div className="sk-mat" data-k="mat">d</div>
      </div>,
      { ready: (h) => h.querySelector('[data-k="mat"]'), label: 'cards' },
    )
    return ['today', 'card', 'detail', 'mat'].map((k) => host.querySelector(`[data-k="${k}"]`)!)
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`Today cards and every other leaf card share one material (${theme})`, async () => {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      const els = await cards()
      const bg = els.map((e) => cs(e).backgroundImage)
      const sh = els.map((e) => cs(e).boxShadow)
      expect(bg[0]).toMatch(/^linear-gradient/)
      expect(new Set(bg).size).toBe(1)
      expect(new Set(sh).size).toBe(1)
      // a lit top edge (inset 1px) over a soft ambient shadow
      expect(sh[0]).toMatch(/inset/)
      for (const e of els) expect(cs(e).borderTopWidth).toBe('1px')
    })
  }
})

describe('pick 3: section heads by weight', () => {
  it('bold head, dim count, a short gray fade; controls sit right of the fade', async () => {
    const host = await mount(
      <div style={{ width: 600 }}>
        <SectionHead title="Decisions" count="4" right={<a href="#x">View all</a>} />
      </div>,
      { ready: (h) => h.querySelector('.sk-hd'), label: 'head' },
    )
    const hd = host.querySelector('.sk-hd')!
    const t = hd.querySelector('.sk-hd-t')!
    expect(t.tagName).toBe('H2')
    expect(t.textContent).toBe('Decisions')
    expect(cs(t).fontWeight).toBe('600')
    expect(hd.querySelector('.sk-hd-c')!.textContent).toBe('4')
    expect(cs(hd.querySelector('.sk-hd-c')!).fontWeight).toBe('400')

    const fade = cs(hd, '::after')
    expect(fade.content).toBe('""')
    expect(fade.height).toBe('1px')
    // clamp(32px, 12vw, 120px): short on a phone, 120px on a desktop
    const want = Math.min(120, Math.max(32, window.innerWidth * 0.12))
    expect(parseFloat(fade.width)).toBeCloseTo(want, 1)
    expect(fade.backgroundImage).toMatch(/linear-gradient.*rgba\(0, 0, 0, 0\)|transparent/)
    // the right slot is ordered after the fade, pinned right
    expect(Number(cs(hd.querySelector('.sk-hd-r')!).order)).toBeGreaterThan(Number(fade.order))
    const right = hd.querySelector('.sk-hd-r')!.getBoundingClientRect()
    const count = hd.querySelector('.sk-hd-c')!.getBoundingClientRect()
    expect(right.left).toBeGreaterThan(count.right + want)
  })

  it('no count, no right slot: renders only the head and the fade', async () => {
    const host = await mount(<SectionHead title="Agenda" as="h3" />, { ready: (h) => h.querySelector('.sk-hd'), label: 'bare head' })
    const hd = host.querySelector('.sk-hd')!
    expect(hd.querySelector('h3')!.textContent).toBe('Agenda')
    expect(hd.querySelector('.sk-hd-c')).toBeNull()
    expect(hd.querySelector('.sk-hd-r')).toBeNull()
  })

  it("Today's collapsible heads draw the same fade", async () => {
    const host = await mount(
      <div className="tk"><div className="tk-ph"><div className="tk-ctog"><h3>Projects</h3><span className="tk-cnt">3</span></div></div></div>,
      { ready: (h) => h.querySelector('.tk-ctog'), label: 'today head' },
    )
    const sk = await mount(<SectionHead title="X" />, { ready: (h) => h.querySelector('.sk-hd'), label: 'ref head' })
    const a = cs(host.querySelector('.tk-ctog')!, '::after')
    const b = cs(sk.querySelector('.sk-hd')!, '::after')
    expect(a.width).toBe(b.width)
    expect(a.backgroundImage).toBe(b.backgroundImage)
  })
})

describe('pick 6: rows lift on hover', () => {
  type Row = { id: string; name: string }
  const cols: SleekColumn<Row>[] = [
    { key: 'name', label: 'Name', width: 'minmax(0,1fr)', phone: 'title', render: (r) => <span>{r.name}</span> },
  ]
  async function table(urg = false) {
    const rows: Row[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }]
    return mount(
      <MemoryRouter>
        <SleekTable columns={cols} sort={null} onSort={() => {}}>
          {rows.map((r) => (
            <SleekRow key={r.id} row={r} urgent={urg && r.id === 'a'} onClick={() => {}} />
          ))}
        </SleekTable>
      </MemoryRouter>,
      { ready: (h) => h.querySelectorAll('.sr-row').length === 2, label: 'sleek rows', width: '900px' },
    )
  }

  // The vitest iframe never puts the row in :hover (userEvent.hover lands, the
  // pseudo-class does not), so copy the stylesheet's own :hover row rules onto
  // a .cb-hov class: the declarations under test are the shipped ones. The
  // real pointer hover is checked in the app with Playwright.
  const hov = document.createElement('style')
  for (const sheet of Array.from(document.styleSheets)) {
    for (const r of Array.from(sheet.cssRules)) {
      if (r instanceof CSSStyleRule && r.selectorText.includes('.sr-row') && r.selectorText.includes(':hover:not(.sr-sel)')) {
        hov.textContent += r.cssText.replace(/:hover/g, '.cb-hov') + '\n'
      }
    }
  }
  document.head.appendChild(hov)
  const hover = async (el: HTMLElement) => {
    await userEvent.hover(el)
    el.classList.add('cb-hov')
    await new Promise((r) => setTimeout(r, 200))
  }

  it('the stylesheet carries the lift for plain and urgent rows', () => {
    expect(hov.textContent!.match(/cb-hov/g)!.length).toBe(2)
  })

  it('the hovered row takes the card material and a teal rim; the others stay flat; nothing moves', async () => {
    const host = await table()
    const [a, b] = Array.from(host.querySelectorAll<HTMLElement>('.sr-row'))
    const before = a.getBoundingClientRect()
    expect(cs(a).backgroundImage).toBe('none')
    await hover(a)
    expect(cs(a).backgroundImage).toMatch(/^linear-gradient/)
    expect(cs(a).boxShadow).toMatch(/inset/)
    expect(cs(b).backgroundImage).toBe('none')
    const after = a.getBoundingClientRect()
    expect(after.top).toBe(before.top)
    expect(after.left).toBe(before.left)
    expect(cs(a).transform).toBe('none')
  })

  it('an urgent row keeps its orange edge while lifted', async () => {
    const host = await table(true)
    const a = host.querySelector<HTMLElement>('.sr-row.sr-urg')!
    await hover(a)
    // the orange edge AND the lift's rim layers
    expect(cs(a).boxShadow).toMatch(/2px 0px 0px 0px inset/)
    expect(cs(a).boxShadow.match(/inset/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('reduced motion: the lift is instant (the stylesheet drops the row transition)', () => {
    const rules: CSSMediaRule[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSMediaRule) rules.push(r)
    }
    const hit = rules
      .filter((m) => m.conditionText.includes('prefers-reduced-motion'))
      .flatMap((m) => Array.from(m.cssRules) as CSSStyleRule[])
      .find((r) => r.selectorText === '.sr .sr-row')
    expect(hit?.style.transition).toBe('none')
  })
})

describe('pick 7: teal data ramp', () => {
  // WCAG contrast from computed rgb() strings
  // Chromium reports a color-mix() result as color(srgb r g b) in 0..1, a plain color as rgb()
  const rgb = (s: string) => {
    const n = (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    return s.startsWith('color(srgb') ? n.map((v) => Math.round(v * 255)) : n
  }
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (x: number[], y: number[]) => {
    const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p)
    return (a + 0.05) / (b + 0.05)
  }

  for (const theme of ['light', 'dark'] as const) {
    it(`dim end to full accent, and the dim end holds 3:1 on the card (${theme})`, async () => {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      const host = await mount(
        <div>
          <i data-k="card" style={{ background: 'var(--sk-card)' }} />
          {[0, 0.5, 1].map((t) => <i key={t} data-t={t} style={{ background: tealRamp(t) }} />)}
          <i data-k="ac" style={{ background: 'var(--sk-ac)' }} />
        </div>,
        { ready: (h) => h.querySelector('[data-k="ac"]'), label: 'ramp' },
      )
      const col = (sel: string) => rgb(cs(host.querySelector(sel)!).backgroundColor)
      const card = col('[data-k="card"]')
      const dim = col('[data-t="0"]'), mid = col('[data-t="0.5"]'), full = col('[data-t="1"]')
      expect(full).toEqual(col('[data-k="ac"]'))
      // brightness carries the order: each step sits further from the card
      expect(contrast(dim, card)).toBeGreaterThanOrEqual(3)
      expect(contrast(mid, card)).toBeGreaterThan(contrast(dim, card))
      expect(contrast(full, card)).toBeGreaterThan(contrast(mid, card))
    })
  }
})
