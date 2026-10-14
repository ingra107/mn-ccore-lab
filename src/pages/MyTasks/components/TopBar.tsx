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
import FilterLinks from '../../../components/ui/FilterLinks'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  GROUP_META, GROUP_ORDER,
  JOB_ACCENT,
  INK,
  type ViewMode, type GroupKey, type QuickViewKey, type FilterState, type FilterOption,
} from '../constants'
import { ICON_PROPS } from '../../../lib/iconProps'
import PageHeartbeat from '../../../components/moments/PageHeartbeat'

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
  // control rows). Condensed: quick-views become ONE swipeable row, the filter
  // chips collapse behind a Filters pill with an active-count badge. Create
  // Task stays on every width: the + FAB it once deferred to is desktop-only
  // (`hidden lg:flex` in PortalLayout), so a phone had no create control.
  const isPhone = useIsMobile(768)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const activeFilterCount = [filter.group, filter.priority, filter.project, filter.mentee].filter(Boolean).length
  const showFilterChips = !isPhone || filtersOpen
  // 'New' = your tasks you haven't opened yet (Slack-style seen; matches the
  // sidebar badge count + the gold NEW chip on rows). Drains on open.
  const tabs: { value: QuickViewKey; label: string; tone?: 'overdue' }[] = [
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'today', label: 'Today' },
    { value: 'planned', label: 'Planned' },
    { value: 'done-today', label: 'Done today' },
    { value: 'overdue', label: 'Overdue', tone: 'overdue' },
    { value: 'waiting', label: 'Waiting on' },
    { value: 'stale', label: 'Stale' },
    { value: 'declined', label: 'Declined' },
  ]
  const hasFilters = filter.priority || filter.project || filter.mentee || filter.group || search || quickView !== 'all'
  return (
    // P1-1 (Nick 2026-06-10): the border-bottom spans full width (visual
    // separator) but the toolbar CONTENT is band-centered via .mt-band so its
    // left edge matches the views below + the data pages. Vertical padding
    // stays on the outer; horizontal padding comes from .mt-band.
    <div style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, paddingTop: 14, paddingBottom: 12 }}>
     <div className="mt-band">
      {/* P2-6: title row wraps so the search input + Create Task drop to a
          second line on narrow widths instead of clipping the fixed-260 search
          and overlapping the title. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <div className="tk-titlerow">
          <h1 className="tk-h1" style={{ color: 'var(--sk-t1)' }}>My Tasks</h1>
          <span className="tk-date" aria-live="polite" aria-atomic="true" style={{ fontVariantNumeric: 'tabular-nums' }}>{taskCount} visible</span>
        </div>
        {/* The heartbeat line under the title (color-back pick 10): its own
            full-width line in the wrapping title row. */}
        <PageHeartbeat className="pg-hb-row" />
        <div style={{ flex: 1, minWidth: 12 }} />
        {/* The one create control on every width (2026-10-14). N1.20 dropped
            it on phones for the teal + FAB, but that FAB only shows at lg+,
            so phones were left with no create control on this page. It sits
            beside the search field, which takes the rest of the line. */}
        <button
          type="button"
          onClick={onCreateTask}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            fontFamily: 'inherit', cursor: 'pointer', border: 'none',
            backgroundColor: JOB_ACCENT, color: 'var(--sk-card)',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          <Plus {...ICON_PROPS} size={15} />
          Create Task
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          // N1.20 — phones: fill the row (the 260px cap left a dead gap).
          // An input must look like an input (rules-ui-design 20): the gray
          // fill read as disabled in light, so it takes the field look, a
          // well (--cream) with the --field-edge hairline, teal on focus.
          style={{ padding: '6px 12px', background: 'var(--cream)', border: `1px solid ${searchFocused ? 'var(--job-accent)' : 'var(--field-edge)'}`, borderRadius: 6, color: INK, fontSize: 12, flex: '1 1 200px', minWidth: 140, maxWidth: isPhone ? 'none' : 260, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>
      {/* N1.10 / ROW 25: swipeable-on-phones → CSS .topbar-tab-strip (@media in index.css) */}
      <div className="topbar-tab-strip">
        <FilterLinks className="tk-flt-scroll" ariaLabel="Quick view" options={tabs} value={quickView} onChange={setQuickView} />
      </div>
      <div className="tk-tools">
        <ViewPicker view={view} setView={setView} isPhone={isPhone} />
        <SavedViewsMenu page="my-tasks" currentQuery={currentQuery} onApply={onApplyView} />
        {isPhone && (
          <div className="tk-fsel">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              data-set={activeFilterCount > 0 ? 'true' : undefined}
            >
              <SlidersHorizontal size={11} strokeWidth={1.5} absoluteStrokeWidth />
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
          </div>
        )}
        {showFilterChips && <>
        <FilterChip
          label="Group"
          value={filter.group}
          options={[{ v: null, l: 'All' }, ...GROUP_ORDER.map((k) => ({ v: k, l: GROUP_META[k].label }))]}
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
            { v: '__any_mentee__', l: 'Any mentee' },
            ...researchTeam.filter((m) => !!m.slug).map((m) => ({ v: m.slug as string, l: m.name })),
          ]}
          onChange={(v) => setFilter((f) => ({ ...f, mentee: v }))}
        />
        <div className="tk-fsel">
          <button
            type="button"
            onClick={() => setFilter((f) => ({ ...f, hideCompleted: !f.hideCompleted }))}
          >{filter.hideCompleted ? 'Show completed' : 'Hide completed'}</button>
        </div>
        {hasFilters && (
          <div className="tk-fsel">
            <button
              type="button"
              onClick={() => { setFilter((f) => ({ priority: null, project: null, mentee: null, group: null, hideCompleted: f.hideCompleted })); setSearch(''); setQuickView('all') }}
              style={{ color: 'var(--sk-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >Clear all</button>
          </div>
        )}
        </>}
      </div>
     </div>
    </div>
  )
}
