// LanesView — stacked-section renderer. Focus one group, peek at others
// (collapse to peek shows first 4 rows; "+N more" reveals all). Click a
// row body → inline detail slides in below the row (CD spec).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (LanesView + LaneRow).

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../constants/paths'
import { Chip } from '../primitives'
import { InlineDetail } from '../components/InlineDetail'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_ORANGE, ACCENT_CORAL,
  INK, INK_MUTED, INK_DIM,
  PRIORITY_COLOR, PRIORITY_SHORT,
  todayKey, daysSince, dueLabel, dueColor, withAlpha,
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

export function LanesView({ byGroup, selected, toggleSelect, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching lane.
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => readSet(LS_COLLAPSED))
  const [peek, setPeek] = useState<Set<GroupKey>>(() => readSet(LS_PEEK))
  useEffect(() => { writeSet(LS_COLLAPSED, collapsed) }, [collapsed])
  useEffect(() => { writeSet(LS_PEEK, peek) }, [peek])
  const toggleC = (k: GroupKey) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const toggleP = (k: GroupKey) => setPeek((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

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
              <div style={{ padding: '8px 14px 12px' }}>
                {visible.length === 0 && (
                  <div style={{ padding: '12px 4px', fontSize: 12, color: INK_DIM, fontStyle: 'italic' }}>nothing here</div>
                )}
                {visible.map((t) => (
                  <LaneRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                    expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    planned={plannedSet.has(t.id)}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    onClick={() => toggleP(gkey)}
                    style={{ marginTop: 6, padding: '6px 10px', fontSize: 11.5, fontWeight: 500, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4, background: 'transparent', color: INK_DIM, fontFamily: 'inherit', cursor: 'pointer', width: '100%', textAlign: 'center' }}
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

function LaneRow({ task, project, selected, onSelect, expanded, onExpand, planned }: { task: TaskRow; project: { name: string; slug: string } | null; selected: boolean; onSelect: () => void; expanded: boolean; onExpand: () => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div>
      <div
        onClick={(e) => { if ((e.target as HTMLElement).dataset.stop) return; onExpand() }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 4, background: selected ? withAlpha(meta.color, 8) : expanded ? 'rgba(255,255,255,0.03)' : 'transparent', borderLeft: `2px solid ${planned ? ACCENT_GOLD : withAlpha(meta.color, 19)}`, opacity: isCompleted ? 0.5 : 1, cursor: 'pointer', transition: 'background 120ms' }}
      >
        <input type="checkbox" checked={selected} onChange={onSelect} onClick={(e) => e.stopPropagation()} data-stop="1" style={{ accentColor: meta.color, cursor: 'pointer' }} />
        <span style={{ fontSize: 12, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{task.title}</span>
          {project && (
            <Link to={PATHS.project(project.slug)} onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: INK_DIM, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 160px' }}>{project.name}</Link>
          )}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {task.group_override && (
            <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 9, color: ACCENT_TEAL, padding: '1px 4px', background: 'rgba(92,188,180,0.10)', borderRadius: 3 }}>📍</span>
          )}
          {planned && <Chip color={ACCENT_GOLD} filled>📌 today</Chip>}
          {task.status === 'waiting_external' && <Chip color={ACCENT_ORANGE} filled>⏳ waiting</Chip>}
          {stale > 0 && <Chip color={ACCENT_ORANGE}>{stale}d stale</Chip>}
          {overdueDays > 0 && <Chip color={ACCENT_CORAL} filled>{overdueDays}d late</Chip>}
          {task.due_date && <span style={{ fontSize: 11, color: dueCol, minWidth: 56, textAlign: 'right' }}>{dueText}</span>}
          <Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip>
          <span style={{ fontSize: 10, color: INK_DIM, marginLeft: 2, width: 10 }}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ paddingLeft: 30, paddingRight: 8, marginBottom: 4 }}>
          <InlineDetail task={task} projectName={project?.name} />
        </div>
      )}
    </div>
  )
}
