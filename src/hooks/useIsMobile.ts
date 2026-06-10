import { useEffect, useState } from 'react'

// UX-9 (2026-06-09): unified to 1024 (`lg`) so the "mobile" layout state lines
// up with the nav split. The desktop sidebar only mounts at ≥1024 (`lg:block`
// in PortalLayout), so 768–1023 (iPad portrait) has NO sidebar — it must run
// the mobile-nav system (MobileTabBar + hamburger) AND mobile chrome
// (bottom-sheet modals, compose sheets). Previously this split at 768 while
// nav split at 1024, leaving iPad portrait with desktop modals + no tab bar.
const MOBILE_BREAKPOINT = 1024

/**
 * Reactive viewport check — returns true below 1024px (the `lg` nav split).
 * SSR-safe (false until first client render). Updates on resize via matchMedia,
 * so rotating an iPad from landscape → portrait re-evaluates.
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
