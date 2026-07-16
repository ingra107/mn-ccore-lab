import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Thin teal progress bar at the top of the viewport that animates
 * during route transitions. Mimics NProgress / YouTube-style bar.
 */
export default function RouteProgressBar() {
  const location = useLocation()
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Start progress on every route change (including mount — prevPathname
  // starts as null so the very first render counts as "changed" too).
  // Adjusted during render (React's "adjusting state when a prop changes"
  // pattern) rather than an effect; the timer-driven remainder of the
  // sequence below still needs a real effect.
  const [prevPathname, setPrevPathname] = useState<string | null>(null)
  if (location.pathname !== prevPathname) {
    setPrevPathname(location.pathname)
    setVisible(true)
    setProgress(30)
  }

  useEffect(() => {
    // Quick jump to ~70%
    timeoutRef.current = setTimeout(() => setProgress(70), 80)

    // Complete
    const completeTimer = setTimeout(() => {
      setProgress(100)
      // Hide after animation completes
      setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 200)
    }, 150)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      clearTimeout(completeTimer)
    }
  }, [location.pathname])

  if (!visible && progress === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 'var(--z-toast)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--teal)',
          transition: progress === 0
            ? 'none'
            : progress === 100
              ? 'width 150ms ease-out, opacity 200ms ease-out 100ms'
              : 'width 300ms ease-out',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(45, 138, 138, 0.4)',
        }}
      />
    </div>
  )
}
