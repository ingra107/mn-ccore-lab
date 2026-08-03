// timelineModel.ts — Pure data transform for the Timeline proportional grid.
//
// Phase 3 flag: TIMELINE_TASK_BLOCKS gates all absolute-lane rendering inside
// AgendaGapRow. Set to false to restore the Phase-1 full-width stacked render
// with one line change (rollback path per the synchronous-swinging-sifakis plan).
// (Renamed from agendaModel.ts — "Agenda" now refers to the linear list view;
//  "Timeline" is the absolute-axis drag-to-plan surface.)
//
// GH#80 codex-plan (2026-06-18): Replaces the absolute-canvas model (P1-P4).
// Takes a list of TodayEvent objects and produces a TimelineModel whose units
// are rendered in normal document flow with proportional min-heights.
//
// KEY DESIGN:
//   - serviceBlocks (≥LONG_EVENT_MIN) → right 25% transparent lane, do NOT
//     consume draggable free-minutes or produce gap slots.
//   - timelineEvents (timed <3h + untimed) → clustered into timelineUnits.
//   - Each agendaUnit has a baseHeight = proportional px (with readable floor).
//   - GapUnit.freeMinutes counts ONLY agenda-meeting-free time (not service time).
//   - OverlapUnit.columns = packColumns() result for side-by-side rendering.
//   - Slot keys (`between-N`) follow global index = untimedCount + timedClusters.
//     The trailing gap is always `between-<clusters.length>` to match the prior
//     Timeline implementation so existing planned tasks still route correctly.

import { LONG_EVENT_MIN, type TodayEvent } from './constants'
import type { TaskRow } from '../../lib/api'

// ── Phase 3 feature flag ───────────────────────────────────────────────────
// One-line rollback to Phase-1 stacked render: set to false.
export const TIMELINE_TASK_BLOCKS = true

// ── Height constants ───────────────────────────────────────────────────────
// PX_PER_MIN raised + MEETING_FLOOR lowered so 30/45/60/90-min blocks are
// visually distinct: 30→27px(floor), 45→40px, 60→54px, 90→81px.
// (Prior: PX_PER_MIN=0.6 + MEETING_FLOOR=40 → everything ≤66min was 40px,
// making 30min look the same as 60min. Nick eval 2026-06-18.)
// 2026-08-03 (Nick: "make the timeline not as tall"): 0.9 → 0.7.
//
// Measured first: on a 7am-8pm axis with four meetings, the timeline is 702px,
// of which 540px (77%) is empty gap. Gaps are where the height is, but they
// CANNOT be compressed on their own — a gap's interior is a coordinate system
// (see pxForGap below), so a non-uniform scale saves dropped tasks at the wrong
// time. Reducing this ONE shared constant is the only change that shortens the
// page while keeping every pixel↔minute conversion self-consistent.
//
// Cost, measured rather than assumed: `.meeting-row-header` is 6px padding on
// an 11px font ≈ 28px of intrinsic content, and units use minHeight, so a
// 30-min row is intrinsic-bound at ~28px either way. At 0.9 a 45-min row was
// 41px; at 0.7 it is 32px. So the 30-vs-45 distinction narrows from ~13px to
// ~4px. Still monotonic (28 < 32 < 42 < 63) and nowhere near the pre-2026-06-18
// defect where 0.6px/min + a 40px floor made everything ≤66min identical — but
// it is the real price of this change, and durationHierarchy in
// timelineModel.test.ts pins it so a further cut cannot silently flatten it.
//
// The whole-day free-time signal no longer rests on raw height alone: the
// DayBalanceStrip above the axis states it from model MINUTES.
export const PX_PER_MIN = 0.7      // was 0.9; 0.6 + a 40px floor was the old defect
export const MEETING_FLOOR = 27    // lowered from 40 — 30min hits this floor, 60min=42px
export const GAP_FLOOR = 24        // min-height for a gap row

// ── Morning planning floor ─────────────────────────────────────────────────
// dayStart is always ≤ MORNING_FLOOR (7 AM) so the axis covers pre-first-event
// morning time even on days where the first event is late.  Nick may adjust to
// 6*60 if he wants an earlier window.  The 30-min lead on the first event and
// nowMin are also factored in (whichever is earliest wins).
export const MORNING_FLOOR = 7 * 60   // 7:00 AM in minutes-since-midnight

export const pxForMeeting = (min: number): number =>
  Math.max(MEETING_FLOOR, Math.round(min * PX_PER_MIN))

