// ListView — power-mode dense table renderer. j/k cursor nav, e/Enter open
// right-side drawer, x/Space toggle select. Drawer instead of inline expand
// because j/k navigation in a dense table can't push rows down without
// disorienting the user (CD spec / CLAUDE.md Rule 60).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (ListView + ListRow).

import { useEffect, useRef } from 'react'
import { Chip, LinksBar } from '../primitives'
import { useListKeyboard } from '../hooks/useListKeyboard'
import {
  GROUP_META,
  ACCENT_GOLD, ACCENT_ORANGE, ACCENT_CORAL, ACCENT_TEAL,
  INK, INK_MUTED, INK_DIM, PAGE_BG,
  STATUS_LABEL, STATUS_COLOR, PRIORITY_COLOR, PRIORITY_SHORT,
  todayKey, daysSince, dueLabel, dueColor,
  type GroupKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

export function ListView({ filtered, selected, toggleSelect, setSelected, setDrawer, projectsByPid, plannedSet }: { filtered: TaskRow[]; selected: Set<string>; toggleSelect: (id: string) => void; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; setDrawer: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string> }) {
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const { cursor, setCursor } = useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected })

  useEffect(() => { rowRefs.current[cursor]?.scrollIntoView({ block: 'nearest' }) }, [cursor])

  const kbdStyle = { fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 9, padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 2, color: INK_MUTED }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 76px 38px 80px 80px 70px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#5a6068', position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
          <div></div><div></div>
          <div>Title</div><div>Project</div><div>Due</div><div>P</div>
          <div>Status</div><div>Owner</div><div style={{ textAlign: 'right' }}>Links</div>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5a6068', fontSize: 13, fontStyle: 'italic' }}>no tasks match</div>
        )}
        {filtered.map((t, i) => (
          <ListRow
            key={t.id}
            task={t}
            project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
            isCursor={i === cursor}
            isSelected={selected.has(t.id)}
            onClick={() => setCursor(i)}
            onDouble={() => setDrawer(t.id)}
            onSelect={() => toggleSelect(t.id)}
            refSet={(el) => { rowRefs.current[i] = el }}
            planned={plannedSet.has(t.id)}
          />
        ))}
      </div>
      <div style={{ padding: '5px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', fontSize: 10, color: '#5a6068', display: 'flex', gap: 14, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', flexShrink: 0 }}>
        <span>{filtered.length > 0 ? `${cursor + 1}/${filtered.length}` : '0/0'}</span>
        <span style={{ flex: 1 }} />
        <span><kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> move</span>
        <span><kbd style={kbdStyle}>x</kbd> select</span>
        <span><kbd style={kbdStyle}>e</kbd>/<kbd style={kbdStyle}>⏎</kbd> drawer</span>
        <span><kbd style={kbdStyle}>esc</kbd> deselect</span>
      </div>
    </div>
  )
}

function ListRow({ task, project, isCursor, isSelected, onClick, onDouble, onSelect, refSet, planned }: { task: TaskRow; project: { name: string; slug: string } | null; isCursor: boolean; isSelected: boolean; onClick: () => void; onDouble: () => void; onSelect: () => void; refSet: (el: HTMLDivElement | null) => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div
      ref={refSet}
      onClick={onClick}
      onDoubleClick={onDouble}
      style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 76px 38px 80px 80px 70px', padding: '5px 16px', alignItems: 'center', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${isCursor ? meta.color : planned ? ACCENT_GOLD : 'transparent'}`, background: isCursor ? `${meta.color}12` : isSelected ? 'rgba(201,168,76,0.06)' : 'transparent', opacity: isCompleted ? 0.5 : 1, cursor: 'pointer' }}
    >
      <div style={{ color: meta.color, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{isCursor ? '▶' : ''}</div>
      <div><input type="checkbox" checked={isSelected} onChange={onSelect} onClick={(e) => e.stopPropagation()} style={{ accentColor: meta.color, cursor: 'pointer' }} /></div>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: 500, paddingRight: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color + '80', flexShrink: 0 }} />
        <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        {task.title}
        {task.group_override && <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 10, color: ACCENT_TEAL, flexShrink: 0 }}>📍</span>}
        {planned && <span style={{ fontSize: 9, color: ACCENT_GOLD, fontWeight: 700, letterSpacing: '0.1em' }}>PLANNED</span>}
        {overdueDays > 0 && <span style={{ fontSize: 9, color: ACCENT_CORAL, fontWeight: 700 }}>{overdueDays}d LATE</span>}
        {stale > 0 && <span style={{ fontSize: 9, color: ACCENT_ORANGE }}>{stale}d stale</span>}
      </div>
      <div style={{ fontSize: 11, color: INK_DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project?.name ?? '—'}</div>
      <div style={{ fontSize: 11, color: dueCol, fontWeight: 500 }}>{task.due_date ? dueText : '—'}</div>
      <div><Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip></div>
      <div style={{ fontSize: 10.5, color: STATUS_COLOR[task.status] ?? INK_DIM }}>{STATUS_LABEL[task.status] ?? task.status}</div>
      <div style={{ fontSize: 11, color: task.assignee?.toLowerCase().includes('nick') ? INK : ACCENT_TEAL, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.assignee}</div>
      <div style={{ textAlign: 'right' }}><LinksBar task={task} /></div>
    </div>
  )
}
