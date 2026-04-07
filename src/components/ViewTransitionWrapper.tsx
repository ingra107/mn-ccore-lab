import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

/**
 * ViewTransitionWrapper — uses the native View Transitions API to animate
 * route changes with a simple crossfade (opacity 0 -> 1, 200ms).
 * Falls back silently on unsupported browsers (no Framer Motion overhead).
 */
export default function ViewTransitionWrapper({ children }: { children: ReactNode }) {
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Only trigger on actual route changes
    if (prevPathRef.current === location.pathname) return
    prevPathRef.current = location.pathname

    // Check for native View Transitions API support
    if (!document.startViewTransition) {
      // Fallback: simple CSS opacity fade
      const el = containerRef.current
      if (!el) return
      el.style.opacity = '0'
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 200ms ease-in'
        el.style.opacity = '1'
      })
      return
    }

    // Use native View Transitions API
    document.startViewTransition(() => {
      // The DOM update happens synchronously during the callback
      // React has already committed by the time this effect runs,
      // so we just need to signal the transition
      return Promise.resolve()
    })
  }, [location.pathname])

  return (
    <>
      <div ref={containerRef} style={{ opacity: 1 }}>
        {children}
      </div>
      <style>{`
        /* Native View Transitions CSS — crossfade */
        ::view-transition-old(root) {
          animation: vt-fade-out 200ms ease-out forwards;
        }
        ::view-transition-new(root) {
          animation: vt-fade-in 200ms ease-in forwards;
        }
        @keyframes vt-fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes vt-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}
