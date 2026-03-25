import { useMemo } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import LabPageLayout, { PublicationsSection } from '../components/LabPageLayout'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'
import { publications } from '../data/publications'
import { getMemberBySlug } from '../data/team'

const TOPIC_DISPLAY: Record<string, string> = {
  clif: 'CLIF',
  covid: 'COVID-19',
  ventilation: 'Ventilation',
  'decision-making': 'Decision-Making',
  quality: 'Quality',
  sepsis: 'Sepsis',
  disparities: 'Disparities',
}

const TOPIC_COLORS: Record<string, string> = {
  clif: '#3b82f6',
  covid: '#dc2626',
  ventilation: '#16a34a',
  'decision-making': '#9333ea',
  quality: '#d97706',
  sepsis: '#db2777',
  disparities: '#0284c7',
}

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
  const memberPubs = useMemo(
    () =>
      member.authorName
        ? publications.filter((p) => p.authors.includes(member.authorName!))
        : [],
    [member.authorName]
  )

  // Derive research topics from publications
  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    memberPubs.forEach((p) => {
      p.topics.forEach((t) => {
        counts[t] = (counts[t] || 0) + 1
      })
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [memberPubs])

  // Build links
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

  const publishedCount = memberPubs.filter((p) => p.status === 'Published').length
  const yearRange =
    memberPubs.length > 0
      ? `${Math.min(...memberPubs.map((p) => p.year))}–${Math.max(...memberPubs.map((p) => p.year))}`
      : ''

  usePageMeta(
    `${member.name} | MN-CCORE Lab`,
    `${displayName} — ${member.role} at MN-CCORE Lab, University of Minnesota.${publishedCount > 0 ? ` ${publishedCount} publications.` : ''}`
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
      sections={[
        ...(topicCounts.length > 0
          ? [{ id: 'research-areas', label: 'Research Areas' }]
          : []),
        ...(memberPubs.length > 0
          ? [{ id: 'publications', label: `Publications (${memberPubs.length})` }]
          : []),
      ]}
    >
      {/* Research areas derived from publication topics */}
      {topicCounts.length > 0 && (
        <>
          <section className="mb-8" id="research-areas">
            <h2
              className="text-xl sm:text-2xl mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Research Areas
            </h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {topicCounts.map(([topic, count]) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
                  style={{
                    background: `${TOPIC_COLORS[topic] ?? 'var(--gold)'}15`,
                    color: TOPIC_COLORS[topic] ?? 'var(--gold)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                  }}
                >
                  {TOPIC_DISPLAY[topic] ?? topic}
                  <span
                    className="text-xs opacity-60"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {count}
                  </span>
                </span>
              ))}
            </div>
            {publishedCount > 0 && (
              <p
                className="text-sm"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--slate)',
                }}
              >
                {publishedCount} published paper{publishedCount !== 1 ? 's' : ''}
                {yearRange && ` (${yearRange})`}
              </p>
            )}
          </section>
          <SectionDivider />
          <div className="py-4" />
        </>
      )}

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
