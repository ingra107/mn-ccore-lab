import { useEffect, type RefObject } from 'react'

/**
 * A sideways-scrolling row says it continues: the hook marks the element
 * `data-fade="end" | "start" | "both"` while there is more that way, and index.css
 * fades that edge on a phone. No overflow, no mark, so a row that fits is left crisp.
 */
export function useEdgeFade(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const update = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft
      const before = el.scrollLeft > 1
      const after = more > 1
      const fade = before && after ? 'both' : after ? 'end' : before ? 'start' : null
      if (fade) el.dataset.fade = fade
      else delete el.dataset.fade
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [ref, enabled])
}
