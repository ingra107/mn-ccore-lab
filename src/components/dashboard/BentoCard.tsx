import { motion } from 'framer-motion'
import { useScrollReveal } from '../../hooks/useScrollReveal'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

type BentoSize = 'span-1' | 'span-2' | 'span-2x2' | 'span-1x2'

/** The card's one hero number, in Today's stat anatomy (rule, number, label). */
export interface BentoHero {
  value: number | string
  label: string
  /** Rule color job: accent = on track, urgent = going stale, overdue = late. */
  rule?: 'accent' | 'urgent' | 'overdue' | 'none'
  to?: string
  /** Tooltip with the breakdown the label leaves out. */
  title?: string
}

function HeroInner({ hero }: { hero: BentoHero }) {
  const rule = hero.rule ?? 'none'
  const cls = rule === 'accent' ? ' tk-t' : rule === 'urgent' ? ' tk-u' : rule === 'overdue' ? ' tk-o' : ''
  return (
    <>
      <span className={`tk-rl${cls}`} aria-hidden="true" />
      <span>
        <span className="tk-v" style={{ display: 'block' }}>{hero.value}</span>
        <span className="tk-l">{hero.label}</span>
      </span>
    </>
  )
}

interface BentoCardProps {
  title: string
  subtitle?: string
  /** Muted count after the title ("29"). */
  count?: string | number
  /** Right end of the head, after the hairline (a view switch). */
  headRight?: ReactNode
  /** The one hero number under the head. */
  hero?: BentoHero
  /** Same height on every card in the row (the four lead cards). */
  uniform?: boolean
  size?: BentoSize
  /** Accepted for old callers; the head no longer draws an icon. */
  icon?: LucideIcon
  badge?: string
  className?: string
  glass?: boolean
  /** Accepted for old callers; the decorative chevron is gone. */
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
  count,
  hero,
  headRight,
  uniform = false,
  size = 'span-1',
  badge,
  className = '',
  glass = false,
  noLift = false,
  children,
}: BentoCardProps) {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <div ref={ref} className={`fade-in-up ${sizeClasses[size]} ${className}`}>
      <motion.div
        layoutId={`bento-${title.replace(/\s+/g, '-').toLowerCase()}`}
        // Leaf card: the shared card material (color back pick 1, 2026-10-11)
        // gives the surface, edge, lit top and ambient shadow; glass overrides.
        className={`bento-card h-full${glass ? '' : ' sk-mat'}${uniform ? ' bento-uniform' : ''}`}
        style={{
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--density-card-padding, 1rem)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          background: glass ? 'rgba(255, 255, 255, 0.7)' : undefined,
          backdropFilter: glass ? 'blur(12px)' : undefined,
          WebkitBackdropFilter: glass ? 'blur(12px)' : undefined,
          ...(glass ? { border: 'none', boxShadow: '0 0 0 1px var(--border-subtle), var(--shadow-card)' } : {}),
          transition: 'transform 0.25s ease, box-shadow 0.25s ease, background-color 0.3s ease',
        }}
        whileHover={noLift ? undefined : {
          y: -2,
          boxShadow: 'inset 0 1px 0 var(--sk-rim), var(--shadow-card-hover)',
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
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.05em',
              color: 'var(--slate)',
              opacity: 0.75,
              lineHeight: 1,
              pointerEvents: 'none',
            }}
          >
            {badge}
          </span>
        )}

        {/* Header (Wave 3 Lab Overview, option A): the title, an optional muted
            count, a hairline that runs to the edge. No icon well and no subtitle
            line; the count and the one hero number carry the facts once. */}
        <div className="bento-hd">
          <h3 className="bento-hd-t">{title}</h3>
          {count !== undefined && <span className="bento-hd-n">{count}</span>}
          {!hero && subtitle && <span className="bento-hd-n">{subtitle}</span>}
          <span className="bento-hd-rule" aria-hidden="true" />
          {headRight}
        </div>

        {hero && (
          <div className="tk bento-hero">
            {hero.to ? (
              <Link to={hero.to} className="tk-st" aria-label={`${hero.value} ${hero.label}`} title={hero.title}>
                <HeroInner hero={hero} />
              </Link>
            ) : (
              <div className="tk-st" title={hero.title}>
                <HeroInner hero={hero} />
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0">{children}</div>
      </motion.div>
    </div>
  )
}
