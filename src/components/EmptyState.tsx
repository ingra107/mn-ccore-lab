interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      {/* Icon */}
      <div
        style={{
          color: 'var(--slate)',
          opacity: 0.3,
          fontSize: 0,
          lineHeight: 0,
        }}
      >
        {icon}
      </div>

      {/* Title */}
      <p
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: 'var(--ink)',
          margin: 0,
          marginTop: 12,
        }}
      >
        {title}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: 'var(--slate)',
            opacity: 0.6,
            margin: 0,
            marginTop: 6,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}

      {/* Action button */}
      {action && (
        <button
          onClick={action.onClick}
          aria-label={action.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 16,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            background: 'none',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(45, 138, 138, 0.06)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
