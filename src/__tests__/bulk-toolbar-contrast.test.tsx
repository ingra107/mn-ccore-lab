// #146 (Nick, /portal/deadlines, dark): "its really hard to see the options at
// the bottom here with the contrast". The floating bulk bar was a var(--ink)
// pill, which is LIGHT in dark mode, with fixed-white button text on it. Every
// control must now hold 4.5:1 (3:1 for the icon-only close glyph) against the
// bar in BOTH themes, read off the real stylesheet in real Chromium.

import { describe, it, expect, afterEach } from 'vitest'
import BulkActionToolbar from '../components/tasks/BulkActionToolbar'
import type { TaskRow } from '../lib/api'
import css from '../index.css?raw'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => { document.documentElement.classList.remove('dark') })

const style = document.createElement('style')
style.textContent = css.replace('@import "tailwindcss";', '')
document.head.appendChild(style)

// Any CSS color (rgb, color-mix, oklch) to sRGB bytes, through a 1px canvas.
const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
function rgb(color: string): [number, number, number] {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const tasks = [{ id: 't1', completed: false, due_date: '2026-10-14' }] as unknown as TaskRow[]

for (const theme of ['light', 'dark'] as const) {
  describe(`bulk toolbar (${theme})`, () => {
    it('every control reads against the bar', async () => {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      const host = await mount(
        <BulkActionToolbar selectedIds={new Set(['t1'])} selectedTasks={tasks} onClear={() => {}} onBulkAction={() => {}} isUpdating={false} />,
        { ready: (h) => h.querySelectorAll('button').length >= 6, label: 'bulk toolbar' },
      )
      const bar = host.firstElementChild as HTMLElement
      const barBg = getComputedStyle(bar).backgroundColor
      const labels = ['Complete', 'Status', 'Reassign', 'Priority', 'Delete']
      const buttons = [...host.querySelectorAll('button')]
      for (const label of labels) {
        const b = buttons.find((x) => (x.textContent ?? '').trim() === label)
        expect(b, label).toBeTruthy()
        expect(contrast(getComputedStyle(b!).color, barBg), `${label} text on the bar`).toBeGreaterThanOrEqual(4.5)
      }
      // The due-date picker's trigger (it replaced "+1 day"): the label is a span
      // inside the picker's button, so read the span.
      const due = host.querySelector('.bulk-date-host .sr-trig > span') as HTMLElement
      expect(due?.textContent?.trim(), 'Due date trigger').toBe('Due date')
      expect(contrast(getComputedStyle(due).color, barBg), 'Due date text on the bar').toBeGreaterThanOrEqual(4.5)
      const close = host.querySelector('button[aria-label="Clear selection"]')!
      expect(contrast(getComputedStyle(close).color, barBg), 'clear glyph').toBeGreaterThanOrEqual(3)
      const count = [...host.querySelectorAll('span')].find((s) => (s.textContent ?? '').includes('selected'))!
      expect(contrast(getComputedStyle(count).color, barBg), 'selected count').toBeGreaterThanOrEqual(4.5)
    })
  })
}
