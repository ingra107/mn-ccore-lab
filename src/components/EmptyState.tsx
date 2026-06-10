interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
  /**
   * P2-8: compact variant for tight rails (Today timeline, side panels).
   * Smaller padding + type so the designed empty state fits without
   * restructuring the surrounding layout.
   */
  compact?: boolean
}

export default function EmptyState({ icon, title, subtitle, action, compact = false }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '20px 16px' : '48px 24px',
        textAlign: 'center',
      }}
    >
      {/* Icon */}
      <div
        style={{
          color: 'var(--slate)',
          opacity: 0.75,
          fontSize: 0,
          lineHeight: 0,
        }}
      >
        {icon}
      </div>

      {/* Title */}
      <p
        style={{
          fontSize: compact ? 14 : 16,
          fontWeight: 500,
          color: 'var(--ink)',
          margin: 0,
          marginTop: compact ? 'var(--sp-sm)' : 'var(--sp-md)',
        }}
      >
        {title}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 400,
            color: 'var(--slate)',
            opacity: 0.85,
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
            marginTop: compact ? 'var(--sp-md)' : 'var(--sp-lg)',
            padding: compact ? 'var(--sp-xs) var(--sp-md)' : 'var(--sp-sm) var(--sp-lg)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            background: 'none',
            fontSize: compact ? 12 : 13,
            fontWeight: 500,
            color: 'var(--ink)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--teal-hover)'
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