// ⚠️ A GAP'S HEIGHT MUST STAY min * PX_PER_MIN. It is not just a visual
// choice — the gap's interior is a coordinate system. Six call sites convert
// pointer pixels to minutes inside a gap by dividing by this same global
// constant: the list-drop math (TodayDndContext), block move and resize
// (useTaskBlockDrag, useTaskBlockGesture), task-block placement
// (packTaskBlocks below), and the drop preview + in-unit now-line offset
// (TimelineGrid). Rendering a gap at anything other than its linear height
// makes every one of those conversions wrong, so a task dropped near the
// bottom of a long gap would be saved at the wrong time.
//
// This was measured 2026-08-03 while trying to compress long gaps to cut the
// timeline's height (~77% of it is empty gap). Compression is still the right
// idea, but it requires threading a PER-GAP scale through all six sites, not
// changing this function alone. See the height options written up for Nick.
export const pxForGap = (min: number): number =>
  Math.max(GAP_FLOOR, Math.round(min * PX_PER_MIN))

// ── Duration helpers ───────────────────────────────────────────────────────
function duration(e: TodayEvent): number {
  return typeof e.startMin === 'number' && typeof e.endMin === 'number'
    ? e.endMin - e.startMin
    : 30
}

// #107: a slice that crosses either day boundary is a service block regardless
// of how many minutes of it land inside this day. Nick: overnight events "should
// not be in the main body... it should be with the small boxes of events that
// are > 4 hours etc." An 11:30 PM → 12:30 AM event is only 30 minutes of today,
// but it is still a cross-day commitment and belongs in the compact rail, not
// stretched across the main chronology.
//
// The 3h threshold is unchanged — cross-day is an INDEPENDENT criterion, not a
// redefinition of "long".
function isService(e: TodayEvent): boolean {
  return (
    !e.isAllDay &&
    typeof e.startMin === 'number' &&
    (e.startsBeforeDay === true || e.endsAfterDay === true || duration(e) >= LONG_EVENT_MIN)
  )
}

// ── Column packing (greedy interval coloring) ──────────────────────────────
// Returns array parallel to events: {colIdx, colCount}.
// colCount = total distinct columns needed (chromatic number of interval graph).
export interface ColPlacement {
  colIdx: number
  colCount: number
}

export function packColumns(events: TodayEvent[]): ColPlacement[] {
  if (events.length === 0) return []
  if (events.length === 1) return [{ colIdx: 0, colCount: 1 }]

  const intervals = events.map((e) => ({
    start: e.startMin as number,
    end: typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30,
  }))

  const colIdx: number[] = new Array(events.length).fill(-1)
  const colEnds: number[] = []

  for (let i = 0; i < events.length; i++) {
    const { start } = intervals[i]
    let placed = false
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= start) {
        colIdx[i] = c
        colEnds[c] = intervals[i].end
        placed = true
        break
      }
    }
    if (!placed) {
      colIdx[i] = colEnds.length
      colEnds.push(intervals[i].end)
    }
  }

  const colCount = colEnds.length
  return colIdx.map((ci) => ({ colIdx: ci, colCount }))
}

// ── Task block packing ────────────────────────────────────────────────────
//
// Adapts TaskRow[] to the packColumns() interval-coloring algorithm. Reuses
// packColumns() directly — does NOT fork the algorithm. The adapter builds the
// minimal TodayEvent-shaped objects (only startMin/endMin consumed by
// packColumns) from plan_start_min + estimated_minutes, pre-sorted by start
// then plan_rank so ties go to the rank-ordered task.
//
// Returns parallel to input tasks (same order as sorted timedTasks caller passes).

export interface TaskBlockPlacement extends ColPlacement {
  /** Task id — used by consumers to look up by id instead of positional index.
   *  packTaskBlocks sorts internally; positional indexing with the original
   *  task array order produces wrong column assignments. Always look up by id. */
  id: string
  /** px from the gap's top edge (plan_start_min - gap.startMin) * PX_PER_MIN */
  topPx: number
  /** px height: max(MEETING_FLOOR, estimated_minutes * PX_PER_MIN) */
  heightPx: number
}

/** Sort predicate for timed tasks within a gap: by start time, then plan_rank. */
export function sortTimedTasks(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    const aStart = a.plan_start_min ?? 0
    const bStart = b.plan_start_min ?? 0
    if (aStart !== bStart) return aStart - bStart
    const aRank = a.plan_rank ?? 0
    const bRank = b.plan_rank ?? 0
    return aRank - bRank
  })
}

/**
 * Compute absolute-lane placements for TIMED tasks within a gap.
 * @param timedTasks - Tasks with plan_start_min != null (pre-sorted by caller
 *   via sortTimedTasks is fine but not required — this sorts internally).
 * @param gapStartMin - The gap's startMin (minutes-since-midnight).
 */
