// Small behaviours from the 2026-11-05 real-viewport audit, against the real
// index.css in Chromium where the cascade matters.

import '../index.css'
import { describe, it, expect } from 'vitest'
import { verbAfterName } from '../lib/verbAfterName'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

describe('activity feed text after a name (M23)', () => {
  it.each([
    ['Commented on task', 'commented on task'],
    ['Posted note on "Aim 2": "x"', 'posted note on "Aim 2": "x"'],
    ['MNCCORE meeting created', 'MNCCORE meeting created'],
    ['', ''],
  ])('%s', (input, want) => {
    expect(verbAfterName(input)).toBe(want)
  })
})

describe('urgency rail on a row without a card (L5)', () => {
  it('is a straight bar inset from the corners, not a border bent by the row radius', async () => {
    const host = await mount(
      <div className="sr"><div className="sr-row sr-urg" style={{ height: 40, width: 300 }}>x</div></div>,
      { ready: (h) => h.querySelector('.sr-row'), label: 'row' },
    )
    const row = host.querySelector('.sr-row')!
    expect(getComputedStyle(row).boxShadow).toBe('none')
    const rail = getComputedStyle(row, '::before')
    expect(rail.width).toBe('2px')
    expect(rail.top).toBe('6px')
    expect(rail.bottom).toBe('6px')
  })
})

describe('a stat with a zero (M30)', () => {
  it('does not dim its label below the dim tier', async () => {
    const host = await mount(
      <div className="tk"><span className="tk-st tk-zero"><span className="tk-l">IRB renewals</span></span></div>,
      { ready: (h) => h.querySelector('.tk-l'), label: 'stat' },
    )
    expect(getComputedStyle(host.querySelector('.tk-l')!).opacity).toBe('1')
  })
})
