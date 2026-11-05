import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

// Progressive disclosure for a long list (rules-ui-design.md principle 5:
// show what is needed to decide, the rest one click away).
//
// The member trajectory page drew every row it was given: 759 timeline
// entries made the phone page 125,000px tall (overnight audit 2026-10-14,
// G9-3/G9-4/G11-2). A list that can grow without bound goes through
// useShowMore, so its first paint is capped by construction. Render the
// control with ui/ShowMore's ShowMoreButton.
//
// A printout has no "Show more" to press, so while the page prints every list
// shows all its rows and the control goes away. flushSync because the browser
// takes its print snapshot right after `beforeprint` returns.

export interface ShowMoreState<T> {
  visible: readonly T[]
  hidden: number
  total: number
  expanded: boolean
  more: () => void
  less: () => void
  step: number
}

/** The first `step` items, and `step` more on each "Show more". */
export function useShowMore<T>(items: readonly T[], step: number): ShowMoreState<T> {
  const [shown, setShown] = useState(step)
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  const visible = !printing && items.length > shown ? items.slice(0, shown) : items
  return {
    visible,
    hidden: items.length - visible.length,
    total: items.length,
    expanded: !printing && shown > step,
    more: () => setShown((n) => n + step),
    less: () => setShown(step),
    step,
  }
}
