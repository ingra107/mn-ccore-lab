import { useLayoutEffect, type RefObject } from 'react'
import { viewportBottom } from '../lib/viewportBottom'

interface FitViewportOptions {
  /** Floor for the page height in px. Default 320. */
  minHeight?: number
  /**
   * Also floor the height at (first child's height + this). For a page whose
   * first child is a fixed header and whose body needs at least this many px:
   * a tall header then scrolls the document instead of pushing the body over
   * the status bar. The first child must be flexShrink:0 so its height does
   * not depend on the page height.
   */
  headerFloor?: number
  /** True: do not fit. The element gets height auto and min-height 100vh. */
  fill?: boolean
}

/**
 * Size a full-height page to the space the portal shell actually leaves it.
 *
 * `height: 100vh` inside #portal-main is too tall by everything the shell puts
 * above (top bar, main padding) and below (main padding, status bar): the
 * element's bottom sits past the viewport, so a scroller inside it ends
 * off-screen and the last row of a j/k list can never come into view. The
 * height is MEASURED (no calc(100vh - N) guess that drifts when the chrome
 * changes) and written straight onto the element (an external-system update,
 * not React state).
 *
 * It refits on window resize, on a resize of the first child, <body> or
 * #portal-main (record forms, focus mode collapsing the top bar, the shell
 * reflowing), and once after the page transition has settled. fit() writes the
 * element's own height and, while the phone tab bar shows, main's bottom
 * padding (a fixed 0, the same value every run). The padding write does change
 * #portal-main's size, but only on the first fit after the bar appears; the
 * refit it triggers writes the same values, so the observer settles in one pass.
 */
export function useFitViewportHeight(
  ref: RefObject<HTMLElement | null>,
  { minHeight = 320, headerFloor, fill = false }: FitViewportOptions = {},
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (fill) {
      el.style.height = ''
      el.style.minHeight = '100vh'
      return
    }
    // Remember main's own inline padding while the hook has it zeroed.
    let zeroed = false
    let savedPadding = ''
    const zeroPadding = (main: HTMLElement, on: boolean) => {
      if (on && !zeroed) { savedPadding = main.style.paddingBottom; zeroed = true }
      if (on) main.style.paddingBottom = '0px'
      else if (zeroed) { main.style.paddingBottom = savedPadding; zeroed = false }
    }
    const fit = () => {
      el.style.minHeight = '0px'
      const top = el.getBoundingClientRect().top + window.scrollY
      let below = 0
      const main = el.closest('#portal-main') as HTMLElement | null
      // Below lg a fixed tab bar owns the bottom of the screen and the shell
      // ends at its top edge. main's bottom padding is window-scroll clearance
      // (tab bar + floater reserve) for pages whose document scrolls; a fitted
      // shell scrolls inside itself (its scroller carries .fab-clear), so it
      // would only leave a blank band above the bar (127px at 390, overnight
      // 2026-10-14) and, if left in place, make the document taller than the
      // screen. So while the bar shows, the padding is zeroed here; it is
      // restored on resize past lg and on unmount.
      const screenEnd = viewportBottom()
      const barShowing = screenEnd < window.innerHeight
      if (barShowing) {
        below += window.innerHeight - screenEnd
        if (main) zeroPadding(main, true)
      } else if (main) {
        zeroPadding(main, false)
        below += parseFloat(getComputedStyle(main).paddingBottom) || 0
      }
      if (main) {
        for (let sib = main.nextElementSibling as HTMLElement | null; sib; sib = sib.nextElementSibling as HTMLElement | null) {
          const pos = getComputedStyle(sib).position
          if (pos !== 'fixed' && pos !== 'absolute') below += sib.offsetHeight
        }
      }
      const headerH = headerFloor == null ? 0 : (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0
      const floor = headerFloor == null ? minHeight : Math.max(minHeight, headerH + headerFloor)
      el.style.height = `${Math.max(floor, Math.round(window.innerHeight - top - below))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    let raf = 0
    const refit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit) }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null
    if (ro) {
      if (headerFloor != null && el.firstElementChild) ro.observe(el.firstElementChild)
      ro.observe(document.body)
      const main = el.closest('#portal-main')
      if (main) ro.observe(main)
    }
    // PageTransition animates the page in; re-measure once it has settled.
    const settle = window.setTimeout(fit, 450)
    return () => {
      const main = el.closest('#portal-main') as HTMLElement | null
      if (main) zeroPadding(main, false)
      window.removeEventListener('resize', fit)
      ro?.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(settle)
    }
  }, [ref, minHeight, headerFloor, fill])
}
