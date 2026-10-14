import { useCallback, useEffect, useState } from 'react'
import { DELETE_ARM_WINDOW_MS } from '../lib/uiTiming'

// Two-tap confirm: the first tap arms, a second tap inside the window runs the
// action, and the arm lapses on its own. No browser dialog. Shared by
// DeleteEntryButton (activity trash) and ConfirmButton (Settings danger zone,
// launch re-fire), so every "are you sure" in the Hub behaves the same way.
// The window is the one in uiTiming, which BulkActionToolbar reads too.
export function useArmedConfirm(windowMs: number = DELETE_ARM_WINDOW_MS) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), windowMs)
    return () => clearTimeout(t)
  }, [armed, windowMs])

  /** First call arms; a second call while armed disarms and runs `action`. */
  const trigger = useCallback((action: () => void) => {
    if (armed) {
      setArmed(false)
      action()
    } else {
      setArmed(true)
    }
  }, [armed])

  return { armed, trigger }
}
