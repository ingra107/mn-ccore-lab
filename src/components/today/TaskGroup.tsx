// TaskGroup — header (icon + label + n/total + extending rule) + sorted rows.
// Group sort: planned → active → done (CLAUDE.md Rule 62).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Group).

import { useMemo, useState, useCallback } from 'react'
import { TaskRow } from './TaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import { GROUP_META, INK_DIM, PANEL_BG, withAlpha, isTaskDone, type GroupKey } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

// expandedId/onExpand no longer come from TodayPage — TaskGroup owns its own
// expand state so clicking a row here never expands the same task in Timeline
// or PlannedTodaySection (Item 2 fix, 2026-06-22).
export function TaskGroup({ gkey, tasks, projectsByPid, state, previewLimit = 5 }: { gkey: GroupKey; tasks: TaskRowData[]; projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>; state: TodayStateApi; previewLimit?: number }) {
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
  // Session-only collapse, per-instance — one TaskGroup per gkey, so each
  // group's open state is naturally independent. Starts expanded (Nick's
  // ask, no localStorage persistence).
  const [open, setOpen] = useState(true)

  // #106: roll up to previewLimit rows by default. Nick: "only show up to 3-5
  // rows or something and then you can expand but the default should be that
  // its rolled up somehow."
  //
  // This is a SEPARATE affordance from the collapse chevron above: the chevron
  // hides the whole group, this bounds how much of an OPEN group you see. The
  // rail cards' "+N more →" is a third thing again — it navigates to another
  // page, whereas these rows are work you do here, so reveal is inline.
  //
  // Slices `sorted`, never `tasks`: planned → active → done is settled ordering
  // (Rule 62), and slicing the raw array would bury planned work under whatever
  // order the API happened to return.
  const [showAll, setShowAll] = useState(false)
  // One memoized slice, shared by the render and the collapse handler — they
  // need the same set, and recomputing it in two places invites them to drift.
  const preview = useMemo(() => sorted.slice(0, previewLimit), [sorted, previewLimit])
  const visible = showAll ? sorted : preview
  const hiddenCount = sorted.length - visible.length

  // Collapsing must not strand the expanded drawer on a row that just left the
  // list — the drawer would keep rendering with no visible parent row.
  const collapseRows = useCallback(() => {
    setShowAll(false)
    setExpandedId((id) => (id && !preview.some((t) => t.id === id) ? null : id))
  }, [preview])

  if (tasks.length === 0) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        {...collapseToggleProps(open, () => setOpen((o) => !o), meta.label)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '0 2px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--task-ink)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>{meta.label}</h4>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{tasks.length}</span>
        <div style={{ flex: 1, height: 1, background: withAlpha(meta.color, 13), marginLeft: 4 }} />
        <CollapseChevron open={open} color={meta.color} />
      </div>
      {open && (
        <div style={{ background: PANEL_BG, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          {visible.map((t) => (
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
          {(hiddenCount > 0 || showAll) && (
            <button
              onClick={showAll ? collapseRows : () => setShowAll(true)}
              aria-expanded={showAll}
              style={{
                display: 'block',
                width: '100%',
                background: 'none',
                border: 'none',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                color: INK_DIM,
                fontSize: 11,
                cursor: 'pointer',
                padding: '7px 14px',
                textAlign: 'left',
                letterSpacing: '0.02em',
              }}
            >
              {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
