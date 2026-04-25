// TaskDetailDrawer — inline expand drawer for tasks on TodayPage.
// Shown when the user clicks a task row body (CD spec: "click expands, doesn't
// promote"). Action bar with ▶ Work / 📌 Plan / Move → / Unplan; Why callout;
// Subtasks + Blocks (left); Recent updates (right); SmartCompose chat at bottom.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_TaskDetail). Same Move→
// popover wiring as UnifiedMyTasks InlineDetail (writes group_override on tasks).

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTaskDetail } from '../../hooks/useApiData'
import ReactionBar from '../ReactionBar'
import SmartCompose from '../SmartCompose'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { LinkRow } from './primitives'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM, PAGE_BG, PANEL_BG,
  TODAY_MOVE_OPTIONS, type LinkKind,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

export function TaskDetailDrawer({ task, project, state }: { task: TaskRow; project: { name: string; slug: string } | null; state: TodayStateApi }) {
  const isPlanned = !!state.planned[task.id]
  const isNow = state.rightNow === task.id
  const detailQuery = useTaskDetail(task.id)
  const detail = detailQuery.data
  // Why: prefer server-derived first paragraph, fall back to local cut.
  const why = detail?.why ?? task.description?.split('\n')[0]?.trim() ?? null
  const linkSet: LinkKind[] = []
  if (task.key_link_1) linkSet.push('folder')
  if (task.key_link_2) linkSet.push('claude')
  if (task.key_link_3) linkSet.push('brief')
  const subtasks = detail?.subtasks ?? []
  const updates = detail?.updates ?? []
  const blocks = detail?.blocks ?? []

  // Move → popover wiring (parity with UnifiedMyTasks).
  const updateTask = useUpdateTask()
  const undoToast = useUndoToast()
  const [moveOpen, setMoveOpen] = useState(false)
  const moveRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moveOpen) return
    const close = (e: MouseEvent) => { if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moveOpen])
  const moveToGroup = useCallback((opt: typeof TODAY_MOVE_OPTIONS[number]) => {
    updateTask.mutate({ id: task.id, fields: { group_override: opt.key } }, {
      onSuccess: () => { undoToast.showSuccess(`Moved to ${opt.label}`); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])
  const resetGroup = useCallback(() => {
    updateTask.mutate({ id: task.id, fields: { group_override: null } }, {
      onSuccess: () => { undoToast.showSuccess('Reset to auto-classify'); setMoveOpen(false) },
    })
  }, [task.id, updateTask, undoToast])

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ padding: '14px 16px 16px', background: 'rgba(0,0,0,0.20)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {!isNow && (
          <button onClick={() => state.promote(task.id)} style={{ padding: '6px 12px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>▶ Work on this now</button>
        )}
        {!isPlanned && !isNow && (
          <button onClick={() => state.planAt(task.id, 'strip')} style={{ padding: '6px 12px', background: 'rgba(201,168,76,0.08)', color: ACCENT_GOLD, border: '1px solid rgba(201,168,76,0.30)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>📌 Plan for today</button>
        )}
        {isPlanned && !isNow && (
          <button onClick={() => state.unplan(task.id)} style={{ padding: '6px 12px', background: 'transparent', color: INK_MUTED, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Unplan</button>
        )}
        <div ref={moveRef} style={{ position: 'relative' }}>
          <button onClick={() => setMoveOpen((o) => !o)} title="Move to a different group (writes group_override)" style={{ padding: '6px 12px', background: moveOpen ? 'rgba(92,188,180,0.20)' : 'transparent', color: moveOpen ? '#5cbcb4' : INK, border: `1px solid ${moveOpen ? '#5cbcb4' : 'rgba(255,255,255,0.14)'}`, borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>Move →</button>
          {moveOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200, background: PANEL_BG, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, zIndex: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
              {TODAY_MOVE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => moveToGroup(opt)}
                  disabled={updateTask.isPending}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 11, background: task.group_override === opt.key ? 'rgba(92,188,180,0.15)' : 'transparent', border: 'none', color: task.group_override === opt.key ? '#5cbcb4' : INK, fontFamily: 'inherit', cursor: updateTask.isPending ? 'wait' : 'pointer' }}
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
        <LinkRow links={linkSet} />
        {project && <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_DIM }}>{project.name}</span>}
      </div>
      {why && (
        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(201,168,76,0.04)', borderLeft: '2px solid rgba(201,168,76,0.30)', borderRadius: 3 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_GOLD, marginBottom: 4 }}>Why this matters</div>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.55 }}>{why}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Subtasks</div>
          {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
          {!detailQuery.isLoading && subtasks.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>None yet.</div>}
          {subtasks.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 6, padding: '3px 0', alignItems: 'flex-start' }}>
              <input type="checkbox" defaultChecked={s.completed === 1} style={{ marginTop: 2, accentColor: ACCENT_GREEN, cursor: 'pointer' }} />
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
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: INK_DIM, marginBottom: 6 }}>Recent updates</div>
          {detailQuery.isLoading && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>Loading…</div>}
          {!detailQuery.isLoading && updates.length === 0 && <div style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>No updates logged.</div>}
          {updates.slice(0, 8).map((u, i) => {
            const isHermes = u.who === 'claude-ai' || u.who === 'hermes'
            const isMe = u.who === 'nick-ingraham' || u.who === 'nick'
            const color = isHermes ? ACCENT_GOLD : isMe ? ACCENT_TEAL : INK_MUTED
            return (
              <div key={u.id ?? i} style={{ padding: '6px 0', borderBottom: i < updates.length - 1 && i < 7 ? '1px dashed rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '0.04em' }}>{isHermes ? 'Hermes' : u.who}</span>
                  <span style={{ fontSize: 10, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{u.when?.slice(0, 16) ?? ''}</span>
                </div>
                <div style={{ fontSize: 12, color: INK, lineHeight: 1.45 }}>{u.text}</div>
                {u.kind === 'note' && u.id && (
                  <div style={{ marginTop: 4 }}>
                    <ReactionBar targetType="task_update" targetId={u.id} compact />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <SmartCompose taskId={task.id} placeholder="Add a note, or @hermes for AI…" />
    </div>
  )
}
