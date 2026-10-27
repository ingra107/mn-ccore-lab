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
import { ChevronDown } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'

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
  /** The body's line-height; the cap is measured in the same unit. Set it HERE,
   *  not on a child: a child's own line-height overrides the wrapper's, and a
   *  3-line cap then shows 3.4 lines (1.375) or cuts the third (1.6). */
  lineHeight?: number
  /** The entry's own controls (reactions, Reply). They share ONE line with
   *  "more" (#153): "more" on the left, these after it; put `ml-auto` on a
   *  control that belongs at the far right. */
  actions?: ReactNode
}

const DEFAULT_LINE_HEIGHT = 1.55

export function CollapsibleBody({ children, maxLines = 5, fontSize, contentKey, lineHeight = DEFAULT_LINE_HEIGHT, actions }: CollapsibleBodyProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  // Measure against the cap even while expanded, so collapsing back stays
  // offered only when it would actually hide something.
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const capPx = parseFloat(getComputedStyle(el).fontSize) * lineHeight * maxLines
    setOverflows(el.scrollHeight > capPx + 1)
  }, [maxLines, lineHeight])

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

  const clipped = overflows && !expanded
  return (
    <>
      <div
        ref={ref}
        data-collapsible-body=""
        style={{
          lineHeight,
          fontSize,
          ...(expanded ? {} : { maxHeight: `${maxLines * lineHeight}em`, overflow: 'hidden' }),
          // The last line fades out while clipped: the text visibly continues,
          // which is the cue to click "more" (#153).
          ...(clipped ? {
            maskImage: `linear-gradient(to bottom, #000 calc(100% - ${lineHeight}em), transparent)`,
            WebkitMaskImage: `linear-gradient(to bottom, #000 calc(100% - ${lineHeight}em), transparent)`,
          } : {}),
        }}
      >
        {children}
      </div>
      {(overflows || actions) && (
        <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: overflows ? 2 : 6 }}>
          {overflows && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              // .hit-area: a 44px tap target on touch without growing the row.
              className="hit-area collapsible-more"
            >
              {expanded ? 'Show less' : 'Show more'}
              <ChevronDown size={12} {...ICON_PROPS} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
            </button>
          )}
          {actions}
        </div>
      )}
    </>
  )
}
