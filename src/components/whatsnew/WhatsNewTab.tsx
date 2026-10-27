// The What's new tab (#156): the newest approved release, then older ones.
import { useState } from 'react'
import type { PulsePayload, PulseRelease } from '../../../shared/pulse'
import { formatShortDate } from '../../lib/dateUtils'

export function ReleaseBody({ release }: { release: PulseRelease }) {
  return (
    <ul className="pulse-blurbs">
      {release.blurbs.map((b, i) => (
        <li key={i}><b>{b.lead}</b> {b.text}</li>
      ))}
    </ul>
  )
}

export function WhatsNewTab({ data }: { data: PulsePayload | undefined }) {
  const [showPast, setShowPast] = useState(false)
  const release = data?.release ?? null
  return (
    <div className="pulse-col">
      {release ? (
        <section aria-label="Latest release">
          <div className="pulse-eyebrow">{release.approvedAt ? formatShortDate(release.approvedAt) : 'Released'}</div>
          <div className="pulse-title">{release.title}</div>
          <ReleaseBody release={release} />
        </section>
      ) : (
        <p className="pulse-empty">Nothing shipped yet. Release notes appear here after the next update.</p>
      )}
      {data && data.pastReleases.length > 0 && (
        <div>
          <button type="button" className="pulse-link" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
            {showPast ? 'Hide past releases' : `Past releases (${data.pastReleases.length})`}
          </button>
          {showPast && (
            <ul className="pulse-rows">
              {data.pastReleases.map((r) => (
                <li key={r.id}><span>{r.title}</span><span className="pulse-date">{formatShortDate(r.approvedAt)}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
