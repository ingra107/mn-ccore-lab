import { describe, it, expect } from 'vitest'
import { clampToViewport } from '../viewportClamp'

describe('clampToViewport', () => {
  it('keeps the phone bell panel on screen (bell right edge 288 on a 390px screen)', () => {
    const trigger = { left: 254, right: 288 }
    const box = clampToViewport(trigger, 360, 390, 'right')
    const absLeft = trigger.left + box.left
    expect(box.width).toBe(360)
    expect(absLeft).toBeGreaterThanOrEqual(12)
    expect(absLeft + box.width).toBeLessThanOrEqual(390 - 12)
  })

  it('shrinks the width on a screen narrower than the panel', () => {
    const box = clampToViewport({ left: 250, right: 280 }, 360, 320, 'right')
    expect(box.width).toBe(296)
    expect(250 + box.left).toBe(12)
  })

  it('leaves a desktop right-anchored panel flush with the trigger', () => {
    const trigger = { left: 1200, right: 1234 }
    const box = clampToViewport(trigger, 360, 1440, 'right')
    expect(trigger.left + box.left + box.width).toBe(1234)
  })

  it('leaves a left-anchored sidebar panel at the trigger', () => {
    const box = clampToViewport({ left: 20, right: 54 }, 360, 1440, 'left')
    expect(box.left).toBe(0)
  })
})
