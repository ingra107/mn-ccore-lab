// PomodoroControl — Start/Stop focus timer button for TodayPage header.
//
// Wires to the local Flask pomodoro server at localhost:5555. Laptop-only by
// design (phone can't reach localhost). Three states:
//   1. Server unreachable → disabled gray button "⏱ Pomo" (no crash, clear cue)
//   2. Stopped           → gold  button "▶ Focus"  (matches Process button style)
//   3. Active            → teal  button "⏹ M:SS"   (live tick, stop on click)
//
// Placed next to the PI-only Process button in TodayPage; guarded by user.isPi
// at the call site. Only Nick's machine runs the server, so no relay needed.

import { useEffect, useState } from 'react'
import { useLocalPomodoro } from '../../hooks/useLocalPomodoro'
import { useToast } from '../../hooks/useToast'
import { ACCENT_GOLD, ACCENT_TEAL, withAlpha } from '../../lib/taskGrouping'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function PomodoroControl() {
  const { status, serverReachable, isLoading, start, stop } = useLocalPomodoro()
  const { showSuccess } = useToast()

  // Local tick: derives elapsed from start_time every second so the display
  // stays live between the 5s background polls. This state is owned ONLY by
  // the ticking effect below — while inactive there's nothing to tick, so we
  // never push a value into it from a "reset" branch. Instead the displayed
  // value (`displayElapsed`) is derived at render time: ticking `localElapsed`
  // while active, the server-reported `elapsed_seconds` otherwise. This was
  // previously a setState-in-effect (an early-return branch that reset
  // localElapsed to elapsed_seconds whenever inactive) — that branch was pure
  // derived state with no independent purpose (every active-session tick
  // recomputes elapsed fully from start_time via Date.now(), never reading the
  // prior localElapsed), so the reset is now a render-time computation instead
  // of a state write.
  const [localElapsed, setLocalElapsed] = useState<number>(0)
  useEffect(() => {
    if (!status?.active || !status.start_time) return
    const tick = () => {
      // start_time is Python datetime.now().isoformat() — local time, no tz offset.
      // JS parses no-tz ISO strings as local time, so the subtraction is correct
      // as long as browser + server are on the same machine (which they are).
      const elapsed = Math.round((Date.now() - new Date(status.start_time!).getTime()) / 1000)
      setLocalElapsed(Math.max(0, elapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status?.active, status?.start_time])

  const displayElapsed = status?.active ? localElapsed : (status?.elapsed_seconds ?? 0)

  const handleStart = async () => {
    await start()
    if (serverReachable) showSuccess('Focus timer started')
    // If unreachable, the hook clears serverReachable → button flips to idle state.
  }

  const handleStop = async () => {
    const minLogged = Math.round(displayElapsed / 60)
    await stop()
    showSuccess(`Focus session stopped — ${minLogged}m logged`)
  }

  // 1. Server unreachable — idle/disabled
  if (!serverReachable) {
    return (
      <button
        type="button"
        disabled
        title="Pomodoro server not reachable (run pomodoro_server.py on this machine)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
          background: 'rgba(127,127,127,0.06)', border: '1px solid rgba(127,127,127,0.15)',
          color: 'rgba(127,127,127,0.4)', borderRadius: 6, padding: '5px 11px',
          fontSize: 13, fontWeight: 500, cursor: 'not-allowed', flexShrink: 0,
        }}
      >
        ⏱ Pomo
      </button>
    )
  }

  // 2. Timer active — teal Stop button with live elapsed
  if (status?.active) {
    return (
      <button
        type="button"
        onClick={handleStop}
        disabled={isLoading}
        title={`Stop focus timer · ${formatElapsed(displayElapsed)} elapsed`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
          background: withAlpha(ACCENT_TEAL, 12), border: `1px solid ${withAlpha(ACCENT_TEAL, 35)}`,
          color: ACCENT_TEAL, borderRadius: 6, padding: '5px 11px',
          fontSize: 13, fontWeight: 500, cursor: isLoading ? 'wait' : 'pointer',
          flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        }}
      >
        ⏹ {formatElapsed(displayElapsed)}
      </button>
    )
  }

  // 3. Stopped — gold Start button (matches Process button style)
  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isLoading}
      title="Start a focus session"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'center',
        background: withAlpha(ACCENT_GOLD, 12), border: `1px solid ${withAlpha(ACCENT_GOLD, 35)}`,
        color: ACCENT_GOLD, borderRadius: 6, padding: '5px 11px',
        fontSize: 13, fontWeight: 500, cursor: isLoading ? 'wait' : 'pointer', flexShrink: 0,
      }}
    >
      ▶ Focus
    </button>
  )
}
