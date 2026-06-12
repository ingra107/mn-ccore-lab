// TopBar — title + count + search + quick-view tabs + view picker + filter chips +
// hide-completed toggle + clear-all. Identical across all 3 views (CLAUDE.md
// Rule 60: "three views, one toolbar").
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState } from 'react'
import { Plus, SlidersHorizontal } from 'lucide-react'
import { researchTeam } from '../../../data/team'
import SavedViewsMenu from '../../../components/SavedViewsMenu'
import { ViewPicker } from './ViewPicker'
import { FilterChip } from './FilterChip'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, ACCENT_ORANGE, ACCENT_GREEN,
  INK, INK_MUTED, INK_DIM,
  type ViewMode, type GroupKey, type QuickViewKey, type FilterState, type FilterOption,
} from '../constants'

interface TopBarProps {
  view: ViewMode; setView: (v: ViewMode) => void
  search: string; setSearch: (v: string) => void
  filter: FilterState; setFilter: (fn: (f: FilterState) => FilterState) => void
  quickView: QuickViewKey; setQuickView: (q: QuickViewKey) => void
  taskCount: number
  projectOptions: FilterOption[]
  currentQuery: string
  onApplyView: (q: string) => void
  onCreateTask: () => void
}

export function TopBar({ view, setView, search, setSearch, filter, setFilter, quickView, setQuickView, taskCount, projectOptions, currentQuery, onApplyView, onCreateTask }: TopBarProps) {
  // N1.10 — phones: the toolbar consumed ~60% of the viewport (7 wrapped
  // control rows). Condensed: Create Task drops (the + FAB is the create
  // path), quick-views become ONE swipeable row, the filter chips collapse
  // behind a Filters pill with an active-count badge.
  const isPhone = useIsMobile(768)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = [filter.group, filter.priority, filter.project, filter.mentee].filter(Boolean).length
  const showFilterChips = !isPhone || filtersOpen
  const tabs: { k: QuickViewKey; l: string; color?: string }[] = [
    { k: 'all', l: 'All' },
    // 'New' = your tasks you haven't opened yet (Slack-style seen; matches the
    // sidebar badge count + the gold NEW chip on rows). Drains on open.
    { k: 'new', l: '✦ New', color: ACCENT_GOLD },
    { k: 'today', l: '📌 Today', color: ACCENT_GOLD },
    { k: 'overdue', l: '⚠ Overdue', color: ACCENT_CORAL },
    { k: 'waiting', l: '⏳ Waiting on', color: ACCENT_ORANGE },
    { k: 'stale', l: '🕰 Stale', color: ACCENT_ORANGE },
  ]
  const hasFilters = filter.priority || filter.project || filter.mentee || filter.group || search || quickView !== 'all'
  return (
    // P1-1 (Nick 2026-06-10): the border-bottom spans full width (visual
    // separator) but the toolbar CONTENT is band-centered via .mt-band so its
    // left edge matches the views below + the data pages. Vertical padding
    // stays on the outer; horizontal padding comes from .mt-band.
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, paddingTop: 14, paddingBottom: 12 }}>
     <div className="mt-band">
      {/* P2-6: title row wraps so the search input + Create Task drop to a
          second line on narrow widths instead of clipping the fixed-260 search
          and overlapping the title. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: '#fff' }}>My Tasks</h1>
        <span aria-live="polite" aria-atomic="true" style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{taskCount} visible</span>
        <div style={{ flex: 1, minWidth: 12 }} />
        {/* N1.20 — phones drop this button: the teal + FAB is the create
            affordance there (two create buttons crowded the layout). */}
        {!isPhone && (
          <button
            onClick={onCreateTask}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              fontFamily: 'inherit', cursor: 'pointer', border: 'none',
              backgroundColor: ACCENT_TEAL, color: 'var(--ink-bright, #fff)',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            <Plus size={15} />
            Create Task
          </button>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          // N1.20 — phones: fill the row (the 260px cap left a dead gap).
          style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: INK, fontSize: 12, flex: '1 1 200px', minWidth: 140, maxWidth: isPhone ? 'none' : 260, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      {/* N1.10 — phones: one swipeable row instead of a 2-3 row wrap. */}
      <div style={isPhone
        ? { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as const }
        : { display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = quickView === tab.k
          const c = tab.color || ACCENT_TEAL
          return (
            <button
              key={tab.k}
              onClick={() => setQuickView(tab.k)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${active ? c + '70' : 'rgba(255,255,255,0.1)'}`, background: active ? c + '15' : 'transparent', color: active ? c : INK_MUTED, flexShrink: 0, whiteSpace: 'nowrap' }}
            >{tab.l}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <ViewPicker view={view} setView={setView} />
        <SavedViewsMenu page="my-tasks" currentQuery={currentQuery} onApply={onApplyView} />
        {/* N1.20 — divider only when the chips render beside it (it stranded
            itself at wrapped line ends on phones). */}
        {showFilterChips && !isPhone && <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />}
        {isPhone && (
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${filtersOpen || activeFilterCount > 0 ? ACCENT_TEAL + '70' : 'rgba(255,255,255,0.1)'}`, background: filtersOpen || activeFilterCount > 0 ? ACCENT_TEAL + '15' : 'transparent', color: filtersOpen || activeFilterCount > 0 ? ACCENT_TEAL : INK_MUTED }}
          >
            <SlidersHorizontal size={11} strokeWidth={1.5} absoluteStrokeWidth />
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
        )}
        {showFilterChips && <>
        <FilterChip
          label="Group"
          value={filter.group}
          options={[{ v: null, l: 'All' }, ...GROUP_ORDER.map((k) => ({ v: k, l: `${GROUP_META[k].icon} ${GROUP_META[k].label}` }))]}
          onChange={(v) => setFilter((f) => ({ ...f, group: v as GroupKey | null }))}
        />
        <FilterChip
          label="Priority"
          value={filter.priority}
          options={[{ v: null, l: 'Any' }, { v: 'urgent', l: 'P1 / urgent' }, { v: 'high', l: 'P1 / high' }, { v: 'medium', l: 'P2 / medium' }, { v: 'low', l: 'P3 / low' }]}
          onChange={(v) => setFilter((f) => ({ ...f, priority: v }))}
        />
        <FilterChip
          label="Project"
          value={filter.project}
          options={[{ v: null, l: 'All' }, ...projectOptions]}
          onChange={(v) => setFilter((f) => ({ ...f, project: v }))}
        />
        <FilterChip
          label="Mentee"
          value={filter.mentee}
          options={[
            { v: null, l: 'Any' },
            { v: '__any_mentee__', l: '🎓 Any mentee' },
            ...researchTeam.filter((m) => !!m.slug).map((m) => ({ v: m.slug as string, l: m.name })),
          ]}
          onChange={(v) => setFilter((f) => ({ ...f, mentee: v }))}
        />
        <button
          onClick={() => setFilter((f) => ({ ...f, hideCompleted: !f.hideCompleted }))}
          style={{ padding: '4px 10px', fontSize: 11, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, background: filter.hideCompleted ? 'rgba(255,255,255,0.02)' : 'rgba(110,232,154,0.1)', color: filter.hideCompleted ? INK_MUTED : ACCENT_GREEN, fontFamily: 'inherit', cursor: 'pointer' }}
        >{filter.hideCompleted ? 'Show completed' : 'Hide completed'}</button>
        {hasFilters && (
          <button
            onClick={() => { setFilter((f) => ({ priority: null, project: null, mentee: null, group: null, hideCompleted: f.hideCompleted })); setSearch(''); setQuickView('all') }}
            style={{ padding: '4px 10px', fontSize: 11, border: 'none', background: 'transparent', color: ACCENT_CORAL, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >clear all</button>
        )}
        </>}
      </div>
     </div>
    </div>
  )
}
