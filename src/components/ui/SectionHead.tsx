import type { ReactNode, Ref } from 'react'

// SectionHead -- the one section head (color back pick 3, Nick 2026-10-11):
// a bold head, a dim count, then a short gray hairline that fades out. The
// teal tick and the gold rule it replaces both spent a color on nothing.
// The fade is CSS (.sk-hd::after in index.css), the same rule Today's
// collapsible heads use, so the line looks the same on every page.

interface SectionHeadProps {
  title: ReactNode
  /** Dim count or short fact after the title ("3", "2 of 5", "4 upcoming"). */
  count?: ReactNode
  /** DEPRECATED: only the Project detail files still pass it; the project redesign lane removes it and this prop. */
  icon?: ReactNode
  /** Controls pinned right, after the fade (a link, a "+ Add" button). */
  right?: ReactNode
  as?: 'h2' | 'h3'
  id?: string
  /** Ref to the title element; when set it is also programmatically focusable. */
  titleRef?: Ref<HTMLHeadingElement>
  className?: string
}

export default function SectionHead({ title, count, icon, right, as: Tag = 'h2', id, titleRef, className }: SectionHeadProps) {
  return (
    <div className={`sk-hd${className ? ` ${className}` : ''}`}>
      {icon != null && <span className="sk-hd-ic" aria-hidden="true">{icon}</span>}
      <Tag id={id} ref={titleRef} tabIndex={titleRef ? -1 : undefined} style={titleRef ? { outline: 'none' } : undefined} className="sk-hd-t">{title}</Tag>
      {count != null && count !== '' && <span className="sk-hd-c">{count}</span>}
      {right != null && <div className="sk-hd-r">{right}</div>}
    </div>
  )
}
