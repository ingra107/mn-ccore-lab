import { useLayoutEffect, type RefObject } from 'react'

/**
 * Size a full-height page to the space the portal shell actually leaves it.
 *
 * `height: 100vh` inside #portal-main is too tall by everything the shell puts
 * above (top bar, main padding) and below (main padding, status bar): the
 * element's bottom sits past the viewport, so a scroller inside it ends
 * off-screen and the last row of a j/k list can never come into view. The
 * height is MEASURED (no calc(100vh - N) guess that drifts when the chrome
 * changes) and written straight onto the element, like Meetings does.
 */
export function useFitViewportHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      let below = 0
      const main = el.closest('#portal-main') as HTMLElement | null
      if (main) {
        below += parseFloat(getComputedStyle(main).paddingBottom) || 0
        for (let sib = main.nextElementSibling as HTMLElement | null; sib; sib = sib.nextElementSibling as HTMLElement | null) {
          const pos = getComputedStyle(sib).position
          if (pos !== 'fixed' && pos !== 'absolute') below += sib.offsetHeight
        }
      }
      el.style.height = `${Math.max(320, Math.round(window.innerHeight - top - below))}px`
    }
    fit()
    // The page transition moves the element while it mounts; measure again once settled.
    const raf = requestAnimationFrame(() => requestAnimationFrame(fit))
    const settle = window.setTimeout(fit, 400)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(settle)
      window.removeEventListener('resize', fit)
    }
  }, [ref])
}
