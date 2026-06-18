// Timeline — meetings + drop zones + planned strip.
// Renders today's chronologically-ordered meetings interleaved with drop
// zones that accept dragged tasks (between-N slot). Bottom strip = "no
// specific time" planned tasks. Sticky "Restore N hidden" link above the
// list when meetings have been dismissed.
//
// GH#80 Phase 1 (2026-06-18): absolute-positioned calendar-style canvas
// replacing the flow-list + gapHeight() approach.
//
// GH#80 Phase 2+3 (2026-06-18): full rewrite of overlap handling + rail logic.
//   - PX_PER_MIN reduced 1.2 → 0.6 (overall height ~50% of Phase 1).
//   - MIN_BLOCK_H = 24px so 30-min meetings stay legible at 0.6px/min.
//   - isRailEvent now checks ONLY isAllDay (true all-day events). Timed long
//     blocks (≥3h) are NO LONGER railed — they render as tall absolute blocks
//     on the axis at true duration height.
//   - All-day banner = genuinely all-day events only (no start/end time, or
//     isAllDay=true from the calendar feed). A 7am-6:30pm timed block is NOT
//     all-day.
//   - Google-style side-by-side column packing via interval-graph greedy
//     coloring. Overlapping events in a cluster each get width=1/cols,
//     left=colIdx/cols × (right - left). The 3-event-non-pairwise case
//     correctly yields 2 columns, not 3.
//   - Hour-label gutter fix: labels live at left:0, width:42px. Tick lines +
//     event blocks start at left:44px. Events never overlay the labels.
//
// DEPRECATES (Phase 2+3 kills these, ON TOP of Phase 1):
//   - OverlapBand for timed clusters — replaced by in-canvas column layout.
//     OverlapBand is still used for UNTIMED clusters below the canvas.
//   - The "All-day · long blocks" rail for TIMED events — long timed events
//     now render on the axis. Rail survives only for isAllDay events.
//   - railBlockHeight() reference (dead since Phase 1; fully gone now).
//   - gapHeight / GAP_* / fmtGap / nowIdx / nowDivider (dead since Phase 1).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Timeline + DropZone).

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import EmptyState from '../EmptyState'
import EmptyStateArt from '../EmptyStateArt'
import { EventRow, type SaveStatus } from './MeetingRow'
import { OverlapBand } from './OverlapBand'
import { useIsMobile } from '../../hooks/useIsMobile'
import { PlannedTaskRow } from './PlannedTaskRow'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK_DIM, PAGE_BG, withAlpha,
  type PlannedSlot, type TodayEvent,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { useUpdateMeetingNotes } from '../../hooks/mutations/useMeetingMutations'

