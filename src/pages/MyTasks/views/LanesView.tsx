// LanesView — stacked-section renderer. Focus one group, peek at others
// (collapse to peek shows first 4 rows; "+N more" reveals all). Each lane is
// its own soft box on the flat page (the chosen "My Tasks Before and After"
// look, handoff §5). Rows use the shared <TaskRow> via MyTasksRow — square =
// complete, shift-click / long-press = select, body click = inline detail
// below the row.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (LanesView + LaneRow).

import { useEffect, useState } from 'react'
import { Chip } from '../primitives'
import { MyTasksRow } from './ColumnsView'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_GOLD, ACCENT_CORAL,
  INK_MUTED, INK_DIM,
  todayKey, withAlpha,
  type GroupKey,
} from '../constants'
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

export function LanesView({ byGroup, selected, toggleSelect, onToggleComplete, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; onToggleComplete: (task: TaskRow) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching lane.
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => readSet(LS_COLLAPSED))
  const [peek, setPeek] = useState<Set<GroupKey>>(() => readSet(LS_PEEK))
  useEffect(() => { writeSet(LS_COLLAPSED, collapsed) }, [collapsed])
  useEffect(() => { writeSet(LS_PEEK, peek) }, [peek])
  const toggleC = (k: GroupKey) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleP = (k: GroupKey) => setPeek((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const selectionActive = selected.size > 0

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px 28px 40px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {visibleGroups.map((gkey) => {
        const meta = GROUP_META[gkey]
        const tasks = byGroup[gkey]
        const isCollapsed = collapsed.has(gkey)
        const isPeek = peek.has(gkey)
        const visible = isCollapsed ? [] : isPeek ? tasks : tasks.slice(0, 4)
        const hidden = tasks.length - visible.length
        const today = todayKey()
        const overdueInLane = tasks.filter((t) => t.due_date && t.due_date.slice(0, 10) < today && t.completed === 0).length
        const plannedInLane = tasks.filter((t) => plannedSet.has(t.id) && t.completed === 0).length
        return (
          <section key={gkey} style={{ marginBottom: 18, background: 'rgba(255,255,255,0.015)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <button
              onClick={() => toggleC(gkey)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderBottom: isCollapsed ? 'none' : `1px solid ${withAlpha(meta.color, 15)}` }}
            >
              <span style={{ fontSize: 14, transition: 'transform 200ms', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0)', color: meta.color, width: 10 }}>▾</span>
              <span style={{ fontSize: 16 }}>{meta.icon}</span>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: meta.color, margin: 0 }}>{meta.label}</h3>
              <span style={{ fontSize: 11, color: INK_DIM, fontStyle: 'italic', marginLeft: 6 }}>{meta.desc}</span>
              <div style={{ flex: 1 }} />
              {overdueInLane > 0 && <Chip color={ACCENT_CORAL} filled>{overdueInLane} overdue</Chip>}
              {plannedInLane > 0 && <Chip color={ACCENT_GOLD} filled>{plannedInLane} planned</Chip>}
              <span style={{ fontSize: 11, color: INK_MUTED, minWidth: 40, textAlign: 'right' }}>{tasks.length}</span>
            </button>
            {!isCollapsed && (
              <div>
                {visible.length === 0 && (
                  <div style={{ padding: '12px 16px', fontSize: 12, color: INK_DIM, fontStyle: 'italic' }}>nothing here</div>
                )}
                {visible.map((t) => (
                  <MyTasksRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    selectionActive={selectionActive}
                    onSelect={() => toggleSelect(t.id)}
                    onToggleComplete={() => onToggleComplete(t)}
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
  )
}
