// PastThoughts — the last 7 days of Today compose captures, newest first,
// shown quietly under the compose box (Nick, 2026-10-14: "Show past
// thoughts"). The thoughts live only in this browser (lib/dailyThoughts.ts).
// Hidden when there are none. Muted tier only: no accent, no box; the newest
// few show and the rest sit behind "Show N more" (progressive disclosure).
// Collapsed by default behind a caret header with a count (Nick, 2026-10-22:
// "make it so this can be collapsed and should default to collapsed"). The fold
// is device-local, under the same `collapsible-*` key family CollapsibleSection
// uses (shared/userPrefKeys.ts lists fold state as device-local on purpose).

import { useEffect, useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { readRecentThoughts, DAILY_THOUGHTS_EVENT, type DailyThought } from '../../lib/dailyThoughts'
import { todayKey } from '../../lib/taskGrouping'
import BodyText from '../BodyText'

const SHOWN = 5
const FOLD_KEY = 'collapsible-past-thoughts'

function readOpen(): boolean {
  try { return localStorage.getItem(FOLD_KEY) === 'true' } catch { return false }
}
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const CLOCK = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function whenLabel(t: DailyThought, today: string): string {
  const d = new Date(t.at)
  const clock = Number.isNaN(d.getTime()) ? '' : CLOCK.format(d)
  if (t.day === today) return clock
  const day = Number.isNaN(d.getTime()) ? t.day : WEEKDAY.format(d)
  return clock ? `${day} ${clock}` : day
}

export function PastThoughts() {
  const [thoughts, setThoughts] = useState<DailyThought[]>(() => readRecentThoughts())
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(readOpen)
  const listId = useId()

  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(FOLD_KEY, String(next)) } catch { /* storage off: the fold just will not persist */ }
  }

  useEffect(() => {
    const reread = () => setThoughts(readRecentThoughts())
    window.addEventListener(DAILY_THOUGHTS_EVENT, reread)
    // Another tab's capture lands through the storage event.
    window.addEventListener('storage', reread)
    return () => {
      window.removeEventListener(DAILY_THOUGHTS_EVENT, reread)
      window.removeEventListener('storage', reread)
    }
  }, [])

  if (thoughts.length === 0) return null
  const today = todayKey()
  const visible = showAll ? thoughts : thoughts.slice(0, SHOWN)
  const hidden = thoughts.length - visible.length

  return (
    <section className="tk-past-thoughts" aria-label="Past thoughts" data-testid="past-thoughts">
      <button
        type="button"
        className="tk-past-thoughts-head"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
      >
        <ChevronRight {...ICON_PROPS} size={12} className="tk-past-thoughts-caret" data-open={open} aria-hidden="true" />
        Past thoughts ({thoughts.length})
      </button>
      <div id={listId} hidden={!open}>
        <ul>
          {visible.map((t, i) => (
            <li key={`${t.at}-${i}`} data-testid="past-thought">
              <span className="tk-past-thoughts-when">{whenLabel(t, today)}</span>
              <span className="tk-past-thoughts-text"><BodyText text={t.content} /></span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" className="tk-past-thoughts-more" onClick={() => setShowAll(true)}>
            Show {hidden} more
          </button>
        )}
      </div>
    </section>
  )
}
