import { useCallback, useEffect, useState } from 'react'

// Two-tap confirm: the first tap arms, a second tap inside the window runs the
// action, and the arm lapses on its own. No browser dialog. Shared by
// DeleteEntryButton (activity trash) and ConfirmButton (Settings danger zone,
// launch re-fire), so every "are you sure" in the Hub behaves the same way.
export const ARM_WINDOW_MS = 5000

export function useArmedConfirm(windowMs: number = ARM_WINDOW_MS) {
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
