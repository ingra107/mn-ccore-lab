// timelineModel.ts — Pure data transform for the Timeline proportional grid.
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

// ── Height constants ───────────────────────────────────────────────────────
// PX_PER_MIN raised + MEETING_FLOOR lowered so 30/45/60/90-min blocks are
// visually distinct: 30→27px(floor), 45→40px, 60→54px, 90→81px.
// (Prior: PX_PER_MIN=0.6 + MEETING_FLOOR=40 → everything ≤66min was 40px,
// making 30min look the same as 60min. Nick eval 2026-06-18.)
export const PX_PER_MIN = 0.9      // raised from 0.6 to distinguish 30/45/60/90min
export const MEETING_FLOOR = 27    // lowered from 40 — 30min=27px(hits floor), 60min=54px
export const GAP_FLOOR = 24        // min-height for a gap row

export const pxForMeeting = (min: number): number =>
  Math.max(MEETING_FLOOR, Math.round(min * PX_PER_MIN))

export const pxForGap = (min: number): number =>
  Math.max(GAP_FLOOR, Math.round(min * PX_PER_MIN))

// ── Duration helpers ───────────────────────────────────────────────────────
function duration(e: TodayEvent): number {
  return typeof e.startMin === 'number' && typeof e.endMin === 'number'
    ? e.endMin - e.startMin
    : 30
}

function isService(e: TodayEvent): boolean {
  return (
    !e.isAllDay &&
    typeof e.startMin === 'number' &&
    duration(e) >= LONG_EVENT_MIN
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

export interface OverlapColumn {
  events: TodayEvent[]
  placements: ColPlacement[]
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

/** @deprecated Use TimelineUnit */
export type AgendaUnit = TimelineUnit

export interface TimelineModel {
  allDayEvents: TodayEvent[]
  serviceBlocks: TodayEvent[]
  units: TimelineUnit[]
  dayStart: number   // minutes-since-midnight
  dayEnd: number
  /** total globalClusterCount — so trailing gap slot = between-{globalClusterCount} */
  globalClusterCount: number
}

/** @deprecated Use TimelineModel */
export type AgendaModel = TimelineModel

// ── Main export ────────────────────────────────────────────────────────────

export function buildTimelineModel(
  events: TodayEvent[],
  {
    defaultDayStart = 7 * 60,
    defaultDayEnd = 20 * 60,
  }: { defaultDayStart?: number; defaultDayEnd?: number } = {},
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

  // 4. Compute day window from timed events only (service blocks excluded)
  let dayStart = defaultDayStart
  let dayEnd = defaultDayEnd
  if (timedEvents.length > 0) {
    const minStart = Math.min(...timedEvents.map((e) => e.startMin as number))
    const maxEnd = Math.max(...timedEvents.map((e) =>
      typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30
    ))
    dayStart = Math.min(dayStart, minStart - 30)
    dayEnd = Math.max(dayEnd, maxEnd + 30)
  }

  // 5. Build agendaUnits
  const units: AgendaUnit[] = []

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

  return {
    allDayEvents,
    serviceBlocks,
    units,
    dayStart,
    dayEnd,
    globalClusterCount,
  }
}

/** @deprecated Use buildTimelineModel */
export const buildAgendaModel = buildTimelineModel
