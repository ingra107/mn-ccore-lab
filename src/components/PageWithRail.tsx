import type { CSSProperties, ReactNode } from 'react'

/**
 * The one main-column + rail page layout (s79, Nick 2026-10-12).
 *
 * Today, Project and Member each hand-built this grid with a different stack
 * point. This is the chokepoint: a page passes slots, never a grid.
 *
 * Slots, in DOM order (so Tab and the phone stack both read head, railTop,
 * main, rail): `head`, `railTop`, `children` (main), `rail`.
 *   - `side="end"` (default) puts the rail right of main; `"start"` puts it left.
 *   - `railFirst`: the rail leads main when stacked (and in the DOM). Member profile only.
 *   - `railHidden`, or no `rail`, gives one column with main at --col-main.
 *   - The grid stacks on a container query on the page band (see index.css
 *     `.pwr`), not on the viewport: the sidebar eats a different width per state.
 *   - The rail is sticky while two columns show.
 *
 * Styles: index.css "PageWithRail". A new hand-rolled `var(--col-rail)` grid
 * outside this file and index.css fails `npm run lint:page-rail`.
 */
export default function PageWithRail({
  head,
  railTop,
  rail,
  railLabel,
  side = 'end',
  railHidden = false,
  railFirst = false,
  testId,
  railTestId,
  railTopTestId,
  bandStyle,
  children,
}: {
  head?: ReactNode
  railTop?: ReactNode
  rail?: ReactNode
  /** aria-label of the rail landmark. */
  railLabel: string
  side?: 'end' | 'start'
  railHidden?: boolean
  /** Stacked, the rail comes before main (a profile that leads its page). DOM order follows. */
  railFirst?: boolean
  testId?: string
  railTestId?: string
  railTopTestId?: string
  /** Style on the band wrapper: a width cap, or `--pwr-top` (the rail's sticky offset when a page's fixed bar is not the portal's 56px one). */
  bandStyle?: CSSProperties
  children: ReactNode
}) {
  const hasRail = !!rail && !railHidden
  const railEl = hasRail && (
    <aside className="pwr-rail" aria-label={railLabel} data-testid={railTestId}>
      {rail}
    </aside>
  )
  return (
    <div className="pwr-band" style={bandStyle}>
      <div className={`pwr${side === 'start' ? ' pwr-start' : ''}${hasRail ? '' : ' pwr-norail'}${railFirst ? ' pwr-rf' : ''}`} data-testid={testId}>
        {head && <header className="pwr-head">{head}</header>}
        {hasRail && (
          <div
            className="pwr-top"
            data-testid={railTopTestId}
            role={railTop ? 'region' : undefined}
            aria-label={railTop ? `${railLabel} actions` : undefined}
          >
            {railTop}
          </div>
        )}
        {railFirst && railEl}
        <div className="pwr-main">{children}</div>
        {!railFirst && railEl}
      </div>
    </div>
  )
}
