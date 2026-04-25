// TopBar — title + count + search + quick-view tabs + view picker + filter chips +
// hide-completed toggle + clear-all. Identical across all 3 views (CLAUDE.md
// Rule 60: "three views, one toolbar").
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { researchTeam } from '../../../data/team'
import SavedViewsMenu from '../../../components/SavedViewsMenu'
import { ViewPicker } from './ViewPicker'
import { FilterChip } from './FilterChip'
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
}

export function TopBar({ view, setView, search, setSearch, filter, setFilter, quickView, setQuickView, taskCount, projectOptions, currentQuery, onApplyView }: TopBarProps) {
  const tabs: { k: QuickViewKey; l: string; color?: string }[] = [
    { k: 'all', l: 'All' },
    { k: 'today', l: '📌 Today', color: ACCENT_GOLD },
    { k: 'overdue', l: '⚠ Overdue', color: ACCENT_CORAL },
    { k: 'waiting', l: '⏳ Waiting on', color: ACCENT_ORANGE },
    { k: 'stale', l: '🕰 Stale', color: ACCENT_ORANGE },
  ]
  const hasFilters = filter.priority || filter.project || filter.mentee || filter.group || search || quickView !== 'all'
  return (
    <div style={{ padding: '14px 24px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: '#fff' }}>My Tasks</h1>
        <span style={{ fontSize: 11, color: INK_DIM, fontVariantNumeric: 'tabular-nums' }}>{taskCount} visible</span>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: INK, fontSize: 12, width: 260, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = quickView === tab.k
          const c = tab.color || ACCENT_TEAL
          return (
            <button
              key={tab.k}
              onClick={() => setQuickView(tab.k)}
              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, borderRadius: 999, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${active ? c + '70' : 'rgba(255,255,255,0.1)'}`, background: active ? c + '15' : 'transparent', color: active ? c : INK_MUTED }}
            >{tab.l}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <ViewPicker view={view} setView={setView} />
        <SavedViewsMenu page="my-tasks" currentQuery={currentQuery} onApply={onApplyView} />
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
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
      </div>
    </div>
  )
}
