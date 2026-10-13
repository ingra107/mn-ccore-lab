// NewActivityCard -- tasks and projects you have seen that have new activity
// by others since your last look. Moved here from the My Items page (the page
// is gone; Nick 2026-10-13, "Fold into Today").
//
// Same population as before: the unseen-activity feed, tasks and projects only
// (meeting and day rows have no open handler here; the meetings tab and the
// Today nav badge carry those). A task row opens in My Tasks (?open=<id>), which
// opens the editor and marks it seen, so the row drains on its own. A project
// row goes to the project page, whose visit marks it seen.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { PATHS } from '../../../constants/paths'
import { useUnseenActivity } from '../../../hooks/useEntitySeen'
import { AttentionChip } from '../../tasks/AttentionChip'
import { formatRelativeTime } from '../../../lib/dateUtils'

export function NewActivityCard() {
  const [open, setOpen] = useState(true)
  const { data } = useUnseenActivity()
  const rows = (data?.rows ?? []).filter((r) => r.entity_type === 'task' || r.entity_type === 'project')
  if (rows.length === 0) return null
  return (
    <section className="tk-panel" data-b2-new-activity>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'New activity')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>New activity</h3>
          <span className="tk-cnt">{rows.length}</span>
        </div>
      </div>
      {open && rows.map((r) => {
        const to = r.entity_type === 'task'
          ? `${PATHS.myTasks}?open=${r.entity_id}`
          : r.project_slug ? PATHS.project(r.project_slug) : null
        const inner = (
          <>
            <AttentionChip kind="activity" count={r.new_count} />
            <span className="tk-t">{r.title ?? r.entity_id}</span>
            <span className="tk-d">{formatRelativeTime(r.latest_at)}</span>
          </>
        )
        return to
          ? <Link key={`${r.entity_type}:${r.entity_id}`} to={to} className="tk-rli" style={{ color: 'inherit', textDecoration: 'none' }}>{inner}</Link>
          : <div key={`${r.entity_type}:${r.entity_id}`} className="tk-rli">{inner}</div>
      })}
    </section>
  )
}
