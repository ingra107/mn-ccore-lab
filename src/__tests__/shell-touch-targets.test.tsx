// Portal chrome on a phone (overnight 2026-10-14 mobile audit, lane H1).
//
// Runs in real Chromium against the real index.css text. The touch and narrow
// media queries are unwrapped to `@media all`, so the test sees the phone rules
// at any runner viewport.
//
//  1. G1-1: two flush 24px hit-area buttons (the Today card's folder + Work on
//     pair). On touch the later button's -13px ::before covered the earlier
//     button's centre, so a tap on the folder fired Work on. The control run
//     strips the sibling rule and must reproduce that bug, so the check can
//     see the failure it guards.
//  2. G1-6: the Join link is an <a>; it now gets the hit area too.
//  3. G1-3 / G5-1 / G8-02: the <=420px .portal-content rule keeps main's
//     bottom clearance for the tab bar.
//  4. G1-8 / G2-10: a touch tap never opens a hover tooltip; a mouse still does.

import { describe, it, expect, afterEach } from 'vitest'
import css from '../index.css?raw'
import { TooltipLayer } from '../components/TooltipLayer'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const HIT_START = '/* N1.08/N1.16'
const HIT_END = '/* Touch devices have no hover, so hover-revealed'
const hitCss = css.slice(css.indexOf(HIT_START), css.indexOf(HIT_END)).replace(/@media \(hover: none\)/g, '@media all')
const SIBLING_RULE = /\/\* A widened hit area never covers[\s\S]*$/

let styleEl: HTMLStyleElement | null = null
function inject(text: string) {
  styleEl?.remove()
  styleEl = document.createElement('style')
  styleEl.textContent = '*,::before,::after{box-sizing:border-box}\n' + text
  document.head.appendChild(styleEl)
}
let fixture: HTMLElement | null = null
afterEach(() => { styleEl?.remove(); styleEl = null; fixture?.remove(); fixture = null })

const BOX = 'display:inline-grid;width:24px;height:24px;padding:0;border:0;margin:0'
function renderPair(): { folder: HTMLElement; work: HTMLElement; prep: HTMLElement; join: HTMLElement } {
  fixture = document.createElement('div')
  fixture.className = 'tk'
  fixture.style.cssText = 'position:fixed;left:100px;top:100px'
  fixture.innerHTML = `
    <div style="display:flex">
      <button class="tk-wo" id="folder" style="${BOX}">F</button><button class="tk-wo" id="work" style="${BOX}">W</button>
    </div>
    <div style="display:flex;margin-top:40px">
      <button class="tk-pill" id="prep" style="padding:2px 6px;border:0;margin:0">Prep</button><a class="tk-join" id="join" href="#" style="padding:2px 6px">Join</a>
    </div>`
  document.body.appendChild(fixture)
  const q = (id: string) => fixture!.querySelector<HTMLElement>(`#${id}`)!
  return { folder: q('folder'), work: q('work'), prep: q('prep'), join: q('join') }
}
function centre(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
}
const hitAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('button,a')

describe('touch hit areas (index.css)', () => {
  it('control: without the sibling rule, a tap on the folder centre lands on Work on', () => {
    inject(hitCss.replace(SIBLING_RULE, ''))
    const { folder, work } = renderPair()
    expect(hitAt(...centre(folder))).toBe(work)
  })

  it('each of two flush buttons owns its centre and keeps its vertical bleed', () => {
    inject(hitCss)
    const { folder, work } = renderPair()
    const [fx, fy] = centre(folder)
    const [wx, wy] = centre(work)
    expect(hitAt(fx, fy)).toBe(folder)
    expect(hitAt(wx, wy)).toBe(work)
    // still a bigger-than-visual target: 10px above each button hits it
    expect(hitAt(fx, fy - 22)).toBe(folder)
    expect(hitAt(wx, wy - 22)).toBe(work)
    // the outer edges keep their bleed
    expect(hitAt(fx - 20, fy)).toBe(folder)
    expect(hitAt(wx + 20, wy)).toBe(work)
  })

  it('the Join link gets a hit area and does not cover Prep', () => {
    inject(hitCss)
    const { prep, join } = renderPair()
    expect(getComputedStyle(join, '::before').position).toBe('absolute')
    const [jx, jy] = centre(join)
    expect(hitAt(jx, jy - 18)).toBe(join)
    expect(hitAt(...centre(prep))).toBe(prep)
  })
})

describe('narrow portal padding (index.css, <=420px)', () => {
  it('keeps the tab-bar clearance at the bottom while tightening top and sides', () => {
    const block = css.match(/\.portal-content \{\s*padding-top: 12px !important;[^}]*\}/)
    expect(block).not.toBeNull()
    inject(block![0])
    fixture = document.createElement('main')
    fixture.className = 'portal-content'
    // stands in for PortalLayout's pb-[calc(var(--fab-stack-2)+56px)] class
    fixture.style.cssText = 'padding:16px;padding-bottom:184px'
    document.body.appendChild(fixture)
    const cs = getComputedStyle(fixture)
    expect(cs.paddingBottom).toBe('184px')
    expect(cs.paddingTop).toBe('12px')
    expect(cs.paddingLeft).toBe('12px')
  })
})

describe('TooltipLayer', () => {
  function over(el: Element, pointerType: string) {
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType, clientX: r.left + 2, clientY: r.top + 2 }))
    // the compatibility mouse event a tap also fires
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2 }))
  }
  const tooltip = () => document.querySelector('[role="tooltip"]')?.textContent ?? null

  it('a touch tap does not open the chip; a mouse hover does', async () => {
    const host = await mount(
      <div>
        <TooltipLayer />
        <button data-tip="Mark done" aria-label="Mark done">o</button>
      </div>,
      { ready: (h) => h.querySelector('button'), label: 'tooltip fixture' },
    )
    const btn = host.querySelector('button')!
    over(btn, 'touch')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(tooltip()).toBeNull()
    over(btn, 'mouse')
    await expect.poll(tooltip).toBe('Mark done')
  })
})
