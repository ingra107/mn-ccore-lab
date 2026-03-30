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
  sm: 'text-xl sm:text-2xl lg:text-3xl',
  md: 'text-2xl sm:text-3xl lg:text-4xl',
  lg: 'text-3xl sm:text-4xl lg:text-5xl',
} as const

const iconSizes = {
  sm: { box: 28, icon: 15 },
  md: { box: 32, icon: 17 },
  lg: { box: 36, icon: 19 },
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
  const weight = Tag === 'h1' ? 800 : 600
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
          fontFamily: 'var(--font-display)',
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
          className={`text-base sm:text-lg ${Icon ? 'ml-0' : ''}`}
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--slate)',
            marginTop: Icon ? '4px' : '12px',
            paddingLeft: Icon ? `${iconConfig.box + 12}px` : undefined,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
