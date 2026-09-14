// CollapsibleBody — auto-collapse a long activity body to N lines with a
// "more"/"less" control (#126, Nick: "shouldn't comments autocollapse for
// visibility with an expand feature?").
//
// The decision is a MEASUREMENT, not a character count: the box is capped at
// `maxLines` line-heights and the control appears only when the content
// actually overflows that cap at the current width (re-checked on resize). A
// character heuristic shows "more" on bodies that fit and hides it on ones
// that wrap — the wrong signal on both sides.
//
// Max-height rather than -webkit-line-clamp so the same primitive bounds a
// plain pre-wrap paragraph AND a Hermes markdown answer (lists, code fences),
// which line-clamp handles inconsistently across block children.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface CollapsibleBodyProps {
  children: ReactNode
  /** Lines visible while collapsed. */
  maxLines?: number
  /** Font size the cap is computed against — set it HERE and let the body
   *  inherit, or the cap and the lines it counts disagree. */
  fontSize?: string | number
  /** What the content IS (the body string) — re-measured when it changes.
   *  `children` cannot serve: it is a new element every render. */
  contentKey?: string
}

// The body's own line-height; the cap is measured in the same unit.
const LINE_HEIGHT = 1.55

export function CollapsibleBody({ children, maxLines = 5, fontSize, contentKey }: CollapsibleBodyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Measure against the cap even while expanded, so collapsing back stays
  // offered only when it would actually hide something.
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const capPx = parseFloat(getComputedStyle(el).fontSize) * LINE_HEIGHT * maxLines
    setOverflows(el.scrollHeight > capPx + 1)
  }, [maxLines])

  // One observer for the row's lifetime (per cap). Keying it on `children`
  // (a fresh element every render) rebuilt it on every feed poll, for every
  // row, whether or not the text changed.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // Re-measure when the content changes.
  useLayoutEffect(() => { measure() }, [measure, contentKey])

  return (
    <>
      <div
        ref={ref}
        data-collapsible-body=""
        style={{
          lineHeight: LINE_HEIGHT,
          fontSize,
          ...(expanded ? {} : { maxHeight: `${maxLines * LINE_HEIGHT}em`, overflow: 'hidden' }),
        }}
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.85, background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}
        >{expanded ? 'less' : 'more'}</button>
      )}
    </>
  )
}
