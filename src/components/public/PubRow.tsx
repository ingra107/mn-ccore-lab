/**
 * PubRow -- the ONE public card for a paper (Nick, 2026-10-13/14 Wave 2:
 * "Published by default, one card": "Every public paper uses the newer pub-row
 * linking to its detail page, with author faces").
 *
 * Year, title, journal, and the faces of the lab members on the byline (the
 * byline match of Rule 89, never stored author_slugs). The whole row opens the
 * paper's detail page, where the abstract, links and citation live. A paper
 * that is not published says its status beside the journal.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Publication } from '../../data/types'
import { getAllMembers } from '../../data/team'
import { resolveBylineAuthors } from '../../lib/authorAvatars'
import { isPublished } from '../../lib/publicationCounts'
import { statusLabel } from '../../lib/textUtils'
import { FaceDisc } from '../today/skin'
// The row's styles travel with it: member pages also render inside the portal,
// where the public Layout (the usual importer) is not mounted.
import '../../styles/public.css'

export default function PubRow({ pub }: { pub: Publication }) {
  const members = useMemo(() => getAllMembers(), [])
  const faces = useMemo(
    () => resolveBylineAuthors(pub, members).map((a) => a.member).filter((m): m is NonNullable<typeof m> => !!m),
    [pub, members],
  )
  return (
    <Link to={`/publications/${encodeURIComponent(pub.id)}`} className="pub-row" data-testid="pub-row">
      <span className="pub-yr">{pub.year}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="pub-rt">{pub.title}</span>
        {(pub.journal || !isPublished(pub)) && (
          <span className="pub-rj">
            {pub.journal}
            {!isPublished(pub) && `${pub.journal ? ' · ' : ''}${statusLabel(pub.status)}`}
          </span>
        )}
        {faces.length > 0 && (
          <span className="pub-row-faces" aria-label={`Lab authors: ${faces.map((f) => f.name).join(', ')}`}>
            {faces.map((f) => (
              <FaceDisc key={f.slug} label={f.name} initials={f.initials} photo={f.photoUrl} px={22} variant="brand" decorative />
            ))}
          </span>
        )}
      </span>
    </Link>
  )
}
