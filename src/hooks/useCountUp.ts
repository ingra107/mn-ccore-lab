import { useState, useEffect, useRef, useCallback } from 'react'

export function useCountUp(
  target: number,
  duration: number = 2000,
  startOnView: boolean = true
) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const animatedRef = useRef(false)
  const prevTargetRef = useRef(target)

  const animate = useCallback((to: number) => {
    if (to === 0) return

    animatedRef.current = true

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

  // When startOnView is true, show the target value until the IntersectionObserver
  // fires and the count-up animation begins. This prevents "0" from appearing in
  // the DOM before the user scrolls the section into view (for SEO/accessibility).
  // When startOnView is false (hero stats), the animation starts immediately so
  // we always use the animated count.
  // animatedRef must NOT be state here: flipping it via setState would force an
  // extra render between "animation started" and "first RAF frame lands a real
  // count", flashing 0 in the DOM — exactly what this fallback exists to prevent.
  // The ref write never itself triggers a render; it is only observed on the
  // next render already caused by setCount.
  // eslint-disable-next-line react-hooks/refs -- see comment above
  const display = (startOnView && !animatedRef.current) ? target : count

  return { count: display, ref }
}
