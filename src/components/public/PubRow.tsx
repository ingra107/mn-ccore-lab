/**
 * PubRow -- the ONE public card for a paper. Source: Nick's answer to a Wave 2
 * question on 2026-10-13 (HOME transcript 4334566d, AskUserQuestion at
 * 18:19Z). He picked the option "Published by default, one card
 * (Recommended)", whose text read: "Every public paper uses the newer pub-row
 * linking to its detail page, with author faces." The words are the option's,
 * the choice is his.
 *
 * Nothing the retired PublicationCard showed is gone, it moved one tap away to
 * the detail page: full byline, abstract, DOI and PubMed links, Copy citation.
 * Copy bibliography stays on the Publications page.
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
