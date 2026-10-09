// PomodoroControl — Start/Stop focus timer button for TodayPage header.
//
// Wires to the local Flask pomodoro server at localhost:5555. Laptop-only by
// design (phone can't reach localhost). Three states:
//   1. Server unreachable → dim disabled button "Pomo" (no crash, clear cue)
//   2. Stopped           → neutral button "Focus"  (same family as Process)
//   3. Active            → filled teal button "M:SS" (live tick, stop on click)
// Styles: .tk-btn in index.css (Today reskin); the page root carries .tk.
//
// Placed next to the PI-only Process button in TodayPage; guarded by user.isPi
// at the call site. Only Nick's machine runs the server, so no relay needed.

import { useEffect, useState } from 'react'
import { useLocalPomodoro, POMO_BASE } from '../../hooks/useLocalPomodoro'
import { useToast } from '../../hooks/useToast'
import { Play, Square, Timer } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'

const POMO_APP_URL = `${POMO_BASE}/`

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
    // Open the local timer UI too, matching Obsidian's ▶ Start (pomo_launch.vbs
    // opens http://localhost:5555 and then POSTs /api/start) so the session is
    // visibly tracked. Must fire SYNCHRONOUSLY inside the click handler — after
    // an await the user gesture is spent and the popup blocker kills it. Safe to
    // open unconditionally here: this branch only renders when serverReachable.
    // Named target → repeat clicks reuse the same tab instead of piling up.
    window.open(POMO_APP_URL, 'pb-focus-timer')
    await start()
    if (serverReachable) showSuccess('Focus timer started')
    // If unreachable, the hook clears serverReachable → button flips to idle state.
  }

  const handleStop = async () => {
    const minLogged = Math.round(displayElapsed / 60)
    await stop()
    showSuccess(`Focus session stopped — ${minLogged}m logged`)
  }

  // 1. Server unreachable: dim, disabled, no crash and a clear cue
  if (!serverReachable) {
    return (
      <button
        type="button"
        disabled
        title="Pomodoro server not reachable (run pomodoro_server.py on this machine)"
        className="tk-btn tk-off"
      >
        <Timer {...ICON_PROPS} size={13} aria-hidden />Pomo
      </button>
    )
  }

  // 2. Timer active: the one filled teal control, with the live elapsed time
  if (status?.active) {
    return (
      <button
        type="button"
        onClick={handleStop}
        disabled={isLoading}
        title={`Stop focus timer · ${formatElapsed(displayElapsed)} elapsed`}
        className="tk-btn tk-ac"
        style={{ cursor: isLoading ? 'wait' : 'pointer' }}
      >
        <Square {...ICON_PROPS} size={12} aria-hidden />{formatElapsed(displayElapsed)}
      </button>
    )
  }

  // 3. Stopped: a plain neutral Start button, same family as Quick Chat / Process
  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isLoading}
      title="Start a focus session"
      className="tk-btn"
      style={{ cursor: isLoading ? 'wait' : 'pointer' }}
    >
      <Play {...ICON_PROPS} size={12} aria-hidden />Focus
    </button>
  )
}
