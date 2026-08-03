import { describe, it, expect } from 'vitest'
import {
  pxForMeeting, pxForGap, buildTimelineModel,
  PX_PER_MIN, MEETING_FLOOR, GAP_FLOOR,
} from './timelineModel'
import type { TodayEvent } from './constants'

// The 2026-08-03 height reduction (PX_PER_MIN 0.9 -> 0.7) traded some of the
// duration hierarchy for a shorter page. These pin what must survive the trade,
// so a future cut cannot quietly re-create the pre-2026-06-18 defect where
// 0.6px/min + a 40px floor made every meeting up to ~66 minutes identical.
describe('meeting duration hierarchy', () => {
  it('is STRICTLY increasing across the common durations', () => {
    const heights = [30, 45, 60, 90, 120].map(pxForMeeting)
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1])
    }
  })

  it('keeps 30 and 60 minutes clearly apart', () => {
    // The headline case from the 0.6 -> 0.9 change: these two must not converge.
    expect(pxForMeeting(60) - pxForMeeting(30)).toBeGreaterThanOrEqual(12)
  })

  it('separates 45 from 30 by at least the intrinsic-row slack', () => {
    // `.meeting-row-header` is ~28px of intrinsic content and units use
    // minHeight, so a 30-min row renders ~28px whatever its model height. 45min
    // must stay above that or the two collapse into one on screen.
    expect(pxForMeeting(45)).toBeGreaterThan(28)
  })

  it('never returns less than the readable floor', () => {
    expect(pxForMeeting(1)).toBe(MEETING_FLOOR)
    expect(pxForGap(1)).toBe(GAP_FLOOR)
  })
})

describe('pxForGap is LINEAR in minutes', () => {
  // Not cosmetic. A gap's interior is a coordinate system: six call sites turn
  // pointer pixels into minutes by dividing by PX_PER_MIN. If a gap is rendered
  // at anything other than its linear height, a task dropped near its bottom is
  // saved at the wrong time. This test is the guard on that invariant.
  it('holds px == minutes * PX_PER_MIN above the floor', () => {
    for (const min of [60, 90, 120, 180, 240, 480]) {
      expect(pxForGap(min)).toBe(Math.round(min * PX_PER_MIN))
    }
  })

  it('scales proportionally — double the minutes, double the pixels', () => {
    expect(pxForGap(240)).toBeCloseTo(pxForGap(120) * 2, 0)
  })
})

describe('day balance', () => {
  const ev = (id: string, startMin: number, endMin: number): TodayEvent => ({
    id, time: '', title: id, startMin, endMin,
  })

  it('reports free and meeting minutes from the model, not from heights', () => {
    const { balance } = buildTimelineModel(
      [ev('a', 9 * 60, 10 * 60), ev('b', 13 * 60, 14 * 60)],
      { defaultDayStart: 8 * 60, defaultDayEnd: 17 * 60 },
    )
    expect(balance.meetingMinutes).toBe(120)
    // 8:00-17:00 is 540 min; 120 of it is meetings.
    expect(balance.freeMinutes).toBe(420)
  })

  it('counts an overlap once, by SPAN — two meetings in one hour cost one hour', () => {
    const { balance } = buildTimelineModel(
      [ev('a', 9 * 60, 10 * 60), ev('b', 9 * 60 + 30, 10 * 60)],
      { defaultDayStart: 9 * 60, defaultDayEnd: 11 * 60 },
    )
    // The two overlapping meetings span ONE hour between them, not two.
    expect(balance.meetingMinutes).toBe(60)
    // The axis opens 30 min before the earliest event (8:30, not 9:00), so the
    // window is 150 min and 90 of it is free.
    expect(balance.freeMinutes).toBe(90)
  })

  it('reports long/cross-day blocks separately — they never eat free time', () => {
    const overnight: TodayEvent = {
      id: 'x', time: '', title: 'on call', startMin: 0, endMin: 1440, endsAfterDay: true,
    }
    const { balance } = buildTimelineModel([overnight], { defaultDayStart: 8 * 60, defaultDayEnd: 17 * 60 })
    expect(balance.serviceMinutes).toBe(1440)
    expect(balance.meetingMinutes).toBe(0)
    expect(balance.freeMinutes).toBe(540)
  })
})
