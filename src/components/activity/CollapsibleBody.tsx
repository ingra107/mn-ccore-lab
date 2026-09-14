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

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface CollapsibleBodyProps {
  children: ReactNode
  /** Lines visible while collapsed. */
  maxLines?: number
  /** Line-height used for the cap; matches the body's own 1.55. */
  lineHeight?: number
  /** Font size the cap is computed against — set it HERE and let the body
   *  inherit, or the cap and the lines it counts disagree. */
  fontSize?: string | number
}

export function CollapsibleBody({ children, maxLines = 5, lineHeight = 1.55, fontSize }: CollapsibleBodyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      // Measure against the cap even while expanded, so collapsing back stays
      // offered only when it would actually hide something.
      const capPx = parseFloat(getComputedStyle(el).fontSize) * lineHeight * maxLines
      setOverflows(el.scrollHeight > capPx + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children, lineHeight, maxLines])

  return (
    <>
      <div
        ref={ref}
        data-collapsible-body=""
        style={{
          lineHeight,
          fontSize,
          ...(expanded ? {} : { maxHeight: `${maxLines * lineHeight}em`, overflow: 'hidden' }),
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
