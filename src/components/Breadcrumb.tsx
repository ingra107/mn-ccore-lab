import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

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
    <div style={{ paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
      {current && (
        <nav className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--slate)' }}>
          <Link to={backTo} style={{ color: 'var(--slate)', textDecoration: 'none', opacity: 0.5 }}>{backLabel}</Link>
          <span style={{ opacity: 0.3 }}>/</span>
          <span style={{ color: 'var(--ink)', opacity: 0.8 }}>{truncated}</span>
        </nav>
      )}
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 mt-1 hover:!opacity-100 transition-opacity"
        style={{
          fontSize: '14px',
          color: 'var(--slate)',
          textDecoration: 'none',
          opacity: 0.7,
        }}
      >
        <ArrowLeft size={16} />
        Back to {backLabel}
      </Link>
    </div>
  )
}
