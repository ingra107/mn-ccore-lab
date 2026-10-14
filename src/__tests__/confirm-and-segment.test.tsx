// G10-02: ConfirmButton asks before it acts (Settings danger zone, Lab reset,
// launch re-fire). G10-09: a scrollable SegmentedToggle brings its selected
// segment into view, so /settings#danger shows which section is open.
//
// Runs in real Chromium (vitest.config.ts browser mode).
import { describe, it, expect } from 'vitest'
import ConfirmButton from '../components/ui/ConfirmButton'
import SegmentedToggle from '../components/ui/SegmentedToggle'
import { mount, waitFor, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

describe('ConfirmButton', () => {
  it('arms on the first tap and acts only on the second', async () => {
    let runs = 0
    const host = await mount(
      <ConfirmButton confirmLabel="Reset?" onConfirm={() => { runs++ }}>Reset</ConfirmButton>,
      { ready: (h) => h.querySelector('button'), label: 'confirm button' },
    )
    const btn = host.querySelector('button')!
    btn.click()
    await waitFor(() => btn.textContent === 'Reset?', 'armed label')
    expect(runs).toBe(0)
    btn.click()
    await waitFor(() => btn.textContent === 'Reset', 'disarmed after confirm')
    expect(runs).toBe(1)
  })
})

describe('SegmentedToggle scrollable', () => {
  it('scrolls the selected segment into a narrow strip on mount', async () => {
    // Browser-mode tests do not load index.css; these are its .tk-seg-scroll rules.
    const style = document.createElement('style')
    style.textContent = '.tk-seg{display:inline-flex}.tk-seg.tk-seg-scroll{max-width:100%;min-width:0;overflow-x:auto}.tk-seg button{white-space:nowrap}.tk-seg.tk-seg-scroll button{flex-shrink:0}'
    document.head.appendChild(style)
    const options = ['profile', 'templates', 'lab', 'integrations', 'appearance', 'danger'].map((v) => ({ value: v, label: `Section ${v}` }))
    const host = await mount(
      <SegmentedToggle scrollable options={options} value="danger" onChange={() => {}} />,
      { ready: (h) => h.querySelector('button.tk-on'), label: 'segmented toggle', width: '200px' },
    )
    const strip = host.querySelector<HTMLElement>('[role="tablist"]')!
    const on = host.querySelector<HTMLElement>('button.tk-on')!
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
    const s = strip.getBoundingClientRect()
    const b = on.getBoundingClientRect()
    expect(b.left).toBeGreaterThanOrEqual(s.left - 1)
    expect(b.right).toBeLessThanOrEqual(s.right + 1)
  })
})
