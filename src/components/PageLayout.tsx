/**
 * PageLayout — consistent vertical rhythm wrapper for portal pages.
 *
 * Enforces max-width, horizontal padding, and a flex-col gap so every
 * page that adopts it shares the same outer cadence:
 *   PageHeader -> FilterBar -> Content
 */

interface PageLayoutProps {
  children: React.ReactNode
  className?: string
}

export default function PageLayout({ children, className }: PageLayoutProps) {
  return (
    <div
      className={`flex flex-col gap-4 ${className || ''}`}
      style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}
    >
      {children}
    </div>
  )
}
