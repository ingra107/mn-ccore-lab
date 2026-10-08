// useNowMinutes — TP-09: 1px now-line clock. Updates every 60s via setInterval.
// Static — no animation — so prefers-reduced-motion is a no-op.
//
// Split out of Timeline.tsx (which now exports ONLY the Timeline component) —
// react-refresh/only-export-components requires a file to export exclusively
// components; this is a plain hook. Shared by Timeline/TimelineGrid and
// AgendaListView so both surfaces read the same clock without passing `now`
// as a prop (fixes #168 agenda now-marker freeze).
//
// #138: a bare 60s setInterval is not enough. A hidden or sleeping tab has its
// timers throttled or frozen, so the minute state stayed at the value from
// before the tab went away while other renders (e.g. the "12:58 PM now" label,
// which read the wall clock directly) showed the real time: the line sat at the
// old minute and the label disagreed with it. We now also re-read the clock the
// moment the tab becomes visible / regains focus / is restored from bfcache.
import { useState, useEffect } from 'react'

/** Minutes since local midnight for `d` (the unit the timeline axis uses). */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** "12:58 PM" for a minutes-since-midnight value, in the same clock the line uses. */
export function formatNowLabel(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function useNowMinutes(): number {
  const [now, setNow] = useState(() => minutesOfDay(new Date()))
  useEffect(() => {
    const tick = () => setNow(minutesOfDay(new Date()))
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    window.addEventListener('pageshow', tick)
    // Catch up immediately in case the clock moved between render and effect.
    tick()
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
      window.removeEventListener('pageshow', tick)
    }
  }, [])
  return now
}
