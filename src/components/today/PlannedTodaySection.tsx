// PlannedTodaySection — replaces the standalone RightNow card above the
// Timeline. Renders BELOW the Timeline in this order:
//   1. Section header + divider (clear visual boundary vs calendar strip)
//   2. Gold-highlighted "right-now" hero row: ▶ Work / ✓ Done / links /
//      expandable SmartCompose chat — identical affordances to RightNowCard.
//   3. Other planned (strip-slot) tasks as full PlannedTaskRow rows — clicking
//      one promotes it to right-now (state.promote(id)).
//   4. Empty state when nothing is planned.
//
// The queue-pill strip from RightNowCard is RETIRED here — replaced by the
// PlannedTaskRow list which gives more info (links, project, drag handle).
//
// The between-N slot tasks remain contextually inside <Timeline> drop zones
// where they belong. Only the "no specific time" strip tasks + rightNow appear
// here (same scope as the old strip inside Timeline).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useIsMobile } from '../../hooks/useIsMobile'
import { PlannedTaskRow } from './PlannedTaskRow'
import { LinkRow, type TaskLink } from './primitives'
import { ACCENT_GOLD, INK, INK_MUTED, INK_DIM, PAGE_BG, withAlpha } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import SmartCompose from '../SmartCompose'

interface PlannedTodaySectionProps {
  rightNowTask: TaskRow | null
  rightNowProject: { name: string; slug: string } | null
  stripTasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
}

export function PlannedTodaySection({
  rightNowTask,
  rightNowProject,
  stripTasks,
  state,
  projectsByPid,
  expandedId,
  onExpand,
}: PlannedTodaySectionProps) {
  const [chatExpanded, setChatExpanded] = useState(false)
  const isPhone = useIsMobile(768)

  const hasAnything = rightNowTask || stripTasks.length > 0

  // Build LinkRow set from the right-now task's key_link fields.
  const heroLinks: TaskLink[] = []
  if (rightNowTask) {
    if (rightNowTask.key_link_1) heroLinks.push({ url: rightNowTask.key_link_1, desc: rightNowTask.key_link_1_desc })
    if (rightNowTask.key_link_2) heroLinks.push({ url: rightNowTask.key_link_2, desc: rightNowTask.key_link_2_desc })
    if (rightNowTask.key_link_3) heroLinks.push({ url: rightNowTask.key_link_3, desc: rightNowTask.key_link_3_desc })
  }

  return (
    <section data-b2-planned-today style={{ marginBottom: 24 }}>
      {/* Section header — clear boundary between calendar and planned list */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>📋</span>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap' }}>Planned today</h3>
        <span className="today-section-hint" style={{ fontSize: 11, color: INK_DIM }}>▶ promote · ✓ done · × to unplan</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)', marginLeft: 4 }} />
      </div>

      {!hasAnything ? (
        /* Empty state — reusing the tone from the old RightNowCard empty branch */
        <div style={{ padding: '16px 20px', marginBottom: 4, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_DIM, marginRight: 10 }}>Nothing planned</span>
          <span style={{ fontSize: 13, color: INK_MUTED }}>Drag ⋮⋮ into the timeline or drop onto the strip to plan tasks for today.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* ── Right-now highlighted hero row ── */}
          {rightNowTask && (
            <div
              style={{
                background: `linear-gradient(90deg, ${withAlpha(ACCENT_GOLD, 12)}, ${withAlpha(ACCENT_GOLD, 2)})`,
                border: `1px solid ${withAlpha(ACCENT_GOLD, 28)}`,
                borderLeft: `3px solid ${ACCENT_GOLD}`,
                borderRadius: 'var(--radius-lg)',
                boxShadow: `0 0 24px ${withAlpha(ACCENT_GOLD, 6)}`,
              }}
            >
              <div style={{ display: 'flex', gap: 14, padding: '12px 18px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Pulsing now-dot */}
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: ACCENT_GOLD, boxShadow: `0 0 8px ${ACCENT_GOLD}`,
                    animation: 'b2pulse 1.6s ease-in-out infinite', flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ACCENT_GOLD, flexShrink: 0 }}>Right now</span>
                <span
                  title={rightNowTask.title}
                  style={{
                    fontSize: 14, fontWeight: 600, color: 'var(--task-ink)', letterSpacing: '-0.01em',
                    flex: 1, minWidth: isPhone ? '12ch' : 0, overflow: 'hidden',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}
                >
                  {rightNowTask.short_title || rightNowTask.title}
                </span>
                {/* Action cluster */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: isPhone ? 'auto' : 0 }}>
                  {rightNowProject && (
                    <Link
                      to={PATHS.project(rightNowProject.slug)}
                      style={{ fontSize: 11, color: ACCENT_GOLD, fontWeight: 500, flexShrink: 0, textDecoration: 'none', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {rightNowProject.name}
                    </Link>
                  )}
                  <button
                    onClick={() => setChatExpanded(true)}
                    title="Expand and focus chat"
                    style={{ padding: '5px 10px', background: ACCENT_GOLD, color: PAGE_BG, border: 'none', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                  >
                    ▶ Work
                  </button>
                  <button
                    onClick={() => state.markDone(rightNowTask.id)}
                    style={{ padding: '5px 10px', background: 'transparent', color: INK, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                  >
                    ✓ Done
                  </button>
                  <LinkRow links={heroLinks} />
                  <button
                    onClick={() => setChatExpanded((x) => !x)}
                    title={chatExpanded ? 'Collapse' : 'Expand'}
                    style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 12, cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}
                  >
                    {chatExpanded ? '▾' : '▸'}
                  </button>
                </div>
              </div>
              {chatExpanded && (
                <div style={{ padding: '0 18px 14px', borderTop: `1px dashed ${withAlpha(ACCENT_GOLD, 18)}`, paddingTop: 10 }}>
                  {rightNowTask.description && (
                    <div style={{ fontSize: 12, color: INK_MUTED, marginBottom: 8, fontStyle: 'italic' }}>
                      {rightNowTask.description.split('\n')[0].slice(0, 280)}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 12, color: ACCENT_GOLD, marginTop: 4 }}>💬</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SmartCompose
                        taskId={rightNowTask.id}
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
          )}

          {/* ── Other planned (strip) tasks as full rows ── */}
          {stripTasks.map((t) => (
            <PlannedTaskRow
              key={t.id}
              task={t}
              project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
              state={state}
              onExpand={onExpand}
              expandedId={expandedId}
              projectsByPid={projectsByPid}
            />
          ))}
        </div>
      )}
    </section>
  )
}
