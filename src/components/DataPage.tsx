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
  /** Count summary shown in the controls row (e.g. "78 manuscripts"). */
  controlsCount?: number
  controlsCountLabel?: string
  /** Hide the controls row entirely (page renders only header + body). */
  hideControls?: boolean

  // ── Content between the controls row and the body (e.g. attention
  //    dashboards, category pill rows the page owns). ──
  beforeBody?: ReactNode

  /** Opt the body OUT of the --col-main cap into anchored-wide mode (Nick
   *  2026-06-10b): same anchored left edge, but the body grows rightward to
   *  the viewport (minus standard right padding) instead of being capped at
   *  960px and h-scrolling inside it. For genuinely WIDE multi-column bodies
   *  (e.g. the Projects Pipeline kanban). Leave false for normal tables. */
  wideBody?: boolean

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
  controlsCount,
  controlsCountLabel,
  hideControls,
  beforeBody,
  wideBody,
  isLoading,
  skeletonRows = 6,
  skeletonCols = 5,
  isEmpty,
  empty,
  children,
}: DataPageProps) {
  const showControls =
    !hideControls &&
    (views || filters || rightExtra || controlsCount !== undefined)

  const body = (
    <>
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
    </>
  )

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* Centered band (P1-1). PortalLayout's <main> owns bottom clearance
          (pb-[calc(3rem+56px+safe-area)]) — no rogue page-level paddingBottom. */}
      <div className="content-container">
        <PageHeader icon={icon} title={title} count={count} subtitle={subtitle} actions={actions}>
          {showControls && (
            <TableControls
              views={views}
              activeView={activeView}
              onViewChange={onViewChange}
              filters={filters}
              rightExtra={rightExtra}
              count={controlsCount}
              countLabel={controlsCountLabel}
            />
          )}
        </PageHeader>

        {/* Anchored primary column (P1-1): left edge + width identical on
            every data page. Pages with no rail leave the space beside it
            empty rather than re-centering. When wideBody, the body renders in
            a sibling full-width wrapper below (it can't be both inside the
            --content-band AND fluid past it), so only the non-wide body sits
            here. */}
        {!wideBody && <div style={{ maxWidth: 'var(--col-main)' }}>{body}</div>}
      </div>

      {/* Anchored-wide body (Nick 2026-06-10b): rendered OUTSIDE the band so it
          can grow rightward to the viewport (minus standard right padding); the
          .band-anchored-wide left edge is computed to match .content-container's
          content edge exactly, so the header above and this body share one left
          edge at every viewport width. Used for wide multi-column bodies like
          the Projects Pipeline kanban. */}
      {wideBody && <div className="band-anchored-wide">{body}</div>}
    </div>
  )
}
