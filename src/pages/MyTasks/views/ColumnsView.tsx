// ColumnsView — Kanban renderer. All 5 task groups side-by-side, horizontal
// scroll on small viewports w/ visible thin scrollbar + right-edge fade.
// Click a card body → inline expand within the card (CD spec).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (ColumnsView + Card).

import { Link } from 'react-router-dom'
import { PATHS } from '../../../constants/paths'
import { Chip, LinksBar } from '../primitives'
import { InlineDetail } from '../components/InlineDetail'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_GOLD, ACCENT_ORANGE, ACCENT_CORAL,
  INK, INK_DIM, PAGE_BG,
  PRIORITY_COLOR, PRIORITY_SHORT,
  todayKey, daysSince, dueLabel, dueColor,
  type GroupKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

export function ColumnsView({ filtered, byGroup, selected, toggleSelect, expanded, setExpanded, projectsByPid, plannedSet }: { filtered: TaskRow[]; byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string> }) {
  // Mobile scroll cue — right-edge fade gradient + visible thin scrollbar so
  // users discover the 5 columns scroll horizontally on small viewports
  // (eval Issue 5).
  return (
    <div className="mt-columns-scroll" style={{ flex: 1, overflow: 'auto', padding: '12px 20px 20px', position: 'relative' }}>
      <style>{`
        .mt-columns-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .mt-columns-scroll::-webkit-scrollbar { height: 8px; }
        .mt-columns-scroll::-webkit-scrollbar-track { background: transparent; }
        .mt-columns-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
        @media (max-width: 1024px) {
          .mt-columns-scroll::after {
            content: '';
            position: sticky;
            top: 0; right: 0;
            float: right;
            width: 32px;
            height: 100%;
            margin-left: -32px;
            pointer-events: none;
            background: linear-gradient(to right, transparent, ${PAGE_BG} 80%);
            z-index: 2;
          }
        }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))', gap: 14, minWidth: 1400 }}>
        {GROUP_ORDER.map((gkey) => {
          const meta = GROUP_META[gkey]
          const tasks = byGroup[gkey]
          const incomplete = tasks.filter((t) => t.completed === 0 && t.status !== 'done').length
          return (
            <div key={gkey} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 8px', borderBottom: `1px solid ${meta.color}25`, marginBottom: 8, position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
                <span style={{ fontSize: 14 }}>{meta.icon}</span>
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color, margin: 0 }}>{meta.label}</h3>
                <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>
                  {incomplete}{tasks.length > incomplete && <span style={{ opacity: 0.5 }}> · {tasks.length - incomplete}✓</span>}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.length === 0 && (
                  <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: 11, color: '#5a6068', fontStyle: 'italic' }}>nothing here</div>
                )}
                {tasks.map((t) => (
                  <Card
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
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#5a6068', fontSize: 13, fontStyle: 'italic' }}>no tasks match</div>
      )}
    </div>
  )
}

function Card({ task, project, selected, onSelect, expanded, onExpand, planned }: { task: TaskRow; project: { name: string; slug: string } | null; selected: boolean; onSelect: () => void; expanded: boolean; onExpand: () => void; planned: boolean }) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  const today = todayKey()
  const overdueDays = task.due_date && task.due_date.slice(0, 10) < today ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= 10 && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const dueText = dueLabel(task.due_date)
  const dueCol = dueColor(task)
  const isCompleted = task.completed === 1 || task.status === 'done'

  return (
    <div
      onClick={(e) => { if ((e.target as HTMLElement).dataset.stop) return; onExpand() }}
      style={{
        background: selected ? `${meta.color}15` : isCompleted ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${selected ? meta.color + '55' : 'rgba(255,255,255,0.06)'}`,
        borderLeft: `2px solid ${planned ? ACCENT_GOLD : meta.color + '50'}`,
        borderRadius: 5, padding: '8px 10px', cursor: 'pointer', opacity: isCompleted ? 0.5 : 1, transition: 'background 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <input type="checkbox" checked={selected} onChange={onSelect} data-stop="1" onClick={(e) => e.stopPropagation()} style={{ marginTop: 2, accentColor: meta.color, cursor: 'pointer' }} />
        <span style={{ fontSize: 12, marginTop: 1, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.35, color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.title}</div>
        {task.group_override && (
          <span title={`Moved here manually (override: ${task.group_override})`} style={{ fontSize: 9, color: '#5cbcb4', padding: '1px 4px', background: 'rgba(92,188,180,0.10)', borderRadius: 3, letterSpacing: '0.04em', flexShrink: 0 }}>📍</span>
        )}
        <Chip color={PRIORITY_COLOR[task.priority] ?? INK_DIM}>{PRIORITY_SHORT[task.priority] ?? task.priority}</Chip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: INK_DIM, paddingLeft: 22, flexWrap: 'wrap' }}>
        {project && (
          <Link to={PATHS.project(project.slug)} onClick={(e) => e.stopPropagation()} style={{ color: INK_DIM, textDecoration: 'none', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.name}>{project.name}</Link>
        )}
        {task.due_date && <><span style={{ opacity: 0.4 }}>·</span><span style={{ color: dueCol, fontWeight: 500 }}>{dueText}</span></>}
        {planned && <Chip color={ACCENT_GOLD} filled>📌 today</Chip>}
        {task.status === 'waiting_external' && <Chip color={ACCENT_ORANGE} filled>⏳ waiting</Chip>}
        {stale > 0 && <Chip color={ACCENT_ORANGE}>{stale}d stale</Chip>}
        {overdueDays > 0 && <Chip color={ACCENT_CORAL} filled>{overdueDays}d late</Chip>}
        <span style={{ flex: 1 }} />
        <LinksBar task={task} />
      </div>
      {expanded && <InlineDetail task={task} projectName={project?.name} />}
    </div>
  )
}
