// TaskDrawer — right-side drawer used by List view only (CD spec — dense
// table needs cursor-stable nav, j/k can't push rows). Same Move popover +
// Work / Plan today + meta + subtasks + recent updates + SmartCompose as
// InlineDetail, but as a fixed-width side panel.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PATHS } from '../../../constants/paths'
import { useTaskDetail } from '../../../hooks/useApiData'
import ReactionBar from '../../../components/ReactionBar'
import SmartCompose from '../../../components/SmartCompose'
import { useUpdateTask, useToggleSubtask } from '../../../hooks/useMutations'
import { useUndoToast } from '../../../components/UndoToast'
import { Chip } from '../primitives'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  STATUS_LABEL, STATUS_COLOR, PRIORITY_COLOR, PRIORITY_SHORT,
  GROUP_META, MOVE_OPTIONS,
  dueColor, readTodayState, writeTodayState,
  type GroupKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

function Term({ children }: { children: React.ReactNode }) {
  return <dt style={{ color: '#5a6068', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 9 }}>{children}</dt>
}
function Defn({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <dd style={{ margin: 0, ...style }}>{children}</dd>
}

export function TaskDrawer({ task, project, onClose }: { task: TaskRow; project: { name: string; slug: string } | null; onClose: () => void }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  const why = detail?.why ?? task.description?.split('\n')[0]?.trim() ?? null
  const subtasks = detail?.subtasks ?? []
  const updates = detail?.updates ?? []
  const blocks = detail?.blocks ?? []

  // Wire ▶ Work / 📌 Plan today to today_state localStorage (TodayPage picks up).
  const undoToast = useUndoToast()
  const updateTask = useUpdateTask()

  // Subtask toggle — MT-03. Drawer's subtasks come from useTaskDetail
  // (`['task-detail', taskId]`); useToggleSubtask invalidates only
  // `['subtasks', taskId]`, so add an onSettled to invalidate task-detail.
  const toggleSubtask = useToggleSubtask(task.id)
  const queryClient = useQueryClient()
  const snap = readTodayState()
  const isPromoted = snap.rightNow === task.id
  const isPlanned = !!snap.planned?.[task.id]
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moveOpen) return
    const close = (e: MouseEvent) => { if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moveOpen])

  const moveToGroup = useCallback((opt: typeof MOVE_OPTIONS[number]) => {
    updateTask.mutate({ id: task.id, fields: { group_override: opt.key } }, {
      onSuccess: () => { undoToast.showSuccess(`Moved to ${opt.label}`); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])
  const resetGroup = useCallback(() => {
    updateTask.mutate({ id: task.id, fields: { group_override: null } }, {
      onSuccess: () => { undoToast.showSuccess('Reset to auto-classify'); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])

  const promote = useCallback(() => {
    const s = readTodayState()
    s.rightNow = task.id
    s.planned = s.planned ?? {}
    if (!s.planned[task.id]) s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Promoted to Right Now on Today')
  }, [task.id, undoToast])

  const planToday = useCallback(() => {
    const s = readTodayState()
    s.planned = s.planned ?? {}
    s.planned[task.id] = { slot: 'strip' }
    writeTodayState(s)
    undoToast.showSuccess('Planned for today')
  }, [task.id, undoToast])

  return (
    <aside style={{ width: 380, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', background: '#0a0f15', overflowY: 'auto', padding: '18px 18px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color }}>{meta.label}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: INK_DIM, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 12px', lineHeight: 1.35, letterSpacing: '-0.01em' }}>{task.title}</h3>
      {why && (
        <div style={{ fontSize: 11.5, color: ACCENT_GOLD, marginBottom: 14, fontStyle: 'italic', padding: '9px 12px', background: 'rgba(201,168,76,0.05)', borderLeft: `2px solid ${ACCENT_GOLD}`, borderRadius: 3 }}>
          💡 {why}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, position: 'relative' }}>
        {!isPromoted && (
          <button onClick={promote} title="Promote to Right Now on Today" style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 4, border: `1px solid ${ACCENT_GOLD}`, background: ACCENT_GOLD, color: PAGE_BG, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>▶ Work on this</button>
        )}
        {!isPlanned && (
          <button onClick={planToday} title="Add to today's planned strip" style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: INK, fontFamily: 'inherit', cursor: 'pointer' }}>📌 Plan today</button>
        )}
        {isPromoted && (
          <span style={{ padding: '5px 12px', fontSize: 11.5, color: ACCENT_GOLD, fontStyle: 'italic' }}>▶ Already in Right Now</span>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (changes priority to match)" style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 4, border: `1px solid ${moveOpen ? ACCENT_TEAL : 'rgba(255,255,255,0.15)'}`, background: moveOpen ? ACCENT_TEAL + '20' : 'transparent', color: moveOpen ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: 'pointer' }}>Move →</button>
          {moveOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {MOVE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => moveToGroup(opt)}
                  disabled={updateTask.isPending}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: task.group_override === opt.key ? 'rgba(92,188,180,0.15)' : 'transparent', border: 'none', color: task.group_override === opt.key ? ACCENT_TEAL : INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}
                >{opt.label}{task.group_override === opt.key ? ' ✓' : ''}</button>
              ))}
              {task.group_override && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <button
                    onClick={resetGroup}
                    disabled={updateTask.isPending}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: 'transparent', border: 'none', color: INK_DIM, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer', fontStyle: 'italic' }}
                  >↺ Reset to auto-classify</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <dl style={{ fontSize: 11, color: INK_MUTED, margin: 0, display: 'grid', gridTemplateColumns: '80px 1fr', rowGap: 8, columnGap: 8 }}>
        <Term>Project</Term><Defn>{project ? <Link to={PATHS.project(project.slug)} style={{ color: ACCENT_TEAL, textDecoration: 'none' }}>{project.name}</Link> : '—'}</Defn>
        <Term>Due</Term><Defn style={{ color: dueColor(task) }}>{task.due_date ?? '—'}</Defn>
        <Term>Priority</Term><Defn><Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip></Defn>
        <Term>Status</Term><Defn style={{ color: STATUS_COLOR[task.status] ?? INK_DIM }}>{STATUS_LABEL[task.status] ?? task.status}</Defn>
        <Term>Owner</Term><Defn>{task.assignee}</Defn>
        <Term>Updated</Term><Defn>{task.updated_at?.slice(0, 10) ?? '—'}</Defn>
      </dl>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Subtasks</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && subtasks.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None yet.</div>}
        {subtasks.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, padding: '3px 0', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={s.completed === 1}
              onChange={() => toggleSubtask.mutate(s.id, {
                onSettled: () => queryClient.invalidateQueries({ queryKey: ['task-detail', task.id] }),
              })}
              style={{ marginTop: 2, accentColor: ACCENT_GREEN, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: s.completed === 1 ? INK_DIM : INK, textDecoration: s.completed === 1 ? 'line-through' : 'none', lineHeight: 1.4 }}>{s.title}</span>
          </div>
        ))}
        {blocks.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_ORANGE, marginBottom: 4 }}>Blocks</div>
            {blocks.map((b) => (
              <div key={b.id} style={{ fontSize: 11, color: INK, padding: '2px 0' }}>↳ {b.title}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Recent updates</div>
        {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
        {!detailQuery.isLoading && updates.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No updates logged.</div>}
        {updates.slice(0, 6).map((u, i) => {
          const isHermes = u.who === 'claude-ai' || u.who === 'hermes'
          const isMe = u.who === 'nick-ingraham' || u.who === 'nick'
          const color = isHermes ? ACCENT_GOLD : isMe ? ACCENT_TEAL : INK_MUTED
          return (
            <div key={u.id ?? i} style={{ padding: '6px 0', borderBottom: i < updates.length - 1 && i < 5 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '0.04em' }}>{isHermes ? 'Hermes' : u.who}</span>
                <span style={{ fontSize: 10, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{u.when?.slice(0, 16) ?? ''}</span>
              </div>
              <div style={{ fontSize: 11.5, color: INK, lineHeight: 1.45 }}>{u.text}</div>
              {u.kind === 'note' && u.id && (
                <div style={{ marginTop: 4 }}>
                  <ReactionBar targetType="task_update" targetId={u.id} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <SmartCompose taskId={task.id} placeholder="Jot something or @hermes to delegate…" boxed />
    </aside>
  )
}
