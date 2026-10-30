// MailWatchCard -- Nick-only: the threads where a reply put the ball with him,
// under a status line that is always visible (schema-v151, PB
// Context/Decisions/2026-10-29-email-watcher.md).
//
// The status line is the card's honesty: "Email checked 10:42 · 14 threads"
// only when the watcher's freshness (derived on the server, never stored) says
// so, and "Watcher stale since 10:00" when it has missed slots. It shows even
// while the list is collapsed and even when the list is empty, so a quiet
// inbox and a dead watcher never look alike.
//
// Rows open the task (?open=<id>) and the Gmail thread. Nothing here changes a
// task: the watcher collects evidence, Nick decides.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { PATHS } from '../../../constants/paths'
import { formatRelativeTime } from '../../../lib/dateUtils'
import { useMailWatch } from '../../../hooks/useMailWatch'
import { mailStatusLine, type StatusTone } from '../../../lib/mailStatusLine'

const TONE_COLOR: Record<StatusTone, string> = {
  ok: 'var(--sk-t3)',
  quiet: 'var(--sk-t3)',
  stale: 'var(--job-stale)',
  overdue: 'var(--job-overdue)',
}

export function MailWatchCard({ isNick }: { isNick: boolean }) {
  const [open, setOpen] = useState(true)
  const { data, isError, isPending, dataUpdatedAt } = useMailWatch(isNick)
  if (!isNick) return null
  // The line is read as of the fetch (refetched every 5 minutes and on focus).
  const status = data
    ? mailStatusLine(data, dataUpdatedAt)
    : isError ? { text: 'Mail status unavailable', tone: 'overdue' as StatusTone } : null
  const rows = data?.threads ?? []
  return (
    <section className="tk-panel" data-b2-mail-watch>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Mail')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Mail</h3>
          {rows.length > 0 && <span className="tk-cnt">{rows.length}</span>}
        </div>
      </div>
      <div data-mail-status style={{ fontSize: 11.5, color: status ? TONE_COLOR[status.tone] : 'var(--sk-t3)', margin: '-4px 0 8px', fontVariantNumeric: 'tabular-nums' }}>
        {status ? status.text : isPending ? ' ' : ''}
      </div>
      {open && rows.map((t) => {
        const task = t.tasks[0]
        return (
          <div key={t.thread_id} className="tk-rli">
            <span className="tk-t">
              {task ? (
                <Link to={`${PATHS.myTasks}?open=${task.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{task.title}</Link>
              ) : 'Thread'}
              <span style={{ display: 'block', fontSize: 11, color: 'var(--sk-t3)' }}>
                {t.last_from ?? 'Someone'} replied{t.excerpt ? `: ${t.excerpt}` : ''}
              </span>
              <a href={t.gmail_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--job-accent)' }}>Open in Gmail</a>
            </span>
            <span className="tk-d">{t.last_at ? formatRelativeTime(t.last_at) : ''}</span>
          </div>
        )
      })}
    </section>
  )
}
