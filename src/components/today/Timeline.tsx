// Timeline — meetings + drop zones + planned strip.
// Renders today's chronologically-ordered meetings interleaved with drop
// zones that accept dragged tasks (between-N slot). Bottom strip = "no
// specific time" planned tasks. Sticky "Restore N hidden" link above the
// list when meetings have been dismissed.
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
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK_DIM, LONG_EVENT_MIN, PAGE_BG, withAlpha,
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

// Format a minute count as "1h 30m" / "45m" / "2h".
function fmtGap(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Map a between-meeting gap (minutes) to a clamped pixel height so a 1h break
// reads visibly SHORTER than a 3h break — proportional spacing WITHOUT an
// absolute time axis (keeps the flow-list + droppable gaps, per N1.15). The
// gap IS the drop zone, so a taller gap also says "room for several tasks".
// 0.8px/min, floored so a tiny gap is still a usable drop target and ceiled so
// an all-morning gap doesn't blow out the page. (1h≈48px, 3h≈144px.)
const GAP_PX_PER_MIN = 0.8
const GAP_MIN_H = 30
const GAP_MAX_H = 180
function gapHeight(min: number): number {
  return Math.max(GAP_MIN_H, Math.min(GAP_MAX_H, Math.round(min * GAP_PX_PER_MIN)))
}

// Rail block height ∝ its real duration, on the SAME scale as the between-
// meeting gaps so a 3h block and a 3h gap read alike. All-day blocks (no timed
// duration) take the max so they read as spanning the day.
function railBlockHeight(e: TodayEvent): number {
  if (e.isAllDay || typeof e.startMin !== 'number' || typeof e.endMin !== 'number') return GAP_MAX_H
  return gapHeight(e.endMin - e.startMin)
}

function DropZone({ slot, label, onDropTask, gapMin }: { slot: PlannedSlot; label: string; onDropTask: (id: string, slot: PlannedSlot) => void; gapMin?: number | null }) {
  // A real, timed gap between two meetings → proportional height + a duration
  // label with a capacity cue. Otherwise (leading/trailing/untimed) keep the
  // flat default zone + its contextual label.
  const proportional = typeof gapMin === 'number' && gapMin > 0
  const slots = proportional ? Math.max(1, Math.floor((gapMin as number) / 30)) : 0
  const gapLabel = proportional
    ? `↕ ${fmtGap(gapMin as number)} free · drop tasks here${slots > 1 ? ` · room for ~${slots}` : ''}`
    : label
  return (
    <div
      // N1.15: .today-drop-zone hides on touch devices (index.css) — native
      // DnD never fires there, so six dashed zones were dead UI eating phone
      // space. The 📌 plan button is the touch planning path.
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
      style={{ padding: '6px 14px', margin: '4px 0', border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`, borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic', ...(proportional ? { minHeight: gapHeight(gapMin as number), display: 'flex', alignItems: 'center', justifyContent: 'center' } : {}) }}
    >
      {gapLabel}
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
  // #74: all-day + long (≥3h) events leave the main flow for a left rail so
  // short meetings stay readable (no equal-column OverlapBand squash) and the
  // between-meeting gaps stay droppable. Duration is derived from startMin/endMin
  // so it covers both team meetings and iCal events.
  const isRailEvent = (e: TodayEvent) =>
    !!e.isAllDay || (typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.endMin - e.startMin >= LONG_EVENT_MIN)
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
    // long/all-day blocks) — a ≥3h block happening now should still flip the
    // now-line to coral, even though it's laid out in the rail.
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
  const clusters = useMemo(() => {
    const result: TodayEvent[][] = []
    const timed = flowMeetings.filter((e) => typeof e.startMin === 'number')
    const untimed = flowMeetings.filter((e) => typeof e.startMin !== 'number')
    // Untimed events keep insertion order, each as a 1-event cluster.
    for (const e of untimed) result.push([e])
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
    return result
  }, [flowMeetings])

  // Per-cluster {start,end} in wall-clock minutes (null for untimed clusters),
  // used to size the droppable gap BEFORE each cluster by the real time since
  // the previous cluster ended. Untimed clusters can't anchor a gap → null.
  const clusterBounds = useMemo(() => clusters.map((c) => {
    const timed = c.filter((e) => typeof e.startMin === 'number')
    if (timed.length === 0) return { start: null as number | null, end: null as number | null }
    const start = Math.min(...timed.map((e) => e.startMin as number))
    const end = Math.max(...timed.map((e) => (typeof e.endMin === 'number' ? e.endMin : (e.startMin as number) + 30)))
    return { start, end }
  }), [clusters])

  // Collect real D1 meeting ids that have local notes to auto-save.
  // We render one MeetingNotesAutoSave per touched real meeting (not cal-*).
  const touchedMeetingIds = Object.keys(meetingNotes).filter((id) => !id.startsWith('cal-'))

  // N1.15 — the NOW line is an INLINE divider snapped between clusters, not an
  // absolute fraction-of-listHeight overlay (which cut through the middle of
  // meeting cards and collided its label with their text). nowIdx = the
  // cluster index the divider renders BEFORE; clusters.length = after all.
  const nowIdx = useMemo(() => {
    if (now < dayStart || now > dayEnd) return -1
    const timed = clusters
      .map((c, i) => ({ i, s: c.find((e) => typeof e.startMin === 'number')?.startMin }))
      .filter((x): x is { i: number; s: number } => typeof x.s === 'number')
    if (timed.length === 0) return -1
    const after = timed.find((x) => x.s > now)
    return after ? after.i : clusters.length
  }, [clusters, now, dayStart, dayEnd])

  const nowDivider = (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: nowColor, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: nowColor, boxShadow: `0 0 4px ${nowColor}80` }} />
      <span title={inMeeting ? 'Currently in a meeting' : 'Now'} style={{ padding: '1px 5px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: nowColor, background: withAlpha(PAGE_BG, 90), borderRadius: 3, flexShrink: 0 }}>
        {nowLabel} now
      </span>
    </div>
  )

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
      {/* Rail on the RIGHT (flow column first): grid is `flow | rail`. The
          aside stays first in the DOM (so on phone, where the grid collapses
          to a block, it still stacks ABOVE the timeline) but is placed into
          column 2 on desktop via gridColumn. */}
      <div style={{ display: railEvents.length > 0 && !isPhone ? 'grid' : 'block', gridTemplateColumns: railEvents.length > 0 && !isPhone ? 'minmax(0, 1fr) minmax(150px, 190px)' : undefined, gap: 12, alignItems: 'start' }}>
        {railEvents.length > 0 && (
          <aside aria-label="All-day and long blocks" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: isPhone ? 8 : 0, gridColumn: railEvents.length > 0 && !isPhone ? 2 : undefined }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, padding: '0 2px 2px' }}>All-day · long blocks</div>
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
                minHeight={railBlockHeight(e)}
              />
            ))}
          </aside>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', gridColumn: railEvents.length > 0 && !isPhone ? 1 : undefined }}>
        {clusters.map((cluster, idx) => {
          // Gather planned tasks dropped into the gap BEFORE this cluster.
          const slotKey = `between-${idx}` as PlannedSlot
          const tasksInGap = state.plannedIds()
            .filter((id) => state.planned[id]?.slot === slotKey)
            .map((id) => tasks.find((t) => t.id === id))
            .filter((t): t is TaskRow => !!t)
          const head = cluster[0]
          const beforeLabel = `drop a task here · before ${head.title}${cluster.length > 1 ? ` (+${cluster.length - 1} overlap)` : ''}`
          const clusterKey = cluster.map((e) => e.id).join('|')
          // Proportional gap: minutes from the previous cluster's end to this
          // cluster's start (only when both are timed and there's real space).
          const prev = idx > 0 ? clusterBounds[idx - 1] : null
          const cur = clusterBounds[idx]
          const gapMin = prev && prev.end != null && cur.start != null && cur.start > prev.end ? cur.start - prev.end : null
          return (
            <div key={clusterKey}>
              {nowIdx === idx && nowDivider}
              <DropZone slot={slotKey} label={beforeLabel} onDropTask={onDropTask} gapMin={gapMin} />
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
        {(clusters.length > 0 || railEvents.length > 0) && (() => {
          // Always render the trailing gap when any event exists — on a rail-only
          // day (no flow clusters) this is the ONLY drop zone, and it keeps
          // between-slot planned tasks visible instead of orphaning them (codex #74).
          const slotKey = `between-${clusters.length}` as PlannedSlot
          const tasksInGap = state.plannedIds()
            .filter((id) => state.planned[id]?.slot === slotKey)
            .map((id) => tasks.find((t) => t.id === id))
            .filter((t): t is TaskRow => !!t)
          return (
            <div>
              {nowIdx === clusters.length && nowDivider}
              <DropZone slot={slotKey} label={clusters.length === 0 ? 'drop a task here to plan it for today' : 'drop a task here · after last meeting'} onDropTask={onDropTask} />
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
        })()}
        </div>
      </div>
      {/* Strip-slot planned tasks (no specific time) now live in
          PlannedTodaySection below the timeline — see TodayPage.tsx. */}
    </section>
  )
}
