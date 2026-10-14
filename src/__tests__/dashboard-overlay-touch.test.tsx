// Overview cards: a hidden pin or drag handle never takes a tap (G8-01).
//
// The first fix hid the pin with `@media (hover: none) { .dashboard-pin-btn
// { display: none } }`, and it lost: index.css's phone tap-target rule
// `button[title="Pin to top"] { display: inline-flex; min-width: 44px }`
// is (0,1,1) against (0,1,0), so on a phone the opacity-0 pin kept a 44px hit
// area over Project Health's Heatmap tab and a tap pinned the card.
//
// The class fix: an overlay that is not shown takes no pointer events at all,
// whatever display or size another rule gives it. This runs the real CSS text
// (index.css with its touch and <=768px queries unwrapped, the Dashboard pin
// block, dashboard-grid.css) in real Chromium, with the hover:none hide rule
// STRIPPED, so it proves the pointer-events construction on its own.

import { describe, it, expect, afterEach } from 'vitest'
import css from '../index.css?raw'
import gridCss from '../styles/dashboard-grid.css?raw'
import dashSrc from '../pages/Dashboard.tsx?raw'

const unwrap = (s: string) => s
  .replace(/@media \(hover: ?none\)/g, '@media all')
  .replace(/@media \(max-width: ?768px\)/g, '@media all')
const pinCss = dashSrc
  .slice(dashSrc.indexOf('/* Pin button (overlay'), dashSrc.indexOf('/* "Reset layout"'))
  .replace(/\$\{[^}]*\}/g, 'transparent')
  .replace(/@media \(hover: none\) \{[\s\S]*?\}\s*\}/, '') // strip the hide rule: test the construction alone

let styleEl: HTMLStyleElement | null = null
let fixture: HTMLElement | null = null
afterEach(() => { styleEl?.remove(); styleEl = null; fixture?.remove(); fixture = null })

describe('Overview card overlays on touch', () => {
  it('index.css no longer sizes the dashboard overlays by title', () => {
    expect(css).not.toMatch(/button\[title="Pin to top"\]/)
    expect(css).not.toMatch(/button\[title="Drag to reorder"\]/)
  })

  function setup(strip = false) {
    const cut = (s: string) => (strip ? s.replace(/pointer-events: none;/g, '') : s)
    styleEl = document.createElement('style')
    styleEl.textContent = '*,::before,::after{box-sizing:border-box}\n' + unwrap(css) + '\n' + cut(gridCss) + '\n' + cut(pinCss)
    document.head.appendChild(styleEl)
    fixture = document.createElement('div')
    fixture.className = 'dashboard-grid-item'
    fixture.style.cssText = 'position:fixed;left:50px;top:50px;width:300px;height:200px'
    fixture.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:8px">
        <button id="left" style="width:40px;height:30px">Map</button>
        <button id="right" style="width:40px;height:30px">Heatmap</button>
      </div>
      <button class="rgl-drag-handle" title="Drag to reorder" aria-label="Drag to reorder">d</button>
      <button class="dashboard-pin-btn dashboard-pin-btn--inactive" title="Pin to top" aria-label="Pin card">p</button>`
    document.body.appendChild(fixture)
    const at = (id: string) => {
      const r = fixture!.querySelector(`#${id}`)!.getBoundingClientRect()
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    }
    return at
  }

  it('control: without pointer-events:none the hidden overlays eat both taps', () => {
    const at = setup(true)
    expect(at('right')?.className).toContain('dashboard-pin-btn')
    expect(at('left')?.className).toContain('rgl-drag-handle')
  })

  it('a tab under the unrevealed pin and drag handle gets the tap', () => {
    const at = setup()
    expect(at('right')?.id).toBe('right')
    expect(at('left')?.id).toBe('left')
  })
})
