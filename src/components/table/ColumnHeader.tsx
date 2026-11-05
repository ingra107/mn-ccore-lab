import { Caret } from '../ui/Caret'

interface ColumnHeaderProps {
  label: string
  sortKey: string
  currentSort: string
  sortAsc: boolean
  onSort: (key: string) => void
  /** Optional secondary sort indicator (1-based number, e.g. 1 = primary, 2 = secondary) */
  sortRank?: number
  align?: 'left' | 'right'
  width?: string
}

/**
 * Shared column header for data tables.
 * Renders uppercase label with sort indicator (Caret) when active.
 * Consistent styling: 11px, uppercase, 0.55 opacity, 0.06em letter-spacing.
 */
export default function ColumnHeader({
  label,
  sortKey,
  currentSort,
  sortAsc,
  onSort,
  sortRank,
  align = 'left',
}: ColumnHeaderProps) {
  const isActive = currentSort === sortKey

  const sortDirection = isActive ? (sortAsc ? 'ascending' : 'descending') : null

  return (
    <button
      onClick={() => onSort(sortKey)}
      className="col-header"
      // aria-sort lives on role=columnheader, not on a plain <button>
      // (axe AXE-ARIA-ALLOWED-ATTR, 2026-04-18). aria-label below already
      // communicates the current sort state to screen readers.
      aria-label={`Sort by ${label}${sortDirection ? `, currently ${sortDirection}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        gap: '3px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        color: isActive ? 'var(--job-accent)' : undefined,
        opacity: isActive ? 0.9 : undefined,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {isActive && <Caret dir={sortAsc ? 'up' : 'down'} />}
      {sortRank != null && sortRank > 0 && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            opacity: 0.85,
            marginLeft: '1px',
          }}
        >
          {sortRank === 1 ? '\u2460' : '\u2461'}
        </span>
      )}
    </button>
  )
}
