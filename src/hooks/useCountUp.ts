import { useState, useEffect, useRef } from 'react'

export function useCountUp(
  target: number,
  duration: number = 2000,
  startOnView: boolean = true
) {
  const [count, setCount] = useState(0)
  const hasStartedRef = useRef(false)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Observer to trigger animation when element enters viewport
  useEffect(() => {
    if (!startOnView) {
      hasStartedRef.current = true
      setStarted(true)
      return
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion) {
      setCount(target)
      hasStartedRef.current = true
      setStarted(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStartedRef.current) {
          hasStartedRef.current = true
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [startOnView, target]) // removed hasStarted from deps

  // Animation effect
  useEffect(() => {
    if (!started) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion) {
      setCount(target)
      return
    }

    let rafId: number
    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) {
        rafId = requestAnimationFrame(animate)
      }
    }
    rafId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(rafId)
  }, [started, target, duration])

  return { count, ref }
}
