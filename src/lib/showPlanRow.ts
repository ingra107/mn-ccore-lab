// "A new plan is waiting in Needs you." takes him to the plan. The note lives in
// a Re-plan header (ThisWeekSection / PlannedTodaySection) far from the page
// that owns the Needs you fold, so it fires a window event and TodayPage's
// useShowPlanRowRequests unfolds the card if needed and scrolls the
// "Plan your week" row (data-testid="q-week-plan") into view.

import { useEffect, useState } from 'react'

const EVENT = 'mn:show-plan-row'

export function requestShowPlanRow(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function useShowPlanRowRequests(folded: boolean, restore: () => void): void {
  const [want, setWant] = useState(0)
  useEffect(() => {
    const on = () => {
      if (folded) restore()
      setWant((n) => n + 1)
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [folded, restore])
  useEffect(() => {
    if (want === 0 || folded) return
    // Effects run after commit, so once folded is false the card is in the DOM.
    document.querySelector('[data-testid="q-week-plan"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [want, folded])
}
