import { useState, useEffect, useRef, useCallback } from 'react'

export function useCountUp(
  target: number,
  duration: number = 2000,
  startOnView: boolean = true
) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const prevTargetRef = useRef(target)

  const animate = useCallback((to: number) => {
    if (to === 0) return

    // Cancel any existing animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion) {
      setCount(to)
      return
    }

    const startTime = performance.now()
    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * to))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [duration])

  // Main effect: start animation based on visibility or immediately
  useEffect(() => {
    if (!startOnView) {
      animate(target)
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }

    let started = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true
          animate(target)
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )

    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [startOnView, animate, target])

  // Re-animate when target changes from 0 to a real value (async data arrival)
  useEffect(() => {
    if (prevTargetRef.current === 0 && target > 0) {
      animate(target)
    }
    prevTargetRef.current = target
    // No cleanup here — the main effect handles RAF cleanup
  }, [target, animate])

  return { count, ref }
}
