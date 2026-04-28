// ProjectsCard — searchable project list w/ next-action cue.
//
// TP-19 (D21): default filter narrows to "relevant today" projects —
// those with (tasks due today OR overdue) OR (planned-today tasks) OR
// (last-7d activity). User can toggle "Show all" to expand to the full
// active list. Toggle state persists in localStorage.today_projects_show_all.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Projects).

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../constants/paths'
import { ACCENT_TEAL, ACCENT_GOLD, INK, INK_MUTED, INK_DIM } from '../constants'

const SHOW_ALL_KEY = 'today_projects_show_all'

interface ProjectEntry {
  slug: string
  name: string
  nextAction?: string | null
  relevantToday?: boolean
}

export function ProjectsCard({ projects }: { projects: ProjectEntry[] }) {
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
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, margin: 0 }}>Projects</h4>
        <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>
          {useAll ? totalCount : `${relevantCount} today`}
        </span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Jump to project…"
        style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 12, color: INK, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {shown.length === 0 && (
          <div style={{ padding: '8px 4px', fontSize: 11, color: INK_DIM, fontStyle: 'italic' }}>
            {q ? 'No matches.' : useAll ? 'No active projects.' : 'No projects with activity today — toggle Show all.'}
          </div>
        )}
        {shown.map((p) => (
          <Link key={p.slug} to={PATHS.project(p.slug)} className="b2-proj" style={{ display: 'block', padding: 8, borderRadius: 4, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: INK, fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              {p.relevantToday && !useAll && (
                <span title="Active today" aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', background: ACCENT_GOLD, flexShrink: 0 }} />
              )}
            </div>
            {p.nextAction && (
              <div style={{ fontSize: 11, color: INK_MUTED, opacity: 0.8, paddingLeft: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {p.nextAction}</div>
            )}
          </Link>
        ))}
      </div>
      {!noRelevantFlagged && totalCount > relevantCount && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            padding: 0,
            color: ACCENT_TEAL,
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
        >
          {showAll ? `Show today only (${relevantCount})` : `Show all (${totalCount})`}
        </button>
      )}
    </div>
  )
}