export function packTaskBlocks(
  timedTasks: TaskRow[],
  gapStartMin: number,
): TaskBlockPlacement[] {
  if (timedTasks.length === 0) return []
  const sorted = sortTimedTasks(timedTasks)

  // Build minimal TodayEvent-shaped objects for packColumns().
  // packColumns only reads .startMin and .endMin.
  const fakeEvents: TodayEvent[] = sorted.map((t) => {
    const start = t.plan_start_min as number
    const dur = t.estimated_minutes ?? 30
    return {
      id: t.id,
      time: '',
      title: t.title,
      startMin: start,
      endMin: start + dur,
    }
  })

  const placements = packColumns(fakeEvents)

  // Fix C: attach id to each placement so consumers look up by t.id, not
  // positional index. packTaskBlocks sorts internally; indexing the result array
  // by the original task-array position produces wrong column assignments when
  // sort changes the order.
  return sorted.map((t, i) => {
    const start = t.plan_start_min as number
    const dur = t.estimated_minutes ?? 30
    const topPx = Math.round((start - gapStartMin) * PX_PER_MIN)
    const heightPx = Math.max(MEETING_FLOOR, Math.round(dur * PX_PER_MIN))
    return { id: t.id, ...placements[i], topPx, heightPx }
  })
}

// ── Agenda unit types ─────────────────────────────────────────────────────

export interface GapUnit {
  kind: 'gap'
  slot: `between-${number}`
  startMin: number
  endMin: number
  freeMinutes: number
  baseHeight: number
}

export interface MeetingUnit {
  kind: 'meeting'
  event: TodayEvent
  startMin: number
  endMin: number
  minutes: number
  baseHeight: number
}

export interface OverlapUnit {
  kind: 'overlap'
  events: TodayEvent[]
  startMin: number
  endMin: number
  spanMinutes: number
  baseHeight: number
  placements: ColPlacement[]
}

export interface UntimedUnit {
  kind: 'untimed'
  slot: `between-${number}`
  events: TodayEvent[]
}

export type TimelineUnit = GapUnit | MeetingUnit | OverlapUnit | UntimedUnit

/**
 * Whole-day free/busy totals, in MINUTES.
 *
 * Deliberately derived from the model, never from rendered pixel heights: floors
 * and intrinsic content make a unit's height a lossy proxy for its duration, so
 * a pixel-derived summary would drift from the truth exactly on the crowded days
 * where it matters. This is what lets the axis itself get shorter (PX_PER_MIN
 * 0.9 → 0.7) without losing the answer to "how much free time do I have?".
 */
export interface DayBalance {
  freeMinutes: number
  meetingMinutes: number
  /** Long/cross-day blocks — reported separately: they never consume free time. */
  serviceMinutes: number
}

export interface TimelineModel {
  allDayEvents: TodayEvent[]
  serviceBlocks: TodayEvent[]
  units: TimelineUnit[]
  dayStart: number   // minutes-since-midnight
  dayEnd: number
  /** total globalClusterCount — so trailing gap slot = between-{globalClusterCount} */
  globalClusterCount: number
  balance: DayBalance
}

// ── Main export ────────────────────────────────────────────────────────────

