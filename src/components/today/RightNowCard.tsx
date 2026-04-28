// RightNow — promoted slot hero card.
// Compact horizontal pill with task title + ▶ Work / ✓ Done / link icons +
// queue strip beneath (all OTHER planned tasks as swap pills).
// CD spec: clicking a queue pill swaps Right Now to that task.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_RightNow). Top-level export
// is RightNow (matching original) — file is RightNowCard.tsx per HANDOFF §2.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { LinkRow } from './primitives'
import { ACCENT_GOLD, INK, INK_MUTED, INK_DIM, PAGE_BG, type LinkKind } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import SmartCompose from '../SmartCompose'

export function RightNow({ task, project, queueTasks, state }: { task: TaskRow | null; project: { name: string; slug: string } | null; queueTasks: Array<{ id: string; title: string }>; state: TodayStateApi }) {
  const [expanded, setExpanded] = useState(false)
  if (!task) {
    return (
      <div style={{ padding: '16px 20px', marginBottom: 20, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_DIM, marginRight: 10 }}>Right now · empty</span>
        <span style={{ fontSize: 13, color: INK_MUTED }}>No planned tasks. Drag ⋮⋮ up or click a task to promote.</span>
      </div>
    )
  }
  // Build LinkRow set from task's key_link fields (CD spec — hero shows links inline).
  const heroLinks: LinkKind[] = []
  if (task.key_link_1) heroLinks.push('folder')
  if (task.key_link_2) heroLinks.push('claude')
  if (task.key_link_3) heroLinks.push('brief')

  return (
    <div style={{ marginBottom: 20, background: 'linear-gradient(90deg, rgba(201,168,76,0.12), rgba(201,168,76,0.02))', border: '1px solid rgba(201,168,76,0.28)', borderLeft: `3px solid ${ACCENT_GOLD}`, borderRadius: 8, boxShadow: '0 0 24px rgba(201,168,76,0.06)' }}>
      <div style={{ display: 'flex', gap: 14, padding: '12px 18px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT_GOLD, boxShadow: `0 0 8px ${ACCENT_GOLD}`, animation: 'b2pulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ACCENT_GOLD, flexShrink: 0 }}>Right now</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', flex: 1, minWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
        {project && (
          <Link to={PATHS.project(project.slug)} style={{ fontSize: 11, color: ACCENT_GOLD, fontWeight: 500, flexShrink: 0, textDecoration: 'none' }}>{project.name}</Link>
        )}
        <button onClick={() => setExpanded(true)} title="Expand and focus chat" style={{ padding: '5px 10px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>▶ Work</button>
        <button onClick={() => state.markDone(task.id)} style={{ padding: '5px 10px', background: 'transparent', color: INK, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>✓ Done</button>
        <LinkRow links={heroLinks} />
        <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'} style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 12, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}>{expanded ? '▾' : '▸'}</button>
      </div>
      {queueTasks.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px 10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT_GOLD, opacity: 0.75 }}>Queue →</span>
          {queueTasks.map((q) => (
            <button
              key={q.id}
              onClick={() => state.promote(q.id)}
              style={{ padding: '3px 9px', background: 'rgba(201,168,76,0.06)', color: ACCENT_GOLD, border: '1px solid rgba(201,168,76,0.22)', borderRadius: 999, fontFamily: 'inherit', fontSize: 11, fontWeight: 500, cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              ↻ {q.title}
            </button>
          ))}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 18px 14px', borderTop: '1px dashed rgba(201,168,76,0.18)', paddingTop: 10 }}>
          {task.description && (
            <div style={{ fontSize: 12, color: INK_MUTED, marginBottom: 8, fontStyle: 'italic' }}>{task.description.split('\n')[0].slice(0, 280)}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <span style={{ fontSize: 12, color: ACCENT_GOLD, marginTop: 4 }}>💬</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SmartCompose
                taskId={task.id}
                placeholder="Chat with Claude about this task… (@hermes for AI)"
                theme="dark"
                bare
                rows={1}
                autoFocus
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
