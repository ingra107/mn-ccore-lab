// ProjectsCard — searchable project list w/ next-action cue.
//
// TP-19 (D21): default filter narrows to "relevant today" projects —
// those with (tasks due today OR overdue) OR (planned-today tasks) OR
// (last-7d activity). User can toggle "Show all" to expand to the full
// active list. Toggle state persists in localStorage.today_projects_show_all.
//
// Look (Today reskin, 2026-10-09): a panel; projects by SHORT name, the next
// action as a muted line under it (also short), a teal dot for "active today".
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Projects).

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../constants/paths'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'

const SHOW_ALL_KEY = 'today_projects_show_all'

interface ProjectEntry {
  slug: string
  name: string
  nextAction?: string | null
  relevantToday?: boolean
}

export function ProjectsCard({ projects }: { projects: ProjectEntry[] }) {
  // Session-only collapse — starts expanded on every load (no localStorage).
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SHOW_ALL_KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { window.localStorage.setItem(SHOW_ALL_KEY, showAll ? '1' : '0') } catch { /* ignore */ }
  }, [showAll])

  const relevantCount = useMemo(() => projects.filter((p) => p.relevantToday).length, [projects])
  const totalCount = projects.length
  // If no project is flagged relevant (e.g. blank Friday), fall back to
  // showing all so the card isn't an empty rail. The toggle still reads
  // 'Show all' since the default-collapsed state already shows them.
  const noRelevantFlagged = relevantCount === 0
  const useAll = showAll || noRelevantFlagged

  const shown = useMemo(() => {
    const base = useAll ? projects : projects.filter((p) => p.relevantToday)
    const filtered = q ? base.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : base
    return filtered.slice(0, 12)
  }, [projects, q, useAll])

  return (
    <section className="tk-panel">
      <div className="tk-ph">
        <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Projects')} className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Projects</h3>
          <span className="tk-cnt">{useAll ? totalCount : `${relevantCount} today`}</span>
        </div>
      </div>
      {open && (
      <>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Jump to project…"
        aria-label="Jump to project"
        className="tk-jump"
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {shown.length === 0 && (
          <div style={{ padding: '8px 4px', fontSize: 12, color: 'var(--sk-t3)' }}>
            {q ? 'No matches.' : useAll ? 'No active projects.' : 'No projects with activity today. Toggle Show all.'}
          </div>
        )}
        {shown.map((p) => (
          <Link key={p.slug} to={PATHS.project(p.slug)} className="tk-proj">
            <div className="tk-n">
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              {p.relevantToday && !useAll && (
                <span title="Active today" aria-hidden="true" className="tk-dotg" />
              )}
            </div>
            {p.nextAction && (
              <div className="tk-a">→ {p.nextAction}</div>
            )}
          </Link>
        ))}
      </div>
      {!noRelevantFlagged && totalCount > relevantCount && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="tk-rmore"
          style={{ marginTop: 8 }}
        >
          {showAll ? `Show today only (${relevantCount})` : `Show all (${totalCount})`}
        </button>
      )}
      </>
      )}
    </section>
  )
}
