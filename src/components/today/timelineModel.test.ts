import { describe, it, expect } from 'vitest'
import {
  pxForMeeting, pxForGap, buildTimelineModel,
  minToPx, MEETING_FLOOR, GAP_FLOOR, packTaskBlocks, plannedSlotsFor,
} from './timelineModel'
import type { TodayEvent } from './constants'
import type { TaskRow } from '../../lib/api'

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
  // pointer pixels into minutes through pxToMin, the exact inverse of minToPx.
  // If a gap is rendered at anything other than its linear height, a task
  // dropped near its bottom is saved at the wrong time. Since #110 the six
  // sites share one function pair, so they cannot drift from each other — what
  // this test still guards is that pxForGap RENDERS at that shared height.
  it('holds px == minToPx(minutes) above the floor', () => {
    for (const min of [60, 90, 120, 180, 240, 480]) {
      expect(pxForGap(min)).toBe(Math.round(minToPx(min)))
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

describe('a clock past the last event', () => {
  const ev = (id: string, startMin: number, endMin: number): TodayEvent => ({
    id, time: '', title: id, startMin, endMin,
  })

  it('does not stretch the axis to now, and counts no elapsed time as free', () => {
    const events = [ev('a', 9 * 60, 10 * 60)]
    const opts = { defaultDayStart: 8 * 60, defaultDayEnd: 17 * 60 }
    const open = buildTimelineModel(events, opts)
    // 22:42 is long past the day: same axis as with no clock at all.
    const late = buildTimelineModel(events, { ...opts, nowMin: 22 * 60 + 42 })
    expect(late.dayEnd).toBe(open.dayEnd)
    expect(late.units.length).toBe(open.units.length)
    expect(late.balance.freeMinutes).toBe(0)
  })

  it('counts only the free time still ahead when now is inside a gap', () => {
    const events = [ev('a', 9 * 60, 10 * 60)]
    const { balance } = buildTimelineModel(events, { defaultDayStart: 8 * 60, defaultDayEnd: 17 * 60, nowMin: 15 * 60 })
    // gap 10:00-17:00 minus the elapsed 10:00-15:00 = 120 min; 8:30-9:00 is over too.
    expect(balance.freeMinutes).toBe(120)
  })
})

describe('packTaskBlocks: short tasks and the rendered floor (S07)', () => {
  const t = (id: string, plan_start_min: number, estimated_minutes: number | null) =>
    ({ id, title: id, plan_start_min, estimated_minutes }) as unknown as TaskRow
  const cols = (tasks: TaskRow[]) => Object.fromEntries(packTaskBlocks(tasks, 480).map((p) => [p.id, p.colIdx]))

  it('two 15-minute tasks 15 minutes apart take two columns', () => {
    expect(cols([t('a', 540, 15), t('b', 555, 15)])).toEqual({ a: 0, b: 1 })
  })

  it('back-to-back 30-minute tasks stay in one column: the common day is not halved', () => {
    expect(cols([t('a', 540, 30), t('b', 570, 30)])).toEqual({ a: 0, b: 0 })
    expect(cols([t('a', 540, null), t('b', 570, null)])).toEqual({ a: 0, b: 0 })
  })

  it('a 15-minute task with 30 clear minutes after its start stays in one column', () => {
    expect(cols([t('a', 540, 15), t('b', 570, 15)])).toEqual({ a: 0, b: 0 })
  })

  it('tops and heights still come from the real times and durations', () => {
    const [a, b] = packTaskBlocks([t('a', 540, 15), t('b', 555, 15)], 480)
    expect(a.topPx).toBe(Math.round(minToPx(60)))
    expect(b.topPx).toBe(Math.round(minToPx(75)))
    expect(a.heightPx).toBe(MEETING_FLOOR)
  })
})

describe('plannedSlotsFor: a slot is an ordinal, a planned minute is not (S06)', () => {
  const ev = (id: string, startMin: number, endMin: number) => ({ id, title: id, time: '', startMin, endMin })
  const t = (id: string, plan_start_min: number | null) => ({ id, plan_start_min }) as unknown as TaskRow
  const slotOf = (events: ReturnType<typeof ev>[], task: TaskRow, stored: string) =>
    plannedSlotsFor(buildTimelineModel(events).units, [task.id], { [task.id]: { slot: stored } }, [task]).get(task.id)

  it('a timed task goes to the gap holding its minute, whatever the stored ordinal says', () => {
    expect(slotOf([ev('b', 660, 720)], t('x', 780), 'between-2')).toBe('between-1')
    expect(slotOf([ev('b', 660, 720)], t('x', 630), 'between-1')).toBe('between-0')
  })

  it('a timed task on its gap keeps it', () => {
    expect(slotOf([ev('a', 540, 600), ev('b', 660, 720)], t('x', 630), 'between-1')).toBe('between-1')
  })

  it('a timed task under a meeting goes to the nearest gap', () => {
    expect(slotOf([ev('a', 600, 720)], t('x', 610), 'between-0')).toBe('between-0')
    expect(slotOf([ev('a', 600, 720)], t('x', 710), 'between-0')).toBe('between-1')
  })

  it('no time: an existing slot stands, a missing one falls to the last gap', () => {
    expect(slotOf([ev('b', 660, 720)], t('x', null), 'between-0')).toBe('between-0')
    expect(slotOf([ev('b', 660, 720)], t('x', null), 'between-9')).toBe('between-1')
  })

  it('a strip task is left alone, timed or not', () => {
    expect(slotOf([ev('b', 660, 720)], t('x', 780), 'strip')).toBe('strip')
  })

  it('a planned id with no task row is skipped', () => {
    const units = buildTimelineModel([]).units
    expect(plannedSlotsFor(units, ['gone'], { gone: { slot: 'between-0' } }, []).has('gone')).toBe(false)
  })
})
