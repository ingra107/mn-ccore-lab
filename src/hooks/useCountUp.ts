import { useState, useEffect, useRef, useCallback } from 'react'

export function useCountUp(
  target: number,
  duration: number = 2000,
  startOnView: boolean = true
) {
  const [count, setCount] = useState(0)
  const hasStartedRef = useRef(false)
  const lastTargetRef = useRef(target)
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  // Allow restart when target changes (e.g., async data arrives)
  if (target !== lastTargetRef.current && target > 0 && lastTargetRef.current === 0) {
    hasStartedRef.current = false
    lastTargetRef.current = target
  }

  const startAnimation = useCallback(() => {
    if (hasStartedRef.current) return
    if (target === 0) return // Don't animate to 0
    hasStartedRef.current = true

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion) {
      setCount(target)
      return
    }

    // Cancel any existing animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [target, duration])

  useEffect(() => {
    if (!startOnView) {
      startAnimation()
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStartedRef.current) {
          startAnimation()
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [startOnView, startAnimation])

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { count, ref }
}
