import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout'
import {
  DASHBOARD_GRID_BREAKPOINTS,
  DASHBOARD_GRID_COLS,
  DASHBOARD_GRID_ROW_HEIGHT,
  GRID_MARGIN_Y,
  GRID_SCALE,
  breakpointForWidth,
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
  // The grid is not rendered until the wrapper has been measured, so the first
  // layout and currentBp both come from the real container width. WidthProvider
  // otherwise assumes 1280px (lg, 12 cols) for the first render and phones
  // painted half-width cards until a breakpoint change corrected it.
  const [measured, setMeasured] = useState(false)
  const hasCards = cards.length > 0

  // Reconcile when the card set changes (visibility toggles, pinning).
  // Adjusted during render (React's "adjusting state when a prop changes"
  // pattern) rather than an effect.
  if (cardsKey !== prevCardsKey) {
    setPrevCardsKey(cardsKey)
    setLayouts(prev => reconcileLayouts(cards, prev))
  }

  // Fit rows are the card's content height, recomputed on every change (it
  // grows and shrinks). They are a render-time override kept apart from the
  // saved layout, so nothing auto-sized reaches localStorage.
  const [fitRows, setFitRows] = useState<Record<string, number>>({})
  const [fitBp, setFitBp] = useState(currentBp)
  if (fitBp !== currentBp) { setFitBp(currentBp); setFitRows({}) }
  const defaultRows = useMemo(() => {
    const m = new Map<string, number>()
    cards.forEach(c => m.set(c.id, (c.defaultH ?? 1) * GRID_SCALE))
    return m
  }, [cards])
  const effectiveLayouts = useMemo<Layouts>(() => {
    const list = layouts[currentBp]
    if (!list) return layouts
    const cols = DASHBOARD_GRID_COLS[currentBp]
    return {
      ...layouts,
      [currentBp]: list.map(l => {
        // A card never renders narrower than its minimum width, so a stale
        // narrow saved layout cannot leave a phone card at half width.
        const w = Math.min(Math.max(l.w, l.minW ?? 1), cols)
        const fit = fitRows[l.i]
        // Size to content, shrinking as well as growing, unless the user
        // resized this card away from its default height.
        const userSized = l.h !== defaultRows.get(l.i)
        if (!fit || (userSized && fit < l.h)) return w === l.w ? l : { ...l, w }
        const h = Math.max(fit, l.minH ?? GRID_SCALE)
        return { ...l, w, h, maxH: Math.max(l.maxH ?? 0, h) }
      }),
    }
  }, [layouts, fitRows, currentBp, defaultRows])
  // Set during render, not in an effect: react-grid-layout fires onLayoutChange
  // from its componentDidUpdate (commit layout phase), before a parent passive
  // effect would refresh this, so an effect leaves the previous render's
  // effectiveLayouts here and the fit height gets persisted.
  const stateRef = useRef({ layouts, effectiveLayouts, currentBp })
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = { layouts, effectiveLayouts, currentBp }

  const handleLayoutChange = useCallback(
    (_current: Layout[], all: Layouts) => {
      // Undo the render-time minimum: an item still at the effective height
      // keeps the height the user saved.
      const { layouts: stored, effectiveLayouts: eff, currentBp: bp } = stateRef.current
      const list = all[bp]
      let next = all
      if (list) {
        next = {
          ...all,
          [bp]: list.map(l => {
            const e = eff[bp]?.find(x => x.i === l.i)
            const u = stored[bp]?.find(x => x.i === l.i)
            return e && u && l.h === e.h && e.h !== u.h ? { ...l, h: u.h } : l
          }),
        }
      }
      setLayouts(next)
      saveLayouts(section, userSlug, next)
    },
    [section, userSlug],
  )

  const wrapRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<Set<string>>(new Set())
  useLayoutEffect(() => {
    const root = wrapRef.current
    if (!root) return
    setCurrentBp(breakpointForWidth(root.clientWidth))
    setMeasured(true)
  }, [hasCards])
  useEffect(() => {
    const root = wrapRef.current
    if (!root || !measured) return
    const rh = DASHBOARD_GRID_ROW_HEIGHT[currentBp]
    let timer = 0
    const fit = () => {
      const need: Record<string, number> = {}
      root.querySelectorAll<HTMLElement>('.dashboard-grid-item[data-card-id]').forEach(item => {
        const id = item.dataset.cardId as string
        if (resizing.current.has(id)) return
        const el = item.querySelector<HTMLElement>('.bento-card') ?? item.querySelector<HTMLElement>('.dashboard-grid-card')
        if (!el) return
        // Natural height: let the card size to its content for one synchronous
        // read (no paint between), then put the inline height back.
        const prev = el.style.height
        el.style.height = 'auto'
        const natural = el.offsetHeight
        el.style.height = prev
        if (!natural) return
        need[id] = Math.min(Math.max(Math.ceil((natural + GRID_MARGIN_Y) / (rh + GRID_MARGIN_Y)), GRID_SCALE), 6 * GRID_SCALE)
      })
      setFitRows(prev => {
        const ids = Object.keys(need)
        const same = ids.length === Object.keys(prev).length && ids.every(k => prev[k] === need[k])
        return same ? prev : need
      })
    }
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(fit, 120) }
    schedule()
    const mo = new MutationObserver(schedule)
    mo.observe(root, { childList: true, subtree: true, characterData: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(root)
    return () => { window.clearTimeout(timer); mo.disconnect(); ro.disconnect() }
  }, [currentBp, cardsKey, measured])

  if (cards.length === 0) return null

  return (
    <div ref={wrapRef}>
    {measured && (
    <ResponsiveGridLayout
      measureBeforeMount
      className="dashboard-grid"
      layouts={effectiveLayouts}
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
      onResizeStop={(_l, item) => {
        resizing.current.delete(item.i)
        // Drop this card's fit height; a user-sized card then keeps its size
        // (the fit never shrinks a card the user resized).
        setFitRows(prev => { if (!(item.i in prev)) return prev; const n = { ...prev }; delete n[item.i]; return n })
      }}
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
    )}
    </div>
  )
}