// MeetingNotesAutoSave — renderless helper that debounces a notes string and
// fires useUpdateMeetingNotes when the user pauses typing for DEBOUNCE_MS.
// Instantiated once per real D1 meeting that has been touched this session.
// - Fires ONLY when notes differs from lastSavedRef (avoids re-saves on rerender).
// - onStatus callback lets Timeline track saving/saved badge.
const DEBOUNCE_MS = 1500
function MeetingNotesAutoSave({ meetingId, notes, onStatus }: { meetingId: string; notes: string; onStatus: (id: string, status: SaveStatus) => void }) {
  const mutation = useUpdateMeetingNotes(meetingId)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef<string>(notes) // initialised to the hydrated value
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    // Don't fire on the initial mount value (already persisted).
    if (notes === lastSavedRef.current) return

    onStatusRef.current(meetingId, 'saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = notes
      mutation.mutate(notes, {
        onSuccess: () => onStatusRef.current(meetingId, 'saved'),
        onError: () => onStatusRef.current(meetingId, 'idle'),
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, meetingId])

  return null
}

// TP-09: 1px now-line. Updates every 60s via setInterval. Static — no
// animation — so prefers-reduced-motion is a no-op.
function useNowMinutes(): number {
  const [now, setNow] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(d.getHours() * 60 + d.getMinutes())
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// GH#80 Phase 2: reduced from 1.2 to 0.6 px/min so the overall canvas is
// ~50% shorter. A typical 7am-8pm day (780 min) = ~468px. A 30-min meeting
// = 18px raw → clamped up to MIN_BLOCK_H (24px) so it stays legible.
const PX_PER_MIN = 0.6

// Minimum block height so very short meetings (< ~40 min at 0.6px/min) remain
// legible. 24px holds one line of text with padding.
const MIN_BLOCK_H = 24

// Left gutter width for hour labels. Event blocks and tick lines start here.
const GUTTER_W = 44

// Pixel-offset for a minute count on the canvas (relative to dayStart).
function toY(min: number, dayStart: number): number {
  return Math.round((min - dayStart) * PX_PER_MIN)
}
// Height for a duration in minutes, clamped to MIN_BLOCK_H.
function toDuration(min: number): number {
  return Math.max(MIN_BLOCK_H, Math.round(min * PX_PER_MIN))
}

// ── Interval-graph column packing ──────────────────────────────────────────
// Greedy interval coloring: assign each event the lowest-index column that
// doesn't conflict with any already-placed event. The maximum column count
// used is the true chromatic number of the interval graph — never inflated.
//
// For N events that don't all mutually overlap (the "3 events, 2 columns"
// case) this naturally yields fewer columns than N.
//
// Returns an array parallel to `events`: each element is
//   { colIdx, colCount } where colCount is the total columns used.
function packColumns(events: TodayEvent[]): Array<{ colIdx: number; colCount: number }> {
  if (events.length === 0) return []
  if (events.length === 1) return [{ colIdx: 0, colCount: 1 }]

  // Convert to {start, end} in minutes. Missing endMin → start+30.
  const intervals = events.map((e) => ({
    start: e.startMin as number,
    end: typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30,
  }))

  const cols: Array<{ colIdx: number }> = new Array(events.length).fill(null).map(() => ({ colIdx: -1 }))
  // Track the end-minute of the last event placed in each column.
  const colEnds: number[] = []

  for (let i = 0; i < events.length; i++) {
    const { start } = intervals[i]
    // Find the lowest column whose last event has already ended.
    let placed = false
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= start) {
        cols[i].colIdx = c
        colEnds[c] = intervals[i].end
        placed = true
        break
      }
    }
    if (!placed) {
      // Open a new column.
      cols[i].colIdx = colEnds.length
      colEnds.push(intervals[i].end)
    }
  }

  const colCount = colEnds.length
  return cols.map((c) => ({ colIdx: c.colIdx, colCount }))
}
// ──────────────────────────────────────────────────────────────────────────

