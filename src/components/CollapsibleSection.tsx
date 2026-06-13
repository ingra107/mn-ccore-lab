import { useState, useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../lib/iconProps'

interface CollapsibleSectionProps {
  title: string
  icon?: React.ReactNode
  badge?: string | number | null
  defaultOpen?: boolean
  storageKey?: string
  children: React.ReactNode
}

/**
 * Animated collapsible section with chevron rotation.
 * Stores expanded state in localStorage when storageKey is provided.
 */
export default function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  storageKey,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`collapsible-${storageKey}`)
      if (stored !== null) return stored === 'true'
    }
    return defaultOpen
  })

  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(open ? undefined : 0)

  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(`collapsible-${storageKey}`, String(open))
    }
  }, [open, storageKey])

  useEffect(() => {
    if (!contentRef.current) return
    if (open) {
      const h = contentRef.current.scrollHeight
      setHeight(h)
      // Match transition duration below (180ms) before clearing to 'auto'
      // so dynamically-arriving content (lazy data) can grow naturally.
      const timer = setTimeout(() => setHeight(undefined), 200)
      return () => clearTimeout(timer)
    } else {
      // Set explicit height first so transition works
      setHeight(contentRef.current.scrollHeight)
      requestAnimationFrame(() => {
        setHeight(0)
      })
    }
  }, [open])

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full group"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 'var(--sp-xs) 0',
          textAlign: 'left',
        }}
      >
        <ChevronRight {...ICON_PROPS}
          size={12}
          style={{
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
            flexShrink: 0,
          }}
        />
        {icon}
        <span
          style={{
            fontSize: 'var(--label-size)',
            fontWeight: 'var(--label-weight)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.04em',
          }}
        >
          {title}
        </span>
        {badge != null && badge !== '' && badge !== 0 && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--teal)',
              opacity: 0.85,
              marginLeft: '2px',
            }}
          >
            ({badge})
          </span>
        )}
      </button>
      <div
        ref={contentRef}
        className="collapsible-section-content"
        style={{
          height: height !== undefined ? `${height}px` : 'auto',
          overflow: 'hidden',
          // M-09: 180ms ease-out matches ticket spec; reduced-motion drops
          // the transition entirely (CSS handles via media query below).
          transition: 'height 180ms cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        <div style={{ paddingTop: 6 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
