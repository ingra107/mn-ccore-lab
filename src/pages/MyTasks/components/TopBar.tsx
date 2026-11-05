// TopBar — title + count + search + quick-view tabs + view picker + filter chips +
// hide-completed toggle + clear-all. Identical across all 3 views (CLAUDE.md
// Rule 60: "three views, one toolbar").
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { researchTeam } from '../../../data/team'
import SavedViewsMenu from '../../../components/SavedViewsMenu'
import { ViewPicker } from './ViewPicker'
import { FilterChip } from './FilterChip'
import FilterLinks from '../../../components/ui/FilterLinks'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  INK,
  STATUS_LABEL, STATUS_FILTER_KEYS, parseStatusParam,
  type ViewMode, type QuickViewKey, type FilterState, type FilterOption,
} from '../constants'
import { SECTION_ORDER, SECTION_LABEL, type SectionKey } from '../../../lib/taskSections'
import { ICON_PROPS } from '../../../lib/iconProps'
import { Button } from '../../../components/ui/Button'
import PageHeartbeat from '../../../components/moments/PageHeartbeat'
import { FiltersButton, FiltersSheet, FilterSection } from '../../../components/ui/FiltersSheet'

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
  /** Set while the Needs you card is folded (the same per-person flag Today
   *  folds, #152): shows "N needs you" in the toolbar to bring it back. */
  needsYou?: { count: number; onShow: () => void }
}

export function TopBar({ view, setView, search, setSearch, filter, setFilter, quickView, setQuickView, taskCount, projectOptions, currentQuery, onApplyView, onCreateTask, needsYou }: TopBarProps) {
  // Phones (Nick's mock, 2026-11-05): title and Create Task, then search and
  // Filters, then the view switch. The quick views and the chips live in the Filters
  // sheet, and the button counts what is on. Create Task stays on every width: the
  // + FAB is desktop-only (`hidden lg:flex` in PortalLayout).
  const isPhone = useIsMobile(768)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const activeFilterCount = [filter.group, filter.priority, filter.status, filter.project, filter.mentee, quickView !== 'all', !filter.hideCompleted].filter(Boolean).length
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
  const hasFilters = filter.priority || filter.status || filter.project || filter.mentee || filter.group || search || quickView !== 'all'
  const quickLinks = (scroll: boolean) => (
    <FilterLinks className={scroll ? 'tk-flt-scroll' : undefined} ariaLabel="Quick view" options={tabs} value={quickView} onChange={setQuickView} />
  )
  const chips = (
    <>
      <FilterChip
        label="Section"
        value={filter.group}
        options={[{ v: null, l: 'All' }, ...SECTION_ORDER.map((k) => ({ v: k, l: SECTION_LABEL[k] }))]}
        onChange={(v) => setFilter((f) => ({ ...f, group: v as SectionKey | null }))}
      />
      <FilterChip
        label="Priority"
        value={filter.priority}
        options={[{ v: null, l: 'Any' }, { v: 'urgent', l: 'P1 / urgent' }, { v: 'high', l: 'P1 / high' }, { v: 'medium', l: 'P2 / medium' }, { v: 'low', l: 'P3 / low' }]}
        onChange={(v) => setFilter((f) => ({ ...f, priority: v }))}
      />
      <FilterChip
        label="Status"
        value={filter.status}
        options={[{ v: null, l: 'Any' }, ...STATUS_FILTER_KEYS.map((k) => ({ v: k, l: STATUS_LABEL[k] }))]}
        onChange={(v) => setFilter((f) => ({ ...f, status: parseStatusParam(v) }))}
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
    </>
  )
  return (
    // P1-1 (Nick 2026-06-10): the border-bottom spans full width (visual
    // separator) but the toolbar CONTENT is band-centered via .mt-band so its
    // left edge matches the views below + the data pages. Vertical padding
    // stays on the outer; horizontal padding comes from .mt-band.
    <div style={{ borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, paddingTop: isPhone ? 0 : 14, paddingBottom: 12 }}>
     <div className="mt-band">
      {/* P2-6: title row wraps so the search input + Create Task drop to a
          second line on narrow widths instead of clipping the fixed-260 search
          and overlapping the title. */}
      <div style={{ display: 'flex', alignItems: isPhone ? 'flex-end' : 'center', gap: isPhone ? '6px 10px' : 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <div className="tk-titlerow">
          <h1 className="tk-h1" style={{ color: 'var(--sk-t1)' }}>Tasks</h1>
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
        <Button variant="primary" type="button" onClick={onCreateTask} style={{ flexShrink: 0, padding: '6px 14px', fontSize: 13, borderRadius: 6 }}>
          <Plus {...ICON_PROPS} size={15} />
          Create Task
        </Button>
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
          style={{ padding: '6px 12px', background: 'var(--cream)', border: `1px solid ${searchFocused ? 'var(--job-accent)' : 'var(--field-edge)'}`, borderRadius: 6, color: INK, fontSize: isPhone ? 16 : 12, flex: isPhone ? '1 1 140px' : '1 1 200px', minWidth: isPhone ? 0 : 140, maxWidth: isPhone ? 'none' : 260, order: isPhone ? 11 : undefined, fontFamily: 'inherit', outline: 'none' }}
        />
        {isPhone && <span style={{ order: 12 }}><FiltersButton count={activeFilterCount} open={filtersOpen} onClick={() => setFiltersOpen(true)} /></span>}
      </div>
      {!isPhone && <div className="topbar-tab-strip">{quickLinks(true)}</div>}
      <div className="tk-tools">
        <ViewPicker view={view} setView={setView} isPhone={isPhone} />
        <SavedViewsMenu page="my-tasks" currentQuery={currentQuery} onApply={onApplyView} />
        {!isPhone && chips}
        {!isPhone && hasFilters && (
          <div className="tk-fsel">
            <button
              type="button"
              onClick={() => { setFilter((f) => ({ priority: null, status: null, project: null, mentee: null, group: null, hideCompleted: f.hideCompleted })); setSearch(''); setQuickView('all') }}
              style={{ color: 'var(--sk-t3)', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >Clear all</button>
          </div>
        )}
        {needsYou && needsYou.count > 0 && (
          <div className="tk-fsel">
            <button
              type="button"
              data-stat="needs-you"
              aria-label={`${needsYou.count} needs you: show the card`}
              title="Show the Needs you card"
              onClick={needsYou.onShow}
            >
              <span className="tk-attn-dot" aria-hidden="true" />
              {needsYou.count} needs you<span aria-hidden="true">&darr;</span>
            </button>
          </div>
        )}
      </div>
      {isPhone && (
        <FiltersSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          count={activeFilterCount}
          onClear={() => { setFilter(() => ({ priority: null, status: null, project: null, mentee: null, group: null, hideCompleted: true })); setQuickView('all') }}
        >
          <FilterSection label="Show">{quickLinks(false)}</FilterSection>
          <FilterSection label="Narrow by"><div className="tk-fsheet-chips">{chips}</div></FilterSection>
        </FiltersSheet>
      )}
     </div>
    </div>
  )
}
