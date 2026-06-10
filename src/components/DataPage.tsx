// DataPage — the shared shell for columnar data pages (P2-1, 2026-06-09).
//
// Owns, once, what every data page used to hand-roll:
//   • the anchored-column width rule (P1-1): a centered .content-container
//     band + an inner --col-main left-anchored column, so the primary
//     column's left edge + width are identical on every data page.
//   • the page header (reuses PageHeader).
//   • filter / sort / view / density chrome (reuses TableControls).
//   • the loading skeleton (reuses TableSkeleton).
//   • the empty state (reuses EmptyState + EmptyStateArt) — one copy voice.
//
// Pages pass their header config + controls + their rendered body. Adopters
// this wave: Projects.tsx, ManuscriptsPage.tsx. Deadlines / Decisions / Grants
// adopt next wave.
//
// The shell does NOT own each page's bespoke table internals (kanban DnD,
// trophy grid, stage-grouped rows) — those stay in the page and render as
// `children`. What it standardizes is the chrome + width + loading/empty so
// they're defined once.

import type { ReactNode } from 'react'
import PageHeader from './PageHeader'
import TableControls from './table/TableControls'
import { TableSkeleton } from './LoadingSkeleton'
import EmptyState from './EmptyState'
import EmptyStateArt, { type EmptyArtVariant } from './EmptyStateArt'

type Density = 'compact' | 'default' | 'relaxed'

interface ViewOption {
  key: string
  icon: ReactNode
  label: string
}

interface DataPageProps {
  // ── Header ──
  icon?: ReactNode
  title: string
  /** Live count badge next to the title. */
  count?: number
  subtitle?: ReactNode
  /** Right-aligned header actions (e.g. a "New" button). */
  actions?: ReactNode

  // ── Chrome (TableControls) ──
  views?: ViewOption[]
  activeView?: string
  onViewChange?: (view: string) => void
  /** Filter pills / extra left-side controls. */
  filters?: ReactNode
  /** Extra right-side chrome (e.g. dependency toggle). */
  rightExtra?: ReactNode
  showDensity?: boolean
  density?: Density
  onDensityChange?: (d: Density) => void
  /** Count summary shown in the controls row (e.g. "78 manuscripts"). */
  controlsCount?: number
  controlsCountLabel?: string
  /** Hide the controls row entirely (page renders only header + body). */
  hideControls?: boolean

  // ── Content between the controls row and the body (e.g. attention
  //    dashboards, category pill rows the page owns). ──
  beforeBody?: ReactNode

  // ── State ──
  isLoading?: boolean
  /** Skeleton geometry while loading. */
  skeletonRows?: number
  skeletonCols?: number
  /** True when the resolved dataset has zero rows. */
  isEmpty?: boolean
  empty?: {
    variant?: EmptyArtVariant
    title: string
    subtitle?: ReactNode
    action?: { label: string; onClick: () => void }
  }

  /** The page's rendered table/board/grid. */
  children?: ReactNode
}

export default function DataPage({
  icon,
  title,
  count,
  subtitle,
  actions,
  views,
  activeView,
  onViewChange,
  filters,
  rightExtra,
  showDensity,
  density,
  onDensityChange,
  controlsCount,
  controlsCountLabel,
  hideControls,
  beforeBody,
  isLoading,
  skeletonRows = 6,
  skeletonCols = 5,
  isEmpty,
  empty,
  children,
}: DataPageProps) {
  const showControls =
    !hideControls &&
    (views || filters || rightExtra || showDensity || controlsCount !== undefined)

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Centered band (P1-1). */}
      <div className="content-container" style={{ paddingBottom: '6rem' }}>
        <PageHeader icon={icon} title={title} count={count} subtitle={subtitle} actions={actions}>
          {showControls && (
            <TableControls
              views={views}
              activeView={activeView}
              onViewChange={onViewChange}
              filters={filters}
              rightExtra={rightExtra}
              showDensity={showDensity}
              density={density}
              onDensityChange={onDensityChange}
              count={controlsCount}
              countLabel={controlsCountLabel}
            />
          )}
        </PageHeader>

        {/* Anchored primary column (P1-1): left edge + width identical on
            every data page. Pages with no rail leave the space beside it
            empty rather than re-centering. */}
        <div style={{ maxWidth: 'var(--col-main)' }}>
          {beforeBody}

          {isLoading ? (
            <TableSkeleton rows={skeletonRows} cols={skeletonCols} />
          ) : isEmpty && empty ? (
            <EmptyState
              icon={<EmptyStateArt variant={empty.variant ?? 'generic'} />}
              title={empty.title}
              subtitle={empty.subtitle}
              action={empty.action}
            />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )
}
