import { useEffect, useRef } from 'react'

export function useScrollReveal<T extends HTMLElement>(
  threshold = 0.1,
  rootMargin = '0px 0px -40px 0px'
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    if (prefersReducedMotion) {
      el.classList.add('visible')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return ref
}

export function useScrollRevealGroup(
  selector = '.fade-in-up',
  staggerMs = 100
) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    const elements = container.querySelectorAll(selector)

    if (prefersReducedMotion) {
      elements.forEach((el) => el.classList.add('visible'))
      return
    }

    // Only animate elements that are below the current viewport
    const viewportBottom = window.scrollY + window.innerHeight

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const elementTop = rect.top + window.scrollY

      if (elementTop > viewportBottom - 50) {
        // Element is below viewport — animate it on scroll
        el.classList.add('will-animate')
      } else {
        // Element is already in viewport — show immediately
        el.classList.add('visible')
      }
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const animElements = Array.from(elements).filter((e) =>
              e.classList.contains('will-animate')
            )
            const index = animElements.indexOf(el)
            setTimeout(() => el.classList.add('visible'), Math.max(0, index) * staggerMs)
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    elements.forEach((el) => {
      if (el.classList.contains('will-animate')) {
        observer.observe(el)
      }
    })

    return () => observer.disconnect()
  }, [selector, staggerMs])

  return containerRef
}