export function buildTimelineModel(
  events: TodayEvent[],
  {
    defaultDayStart = MORNING_FLOOR,
    defaultDayEnd = 20 * 60,
    nowMin,
  }: { defaultDayStart?: number; defaultDayEnd?: number; nowMin?: number } = {},
): TimelineModel {
  // 1. Partition
  const allDayEvents = events.filter((e) => !!e.isAllDay)
  const serviceBlocks = events.filter(isService)
  // agendaEvents = not all-day and not a service block
  const agendaEvents = events.filter((e) => !e.isAllDay && !isService(e))

  const timedEvents = agendaEvents
    .filter((e) => typeof e.startMin === 'number')
    .sort((a, b) => {
      const aStart = a.startMin as number
      const bStart = b.startMin as number
      const aEnd = typeof a.endMin === 'number' ? a.endMin : aStart + 30
      const bEnd = typeof b.endMin === 'number' ? b.endMin : bStart + 30
      return aStart !== bStart ? aStart - bStart : aEnd - bEnd
    })
  const untimedEvents = agendaEvents.filter((e) => typeof e.startMin !== 'number')

  // 2. Build timed clusters (overlapping = same cluster)
  type Cluster = { events: TodayEvent[]; maxEnd: number }
  const clusters: Cluster[] = []

  for (const e of timedEvents) {
    const start = e.startMin as number
    const end = typeof e.endMin === 'number' ? e.endMin : start + 30
    const last = clusters[clusters.length - 1]
    if (!last || start >= last.maxEnd) {
      clusters.push({ events: [e], maxEnd: end })
    } else {
      last.events.push(e)
      last.maxEnd = Math.max(last.maxEnd, end)
    }
  }

  // 3. Global slot indices
  //    untimed clusters come first (indices 0..untimedEvents.length-1 each untimed is its own)
  //    then timed clusters (indices untimedEvents.length .. untimedEvents.length+clusters.length-1)
  const untimedCount = untimedEvents.length
  const globalClusterCount = untimedCount + clusters.length

  // 4. Compute day window from timed events only (service blocks excluded).
  //    dayStart = earliest of: defaultDayStart (MORNING_FLOOR=7AM), nowMin,
  //    and (earliestEvent - 30).  This ensures the axis always covers:
  //      (a) at least MORNING_FLOOR (7 AM morning planning window),
  //      (b) the current time (now-line never falls before the axis top),
  //      (c) 30 min lead before the earliest event.
  //    dayEnd extends to include nowMin (now-line never falls after axis bottom)
  //    plus a 30-min tail on the last event.
  let dayStart = defaultDayStart
  let dayEnd = defaultDayEnd
  // Factor in nowMin first (before event-based narrowing) so the window always
  // encompasses the current time regardless of whether there are timed events.
  if (nowMin != null) {
    dayStart = Math.min(dayStart, nowMin)
    dayEnd   = Math.max(dayEnd,   nowMin)
  }
  if (timedEvents.length > 0) {
    const minStart = Math.min(...timedEvents.map((e) => e.startMin as number))
    const maxEnd = Math.max(...timedEvents.map((e) =>
      typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30
    ))
    dayStart = Math.max(0, Math.min(dayStart, minStart - 30))
    dayEnd = Math.max(dayEnd, maxEnd + 30)
  }
  dayStart = Math.max(0, dayStart)

  // 5. Build agendaUnits
  const units: TimelineUnit[] = []

  // 5a. Untimed units (each untimed event = its own cluster with a slot key)
  untimedEvents.forEach((e, i) => {
    const slot = `between-${i}` as `between-${number}`
    units.push({ kind: 'untimed', slot, events: [e] })
  })

  // 5b. Timed units: gaps + meetings/overlaps, chronologically interleaved
  let prevEnd = dayStart

  clusters.forEach((cluster, ci) => {
    const clusterStart = Math.min(...cluster.events.map((e) => e.startMin as number))
    const clusterEnd = cluster.maxEnd
    const timedGlobalIdx = untimedCount + ci

    // Gap before this cluster
    if (clusterStart > prevEnd) {
      const freeMinutes = clusterStart - prevEnd
      const slot = `between-${timedGlobalIdx}` as `between-${number}`
      units.push({
        kind: 'gap',
        slot,
        startMin: prevEnd,
        endMin: clusterStart,
        freeMinutes,
        baseHeight: pxForGap(freeMinutes),
      })
    }

    // Meeting or overlap
    if (cluster.events.length === 1) {
      const e = cluster.events[0]
      const start = e.startMin as number
      const end = typeof e.endMin === 'number' ? e.endMin : start + 30
      const minutes = end - start
      units.push({
        kind: 'meeting',
        event: e,
        startMin: start,
        endMin: end,
        minutes,
        baseHeight: pxForMeeting(minutes),
      })
    } else {
      const spanMinutes = clusterEnd - clusterStart
      units.push({
        kind: 'overlap',
        events: cluster.events,
        startMin: clusterStart,
        endMin: clusterEnd,
        spanMinutes,
        baseHeight: pxForMeeting(spanMinutes),
        placements: packColumns(cluster.events),
      })
    }

    prevEnd = Math.max(prevEnd, clusterEnd)
  })

  // 5c. Trailing gap (prevEnd → dayEnd)
  // The trailing slot = between-{globalClusterCount} (matches prior Timeline impl)
  if (prevEnd < dayEnd || clusters.length === 0) {
    const freeMinutes = Math.max(0, dayEnd - prevEnd)
    const slot = `between-${globalClusterCount}` as `between-${number}`
    units.push({
      kind: 'gap',
      slot,
      startMin: prevEnd,
      endMin: dayEnd,
      freeMinutes,
      baseHeight: pxForGap(freeMinutes),
    })
  }

  // Whole-day totals from MINUTES, not from the heights we just computed.
  // An overlap contributes its SPAN, not the sum of its events — two meetings
  // at the same hour cost one hour of the day, not two.
  let freeMinutes = 0
  let meetingMinutes = 0
  for (const u of units) {
    if (u.kind === 'gap') freeMinutes += u.freeMinutes
    else if (u.kind === 'meeting') meetingMinutes += u.minutes
    else if (u.kind === 'overlap') meetingMinutes += u.spanMinutes
  }
  const serviceMinutes = serviceBlocks.reduce((sum, e) => {
    const s = e.startMin
    const en = e.endMin
    return sum + (typeof s === 'number' && typeof en === 'number' ? Math.max(0, en - s) : 0)
  }, 0)

  return {
    allDayEvents,
    serviceBlocks,
    units,
    dayStart,
    dayEnd,
    globalClusterCount,
    balance: { freeMinutes, meetingMinutes, serviceMinutes },
  }
}