function DropZone({ slot, label, onDropTask }: { slot: PlannedSlot; label: string; onDropTask: (id: string, slot: PlannedSlot) => void }) {
  return (
    <div
      // N1.15: .today-drop-zone hides on touch devices (index.css) — native
      // DnD never fires there, so dashed zones are dead UI eating phone space.
      className="today-drop-zone"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = withAlpha(ACCENT_GOLD, 8) }}
      onDragLeave={(e) => { e.currentTarget.style.borderColor = withAlpha(ACCENT_GOLD, 15); e.currentTarget.style.background = 'transparent' }}
      onDrop={(e) => {
        e.preventDefault()
        e.currentTarget.style.borderColor = withAlpha(ACCENT_GOLD, 15)
        e.currentTarget.style.background = 'transparent'
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropTask(id, slot)
      }}
      style={{ padding: '6px 14px', margin: '4px 0', border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`, borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic' }}
    >
      {label}
    </div>
  )
}

// AbsoluteDropZone: transparent drop-zone overlay for the gaps in the timed
// canvas. Positioned absolutely to fill the free space between event clusters.
// The dashed border + label appear only on dragover so they don't clutter the
// calendar view. Carries the .today-drop-zone class so index.css hides it on touch.
// Phase 2: left/right adjusted to respect the GUTTER_W gutter so drop zones
// don't cover the hour labels.
function AbsoluteDropZone({ slot, label, top, height, onDropTask, tasks, state, projectsByPid, expandedId, onExpand }: {
  slot: PlannedSlot
  label: string
  top: number
  height: number
  onDropTask: (id: string, slot: PlannedSlot) => void
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
}) {
  const tasksInGap = state.plannedIds()
    .filter((id) => state.planned[id]?.slot === slot)
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t)

  return (
    <div
      className="today-drop-zone"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = withAlpha(ACCENT_GOLD, 8) }}
      onDragLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
      onDrop={(e) => {
        e.preventDefault()
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.background = 'transparent'
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropTask(id, slot)
      }}
      title={label}
      style={{
        position: 'absolute',
        top,
        left: GUTTER_W,
        right: 0,
        height: Math.max(height, 12),
        border: `1px dashed transparent`,
        borderRadius: 4,
        transition: 'all 120ms',
        zIndex: 1,
        // Allow event blocks (z-index 2) to render above; drop zone is the base layer.
      }}
    >
      {tasksInGap.map((t) => (
        <PlannedTaskRow
          key={t.id}
          task={t}
          project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
          state={state}
          small
          onExpand={onExpand}
          expandedId={expandedId}
          projectsByPid={projectsByPid}
        />
      ))}
    </div>
  )
}

// Time ruler: a thin vertical axis with hour tick labels on the left of the canvas.
// Phase 2: labels stay at left:0/width:GUTTER_W-2; gridlines start at left:GUTTER_W
// so events never overlay the labels.
function TimeRuler({ dayStart, dayEnd }: { dayStart: number; dayEnd: number }) {
  const hours: number[] = []
  const startHour = Math.ceil(dayStart / 60)
  const endHour = Math.floor(dayEnd / 60)
  for (let h = startHour; h <= endHour; h++) hours.push(h)
  return (
    <>
      {hours.map((h) => {
        const y = toY(h * 60, dayStart)
        const label = new Date(0, 0, 0, h, 0).toLocaleTimeString([], { hour: 'numeric', minute: undefined })
        return (
          <div
            key={h}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: y - 8,
              left: 0,
              width: GUTTER_W - 2,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: withAlpha(ACCENT_TEAL, 60),
              lineHeight: 1,
              userSelect: 'none',
              pointerEvents: 'none',
              textAlign: 'right',
            }}
          >
            {label}
          </div>
        )
      })}
      {/* Horizontal tick lines — start at GUTTER_W so they never cross labels */}
      {hours.map((h) => (
        <div
          key={`line-${h}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: toY(h * 60, dayStart),
            left: GUTTER_W,
            right: 0,
            height: 1,
            background: withAlpha(ACCENT_TEAL, 8),
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

interface TimelineProps {
  events: TodayEvent[]
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
}

export function Timeline({ events, tasks, state, projectsByPid, expandedId, onExpand }: TimelineProps) {
  const navigate = useNavigate()
  // ROW 24: hoist isPhone here so EventRow + OverlapBand share one matchMedia
  // listener instead of one per visible meeting row.
  const isPhone = useIsMobile(768)
  const [dismissedMeetings, setDismissedMeetings] = useState<Record<string, boolean>>({})
  const [meetingNotes, setMeetingNotes] = useState<Record<string, string>>({})
  const [meetingSaveState, setMeetingSaveState] = useState<Record<string, SaveStatus>>({})

  // Hydrate local notes state from persisted D1 meeting notes on mount and
  // whenever the events list changes identity (new day / refetch). We only
  // populate entries that carry a notes value so existing local edits are not
  // overwritten mid-session — the effect is gated on `id` set change, not on
  // the notes string itself. cal-* events have no notes field and are skipped.
  useEffect(() => {
    setMeetingNotes((prev) => {
      const next = { ...prev }
      for (const e of events) {
        if (e.id.startsWith('cal-')) continue          // iCal event — no D1 row
        if (e.notes != null && !(e.id in next)) {
          next[e.id] = e.notes                          // hydrate only on first appearance
        }
      }
      return next
    })
  // Re-run when the set of meeting ids changes (new day / data reload).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.map((e) => e.id).join(',')])

  const visibleMeetings = events.filter((e) => !dismissedMeetings[e.id])

  // GH#80 Phase 2: isRailEvent now checks ONLY isAllDay.
  //
  // Phase 1 sent ALL events with duration >= LONG_EVENT_MIN (3h) to the rail.
  // That wrongly banished a timed 7am-6:30pm block to the corner aside instead
  // of rendering it as a tall absolute block on the axis — Nick's core complaint.
  //
  // Phase 2 fix: only calendar-feed events with isAllDay=true (no start/end time)
  // live in the banner. Every event that has a real startMin/endMin — regardless
  // of duration — goes onto the absolute axis. The banner label also changes from
  // "All-day · long blocks" to "All-day events" to reflect the narrower scope.
  const isRailEvent = (e: TodayEvent) => !!e.isAllDay

  const railEvents = visibleMeetings.filter(isRailEvent)
  const flowMeetings = visibleMeetings.filter((e) => !isRailEvent(e))
  const onDropTask = useCallback((id: string, slot: PlannedSlot) => state.planAt(id, slot), [state])

  // TP-09: now-line. Window = min(startMin) of timed events to max(endMin),
  // clamped + padded to a sensible 7am-8pm default if no timed events.
  // Line color = coral if user is currently inside a meeting, gold otherwise
  // (Rule 59 — coral = warnings/overlap, gold = user-driven action).
  const now = useNowMinutes()
  const { dayStart, dayEnd, inMeeting } = useMemo(() => {
    const timed = flowMeetings
      .map((e) => ({ start: e.startMin, end: e.endMin }))
      .filter((t): t is { start: number; end: number | undefined } => typeof t.start === 'number')
    let ds = 7 * 60   // 7:00 default
    let de = 20 * 60  // 20:00 default
    if (timed.length > 0) {
      const minStart = Math.min(...timed.map((t) => t.start))
      const maxEnd = Math.max(...timed.map((t) => (typeof t.end === 'number' ? t.end : t.start + 30)))
      ds = Math.min(ds, minStart - 30)
      de = Math.max(de, maxEnd + 30)
    }
    // #74/codex: current-meeting state must consider ALL events (incl. railed
    // all-day blocks) — a block happening now should still flip the now-line to coral.
    const inMtg = visibleMeetings.some((e) => typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.startMin <= now && now < e.endMin)
    return { dayStart: ds, dayEnd: de, inMeeting: inMtg }
  }, [flowMeetings, visibleMeetings, now])
  const nowColor = inMeeting ? ACCENT_CORAL : ACCENT_GOLD
  // Derive nowLabel from live wall-clock time at render, NOT from the 60s-tick
  // `now` hook (which drives placement). N1.21: locale-formatted so it matches
  // the meeting rows' "8:00 AM" style instead of a hand-built 24h string.
  const nowLabel = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  // TP-11: cluster overlapping events. Walk events sorted by startMin and
  // merge any whose startMin < cluster.maxEnd into the running cluster.
  // Untimed events (no startMin) never overlap — each forms a singleton.
  // GH#80 Phase 2: split into untimedClusters (flex column below canvas) and
  // timedClusters (absolutely positioned on the canvas with column packing).
  // Slot indices are globally assigned across both groups (untimed first, as
  // before) so that existing planned tasks route to the correct between-N slot.
  const { untimedClusters, timedClusters, clusters } = useMemo(() => {
    const result: TodayEvent[][] = []
    const timed = flowMeetings.filter((e) => typeof e.startMin === 'number')
    const untimed = flowMeetings.filter((e) => typeof e.startMin !== 'number')
    // Untimed events keep insertion order, each as a 1-event cluster.
    for (const e of untimed) result.push([e])
    const untimedCount = result.length
    // Timed events: sort by start, then cluster by overlap.
    const sorted = [...timed].sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0))
    let current: TodayEvent[] = []
    let currentEnd = -1
    for (const e of sorted) {
      const s = e.startMin as number
      const en = typeof e.endMin === 'number' ? e.endMin : s + 30
      if (current.length === 0 || s < currentEnd) {
        current.push(e)
        currentEnd = Math.max(currentEnd, en)
      } else {
        result.push(current)
        current = [e]
        currentEnd = en
      }
    }
    if (current.length > 0) result.push(current)
    // Split: untimedClusters get globalIdx 0..untimedCount-1,
    // timedClusters get globalIdx untimedCount..result.length-1.
    return {
      clusters: result,
      untimedClusters: result.slice(0, untimedCount).map((c, i) => ({ cluster: c, globalIdx: i })),
      timedClusters: result.slice(untimedCount).map((c, i) => ({ cluster: c, globalIdx: untimedCount + i })),
    }
  }, [flowMeetings])

  // Per-timed-cluster: {start, end} in wall-clock minutes.
  // Used to place the absolute event block and the gap drop zones.
  const timedClusterBounds = useMemo(() => timedClusters.map(({ cluster }) => {
    const starts = cluster.map((e) => e.startMin as number)
    const ends = cluster.map((e) => typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30)
    return {
      start: Math.min(...starts),
      end: Math.max(...ends),
    }
  }), [timedClusters])

  // Collect real D1 meeting ids that have local notes to auto-save.
  const touchedMeetingIds = Object.keys(meetingNotes).filter((id) => !id.startsWith('cal-'))

  // GH#80 Phase 1: absolute now-line replaces the nowIdx snap-between-clusters
  // approach (N1.15 — no longer needed when the line is truly absolute).
  // Show the line only when now falls within the canvas window.
  const nowInCanvas = now >= dayStart && now <= dayEnd
  const nowTopPx = nowInCanvas ? toY(now, dayStart) : -1

  // Canvas total height
  const canvasHeight = Math.round((dayEnd - dayStart) * PX_PER_MIN)

  return (
    <section data-b2-timeline style={{ marginBottom: 24 }}>
      {/* Renderless auto-savers — one per real D1 meeting with in-session notes */}
      {touchedMeetingIds.map((id) => (
        <MeetingNotesAutoSave
          key={id}
          meetingId={id}
          notes={meetingNotes[id] ?? ''}
          onStatus={(mid, status) => setMeetingSaveState((s) => ({ ...s, [mid]: status }))}
        />
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>Today · timeline</h2>
        {/* N1.15/N1.21 — hide the drag how-to on phones: it wraps into the
            title AND describes drag, which doesn't exist on touch. */}
        <span className="today-section-hint" style={{ fontSize: 11, color: INK_DIM }}>drag tasks into the gaps · click meetings to take notes · × to hide</span>
        {Object.keys(dismissedMeetings).length > 0 && (
          <button onClick={() => setDismissedMeetings({})} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: ACCENT_TEAL, fontSize: 11, cursor: 'pointer' }}>Restore {Object.keys(dismissedMeetings).length} hidden</button>
        )}
      </div>
      {visibleMeetings.length === 0 && (
        <div style={{ background: withAlpha(ACCENT_GOLD, 3), border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`, borderRadius: 8 }}>
          <EmptyState
            compact
            icon={<EmptyStateArt variant="meetings" width={96} height={72} />}
            title="No meetings today"
            subtitle="A clear calendar. Connect a feed if you expected to see meetings here."
            action={{ label: 'Connect a calendar →', onClick: () => navigate(PATHS.settings) }}
          />
        </div>
      )}

      {/* ── All-day banner — ONLY genuinely isAllDay events (Phase 2) ── */}
      {railEvents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, padding: '0 2px 4px' }}>All-day events</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {railEvents.map((e) => (
              <EventRow
                key={e.id}
                e={e}
                onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                note={meetingNotes[e.id]}
                onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                saveStatus={meetingSaveState[e.id] ?? 'idle'}
                isCalEvent={e.id.startsWith('cal-')}
                isPhone={isPhone}
              />
            ))}
          </div>
        </div>
      )}

      {/* Flow column — untimed clusters + timed absolute canvas */}
      <div>

        {/* ── Untimed clusters (no startMin) — flex column with original drop zones ── */}
        {untimedClusters.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: timedClusters.length > 0 ? 12 : 0 }}>
            {untimedClusters.map(({ cluster, globalIdx }) => {
              const slotKey = `between-${globalIdx}` as PlannedSlot
              const head = cluster[0]
              const beforeLabel = `drop a task here · before ${head.title}${cluster.length > 1 ? ` (+${cluster.length - 1} overlap)` : ''}`
              const tasksInGap = state.plannedIds()
                .filter((id) => state.planned[id]?.slot === slotKey)
                .map((id) => tasks.find((t) => t.id === id))
                .filter((t): t is TaskRow => !!t)
              const clusterKey = cluster.map((e) => e.id).join('|')
              return (
                <div key={clusterKey}>
                  <DropZone slot={slotKey} label={beforeLabel} onDropTask={onDropTask} />
                  {tasksInGap.map((t) => (
                    <PlannedTaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                      state={state}
                      small
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                    />
                  ))}
                  {cluster.length === 1 ? (
                    <EventRow
                      e={head}
                      onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                      note={meetingNotes[head.id]}
                      onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                      saveStatus={meetingSaveState[head.id] ?? 'idle'}
                      isCalEvent={head.id.startsWith('cal-')}
                      isPhone={isPhone}
                    />
                  ) : (
                    <OverlapBand
                      events={cluster}
                      onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                      notes={meetingNotes}
                      onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                      saveStates={meetingSaveState}
                      isPhone={isPhone}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Timed canvas — absolute-positioned event blocks ── */}
        {(timedClusters.length > 0 || railEvents.length > 0) && (
          <div
            style={{
              position: 'relative',
              height: canvasHeight,
            }}
          >
            {/* Time ruler: labels in GUTTER_W column, gridlines start at GUTTER_W */}
            <TimeRuler dayStart={dayStart} dayEnd={dayEnd} />

            {/* Now-line — absolute at exact minute position (GH#80 Phase 1).
                Replaces the nowIdx snap-between-clusters logic (N1.15). */}
            {nowInCanvas && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: nowTopPx,
                  left: GUTTER_W,
                  right: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  zIndex: 10,
                  pointerEvents: 'none',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: nowColor, flexShrink: 0, marginLeft: -4 }} />
                <div style={{ flex: 1, height: 1, background: nowColor, boxShadow: `0 0 4px ${nowColor}80` }} />
                <span
                  title={inMeeting ? 'Currently in a meeting' : 'Now'}
                  style={{
                    padding: '1px 5px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: nowColor,
                    background: withAlpha(PAGE_BG, 90),
                    borderRadius: 3,
                    flexShrink: 0,
                    marginRight: 2,
                  }}
                >
                  {nowLabel} now
                </span>
              </div>
            )}

            {/* Absolute gap drop zones — transparent overlays covering free spans */}
            {(() => {
              const zones: React.ReactNode[] = []

              // Leading gap: canvas top → first timed cluster start.
              if (timedClusters.length > 0) {
                const firstGlobalIdx = timedClusters[0].globalIdx
                const firstTop = 0
                const firstBound = timedClusterBounds[0]
                const firstH = toY(firstBound.start, dayStart)
                // Always render (may be zero-height, still needed for slot continuity).
                zones.push(
                  <AbsoluteDropZone
                    key={`leading-${firstGlobalIdx}`}
                    slot={`between-${firstGlobalIdx}` as PlannedSlot}
                    label={`drop a task here · before ${timedClusters[0].cluster[0].title}`}
                    top={firstTop}
                    height={firstH}
                    onDropTask={onDropTask}
                    tasks={tasks}
                    state={state}
                    projectsByPid={projectsByPid}
                    expandedId={expandedId}
                    onExpand={onExpand}
                  />
                )
                // Inter-cluster gaps.
                for (let i = 0; i < timedClusters.length - 1; i++) {
                  const prevBound = timedClusterBounds[i]
                  const nextBound = timedClusterBounds[i + 1]
                  const gapTop = toY(prevBound.end, dayStart)
                  const gapH = toY(nextBound.start, dayStart) - gapTop
                  const nextGlobalIdx = timedClusters[i + 1].globalIdx
                  zones.push(
                    <AbsoluteDropZone
                      key={`gap-${nextGlobalIdx}`}
                      slot={`between-${nextGlobalIdx}` as PlannedSlot}
                      label={`drop a task here · before ${timedClusters[i + 1].cluster[0].title}`}
                      top={gapTop}
                      height={gapH}
                      onDropTask={onDropTask}
                      tasks={tasks}
                      state={state}
                      projectsByPid={projectsByPid}
                      expandedId={expandedId}
                      onExpand={onExpand}
                    />
                  )
                }
              }

              // Trailing gap: last timed cluster end → canvas bottom.
              const trailingGlobalIdx = clusters.length
              const trailingTop = timedClusters.length > 0
                ? toY(timedClusterBounds[timedClusterBounds.length - 1].end, dayStart)
                : 0
              const trailingH = canvasHeight - trailingTop
              const trailingSlot = `between-${trailingGlobalIdx}` as PlannedSlot
              const trailingTasksInGap = state.plannedIds()
                .filter((id) => state.planned[id]?.slot === trailingSlot)
                .map((id) => tasks.find((t) => t.id === id))
                .filter((t): t is TaskRow => !!t)
              zones.push(
                <div
                  key="trailing"
                  className="today-drop-zone"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = withAlpha(ACCENT_GOLD, 8) }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.background = 'transparent'
                    const id = e.dataTransfer.getData('text/plain')
                    if (id) onDropTask(id, trailingSlot)
                  }}
                  style={{
                    position: 'absolute',
                    top: trailingTop,
                    left: GUTTER_W,
                    right: 0,
                    height: Math.max(trailingH, 12),
                    border: `1px dashed transparent`,
                    borderRadius: 4,
                    transition: 'all 120ms',
                    zIndex: 1,
                  }}
                >
                  {trailingTasksInGap.map((t) => (
                    <PlannedTaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                      state={state}
                      small
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                    />
                  ))}
                </div>
              )

              return zones
            })()}

            {/* Absolute event blocks — timed clusters with interval-graph column packing.
                Phase 2: each event gets its own absolute block at the correct position
                and width fraction. Overlapping events appear side-by-side in columns.
                No OverlapBand dashed-border for timed events — that is now only used
                for the untimed cluster section above the canvas. */}
            {timedClusters.map(({ cluster, globalIdx }, i) => {
              const bounds = timedClusterBounds[i]
              // Compute column layout for all events in this cluster.
              const colLayout = packColumns(cluster)
              const clusterKey = cluster.map((e) => e.id).join('|')

              return (
                <div
                  key={clusterKey}
                  style={{
                    position: 'absolute',
                    top: toY(bounds.start, dayStart),
                    left: GUTTER_W,
                    right: 0,
                    height: toDuration(bounds.end - bounds.start),
                    zIndex: 2,
                    // This container spans the full cluster height. Each event is
                    // absolutely positioned within it at its own top/height.
                    pointerEvents: 'none', // let children handle events
                  }}
                >
                  {cluster.map((e, ei) => {
                    const { colIdx, colCount } = colLayout[ei]
                    const eStart = e.startMin as number
                    const eEnd = typeof e.endMin === 'number' ? e.endMin : eStart + 30
                    const eDuration = eEnd - eStart
                    const eTop = toY(eStart, dayStart) - toY(bounds.start, dayStart)
                    const eHeight = toDuration(eDuration)
                    // Width fraction: 1/colCount of the available container width.
                    // A 1px gap between adjacent columns.
                    const colW = `calc(${100 / colCount}% - ${colCount > 1 ? 1 : 0}px)`
                    const colLeft = colCount > 1
                      ? `calc(${(colIdx / colCount) * 100}% + ${colIdx > 0 ? 1 : 0}px)`
                      : '0'

                    return (
                      <div
                        key={e.id}
                        style={{
                          position: 'absolute',
                          top: eTop,
                          left: colLeft,
                          width: colW,
                          height: eHeight,
                          pointerEvents: 'auto',
                          overflow: 'hidden',
                        }}
                      >
                        <EventRow
                          e={e}
                          onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                          note={meetingNotes[e.id]}
                          onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                          saveStatus={meetingSaveState[e.id] ?? 'idle'}
                          isCalEvent={e.id.startsWith('cal-')}
                          isPhone={isPhone}
                          minHeight={eHeight}
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Rail-only day with no timed flow events: a single full-canvas drop zone */}
            {timedClusters.length === 0 && railEvents.length > 0 && (() => {
              const slotKey = `between-${clusters.length}` as PlannedSlot
              const soloTasksInGap = state.plannedIds()
                .filter((id) => state.planned[id]?.slot === slotKey)
                .map((id) => tasks.find((t) => t.id === id))
                .filter((t): t is TaskRow => !!t)
              return (
                <div
                  className="today-drop-zone"
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = withAlpha(ACCENT_GOLD, 8) }}
                  onDragLeave={(e) => { e.currentTarget.style.borderColor = withAlpha(ACCENT_GOLD, 15); e.currentTarget.style.background = 'transparent' }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.style.borderColor = withAlpha(ACCENT_GOLD, 15)
                    e.currentTarget.style.background = 'transparent'
                    const id = e.dataTransfer.getData('text/plain')
                    if (id) onDropTask(id, slotKey)
                  }}
                  style={{ padding: '6px 14px', margin: '4px 0', border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`, borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic' }}
                >
                  drop a task here to plan it for today
                  {soloTasksInGap.map((t) => (
                    <PlannedTaskRow
                      key={t.id}
                      task={t}
                      project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                      state={state}
                      small
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                    />
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* No timed events and no rail events: show a single flat drop zone */}
        {timedClusters.length === 0 && railEvents.length === 0 && clusters.length === 0 && (
          <DropZone
            slot={`between-0` as PlannedSlot}
            label="drop a task here to plan it for today"
            onDropTask={onDropTask}
          />
        )}
      </div>
      {/* Strip-slot planned tasks (no specific time) now live in
          PlannedTodaySection below the timeline — see TodayPage.tsx. */}
    </section>
  )
}
