// useBackToClose — the browser Back gesture closes an overlay instead of
// leaving the page (Android back, iOS swipe-back). First user: TaskDetailPanel
// on a phone or tablet (2026-10-14: opened from Lab overview's Action Board,
// Back left the page with the panel still "open").
//
// Contract:
//   - On mount (when `enabled`), push ONE same-URL history entry tagged with a
//     marker. Popping off it calls onClose.
//   - Closing any other way (X, backdrop, swipe, Escape) unmounts the overlay;
//     the cleanup steps back off its entry so Back is not left with a dead step.
//   - A navigation away (a link inside the overlay) leaves the marker entry
//     behind on its own; history is not touched then.
//   - history.back() is async. If another overlay mounts before that step
//     lands (close one, open the next), it waits for the pop before pushing,
//     so the step-back cannot close the new overlay.
// `enabled` is read once at mount.

import { useEffect, useRef } from 'react'

let stepBackPending = false

function markerOf(): string | undefined {
  return (window.history.state as { overlay?: string } | null)?.overlay
}

export function useBackToClose(onClose: () => void, enabled: boolean) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const enabledAtMount = useRef(enabled)

  useEffect(() => {
    if (!enabledAtMount.current || typeof window === 'undefined') return
    const marker = `ov-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let pushed = false
    let popped = false
    let unmounted = false
    const push = () => {
      if (unmounted) return
      window.history.pushState({ ...(window.history.state ?? {}), overlay: marker }, '')
      pushed = true
    }
    const afterStepBack = () => {
      window.removeEventListener('popstate', afterStepBack)
      push()
    }
    const onPop = () => {
      if (!pushed || markerOf() === marker) return
      popped = true
      onCloseRef.current()
    }
    if (stepBackPending) window.addEventListener('popstate', afterStepBack)
    else push()
    window.addEventListener('popstate', onPop)
    return () => {
      unmounted = true
      window.removeEventListener('popstate', afterStepBack)
      window.removeEventListener('popstate', onPop)
      if (pushed && !popped && markerOf() === marker) {
        stepBackPending = true
        const settled = () => { stepBackPending = false; window.removeEventListener('popstate', settled) }
        window.addEventListener('popstate', settled)
        window.history.back()
      }
    }
  }, [])
}
