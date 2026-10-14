// Fixed dropdowns (InlineSelect, InlineDatePicker, GhostSelect) stop above the
// phone tab bar, not at the window edge (class fix with TaskContextMenu).
import { describe, it, expect, afterEach } from 'vitest'
import { dropdownTop, viewportBottom } from '../lib/viewportBottom'
import selectSrc from '../components/InlineSelect.tsx?raw'
import dateSrc from '../components/InlineDatePicker.tsx?raw'
import ghostSrc from '../components/ui/GhostSelect.tsx?raw'
import chipSrc from '../pages/MyTasks/components/FilterChip.tsx?raw'

let bar: HTMLElement | null = null
afterEach(() => { bar?.remove(); bar = null })

describe('dropdownTop', () => {
  it('ends the menu at the tab bar top when the bar shows', () => {
    bar = document.createElement('nav')
    bar.setAttribute('data-bottom-bar', '')
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:57px'
    document.body.appendChild(bar)
    const barTop = bar.getBoundingClientRect().top
    expect(viewportBottom()).toBe(barTop)
    const top = dropdownTop({ bottom: window.innerHeight - 20 }, 300)
    expect(top + 300).toBeLessThanOrEqual(barTop)
  })

  it('falls back to the window edge without a bar, and leaves roomy triggers alone', () => {
    expect(dropdownTop({ bottom: window.innerHeight - 20 }, 300)).toBe(window.innerHeight - 300)
    expect(dropdownTop({ bottom: 100 }, 300)).toBe(104)
  })

  it('every dropdown uses the helper, none reads innerHeight', () => {
    for (const src of [selectSrc, dateSrc, ghostSrc]) {
      expect(src).toContain('dropdownTop(')
      expect(src).not.toMatch(/window\.innerHeight - 3\d\d/)
    }
    expect(chipSrc).toContain('viewportBottom()')
  })
})
