import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

/**
 * Shared page-root wrapper for portal pages.
 *
 * Owns the single content-width contract: max-width 1440px, centered, with
 * responsive horizontal padding (the `.content-container` rules in index.css).
 * The portal `<main>` (PortalLayout) already supplies vertical padding, so
 * pages should NOT add their own `minHeight`/`paddingBottom` on top of this.
 *
 * Intentionally NOT used by full-bleed operating surfaces (Today, MyTasks,
 * Calendar, Personal), which manage their own edge-to-edge layout.
 */
export default function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={`content-container${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
