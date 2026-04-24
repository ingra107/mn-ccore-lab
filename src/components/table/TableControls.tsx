import type { ReactNode } from 'react'
import DensityToggle from '../DensityToggle'
import InlineSelect from '../InlineSelect'

type Density = 'compact' | 'default' | 'relaxed'

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

  // Density
  showDensity?: boolean
  density?: Density
  onDensityChange?: (d: Density) => void

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
  showDensity = false,
  density,
  onDensityChange,
  count,
  countLabel,
  rightExtra,
}: TableControlsProps) {
  return (
    <div
      className="flex items-center flex-wrap gap-3"
      style={{ minHeight: 40 }}
    >
      {/* Left side ------------------------------------------------- */}

      {/* View toggle */}
      {views && views.length > 0 && onViewChange && (
        <div
          className="flex items-center rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border-subtle)', flexShrink: 0 }}
        >
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              title={v.label}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
              style={{
                fontWeight: 500,
                background: activeView === v.key ? 'var(--teal-solid)' : 'transparent',
                color: activeView === v.key ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                border: 'none',
                transition: 'all var(--duration-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
                {v.icon}
              </span>
              {v.label}
            </button>
          ))}
        </div>
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {rightExtra}
        </div>
      )}

      {/* Density toggle */}
      {showDensity && density !== undefined && onDensityChange && (
        <DensityToggle value={density} onChange={onDensityChange} />
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
