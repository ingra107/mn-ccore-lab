// Link icons keep their colors, dimmer (color back pick 9, Nick 2026-10-11).
// Real Chromium: the glyph paints the dimmed brand, a hovered link lifts it to
// the full brand through the one :where(a, button):hover rule in index.css,
// and a typed chip's label stays neutral (a Gmail label is never overdue red).

import { describe, it, expect } from 'vitest'
import LinkChip from '../components/LinkChip'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

// Every token block from the first :root through the gray ramp: --slate,
// --link-*, --link-strength + the hover rule, --sk-t3.
const start = css.indexOf(':root {')
const end = css.indexOf('/* ── Z-Index Hierarchy')
const style = document.createElement('style')
style.textContent = css.slice(start, end)
document.head.appendChild(style)

// Computed colors serialize as rgb() or, after color-mix, color(srgb ...).
// Normalize both to 0-255 integer triples so equal colors compare equal.
function rgb(c: string): string {
  const nums = (c.match(/[0-9.]+/g) ?? []).map(Number)
  const triple = c.startsWith('color(') ? nums.slice(0, 3).map((n) => Math.round(n * 255)) : nums.slice(0, 3)
  return triple.join(',')
}

// Resolve a CSS color expression to a normalized triple.
function resolve(expr: string, within: HTMLElement): string {
  const probe = document.createElement('span')
  probe.style.color = expr
  within.appendChild(probe)
  const c = getComputedStyle(probe).color
  probe.remove()
  return rgb(c)
}

const colorOf = (el: Element) => rgb(getComputedStyle(el).color)

const chip = () => (
  <div id="wrap"><LinkChip url="https://mail.google.com/mail/u/1/#inbox/abc" type="gmail_thread" label="Thread with Casey" /></div>
)

describe('link glyphs: same colors, dimmer', () => {
  it('slices the token CSS, including the hover rule', () => {
    expect(start).toBeGreaterThan(-1)
    expect(style.textContent).toContain(':where(a, button):hover { --lk-on: 100%; }')
  })

  it('a typed chip: dimmed brand glyph, neutral label', async () => {
    const host = await mount(chip(), { ready: (h) => h.querySelector('a svg'), label: 'chip' })
    const a = host.querySelector<HTMLElement>('a')!
    const svg = a.querySelector<SVGElement>('svg')!
    const label = a.querySelector<HTMLElement>('span')!
    const brand = resolve('var(--link-gmail-thread)', host)
    expect(brand).toBe('234,67,53')
    expect(colorOf(svg)).not.toBe(brand)
    expect(colorOf(svg)).toBe(resolve('color-mix(in srgb, var(--link-gmail-thread) var(--link-strength), var(--sk-t3))', host))
    expect(colorOf(label)).toBe(resolve('var(--slate)', host))
    expect(colorOf(label)).not.toBe(brand)
  })

  it('hover (the --lk-on the hover rule sets) lifts the glyph to the full brand', async () => {
    const host = await mount(chip(), { ready: (h) => h.querySelector('a svg'), label: 'chip hover' })
    const a = host.querySelector<HTMLElement>('a')!
    const svg = a.querySelector<SVGElement>('svg')!
    const dim = colorOf(svg)
    a.style.setProperty('--lk-on', '100%')
    expect(colorOf(svg)).toBe(resolve('var(--link-gmail-thread)', host))
    expect(colorOf(svg)).not.toBe(dim)
  })
})
