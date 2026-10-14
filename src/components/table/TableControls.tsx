import type { ReactNode } from 'react'
import InlineSelect from '../InlineSelect'
import SegmentedToggle from '../ui/SegmentedToggle'

interface ViewOption {
  key: string
  icon: ReactNode
  label: string
}

interface SortOption {
  value: string
  label: string
}

interface TableControlsProps {
  // View toggle
  views?: ViewOption[]
  activeView?: string
  onViewChange?: (view: string) => void

  // Sort
  sortKey?: string
  sortOptions?: SortOption[]
  onSortChange?: (key: string) => void

  // Filter pills / any extra left-side controls
  filters?: ReactNode

  // Count summary
  count?: number
  countLabel?: string

  // Any extra right-side content (e.g., export buttons)
  rightExtra?: ReactNode
}

export default function TableControls({
  views,
  activeView,
  onViewChange,
  sortKey,
  sortOptions,
  onSortChange,
  filters,
  count,
  countLabel,
  rightExtra,
}: TableControlsProps) {
  return (
    // Every group in this row is capped at the row's width ([&>*]): a flex
    // item's default min-width is its content, so a group wider than a phone
    // (the Projects filter links, 701px in a 342px column) never shrank, its
    // own sideways scroller (.tk-flt-scroll) never engaged, and the rest of
    // the row was clipped off screen. Wrapping is unchanged: a flex-wrap row
    // breaks lines on content size first and only shrinks a group that is
    // wider than the row on its own line.
    <div
      className="flex items-center flex-wrap gap-3 [&>*]:min-w-0 [&>*]:max-w-full"
      style={{ minHeight: 40 }}
    >
      {/* Left side ------------------------------------------------- */}

      {/* View toggle — the canonical SegmentedToggle (locked de-box anatomy). */}
      {views && views.length > 0 && onViewChange && activeView !== undefined && (
        <SegmentedToggle
          ariaLabel="View"
          options={views.map((v) => ({ value: v.key, label: v.label, icon: v.icon }))}
          value={activeView}
          onChange={onViewChange}
        />
      )}

      {/* Sort dropdown */}
      {sortOptions && sortOptions.length > 0 && onSortChange && (
        <InlineSelect
          value={sortKey || ''}
          options={sortOptions}
          onChange={onSortChange}
          alwaysShowChevron
        />
      )}

      {/* Filter pills — each page provides its own */}
      {filters && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters}
        </div>
      )}

      {/* Spacer pushes right content to the end */}
      <div style={{ marginLeft: 'auto' }} />

      {/* Right side ------------------------------------------------ */}

      {/* Extra right content (export buttons, links, etc.) */}
      {rightExtra && (
        <div className="flex items-center flex-wrap gap-2">
          {rightExtra}
        </div>
      )}

      {/* Count summary */}
      {count !== undefined && countLabel && (
        <span
          style={{
            fontSize: 'var(--text-small, 12px)',
            color: 'var(--slate)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {count} {countLabel}
        </span>
      )}
    </div>
  )
}
