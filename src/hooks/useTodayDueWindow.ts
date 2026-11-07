import { useUserPref } from './useUserPref'
import { TODAY_WINDOW_DEFAULT, toTodayWindow, type TodayWindowDays } from '../lib/taskSections'

// useTodayDueWindow -- how far ahead a Today section shows tasks before
// "Show N more" (Nick, Hub #172: 7 / 14 / 30 days, default 14). One per-person
// pref ('today.dueWindow', useUserPref), so it is the same on every laptop.
// A stored value that is not 7, 14 or 30 (the retired 'all') reads as 14.
export function useTodayDueWindow(): [TodayWindowDays, (next: TodayWindowDays) => void] {
  const [days, setDays] = useUserPref<TodayWindowDays>('today.dueWindow', TODAY_WINDOW_DEFAULT, toTodayWindow)
  return [days, setDays]
}
