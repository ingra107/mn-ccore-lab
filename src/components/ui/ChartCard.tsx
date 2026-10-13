import type { ReactNode } from 'react'
import SectionHead from './SectionHead'

// ChartCard -- one card per chart, the title inside (Wave 3 item 2, option A).
// Analytics, Insights and PI Analytics all draw their chart panels through it:
// the card material is .sk-mat (same as every other panel), the title is the
// shared SectionHead (bold head, dim count, gray fade) set at the top of the
// card, so there is one title and no box-in-box. Charts can sit side by side
// at 2:1 in a grid; the card fills its grid cell.

interface ChartCardProps {
  title: ReactNode
  /** Dim fact after the title ("4 weeks", "Last 30 days", "PI only"). */
  count?: ReactNode
  /** Controls pinned right of the head. */
  right?: ReactNode
  children: ReactNode
  /** Extra classes on the card (margins, grid spans). */
  className?: string
  /** Tighter padding for phone-width cards that hold wide charts. */
  dense?: boolean
}

export default function ChartCard({ title, count, right, children, className, dense }: ChartCardProps) {
  return (
    <section
      className={`sk-mat rounded-xl ${dense ? 'p-3 sm:p-5' : 'p-4 sm:p-5'}${className ? ` ${className}` : ''}`}
      style={{ minWidth: 0 }}
    >
      <SectionHead as="h3" title={title} count={count} right={right} />
      {children}
    </section>
  )
}
