// HeroNumber — one telling number per page, in Today's stat face, beside the
// title (color-back pick 2, Nick 2026-10-11; principle 6, numbers as heroes).
// No pill, no box. It is a real link to the list it counts, or plainly static:
// pass `to` only when the destination exists.

import { Link } from 'react-router-dom'

export interface HeroNumberProps {
  value: number
  label: string
  /** A real destination for the number; absent = not clickable. */
  to?: string
  /** Screen-reader / hover name for the destination. */
  dest?: string
}

export default function HeroNumber({ value, label, to, dest }: HeroNumberProps) {
  // A zero is dim, the way Today's stat line dims one: nothing to read here.
  const cls = `pg-hero${value === 0 ? ' pg-hero-zero' : ''}`
  const inner = (
    <>
      <span className="pg-hero-n">{value.toLocaleString()}</span>
      <span className="pg-hero-l">{label}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls} data-testid="hero-number" aria-label={`${value} ${label}${dest ? `: open ${dest}` : ''}`} title={dest}>
        {inner}
      </Link>
    )
  }
  return <span className={cls} data-testid="hero-number">{inner}</span>
}
