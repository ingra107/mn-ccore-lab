// Timeline — meetings + drop zones + planned strip.
// Renders today's chronologically-ordered meetings interleaved with drop
// zones that accept dragged tasks (between-N slot). Bottom strip = "no
// specific time" planned tasks. Sticky "Restore N hidden" link above the
// list when meetings have been dismissed.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Timeline + DropZone).

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { EventRow } from './MeetingRow'
import { PlannedTaskRow } from './PlannedTaskRow'
import {
  ACCENT_GOLD, ACCENT_TEAL, INK_MUTED, INK_DIM,
  type PlannedSlot, type TodayEvent,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

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
  const visibleMeetings = events.filter((e) => !dismissedMeetings[e.id])
  const onDropTask = useCallback((id: string, slot: PlannedSlot) => state.planAt(id, slot), [state])

  const plannedStripIds = state.plannedIds().filter((id) => state.planned[id]?.slot === 'strip' && id !== state.rightNow)
  const plannedStripTasks = plannedStripIds.map((id) => tasks.find((t) => t.id === id)).filter((t): t is TaskRow => !!t)

  return (
    <section data-b2-timeline style={{ marginBottom: 24 }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visibleMeetings.map((e, idx) => {
          // Gather planned tasks dropped into the gap BEFORE this meeting.
          const slotKey = `between-${idx}` as PlannedSlot
          const tasksInGap = state.plannedIds()
            .filter((id) => state.planned[id]?.slot === slotKey)
            .map((id) => tasks.find((t) => t.id === id))
            .filter((t): t is TaskRow => !!t)
          return (
            <div key={e.id}>
              <DropZone slot={slotKey} label={`drop a task here · before ${e.title}`} onDropTask={onDropTask} />
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
              <EventRow
                e={e}
                onDismiss={(id) => setDismissedMeetings((s) => ({ ...s, [id]: true }))}
                note={meetingNotes[e.id]}
                onNote={(id, v) => setMeetingNotes((s) => ({ ...s, [id]: v }))}
              />
            </div>
          )
        })}
        {visibleMeetings.length > 0 && (() => {
          const slotKey = `between-${visibleMeetings.length}` as PlannedSlot
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
