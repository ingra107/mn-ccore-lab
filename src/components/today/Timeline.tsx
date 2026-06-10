// Timeline — meetings + drop zones + planned strip.
// Renders today's chronologically-ordered meetings interleaved with drop
// zones that accept dragged tasks (between-N slot). Bottom strip = "no
// specific time" planned tasks. Sticky "Restore N hidden" link above the
// list when meetings have been dismissed.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Timeline + DropZone).

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { EventRow, type SaveStatus } from './MeetingRow'
import { OverlapBand } from './OverlapBand'
import { PlannedTaskRow } from './PlannedTaskRow'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK_MUTED, INK_DIM,
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

function DropZone({ slot, label, onDropTask }: { slot: PlannedSlot; label: string; onDropTask: (id: string, slot: PlannedSlot) => void }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = ACCENT_GOLD; e.currentTarget.style.background = 'rgba(201,168,76,0.08)' }}
      onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'; e.currentTarget.style.background = 'transparent' }}
      onDrop={(e) => {
        e.preventDefault()
        e.currentTarget.style.borderColor = 'rgba(201,168,76,0.15)'
        e.currentTarget.style.background = 'transparent'
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropTask(id, slot)
      }}
      style={{ padding: '6px 14px', margin: '4px 0', border: '1px dashed rgba(201,168,76,0.15)', borderRadius: 6, fontSize: 11, color: INK_DIM, textAlign: 'center', transition: 'all 120ms', fontStyle: 'italic' }}
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
}

