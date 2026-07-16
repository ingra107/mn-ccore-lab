// useNowMinutes — TP-09: 1px now-line clock. Updates every 60s via setInterval.
// Static — no animation — so prefers-reduced-motion is a no-op.
//
// Split out of Timeline.tsx (which now exports ONLY the Timeline component) —
// react-refresh/only-export-components requires a file to export exclusively
// components; this is a plain hook. Shared by Timeline/TimelineGrid and
// AgendaListView so both surfaces read the same clock without passing `now`
// as a prop (fixes #168 agenda now-marker freeze).
import { useState, useEffect } from 'react'

export function useNowMinutes(): number {
  const [now, setNow] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(d.getHours() * 60 + d.getMinutes())
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
