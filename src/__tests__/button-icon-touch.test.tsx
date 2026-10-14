// Icon buttons in a row: each owns its own tap zone, on touch and off.
//
// The md/lg Button once carried .hit-area, an invisible ::before that grows a
// small control to 44px by overhanging its neighbours. In the KeyLinksEditor
// row (Edit and Remove, 6px apart, padding 0) Remove's overhang covered Edit,
// so a tap on the pencil deleted the pinned link. Button size="icon" gives the
// button a real box instead (24x24, 44x44 on touch), so two of them side by
// side cannot overlap.
//
// Runs in real Chromium with the touch-target CSS injected; the touch media
// query is unwrapped to `@media all` so the runner sees the phone rules.

import { describe, it, expect } from 'vitest'
import { Button } from '../components/ui/Button'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const start = css.indexOf('/* Button size="icon" outside touch')
const end = css.indexOf('@media (hover: none) and (pointer: coarse) and (min-width: 769px) {\n  input')
const base = css.slice(start, css.indexOf('/* Touch targets.'))
const touch = css.slice(start, end).replace(
  '@media (max-width: 768px), (hover: none) and (pointer: coarse) and (min-width: 769px)',
  '@media all',
)

function setCss(text: string) {
  const el = document.getElementById('btn-icon-css') ?? document.createElement('style')
  el.id = 'btn-icon-css'
  el.textContent = '*,::before,::after{box-sizing:border-box}\n' + text
  document.head.appendChild(el)
}

function Row() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Button variant="ghost" size="icon" aria-label="Edit link" onClick={() => {}}>
        <svg width="11" height="11" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Remove link" onClick={() => {}}>
        <svg width="12" height="12" />
      </Button>
    </span>
  )
}

function centreHit(btn: Element): Element | null {
  const r = btn.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return hit?.closest('button') ?? null
}

describe('Button size="icon"', () => {
  for (const [label, text, px] of [['touch', touch, 44], ['mouse', base, 24]] as const) {
    it(`gives each icon button its own ${px}px box on ${label}`, async () => {
      expect(start).toBeGreaterThan(-1)
      setCss(text)
      const host = await mount(<Row />, {
        ready: (h) => h.querySelector('button[aria-label="Remove link"]'),
        label: 'icon row',
        width: '366px',
      })
      const edit = host.querySelector('button[aria-label="Edit link"]')!
      const remove = host.querySelector('button[aria-label="Remove link"]')!
      const a = edit.getBoundingClientRect()
      const b = remove.getBoundingClientRect()
      expect(a.width).toBeGreaterThanOrEqual(px)
      expect(a.height).toBeGreaterThanOrEqual(px)
      expect(b.width).toBeGreaterThanOrEqual(px)
      expect(a.right).toBeLessThanOrEqual(b.left)
      // No overhang: the point at Edit's centre and at its right edge hit Edit.
      expect(centreHit(edit)).toBe(edit)
      const rightEdge = document.elementFromPoint(a.right - 1, a.top + a.height / 2)?.closest('button')
      expect(rightEdge).toBe(edit)
      expect(edit.classList.contains('hit-area')).toBe(false)
    })
  }

  it('keeps the overhang off md buttons', async () => {
    setCss(touch)
    const host = await mount(<Button aria-label="Save">Save</Button>, {
      ready: (h) => h.querySelector('button'),
      label: 'md button',
    })
    const btn = host.querySelector('button')!
    expect(btn.classList.contains('touch-tall')).toBe(true)
    expect(btn.classList.contains('hit-area')).toBe(false)
  })
})
