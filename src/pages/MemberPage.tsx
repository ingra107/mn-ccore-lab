import { useParams, Navigate } from 'react-router-dom'
import LabPageLayout, { PublicationsSection } from '../components/LabPageLayout'
import { usePageMeta } from '../hooks/usePageMeta'
import { publications } from '../data/publications'
import { getMemberBySlug } from '../data/team'

export default function MemberPage() {
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? getMemberBySlug(slug) : undefined

  if (!member) {
    return <Navigate to="/team" replace />
  }

  const displayName = member.credentials
    ? `${member.name}, ${member.credentials}`
    : member.name

  // Filter publications: match by authorName in the authors string
  const memberPubs = member.authorName
    ? publications.filter((p) => p.authors.includes(member.authorName!))
    : []

  // Build links: include explicit links + auto-generate Scholar link from scholarId
  const existingLinks = member.links ?? []
  const hasScholarLink = existingLinks.some((l) => l.label === 'Scholar')
  const memberLinks =
    !hasScholarLink && member.scholarId
      ? [
          ...existingLinks,
          {
            label: 'Scholar',
            href: `https://scholar.google.com/citations?user=${member.scholarId}&hl=en`,
          },
        ]
      : existingLinks

  usePageMeta(
    `${member.name} | MN-CCORE Lab`,
    `${displayName} — ${member.role} at MN-CCORE Lab, University of Minnesota.`
  )

  return (
    <LabPageLayout
      name={member.name}
      credentials={member.credentials ?? ''}
      title={member.role}
      role="MN-CCORE Team Member"
      initials={member.initials}
      bio={member.bio}
      links={memberLinks}
      photoUrl={member.photoUrl}
      sections={
        memberPubs.length > 0
          ? [{ id: 'publications', label: `Publications (${memberPubs.length})` }]
          : []
      }
    >
      {memberPubs.length > 0 && (
        <PublicationsSection publications={memberPubs} id="publications" />
      )}
      {memberPubs.length === 0 && (
        <div
          className="py-8 text-center"
          style={{ color: 'var(--slate)', fontFamily: 'var(--font-body)' }}
        >
          <p className="text-sm">
            Publications for {member.name} will appear here as they are added to
            the database.
          </p>
        </div>
      )}
    </LabPageLayout>
  )
}
