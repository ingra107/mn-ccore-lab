// Timeline — meetings + drop zones + planned strip.
// Renders today's chronologically-ordered meetings interleaved with drop
// zones that accept dragged tasks (between-N slot). Bottom strip = "no
// specific time" planned tasks. Sticky "Restore N hidden" link above the
// list when meetings have been dismissed.
//
// GH#80 codex-plan (2026-06-18): FULL REDESIGN to normal-flow proportional agenda.
//
// Four prior absolute-canvas attempts (P1-P4) failed because:
//   - Absolute positioning made note expansion invisible/clipped (P1-P3)
//   - P4's service-rail removed 7am-3pm blocks from the main axis but kept
//     absolute positioning, so expand still bleed + overlaps were still
//     absolute side-by-side
//
// THIS REVISION (codex-plan):
//   - Replaces the absolute canvas with TimelineGrid (normal-flow flex column)
//   - buildTimelineModel() produces proportional GapUnit/MeetingUnit/OverlapUnit
//   - Notes expand INSIDE the flow item → opaque, push down (Level-1 fix)
//   - Service blocks go to a right ~25% column, translucent, NOT consuming gaps
//   - Side-by-side overlaps via packColumns() with no conflict label
//   - Real in-flow AgendaGapRow drop targets (not transparent absolute overlays)
//
// DELETED machinery (vs P1-P4):
//   - AbsoluteDropZone component
//   - TimeRuler as absolute full-canvas ruler
//   - canvasWrapRef, canvasW, ResizeObserver
//   - absolute event block wrappers (top: toY(...), left: GUTTER_W)
//   - timedClusters, timedClusterBounds, canvasHeight, nowTopPx = toY(now)
//   - toY(), toDuration() absolute math functions (PX_PER_MIN now in timelineModel.ts)
//   - OverlapBand for timed clusters (replaced by AgendaOverlapRegion inside TimelineGrid)
//   - GUTTER_W, MIN_COL_W, MIN_BLOCK_H local constants
//   - longTimedBlocks boxed right-fixed-width strip
//
// KEPT:
//   - MeetingNotesAutoSave (debounced D1 save)
//   - meetingNotes/meetingSaveState local state
//   - dismissedMeetings state + Restore N hidden button
//   - useNowMinutes() 60s ticker
//   - All-day banner rendering (allDayEvents pass-through in TimelineGrid)
//   - DropZone for the pure-untimed-only fallback (no timed events at all)

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import EmptyState from '../EmptyState'
import EmptyStateArt from '../EmptyStateArt'
import { type SaveStatus } from './MeetingRow'
import { useIsMobile } from '../../hooks/useIsMobile'
import { TimelineGrid } from './TimelineGrid'
import {
  ACCENT_GOLD, ACCENT_TEAL, INK_DIM, withAlpha,
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

// Fallback drop zone for the case of no timed events and no rail events —
// a simple dashed strip at the bottom.
function DropZone({ slot, label, onDropTask }: { slot: PlannedSlot; label: string; onDropTask: (id: string, slot: PlannedSlot) => void }) {
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
        if (id) onDropTask(id, slot)
      }}
      style={{ padding: '6px 14px', margin: '4px 0', border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`, borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic' }}
    >
      {label}
    </div>
  )
}

interface TimelineProps {
  events: TodayEvent[]
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
  // View toggle (Phase 2). When provided, renders the Timeline⇄Agenda toggle
  // in the section header. activeView tells the toggle which button is active.
  activeView?: 'timeline' | 'agenda'
  onToggleView?: (view: 'timeline' | 'agenda') => void
}

export function Timeline({ events, tasks, state, projectsByPid, expandedId, onExpand, activeView, onToggleView }: TimelineProps) {
  const navigate = useNavigate()
  // Hoist isPhone so EventRow + OverlapBand share one matchMedia listener.
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
        if (e.id.startsWith('cal-')) continue
        if (e.notes != null && !(e.id in next)) {
          next[e.id] = e.notes
        }
      }
      return next
    })
    // Re-run when the set of meeting ids changes (new day / data reload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.map((e) => e.id).join(',')])

  const visibleMeetings = events.filter((e) => !dismissedMeetings[e.id])

  const now = useNowMinutes()

  // Collect real D1 meeting ids that have local notes to auto-save.
  const touchedMeetingIds = Object.keys(meetingNotes).filter((id) => !id.startsWith('cal-'))

  const onDropTask = useCallback((id: string, slot: PlannedSlot) => state.planAt(id, slot), [state])

  // Determine if any visible event is happening now (for coral vs gold now-line).
  const inMeeting = visibleMeetings.some(
    (e) => typeof e.startMin === 'number' && typeof e.endMin === 'number'
      && e.startMin <= now && now < e.endMin
  )

  // Check if there are any timed/railed events at all (for the empty fallback).
  const hasTimed = visibleMeetings.some((e) =>
    typeof e.startMin === 'number' && !e.isAllDay
  )
  const hasAllDay = visibleMeetings.some((e) => !!e.isAllDay)
  const hasAnyEvents = hasTimed || hasAllDay

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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>📅</span>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>Today</h2>
        {/* Timeline⇄Agenda view toggle — rendered when parent passes activeView + onToggleView */}
        {onToggleView && (
          <div
            role="group"
            aria-label="Today view"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${withAlpha(ACCENT_TEAL, 22)}`,
              borderRadius: 6,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {(['timeline', 'agenda'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onToggleView(v)}
                aria-pressed={activeView === v}
                title={v === 'timeline' ? 'Timeline — drag tasks into gaps' : 'Agenda — scan your day'}
                style={{
                  background: activeView === v ? withAlpha(ACCENT_TEAL, 18) : 'transparent',
                  border: 'none',
                  color: activeView === v ? ACCENT_TEAL : INK_DIM,
                  fontSize: 11,
                  fontWeight: activeView === v ? 600 : 400,
                  cursor: 'pointer',
                  padding: '3px 9px',
                  letterSpacing: '0.02em',
                  transition: 'all 120ms',
                  lineHeight: 1.5,
                }}
              >
                {v === 'timeline' ? 'Timeline' : 'Agenda'}
              </button>
            ))}
          </div>
        )}
        <span className="today-section-hint" style={{ fontSize: 11, color: INK_DIM }}>
          {activeView === 'agenda'
            ? 'scan your day · click to open · × to hide'
            : 'drag tasks into the gaps · click meetings to take notes · × to hide'}
        </span>
        {Object.keys(dismissedMeetings).length > 0 && (
          <button onClick={() => setDismissedMeetings({})} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: ACCENT_TEAL, fontSize: 11, cursor: 'pointer' }}>
            Restore {Object.keys(dismissedMeetings).length} hidden
          </button>
        )}
      </div>

      {/* Empty state */}
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

      {/* TimelineGrid handles allDay + service + timed flow */}
      {visibleMeetings.length > 0 && (
        <TimelineGrid
          events={visibleMeetings}
          tasks={tasks}
          state={state}
          projectsByPid={projectsByPid}
          expandedId={expandedId}
          onExpand={onExpand}
          notes={meetingNotes}
          onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
          saveStatus={meetingSaveState}
          onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
          isPhone={isPhone}
          now={now}
          inMeeting={inMeeting}
        />
      )}

      {/* Fallback drop zone when no events at all */}
      {visibleMeetings.length === 0 && !hasAnyEvents && (
        <DropZone
          slot={`between-0` as PlannedSlot}
          label="drop a task here to plan it for today"
          onDropTask={onDropTask}
        />
      )}

      {/* Strip-slot planned tasks (no specific time) now live in
          PlannedTodaySection below the timeline — see TodayPage.tsx. */}
    </section>
  )
}
