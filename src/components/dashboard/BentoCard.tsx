import { motion } from 'framer-motion'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type BentoSize = 'span-1' | 'span-2' | 'span-2x2' | 'span-1x2'

interface BentoCardProps {
  title: string
  subtitle?: string
  size?: BentoSize
  icon?: LucideIcon
  badge?: string
  className?: string
  glass?: boolean
  drillDown?: boolean
  noLift?: boolean
  children: ReactNode
}

const sizeClasses: Record<BentoSize, string> = {
  'span-1': '',
  'span-2': 'bento-span-2',
  'span-2x2': 'bento-span-2x2',
  'span-1x2': 'bento-span-1x2',
}

export default function BentoCard({
  title,
  subtitle,
  size = 'span-1',
  icon: Icon,
  badge,
  className = '',
  glass = false,
  drillDown = false,
  noLift = false,
  children,
}: BentoCardProps) {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <div ref={ref} className={`fade-in-up ${sizeClasses[size]} ${className}`}>
      <motion.div
        layoutId={`bento-${title.replace(/\s+/g, '-').toLowerCase()}`}
        className="bento-card h-full"
        style={{
          borderRadius: '16px',
          padding: 'var(--density-card-padding, 1.5rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          background: glass
            ? 'rgba(255, 255, 255, 0.7)'
            : 'var(--cream)',
          backdropFilter: glass ? 'blur(12px)' : undefined,
          WebkitBackdropFilter: glass ? 'blur(12px)' : undefined,
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease, background-color 0.3s ease',
        }}
        whileHover={noLift ? undefined : {
          y: -2,
          boxShadow: 'var(--shadow-card-hover)',
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {/* Type badge */}
        {badge && (
          <span
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              fontSize: '9px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--slate)',
              opacity: 0.4,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {badge}
          </span>
        )}

        {/* Header */}
        <div className="flex items-start gap-2.5 mb-3">
          {Icon && (
            <div
              className="flex-shrink-0 mt-0.5"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(201, 168, 76, 0.1)',
              }}
            >
              <Icon size={15} style={{ color: 'var(--gold)' }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3
              style={{
                fontWeight: 400,
                fontSize: '15px',
                lineHeight: 1.3,
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--slate)',
                  margin: '2px 0 0 0',
                  opacity: 0.7,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {drillDown && (
            <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0 mt-1 opacity-20" style={{ color: 'var(--slate)' }}>
              <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">{children}</div>
      </motion.div>
    </div>
  )
}
