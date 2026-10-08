import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { useNowMinutes, minutesOfDay, formatNowLabel } from './useNowMinutes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('minutesOfDay / formatNowLabel (#138)', () => {
  it('label and line position come from the same minutes', () => {
    const d = new Date(2026, 8, 30, 12, 58)
    expect(minutesOfDay(d)).toBe(12 * 60 + 58)
    expect(formatNowLabel(minutesOfDay(d))).toMatch(/12:58\s?PM/)
  })
})

describe('useNowMinutes catches up after the tab was asleep (#138)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('re-reads the clock on visibilitychange even when no 60s tick ever fired', async () => {
    // Fake only Date: the interval never fires, exactly like a frozen background tab.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 11, 21))
    let seen = -1
    function Probe() { seen = useNowMinutes(); return null }
    const root = createRoot(document.createElement('div'))
    await act(async () => { root.render(createElement(Probe)) })
    expect(seen).toBe(11 * 60 + 21)

    vi.setSystemTime(new Date(2026, 8, 30, 12, 58)) // 97 minutes pass, no tick
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(seen).toBe(12 * 60 + 58)
    await act(async () => { root.unmount() })
  })
})
