import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Reactive viewport check — returns true below 768px. SSR-safe (false until
 * first client render). Updates on resize via matchMedia, so rotating an iPad
 * from landscape → portrait re-evaluates.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}
