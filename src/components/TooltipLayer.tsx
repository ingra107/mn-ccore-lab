// Global styled tooltip layer.
//
// Why this exists: the first cut of the styled tooltip was a CSS `::after` on a
// `.tip` element. That pseudo-element is clipped by ANY ancestor with
// `overflow: hidden` (dense rows, scroll containers, 44×44 thumbnails), so the
// chip showed only its top sliver — Nick 2026-07-09 ("you can only see the top
// part of the box"). Native `title` never clipped because it renders in the
// browser's top layer.
//
// This layer restores that behavior with a beautified chip: one delegated
// listener watches the whole document for hover on any `[data-tip]` element and
// renders a single `position: fixed` chip in a portal at <body>. Fixed +
// portal-at-root escapes every overflow ancestor. Position is dynamic —
// anchored bottom-right of the POINTER (the native feel Nick likes), then
// clamped/flipped so it never spills past a viewport edge.
//
// Call sites don't change: any element with a non-empty `data-tip` attribute
// gets the tooltip. The `.tip` / `.tip-end` classes are now inert markers.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TipAnchor { text: string; cx: number; cy: number }

export function TooltipLayer() {
  const [tip, setTip] = useState<TipAnchor | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const activeEl = useRef<Element | null>(null)
  const chipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const clear = () => {
      activeEl.current = null
      setTip(null)
      setPos(null)
    }
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null
      if (!el) return
      // Already showing for this element — keep it stationary (native behavior).
      if (el === activeEl.current) return
      const text = el.getAttribute('data-tip')
      if (!text) return
      activeEl.current = el
      setPos(null)                       // hide until re-measured against the viewport
      setTip({ text, cx: e.clientX, cy: e.clientY })
    }
    const onOut = (e: MouseEvent) => {
      if (!activeEl.current) return
      const related = e.relatedTarget as Node | null
      if (related && activeEl.current.contains(related)) return  // moved to a child — stay
      clear()
    }
    // The chip is anchored to a captured pointer position; once the page scrolls
    // that position is stale, so dismiss rather than let it float detached.
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('blur', clear)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // Measure the rendered chip, then clamp/flip so it stays on screen.
  useLayoutEffect(() => {
    if (!tip || !chipRef.current) return
    const w = chipRef.current.offsetWidth
    const h = chipRef.current.offsetHeight
    const offX = 14, offY = 18, pad = 8
    let left = tip.cx + offX
    let top = tip.cy + offY
    if (left + w + pad > window.innerWidth) left = tip.cx - w - offX   // flip to the left of the pointer
    if (left < pad) left = pad
    if (top + h + pad > window.innerHeight) top = tip.cy - h - offY    // flip above the pointer
    if (top < pad) top = pad
    // Genuine post-layout measurement: chipRef's rendered size is only knowable
    // after paint, so this can't be computed during render. Textbook
    // useLayoutEffect "measure then adjust" use case.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setPos({ left, top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={chipRef}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos?.left ?? tip.cx + 14,
        top: pos?.top ?? tip.cy + 18,
        opacity: pos ? 1 : 0,                 // render offscreen-invisible for the measure pass
        zIndex: 9999,
        pointerEvents: 'none',
        maxWidth: 'min(340px, 90vw)',
        whiteSpace: 'normal',                 // long tips wrap instead of forming a giant strip
        fontWeight: 500,
        fontSize: '0.72rem',
        lineHeight: 1.35,
        letterSpacing: '0.01em',
        color: '#eef2f7',
        background: '#20293a',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 7,
        padding: '5px 9px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        transition: 'opacity 0.1s ease',
      }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}
