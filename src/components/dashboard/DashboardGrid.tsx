import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout'
import {
  DASHBOARD_GRID_BREAKPOINTS,
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_ROW_HEIGHT,
  buildDefaultLayouts,
  loadSavedLayouts,
  reconcileLayouts,
  saveLayouts,
  type GridCard,
} from '../../lib/dashboardLayout'
// NOTE: react-grid-layout/css/styles.css and react-resizable/css/styles.css
// are NOT imported here. react-resizable's CSS embeds a base64 SVG as a CSS
// background-image: url(data:...) that violates the Cloudflare Pages CSP.
// All required base styles are vendored into dashboard-grid.css (with the
// data: URI intentionally omitted — we use ::after pseudo-elements instead).
import '../../styles/dashboard-grid.css'

const ResponsiveGridLayout = WidthProvider(Responsive)

interface DashboardGridProps {
  section: string
  userSlug?: string
  cards: GridCard[]
  /** Called with cardId when the user clicks the card body. */
  onCardClick?: (id: string) => void
  /** Renders the card body for a given id. */
  renderCard: (id: string) => React.ReactNode
  /** Optional right-side overlay (e.g. pin button) for each card. */
  renderOverlay?: (id: string) => React.ReactNode
}

export default function DashboardGrid({
  section,
  userSlug,
  cards,
  onCardClick,
  renderCard,
  renderOverlay,
}: DashboardGridProps) {
  const cardsKey = useMemo(() => cards.map(c => c.id).join('|'), [cards])
  const lastCardsKey = useRef(cardsKey)

  const [layouts, setLayouts] = useState<Layouts>(() => {
    const saved = loadSavedLayouts(section, userSlug)
    return saved ? reconcileLayouts(cards, saved) : buildDefaultLayouts(cards)
  })
  const [currentBp, setCurrentBp] = useState<keyof typeof DASHBOARD_GRID_ROW_HEIGHT>('lg')

  // Reconcile when the card set changes (visibility toggles, pinning)
  useEffect(() => {
    if (lastCardsKey.current === cardsKey) return
    lastCardsKey.current = cardsKey
    setLayouts(prev => reconcileLayouts(cards, prev))
  }, [cardsKey, cards])

  const handleLayoutChange = useCallback(
    (_current: Layout[], all: Layouts) => {
      setLayouts(all)
      saveLayouts(section, userSlug, all)
    },
    [section, userSlug],
  )

  if (cards.length === 0) return null

  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layouts={layouts}
      breakpoints={DASHBOARD_GRID_BREAKPOINTS}
      cols={DASHBOARD_GRID_COLS}
      rowHeight={DASHBOARD_GRID_ROW_HEIGHT[currentBp]}
      margin={[20, 20]}
      containerPadding={[0, 0]}
      draggableHandle=".rgl-drag-handle"
      resizeHandles={['se']}
      onLayoutChange={handleLayoutChange}
      onBreakpointChange={(bp) => setCurrentBp(bp as keyof typeof DASHBOARD_GRID_ROW_HEIGHT)}
      isBounded={false}
      useCSSTransforms
      compactType="vertical"
    >
      {cards.map(card => (
        <div key={card.id} data-testid={`card-${card.id}`} className="dashboard-grid-item">
          <div
            className="dashboard-grid-card"
            // Cards contain their own interactive elements (buttons, links),
            // so the wrapper drops role="button" to avoid axe nested-interactive
            // (2026-04-18). Clicks on non-interactive background areas still
            // invoke onCardClick; keyboard reaches inner controls normally.
            onClick={
              onCardClick
                ? (e) => {
                    // Only trigger when the click lands on the card background,
                    // not on an inner button/link that handled the click first.
                    if (e.target === e.currentTarget) onCardClick(card.id)
                  }
                : undefined
            }
          >
            {renderCard(card.id)}
          </div>
          <button
            type="button"
            className="rgl-drag-handle"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            onClick={e => e.stopPropagation()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="3" cy="3" r="1" fill="currentColor" />
              <circle cx="9" cy="3" r="1" fill="currentColor" />
              <circle cx="3" cy="6" r="1" fill="currentColor" />
              <circle cx="9" cy="6" r="1" fill="currentColor" />
              <circle cx="3" cy="9" r="1" fill="currentColor" />
              <circle cx="9" cy="9" r="1" fill="currentColor" />
            </svg>
          </button>
          {renderOverlay?.(card.id)}
        </div>
      ))}
    </ResponsiveGridLayout>
  )
}
