import type { ReactNode } from 'react'

// SectionHead -- the one section head (color back pick 3, Nick 2026-10-11):
// a bold head, a dim count, then a short gray hairline that fades out. The
// teal tick and the gold rule it replaces both spent a color on nothing.
// The fade is CSS (.sk-hd::after in index.css), the same rule Today's
// collapsible heads use, so the line looks the same on every page.

interface SectionHeadProps {
  title: ReactNode
  /** Dim count or short fact after the title ("3", "2 of 5", "4 upcoming"). */
  count?: ReactNode
  /** Small leading glyph, drawn gray. */
  icon?: ReactNode
  /** Controls pinned right, after the fade (a link, a "+ Add" button). */
  right?: ReactNode
  as?: 'h2' | 'h3'
  id?: string
  className?: string
}

export default function SectionHead({ title, count, icon, right, as: Tag = 'h2', id, className }: SectionHeadProps) {
  return (
    <div className={`sk-hd${className ? ` ${className}` : ''}`}>
      {icon != null && <span className="sk-hd-ic" aria-hidden="true">{icon}</span>}
      <Tag id={id} className="sk-hd-t">{title}</Tag>
      {count != null && count !== '' && <span className="sk-hd-c">{count}</span>}
      {right != null && <div className="sk-hd-r">{right}</div>}
    </div>
  )
}
