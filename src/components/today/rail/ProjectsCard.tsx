// ProjectsCard — searchable project list w/ next-action cue.
// Filter input narrows by name (substring); shows up to 12.
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Rail_Projects).

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../constants/paths'
import { ACCENT_TEAL, INK, INK_MUTED, INK_DIM } from '../constants'

export function ProjectsCard({ projects }: { projects: Array<{ slug: string; name: string; nextAction?: string | null }> }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : projects
    return filtered.slice(0, 12)
  }, [projects, q])

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT_TEAL }} />
        <h4 style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, margin: 0 }}>Projects</h4>
        <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>{projects.length}</span>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Jump to project…"
        style={{ width: '100%', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, fontSize: 12, color: INK, outline: 'none', fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }}
      />
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {shown.map((p) => (
          <Link key={p.slug} to={PATHS.project(p.slug)} className="b2-proj" style={{ display: 'block', padding: 8, borderRadius: 4, textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: INK, fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            </div>
            {p.nextAction && (
              <div style={{ fontSize: 11, color: INK_MUTED, opacity: 0.8, paddingLeft: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>→ {p.nextAction}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
