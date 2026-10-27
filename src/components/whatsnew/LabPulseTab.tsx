// The Lab pulse tab (#156): Nick's announcement, who was active in the last
// day, this week's lab-wide numbers, and a few recent wins.
import type { PulsePayload } from '../../../shared/pulse'
import { Face } from '../today/skin'
import { formatRelativeTime, formatShortDate } from '../../lib/dateUtils'
import { fullNameReadable } from '../../lib/personLabel'

const MAX_FACES = 8

export function LabPulseTab({ data }: { data: PulsePayload | undefined }) {
  if (!data) return <p className="pulse-empty">Loading the lab pulse…</p>
  const extra = data.active.length - MAX_FACES
  return (
    <div className="pulse-col">
      {data.announcement && (
        <section className="pulse-ann" aria-label="Announcement">
          <p>{data.announcement.body}</p>
          <span className="pulse-date">{fullNameReadable(data.announcement.authorSlug)} · {formatRelativeTime(data.announcement.createdAt)}</span>
        </section>
      )}
      <section aria-label="Active in the last day">
        <div className="pulse-eyebrow">Active in the last day</div>
        {data.active.length === 0 ? (
          <p className="pulse-empty">Nobody active in the last day.</p>
        ) : (
          <div className="pulse-faces">
            {data.active.slice(0, MAX_FACES).map((slug) => (
              <span key={slug} data-pulse-face={slug}><Face slug={slug} sm /></span>
            ))}
            {extra > 0 && <span className="pulse-more">+{extra}</span>}
          </div>
        )}
      </section>
      <div className="pulse-stats">
        <div className="pulse-stat"><span className="pulse-v">{data.tasksDone}</span><span className="pulse-l">tasks done this week</span></div>
        <div className="pulse-stat"><span className="pulse-v">{data.milestonesHit}</span><span className="pulse-l">milestones this week</span></div>
        <div className="pulse-stat"><span className="pulse-v">{data.newPapers}</span><span className="pulse-l">new papers (30 days)</span></div>
      </div>
      {data.wins.length > 0 && (
        <ul className="pulse-rows" aria-label="Recent wins">
          {data.wins.map((w, i) => (
            <li key={i}><span>{w.kind === 'milestone' ? 'Milestone: ' : 'Paper: '}{w.title}</span><span className="pulse-date">{formatShortDate(w.date)}</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}
