// LanesView — stacked-section renderer. Focus one group, peek at others
// (collapse to peek shows first 4 rows; "+N more" reveals all). Each lane is
// its own soft box on the flat page (the chosen "My Tasks Before and After"
// look, handoff §5). Rows use the shared <TaskRow> via MyTasksRow — square =
// complete, shift-click / long-press = select, body click = inline detail
// below the row.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (LanesView + LaneRow).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip } from '../primitives'
import { MyTasksRow } from './ColumnsView'
import { useSelectMode } from '../../../hooks/useSelectMode'
import { OverdueBanner } from './OverdueBanner'
import { LaneEmpty } from './MyTasksEmpty'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_GOLD, ACCENT_CORAL,
  INK_MUTED, INK_DIM,
  withAlpha, isTaskDone,
  type GroupKey,
} from '../constants'
import { isOverdue } from '../../../lib/dateUtils'
import type { TaskRow } from '../../../lib/api'

// MT-17 — persist lane collapsed/peek state to localStorage so reload
// remembers what was open. Stored as two arrays keyed by GroupKey.
const LS_COLLAPSED = 'mt_lane_collapsed'
const LS_PEEK = 'mt_lane_peek'
function readSet(key: string): Set<GroupKey> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as GroupKey[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function writeSet(key: string, s: Set<GroupKey>) {
  try { window.localStorage.setItem(key, JSON.stringify([...s])) } catch { /* ignore */ }
}

export function LanesView({ byGroup, selected, toggleSelect, selectRange, anchorId, onToggleComplete, onOpenEditor, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void; anchorId: string | null; onToggleComplete: (task: TaskRow) => void; onOpenEditor: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching lane.
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => readSet(LS_COLLAPSED))
  const [peek, setPeek] = useState<Set<GroupKey>>(() => readSet(LS_PEEK))
  useEffect(() => { writeSet(LS_COLLAPSED, collapsed) }, [collapsed])
  useEffect(() => { writeSet(LS_PEEK, peek) }, [peek])
  const toggleC = (k: GroupKey) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleP = (k: GroupKey) => setPeek((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Phase G: Ctrl/Meta held → select-mode affordance on rows.
  const selectModeActive = useSelectMode(true)
  const selectionActive = selectModeActive || selected.size > 0

  // Track last pointer-event modifiers (capture phase) so onSelect can
  // route shift→range vs ctrl/plain→toggle without an event arg.
  const lastModifiers = useRef({ shift: false, ctrlMeta: false })
  // P1-12 banner needs the flat task set across all visible lanes.
  const allTasks = useMemo(() => visibleGroups.flatMap((g) => byGroup[g]), [visibleGroups, byGroup])

  return (
    // P1-1 (Nick 2026-06-10): outer scroll fills the surface; .mt-band centers
    // on --content-band (matching the data pages); the inner --col-main block is
    // left-anchored within the band so the primary column's left edge equals
    // Projects + the other two views + Today. The 1100px literal is gone.
    <div
      className="fab-clear"
      style={{ flex: 1, overflow: 'auto', paddingTop: 12, paddingBottom: 40 }}
      onClickCapture={(e) => {
        lastModifiers.current = { shift: e.shiftKey, ctrlMeta: e.ctrlKey || e.metaKey }
      }}
      // Issue 2: prevent text-selection on modifier+mousedown across ALL lane rows.
      onMouseDownCapture={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
    >
     <div className="mt-band">
      <div style={{ maxWidth: 'var(--col-main)', width: '100%' }}>
      <OverdueBanner tasks={allTasks} />
      {visibleGroups.map((gkey) => {
        const meta = GROUP_META[gkey]
        const tasks = byGroup[gkey]
        const isCollapsed = collapsed.has(gkey)
        const isPeek = peek.has(gkey)
        const visible = isCollapsed ? [] : isPeek ? tasks : tasks.slice(0, 4)
        const hidden = tasks.length - visible.length
        // Rule 68: status-aware isOverdue(), never a hand-rolled date compare.
        const overdueInLane = tasks.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length
        const plannedInLane = tasks.filter((t) => plannedSet.has(t.id) && !isTaskDone(t)).length
        return (
          <section key={gkey} style={{ marginBottom: 18, overflow: 'hidden' }}>
            <button
              onClick={() => toggleC(gkey)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderBottom: isCollapsed ? 'none' : `1px solid ${withAlpha(meta.color, 15)}` }}
            >
              <span style={{ fontSize: 14, transition: 'transform 200ms', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', color: meta.color, width: 10 }}>▾</span>
              <span style={{ fontSize: 16 }}>{meta.icon}</span>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: meta.color, margin: 0, whiteSpace: 'nowrap' }}>{meta.label}</h3>
              {/* N1.20 — single-line description with ellipsis; on phones the
                  label and desc were double-wrapping into a 4-line header. */}
              <span style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic', marginLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>{meta.desc}</span>
              <div style={{ flex: 1 }} />
              {overdueInLane > 0 && <Chip color={ACCENT_CORAL} filled>{overdueInLane} overdue</Chip>}
              {plannedInLane > 0 && <Chip color={ACCENT_GOLD} filled>{plannedInLane} planned</Chip>}
              <span style={{ fontSize: 11, color: INK_MUTED, minWidth: 40, textAlign: 'right' }}>{tasks.length}</span>
            </button>
            {!isCollapsed && (
              <div>
                {visible.length === 0 && <LaneEmpty />}
                {visible.map((t) => (
                  <MyTasksRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    selectionActive={selectionActive}
                    onSelect={() => {
                      if (lastModifiers.current.shift) {
                        // Range within the visible slice of this lane
                        selectRange(t.id, visible.map(r => r.id), anchorId)
                      } else {
                        toggleSelect(t.id)
                      }
                    }}
                    onToggleComplete={() => onToggleComplete(t)}
                    onOpenEditor={() => onOpenEditor(t.id)}
                    expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    planned={plannedSet.has(t.id)}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    onClick={() => toggleP(gkey)}
                    style={{ margin: '6px 14px 12px', padding: '6px 10px', fontSize: 11.5, fontWeight: 500, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4, background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: 'pointer', width: 'calc(100% - 28px)', textAlign: 'center' }}
                  >{isPeek ? '▴ show less' : `▾ +${hidden} more`}</button>
                )}
              </div>
            )}
          </section>
        )
      })}
      </div>
     </div>
    </div>
  )
}
