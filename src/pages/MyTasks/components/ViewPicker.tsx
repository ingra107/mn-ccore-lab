// ViewPicker — segmented pill that switches List / Lanes / Columns view.
// Lives far-left of the filter row (CLAUDE.md Rule 60). Order + List-first
// default per Nick (2026-06-10): "List | Lanes | Columns with List as default
// when I come to the page."
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { ACCENT_TEAL, INK_MUTED, type ViewMode } from '../constants'

export function ViewPicker({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const views: { k: ViewMode; l: string; icon: string; desc: string }[] = [
    { k: 'list',    l: 'List',    icon: '≡', desc: 'Dense table · keyboard-first' },
    { k: 'lanes',   l: 'Lanes',   icon: '☰', desc: 'Stacked lanes · collapse and peek' },
    { k: 'columns', l: 'Columns', icon: '⊞', desc: 'Kanban board · all groups side-by-side' },
  ]
  return (
    // P2-6: pill height is content-driven (minHeight, not fixed) so the touch
    // 44px button floor can grow the segments on coarse-pointer devices without
    // clipping the labels inside a fixed 26px box. Desktop stays compact.
    <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: 'rgba(255,255,255,0.02)', overflow: 'hidden', minHeight: 26 }}>
      {views.map((v, i) => {
        const active = view === v.k
        return (
          <button
            key={v.k}
            onClick={() => setView(v.k)}
            title={v.desc}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', border: 'none', background: active ? 'rgba(92,188,180,0.15)' : 'transparent', color: active ? ACCENT_TEAL : INK_MUTED, fontWeight: active ? 600 : 500, borderRight: i < views.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', whiteSpace: 'nowrap' }}
          >
            <span style={{ fontSize: 12 }}>{v.icon}</span>
            {v.l}
          </button>
        )
      })}
    </div>
  )
}