export function Timeline({ events, tasks, state, projectsByPid, expandedId, onExpand }: TimelineProps) {
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
  const onDropTask = useCallback((id: string, slot: PlannedSlot) => state.planAt(id, slot), [state])

  // TP-09: now-line. Window = min(startMin) of timed events to max(endMin),
  // clamped + padded to a sensible 7am-8pm default if no timed events.
  // Line color = coral if user is currently inside a meeting, gold otherwise
  // (Rule 59 — coral = warnings/overlap, gold = user-driven action).
  const now = useNowMinutes()
  const meetingsListRef = useRef<HTMLDivElement | null>(null)
  const [listHeight, setListHeight] = useState(0)
  useEffect(() => {
    const el = meetingsListRef.current
    if (!el) return
    const update = () => setListHeight(el.offsetHeight)
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [visibleMeetings.length])
  const { dayStart, dayEnd, inMeeting, lineTop } = useMemo(() => {
    const timed = visibleMeetings
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
    const inMtg = visibleMeetings.some((e) => typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.startMin <= now && now < e.endMin)
    const fraction = listHeight > 0 && de > ds && now >= ds && now <= de
      ? (now - ds) / (de - ds)
      : -1
    const top = fraction >= 0 ? Math.round(fraction * listHeight) : -1
    return { dayStart: ds, dayEnd: de, inMeeting: inMtg, lineTop: top }
  }, [visibleMeetings, now, listHeight])
  const showLine = lineTop >= 0
  const nowColor = inMeeting ? ACCENT_CORAL : ACCENT_GOLD
  // Derive nowLabel from live wall-clock time at render, NOT from the 60s-tick
  // `now` hook. The hook drives position smoothness (updates every 60s); the
  // label should always reflect actual current time so it never shows a stale
  // minute (e.g. "11:00" when it's 11:29). Both read from system clock so
  // label and position remain consistent to within a few seconds.
  const nowLabelDate = new Date()
  const nowLabel = `${String(nowLabelDate.getHours()).padStart(2, '0')}:${String(nowLabelDate.getMinutes()).padStart(2, '0')}`
  // Suppress unused-var warning for derived window; kept in scope for future work.
  void dayStart; void dayEnd

  // TP-11: cluster overlapping events. Walk events sorted by startMin and
  // merge any whose startMin < cluster.maxEnd into the running cluster.
  // Untimed events (no startMin) never overlap — each forms a singleton.
  const clusters = useMemo(() => {
    const result: TodayEvent[][] = []
    const timed = visibleMeetings.filter((e) => typeof e.startMin === 'number')
    const untimed = visibleMeetings.filter((e) => typeof e.startMin !== 'number')
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
  }, [visibleMeetings])

  const plannedStripIds = state.plannedIds().filter((id) => state.planned[id]?.slot === 'strip' && id !== state.rightNow)
  const plannedStripTasks = plannedStripIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is TaskRow => !!t)

  // Collect real D1 meeting ids that have local notes to auto-save.
  // We render one MeetingNotesAutoSave per touched real meeting (not cal-*).
  const touchedMeetingIds = Object.keys(meetingNotes).filter((id) => !id.startsWith('cal-'))

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
        <span style={{ fontSize: 14 }}>📅</span>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', margin: 0 }}>Today · timeline</h3>
        <span style={{ fontSize: 11, color: INK_DIM }}>drag tasks into the gaps · click meetings to take notes · × to hide</span>
        {Object.keys(dismissedMeetings).length > 0 && (
          <button onClick={() => setDismissedMeetings({})} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: ACCENT_TEAL, fontSize: 11, cursor: 'pointer' }}>Restore {Object.keys(dismissedMeetings).length} hidden</button>
        )}
      </div>
      {visibleMeetings.length === 0 && (
        <div style={{ padding: '16px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: INK_MUTED, marginBottom: 4 }}>No meetings on today's calendar.</div>
          <Link to={PATHS.settings} style={{ fontSize: 11, color: ACCENT_TEAL, textDecoration: 'underline' }}>Connect a calendar in Settings</Link>
        </div>
      )}
      <div ref={meetingsListRef} style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
        {showLine && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: lineTop,
              height: 1,
              background: nowColor,
              pointerEvents: 'none',
              zIndex: 2,
              boxShadow: `0 0 4px ${nowColor}80`,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: -4,
                top: -3,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: nowColor,
              }}
            />
            <span
              title={inMeeting ? 'Currently in a meeting' : 'Now'}
              style={{
                position: 'absolute',
                right: 0,
                top: -7,
                padding: '1px 5px',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: nowColor,
                background: 'rgba(11,16,23,0.90)',
                borderRadius: 3,
              }}
            >
              {nowLabel} now
            </span>
          </div>
        )}
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
                />
              ) : (
                <OverlapBand
                  events={cluster}
                  onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                  notes={meetingNotes}
                  onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
                  saveStates={meetingSaveState}
                />
              )}
            </div>
          )
        })}
        {clusters.length > 0 && (() => {
          const slotKey = `between-${clusters.length}` as PlannedSlot
          const tasksInGap = state.plannedIds()
            .filter((id) => state.planned[id]?.slot === slotKey)
            .map((id) => tasks.find((t) => t.id === id))
            .filter((t): t is TaskRow => !!t)
          return (
            <div>
              <DropZone slot={slotKey} label="drop a task here · after last meeting" onDropTask={onDropTask} />
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
      <div
        style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.10)', borderRadius: 8 }}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(201,168,76,0.40)' }}
        onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}
        onDrop={(e) => {
          e.preventDefault()
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
          const id = e.dataTransfer.getData('text/plain')
          if (id) state.planAt(id, 'strip')
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACCENT_GOLD }}>Planned today · no specific time</span>
          <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>drag anything here to "get to today"</span>
        </div>
        {plannedStripTasks.length === 0 ? (
          <div style={{ padding: '10px 4px', fontSize: 12, color: INK_DIM, fontStyle: 'italic', textAlign: 'center' }}>
            Empty — drag a task here to plan it without a time slot
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {plannedStripTasks.map((t) => (
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
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <DropZone slot="strip" label="drop a task above to plan it for later today" onDropTask={onDropTask} />
      </div>
    </section>
  )
}
