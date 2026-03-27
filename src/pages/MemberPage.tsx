import { useMemo } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import LabPageLayout, { PublicationsSection } from '../components/LabPageLayout'
import { FlaskConical, GraduationCap, FileText } from 'lucide-react'
import SectionDivider from '../components/SectionDivider'
import MenteeDashboard from '../components/MenteeDashboard'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications } from '../hooks/useApiData'
import { getMemberBySlug } from '../data/team'
import { getMenteeBySlug } from '../data/mentees'
import { projects } from '../data/projects'

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
  const { data: publications = [] } = usePublications()
  const { slug } = useParams<{ slug: string }>()
  const member = slug ? getMemberBySlug(slug) : undefined

  // Check if this member is also a mentee (trainee)
  const mentee = slug ? getMenteeBySlug(slug) : undefined
  const menteeProjects = mentee?.projectSlugs
    ?.map((s) => projects.find((p) => p.slug === s))
    .filter(Boolean) ?? []

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
      bio={member.bio || mentee?.bio}
      links={memberLinks}
      photoUrl={member.photoUrl}
      sections={[
        ...(mentee
          ? [{ id: 'research-focus', label: 'Research Focus' }]
          : []),
        ...(menteeProjects.length > 0
          ? [{ id: 'active-projects', label: 'Active Projects' }]
          : []),
        ...(topicCounts.length > 0
          ? [{ id: 'research-areas', label: 'Research Areas' }]
          : []),
        ...(memberPubs.length > 0
          ? [{ id: 'publications', label: `Publications (${memberPubs.length})` }]
          : []),
      ]}
    >
      {/* Export CV link */}
      {slug && (
        <div className="mb-6">
          <Link
            to={`/team/${slug}/cv`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--ice)',
              color: 'var(--slate)',
              border: '1px solid transparent',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--gold)'
              e.currentTarget.style.color = 'var(--gold)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.color = 'var(--slate)'
            }}
          >
            <FileText size={12} />
            Export CV
          </Link>
        </div>
      )}

      {/* Mentee: Research Focus (interests + mentor info) */}
      {mentee && (
        <>
          <section className="mb-8" id="research-focus">
            <div className="flex items-center gap-3 mb-4">
              <GraduationCap size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                Research Focus
              </h2>
            </div>
            {mentee.researchInterests && mentee.researchInterests.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {mentee.researchInterests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-sm"
                    style={{
                      background: 'rgba(201, 168, 76, 0.1)',
                      color: 'var(--gold)',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      border: '1px solid rgba(201, 168, 76, 0.2)',
                    }}
                  >
                    {interest}
                  </span>
                ))}
              </div>
            )}
            <div
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md"
              style={{
                background: 'var(--ice)',
                border: '1px solid rgba(201, 168, 76, 0.1)',
              }}
            >
              <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>
                {mentee.mentor === 'shared'
                  ? 'Shared mentorship — Ingraham & Mesfin'
                  : `Mentor: ${mentee.mentor === 'nick' ? 'Nick Ingraham, MD' : 'Nathan Mesfin, MD'}`}
              </span>
            </div>
          </section>
          <SectionDivider />
          <div className="py-4" />
        </>
      )}

      {/* Mentee: Active Projects */}
      {menteeProjects.length > 0 && (
        <>
          <section className="mb-8" id="active-projects">
            <div className="flex items-center gap-3 mb-4">
              <FlaskConical size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                Active Projects
              </h2>
            </div>
            <div className="space-y-3">
              {menteeProjects.map((project) => project && (
                <div
                  key={project.slug}
                  className="card p-5 sm:p-6"
                  style={{
                    borderLeft: '3px solid var(--gold)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3
                      className="text-sm sm:text-base font-semibold"
                      style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
                    >
                      {project.title}
                    </h3>
                    <span
                      className={`badge ${
                        project.status === 'Active' ? 'badge-active'
                          : project.status === 'In Review' ? 'badge-review'
                          : project.status === 'Published' ? 'badge-published'
                          : 'badge-preparation'
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--slate)' }}>
                      {project.description}
                    </p>
                  )}
                  {project.stage && (
                    <p
                      className="text-xs mt-2"
                      style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.7 }}
                    >
                      Stage: {project.stage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <SectionDivider />
          <div className="py-4" />
        </>
      )}

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

      {/* Dashboard — projects, action items, publication count, summary */}
      {slug && <MenteeDashboard slug={slug} name={member.name} />}

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
