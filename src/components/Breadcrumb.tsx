import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

interface BreadcrumbProps {
  backTo: string
  backLabel: string
  current?: string
  maxLength?: number
}

// Breadcrumb: lightweight trail for nested/detail pages (ProjectDetail, MeetingDetail, MemberPage)
export default function Breadcrumb({ backTo, backLabel, current, maxLength = 40 }: BreadcrumbProps) {
  const truncated = current && current.length > maxLength
    ? current.slice(0, maxLength) + '...'
    : current

  return (
    <div style={{ paddingTop: '1.5rem', marginBottom: '1rem' }}>
      {/* M-08: single breadcrumb nav — no redundant Back button. Arrow integrated into parent link. */}
      <nav className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--slate)' }}>
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 hover:!opacity-100 transition-opacity"
          style={{ color: 'var(--slate)', textDecoration: 'none', opacity: 0.85 }}
        >
          <ArrowLeft {...ICON_PROPS} size={12} />
          {backLabel}
        </Link>
        {current && (
          <>
            <span style={{ opacity: 0.85 }}>/</span>
            <span style={{ color: 'var(--ink)', opacity: 0.8 }}>{truncated}</span>
          </>
        )}
      </nav>
    </div>
  )
}
