import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout'
import {
  DASHBOARD_GRID_BREAKPOINTS,
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_ROW_HEIGHT,
  GRID_MARGIN_Y,
  GRID_SCALE,
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
  const [prevCardsKey, setPrevCardsKey] = useState(cardsKey)

  const [layouts, setLayouts] = useState<Layouts>(() => {
    const saved = loadSavedLayouts(section, userSlug)
    return saved ? reconcileLayouts(cards, saved) : buildDefaultLayouts(cards)
  })
  const [currentBp, setCurrentBp] = useState<keyof typeof DASHBOARD_GRID_ROW_HEIGHT>('lg')

  // Reconcile when the card set changes (visibility toggles, pinning).
  // Adjusted during render (React's "adjusting state when a prop changes"
  // pattern) rather than an effect.
  if (cardsKey !== prevCardsKey) {
    setPrevCardsKey(cardsKey)
    setLayouts(prev => reconcileLayouts(cards, prev))
  }

  const handleLayoutChange = useCallback(
    (_current: Layout[], all: Layouts) => {
      setLayouts(all)
      saveLayouts(section, userSlug, all)
    },
    [section, userSlug],
  )

  // Grow-to-fit (site audit F90). Every cell used to be a fixed 3x3 box that
  // clips whatever does not fit (Upcoming and Pipeline were cut mid-row). After
  // each render and on any DOM or width change, measure each card's natural
  // height and add rows until it fits. Grow only, so a card is never shorter
  // than its content; a card the user is resizing right now is left alone.
  // Cards with their own inner scroller (Recent Activity) report no overflow
  // and stay as they are.
  const wrapRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<Set<string>>(new Set())
  useEffect(() => {
    const root = wrapRef.current
    if (!root) return
    const rh = DASHBOARD_GRID_ROW_HEIGHT[currentBp]
    let timer = 0
    const fit = () => {
      const need = new Map<string, number>()
      root.querySelectorAll<HTMLElement>('.dashboard-grid-item[data-card-id]').forEach(item => {
        const id = item.dataset.cardId as string
        if (resizing.current.has(id)) return
        const el = item.querySelector<HTMLElement>('.bento-card') ?? item.querySelector<HTMLElement>('.dashboard-grid-card')
        if (!el || el.scrollHeight <= el.clientHeight + 1) return
        const rows = Math.min(Math.ceil((el.scrollHeight + GRID_MARGIN_Y) / (rh + GRID_MARGIN_Y)), 6 * GRID_SCALE)
        need.set(id, rows)
      })
      if (need.size === 0) return
      setLayouts(prev => {
        const list = prev[currentBp]
        if (!list || !list.some(l => (need.get(l.i) ?? 0) > l.h)) return prev
        return {
          ...prev,
          [currentBp]: list.map(l => {
            const rows = need.get(l.i)
            return rows && rows > l.h ? { ...l, h: rows, maxH: Math.max(l.maxH ?? rows, rows) } : l
          }),
        }
      })
    }
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(fit, 120) }
    schedule()
    const mo = new MutationObserver(schedule)
    mo.observe(root, { childList: true, subtree: true, characterData: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(root)
    return () => { window.clearTimeout(timer); mo.disconnect(); ro.disconnect() }
  }, [currentBp, cardsKey])

  if (cards.length === 0) return null

  return (
    <div ref={wrapRef}>
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
      onResizeStart={(_l, item) => { resizing.current.add(item.i) }}
      onResizeStop={(_l, item) => { resizing.current.delete(item.i) }}
      isBounded={false}
      useCSSTransforms
      compactType="vertical"
    >
      {cards.map(card => (
        <div key={card.id} data-testid={`card-${card.id}`} data-card-id={card.id} className="dashboard-grid-item">
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
    </div>
  )
}
