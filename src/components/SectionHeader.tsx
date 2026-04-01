import type { LucideIcon } from 'lucide-react'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  as?: 'h1' | 'h2' | 'h3'
  size?: 'sm' | 'md' | 'lg'
  accentLine?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'text-lg sm:text-xl',
  md: 'text-xl sm:text-2xl',
  lg: 'text-2xl sm:text-3xl',
} as const

const iconSizes = {
  sm: { box: 24, icon: 13 },
  md: { box: 28, icon: 15 },
  lg: { box: 32, icon: 17 },
} as const

export default function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  as: Tag = 'h2',
  size = 'md',
  accentLine = false,
  className,
}: SectionHeaderProps) {
  const weight = Tag === 'h1' ? 700 : 600
  const iconConfig = iconSizes[size]

  const titleContent = (
    <div className="flex items-center gap-3">
      {Icon && (
        <div
          className="flex-shrink-0"
          style={{
            width: iconConfig.box,
            height: iconConfig.box,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(45, 138, 138, 0.1)',
          }}
        >
          <Icon size={iconConfig.icon} style={{ color: 'var(--teal)' }} />
        </div>
      )}
      <Tag
        className={sizeClasses[size]}
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: weight,
          color: 'var(--ink)',
          lineHeight: 1.2,
        }}
      >
        {title}
      </Tag>
    </div>
  )

  return (
    <div className={className}>
      {accentLine ? (
        <div className="flex items-center">
          {titleContent}
          <div className="section-header-line" />
        </div>
      ) : (
        titleContent
      )}
      {subtitle && (
        <p
          className="text-sm"
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            color: 'var(--slate)',
            opacity: 0.7,
            marginTop: '2px',
            paddingLeft: Icon ? `${iconConfig.box + 12}px` : undefined,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
