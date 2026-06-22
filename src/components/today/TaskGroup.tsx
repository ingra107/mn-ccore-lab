// TaskGroup — header (icon + label + n/total + extending rule) + sorted rows.
// Group sort: planned → active → done (CLAUDE.md Rule 62).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Group).

import { useMemo, useState, useCallback } from 'react'
import { TaskRow } from './TaskRow'
import { GROUP_META, INK_DIM, PANEL_BG, withAlpha, isTaskDone, type GroupKey } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

// expandedId/onExpand no longer come from TodayPage — TaskGroup owns its own
// expand state so clicking a row here never expands the same task in Timeline
// or PlannedTodaySection (Item 2 fix, 2026-06-22).
export function TaskGroup({ gkey, tasks, projectsByPid, state }: { gkey: GroupKey; tasks: TaskRowData[]; projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>; state: TodayStateApi }) {
  const meta = GROUP_META[gkey]
  const doneCount = tasks.filter((t) => state.done[t.id] || isTaskDone(t)).length
  const sorted = useMemo(() => {
    const planned = tasks.filter((t) => state.planned[t.id] && !state.done[t.id])
    const active = tasks.filter((t) => !state.planned[t.id] && !state.done[t.id])
    const done = tasks.filter((t) => state.done[t.id])
    return [...planned, ...active, ...done]
  }, [tasks, state.planned, state.done])

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])

  if (tasks.length === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '0 2px' }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--task-ink)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>{meta.label}</h4>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{tasks.length}</span>
        <div style={{ flex: 1, height: 1, background: withAlpha(meta.color, 13), marginLeft: 4 }} />
      </div>
      <div style={{ background: PANEL_BG, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
        {sorted.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
            state={state}
            expandedId={expandedId}
            onExpand={onExpand}
            projectsByPid={projectsByPid}
          />
        ))}
      </div>
    </div>
  )
}
