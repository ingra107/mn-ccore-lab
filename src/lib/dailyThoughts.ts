// Daily thought log: every capture from the Today compose box is saved in this
// browser under localStorage `today_state_<YYYY-MM-DD>.thoughts`. Nothing read
// it back until 2026-10-14, when Nick chose to show past thoughts on Today
// (PastThoughts.tsx). This module is the one reader and the one writer.

import { todayKey, civilDatePlusDays } from './taskGrouping'
import { nowInstant } from './time'

export type ThoughtKind = 'note' | 'hermes' | 'task'

export interface DailyThought {
  /** ISO instant the thought was captured. */
  at: string
  kind: ThoughtKind
  content: string
  /** Civil date of the localStorage key it came from. */
  day: string
}

/** Fired on window after a thought is saved, so the list re-reads. */
export const DAILY_THOUGHTS_EVENT = 'daily-thoughts-changed'

const keyFor = (day: string) => `today_state_${day}`

export function appendDailyThought(content: string, kind: ThoughtKind): void {
  if (typeof window === 'undefined') return
  const key = keyFor(todayKey())
  try {
    const raw = window.localStorage.getItem(key)
    const state = raw ? JSON.parse(raw) : {}
    const thoughts = Array.isArray(state.thoughts) ? state.thoughts : []
    thoughts.push({ at: nowInstant(), kind, content })
    state.thoughts = thoughts
    window.localStorage.setItem(key, JSON.stringify(state))
  } catch { /* storage full or blocked: the capture itself already went out */ }
  window.dispatchEvent(new Event(DAILY_THOUGHTS_EVENT))
}

/** Thoughts from the last `days` days (today included), newest first. */
export function readRecentThoughts(days = 7, today: string = todayKey()): DailyThought[] {
  if (typeof window === 'undefined') return []
  const out: DailyThought[] = []
  for (let i = 0; i < days; i++) {
    const day = civilDatePlusDays(today, -i)
    try {
      const raw = window.localStorage.getItem(keyFor(day))
      if (!raw) continue
      const thoughts = JSON.parse(raw)?.thoughts
      if (!Array.isArray(thoughts)) continue
      for (const t of thoughts) {
        if (t && typeof t.content === 'string' && t.content.trim() && typeof t.at === 'string') {
          out.push({ at: t.at, kind: t.kind, content: t.content, day })
        }
      }
    } catch { /* a corrupt day's blob is skipped; the other days still show */ }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
