// Icon buttons: the size floor and the touch tap zone, against the REAL cascade.
//
// This file imports src/index.css whole (Tailwind layers included, via the
// tailwindcss plugin in vitest.config.ts), so it sees what the page sees: an
// unlayered floor rule beats every Tailwind utility and every layered rule, which
// a hand-sliced copy of the CSS cannot show (O2D cold review, 2026-10-14).
//
// Rules under test (Button size="icon", class .btn-icon):
//  - A bare icon button (no variant) never changes its visual box: a 24px hit area
//    (a ::before, the .hit-area pattern, zero specificity in @layer base) carries
//    the target, 44px on touch. Any site class or utility that sizes it wins, so
//    migrating a raw <button> moves no pixel and dense in-chip controls keep
//    their layout.
//  - An icon Button with a variant (or .btn-icon-box) is a real 24x24 box, 44x44
//    on touch, so a row of adjacent ones cannot overlap.
//  - `disabled` reaches the DOM for as={motion.button}.

import { describe, it, expect } from 'vitest'
import { page } from 'vitest/browser'
import { motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import '../index.css'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

function setCss(text: string) {
  const el = document.getElementById('btn-icon-css') ?? document.createElement('style')
  el.id = 'btn-icon-css'
  el.textContent = text
  document.head.appendChild(el)
}

const size = (btn: Element) => {
  const r = btn.getBoundingClientRect()
  return [Math.round(r.width), Math.round(r.height)]
}
const one = async (node: React.ReactElement) => {
  const host = await mount(node, { ready: (h) => h.querySelector('button'), label: 'icon button' })
  return host.querySelector('button')!
}
const hitsButton = (btn: Element, dx: number, dy = 0) => {
  const r = btn.getBoundingClientRect()
  return document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy)?.closest('button') === btn
}

describe('Button size="icon" on a mouse desktop', () => {
  it('keeps a bare icon button at its own size and carries a 24px hit area', async () => {
    await page.viewport(1280, 800)
    setCss('')
    const btn = await one(<Button size="icon" aria-label="Hide"><svg width="10" height="10" /></Button>)
    expect(size(btn)).toEqual([10, 10])
    expect(hitsButton(btn, 5 + 6)).toBe(true)
    expect(hitsButton(btn, 5 + 10)).toBe(false)
  })

  it('gives an icon Button with a variant a real 24px box', async () => {
    await page.viewport(1280, 800)
    setCss('')
    const btn = await one(<Button variant="ghost" size="icon" aria-label="Edit"><svg width="10" height="10" /></Button>)
    expect(size(btn)).toEqual([24, 24])
  })

  it('lets a site class size the button below the floor (the migrated raw button is unchanged)', async () => {
    await page.viewport(1280, 800)
    setCss('.t-sized { width: 14px; height: 14px; padding: 0; }')
    const btn = await one(<Button size="icon" aria-label="Select" className="t-sized"><svg width="8" height="8" /></Button>)
    expect(size(btn)).toEqual([14, 14])
  })

  it('lets a Tailwind utility size it larger (min-w-[44px] is not overridden)', async () => {
    await page.viewport(1280, 800)
    setCss('@layer utilities { .t-min44 { min-width: 44px; min-height: 44px; } }')
    const btn = await one(<Button size="icon" aria-label="Menu" className="t-min44"><svg width="16" height="16" /></Button>)
    expect(size(btn)).toEqual([44, 44])
  })

  it('lets the caller class style a bare icon button', async () => {
    await page.viewport(1280, 800)
    setCss('.t-skin { color: rgb(255, 0, 0); background: rgb(0, 0, 255); padding: 1px; }')
    const btn = await one(<Button size="icon" aria-label="Hide" className="t-skin"><svg width="10" height="10" /></Button>)
    const cs = getComputedStyle(btn)
    expect(btn.getAttribute('style')).toBeNull()
    expect(cs.color).toBe('rgb(255, 0, 0)')
    expect(cs.backgroundColor).toBe('rgb(0, 0, 255)')
    expect(cs.display).toBe('inline-flex')
  })
})

describe('Button size="icon" on a phone', () => {
  it('keeps the visual box and carries the tap in a 44px hit area', async () => {
    await page.viewport(390, 844)
    setCss('')
    const btn = await one(<Button size="icon" aria-label="Hide"><svg width="10" height="10" /></Button>)
    expect(size(btn)).toEqual([10, 10])
    // 10px box + 17px each side = 44px zone.
    expect(hitsButton(btn, 5 + 15)).toBe(true)
    expect(hitsButton(btn, 5 + 15, 15)).toBe(true)
    expect(hitsButton(btn, 5 + 19)).toBe(false)
  })

  it('does not grow a site-sized dense control', async () => {
    await page.viewport(390, 844)
    setCss('.t-sized { width: 14px; height: 14px; padding: 0; }')
    const btn = await one(<Button size="icon" aria-label="Select" className="t-sized"><svg width="8" height="8" /></Button>)
    expect(size(btn)).toEqual([14, 14])
    expect(hitsButton(btn, 7 + 14)).toBe(true)
  })

  it('lets a site that draws its own ::before keep it', async () => {
    await page.viewport(390, 844)
    setCss('.t-own { width: 20px; height: 20px; position: relative; } .t-own::before { content: ""; position: absolute; inset: -2px; }')
    const btn = await one(<Button size="icon" aria-label="Own" className="t-own"><svg width="8" height="8" /></Button>)
    expect(size(btn)).toEqual([20, 20])
    expect(hitsButton(btn, 10 + 1)).toBe(true)
    expect(hitsButton(btn, 10 + 8)).toBe(false)
  })

  it('gives .btn-icon-box a real 44px box, so a row of two cannot overlap', async () => {
    await page.viewport(390, 844)
    setCss('')
    const host = await mount(
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button variant="ghost" size="icon" aria-label="Edit link" className="btn-icon-box"><svg width="11" height="11" /></Button>
        <Button variant="ghost" size="icon" aria-label="Remove link" className="btn-icon-box"><svg width="12" height="12" /></Button>
      </span>,
      { ready: (h) => h.querySelector('button[aria-label="Remove link"]'), label: 'icon row', width: '366px' },
    )
    const edit = host.querySelector('button[aria-label="Edit link"]')!
    const remove = host.querySelector('button[aria-label="Remove link"]')!
    expect(size(edit)).toEqual([44, 44])
    expect(edit.getBoundingClientRect().right).toBeLessThanOrEqual(remove.getBoundingClientRect().left)
    expect(hitsButton(edit, 21)).toBe(true)
  })

  it("leaves a tk-* icon button at its own size (Today's slots do not move)", async () => {
    await page.viewport(390, 844)
    setCss('')
    const btn = await one(<Button size="icon" aria-label="Remove from plan" className="tk-x">x</Button>)
    expect(size(btn)[0]).toBeLessThan(44)
  })
})

describe('Button', () => {
  it('keeps the overhang off md buttons', async () => {
    await page.viewport(390, 844)
    const btn = await one(<Button aria-label="Save">Save</Button>)
    expect(btn.classList.contains('touch-tall')).toBe(true)
    expect(btn.classList.contains('hit-area')).toBe(false)
  })

  it('forwards disabled to a motion.button', async () => {
    const btn = await one(<Button as={motion.button} size="icon" aria-label="Go" disabled><svg width="10" height="10" /></Button>)
    expect(btn.hasAttribute('disabled')).toBe(true)
  })
})
