// ViewPicker — segmented pill that switches Columns / Lanes / List view.
// Lives far-left of the filter row (CLAUDE.md Rule 60). Persists to
// localStorage.mt_view via the parent's setView callback.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { ACCENT_TEAL, INK_MUTED, type ViewMode } from '../constants'

export function ViewPicker({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const views: { k: ViewMode; l: string; icon: string; desc: string }[] = [
    { k: 'columns', l: 'Columns', icon: '⊞', desc: 'Kanban board · all groups side-by-side' },
    { k: 'lanes',   l: 'Lanes',   icon: '☰', desc: 'Stacked lanes · collapse and peek' },
    { k: 'list',    l: 'List',    icon: '≡', desc: 'Dense table · keyboard-first' },
  ]
  return (
    <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', overflow: 'hidden', height: 26 }}>
      {views.map((v, i) => {
        const active = view === v.k
        return (
          <button
            key={v.k}
            onClick={() => setView(v.k)}
            title={v.desc}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', height: 24, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: active ? 'rgba(92,188,180,0.15)' : 'transparent', color: active ? ACCENT_TEAL : INK_MUTED, fontWeight: active ? 600 : 500, borderRight: i < views.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
          >
            <span style={{ fontSize: 12 }}>{v.icon}</span>
            {v.l}
          </button>
        )
      })}
    </div>
  )
}
