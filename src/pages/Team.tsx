import { useMemo } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import Avatar from '../components/Avatar'
import { usePageMeta } from '../hooks/usePageMeta'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'
import { grants } from '../data/grants'
import { usePublications, useExpertise, useActivity } from '../hooks/useApiData'
import type { ExpertiseTag } from '../hooks/useApiData'
import { mentees } from '../data/mentees'

export default function Team() {
  const { data: publications = [] } = usePublications()
  const { data: allExpertise = [] } = useExpertise() as { data: ExpertiseTag[] }
  const { data: recentActivity = [] } = useActivity(50)

  // Members active in last 7 days
  const activeSlugs = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString()
    const slugs = new Set<string>()
    for (const a of recentActivity) {
      if (a.timestamp >= cutoff && a.actor) slugs.add(a.actor)
    }
    return slugs
  }, [recentActivity])
  const [searchParams, setSearchParams] = useSearchParams()
  const expertiseFilter = searchParams.get('expertise') || ''

  // Group expertise tags by member
  const expertiseByMember = useMemo(() => {
    const map = new Map<string, ExpertiseTag[]>()
    for (const tag of allExpertise) {
      const existing = map.get(tag.member_slug) || []
      existing.push(tag)
      map.set(tag.member_slug, existing)
    }
    return map
  }, [allExpertise])

  // Get all unique tags for the filter
  const allTags = useMemo(() => {
    const tagSet = new Map<string, number>()
    for (const tag of allExpertise) {
      tagSet.set(tag.tag, (tagSet.get(tag.tag) || 0) + 1)
    }
    return [...tagSet.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }))
  }, [allExpertise])

  // Members matching the expertise filter
  const filteredSlugs = useMemo(() => {
    if (!expertiseFilter) return null
    const slugs = new Set<string>()
    for (const tag of allExpertise) {
      if (tag.tag.toLowerCase() === expertiseFilter.toLowerCase()) {
        slugs.add(tag.member_slug)
      }
    }
    return slugs
  }, [allExpertise, expertiseFilter])

  function matchesFilter(slug: string | undefined): boolean {
    if (!filteredSlugs || !slug) return !filteredSlugs
    return filteredSlugs.has(slug)
  }

  function getDirectorStats(slug: string) {
    const grantCount = grants.filter((g) => g.pi === slug && !g.proposed).length
    const pubCount = publications.filter((p) => p.authorSlugs?.includes(slug)).length
    const menteeCount = mentees.filter((m) => m.mentor === 'shared' || m.mentor === slug).length
    return { grantCount, pubCount, menteeCount }
  }
  usePageMeta(
    'Team | MN-CCORE Lab',
    'Meet the MN-CCORE research team: co-directors Nick Ingraham and Nathan Mesfin, and our research coordinators, fellows, analysts, and students.'
  )
  const directorsRef = useScrollRevealGroup('.fade-in-up', 200)
  const mentorsRef = useScrollRevealGroup('.fade-in-up', 100)
  const facultyRef = useScrollRevealGroup('.fade-in-up', 100)
  const researchRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Hero */}
      <section className="pt-4 pb-6 sm:pb-8 content-container">
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl mb-3 sm:mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Our Team
        </h1>
        <p
          className="text-base sm:text-lg max-w-2xl"
          style={{ color: 'var(--slate)' }}
        >
          A collaborative group of physicians, scientists, and research staff
          dedicated to improving critical care outcomes through rigorous,
          data-driven research.
        </p>
      </section>

      {/* Expertise Filter */}
      {(expertiseFilter || allTags.length > 0) && (
        <section className="py-3 content-container">
          <div className="flex flex-wrap items-center gap-2">
            {expertiseFilter && (
              <button
                onClick={() => setSearchParams({})}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-colors"
                style={{
                  fontWeight: 400,
                  background: 'var(--teal)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {expertiseFilter}
                <X size={10} />
              </button>
            )}
            {!expertiseFilter && allTags.slice(0, 12).map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setSearchParams({ expertise: tag })}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-all hover:opacity-80"
                style={{
                  fontWeight: 400,
                  background: 'rgba(45,138,138,0.10)',
                  color: 'var(--teal)',
                  border: '1px solid rgba(45,138,138,0.2)',
                  cursor: 'pointer',
                }}
              >
                {tag}
                <span style={{ opacity: 0.5, fontSize: '9px' }}>{count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <SectionDivider />

      {/* Co-Directors */}
      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={directorsRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          Co-Directors
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {directors.filter(d => matchesFilter(d.slug)).map((director) => {
            const stats = getDirectorStats(director.slug)
            const tags = expertiseByMember.get(director.slug) || []
            return (
              <Link
                key={director.name}
                to={director.path}
                className="fade-in-up card p-5 sm:p-6 group cursor-pointer"
                style={{
                  borderTop: '3px solid var(--gold)',
                  textDecoration: 'none',
                }}
              >
                <div className="flex items-start gap-4 sm:gap-5">
                  <Avatar
                    name={director.name}
                    initials={director.initials}
                    photoUrl={director.photoUrl}
                    size="md"
                    variant="gold"
                  />

                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-lg sm:text-xl mb-0.5 group-hover:text-[var(--gold)] transition-colors duration-200"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 400,
                        color: 'var(--ink)',
                      }}
                    >
                      {director.name}, {director.credentials}
                      {activeSlugs.has(director.slug) && (
                        <span
                          title="Active this week"
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'var(--green)',
                            marginLeft: 6,
                            verticalAlign: 'middle',
                          }}
                        />
                      )}
                    </h3>
                    <p
                      className="mb-0.5"
                      style={{
                        color: 'var(--gold)',
                        fontSize: '11px',
                      }}
                    >
                      {director.role}
                    </p>
                    <p
                      className="text-sm mb-2"
                      style={{ color: 'var(--slate)' }}
                    >
                      {director.title}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-2"
                      style={{ color: 'var(--slate)' }}
                    >
                      {director.bio}
                    </p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tags.slice(0, 4).map(t => (
                          <span
                            key={t.id}
                            className="inline-block px-2 py-0.5 rounded-full text-[11px]"
                            style={{
                              fontWeight: 400,
                              background: 'rgba(45,138,138,0.10)',
                              color: 'var(--teal)',
                            }}
                          >
                            {t.tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--gold)',
                      }}
                    >
                      {stats.grantCount} Grant{stats.grantCount !== 1 ? 's' : ''}
                      {' \u00B7 '}
                      {stats.pubCount} Publication{stats.pubCount !== 1 ? 's' : ''}
                      {' \u00B7 '}
                      {stats.menteeCount} Trainee{stats.menteeCount !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <ArrowRight
                    size={16}
                    className="flex-shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ color: 'var(--gold)' }}
                    aria-hidden="true"
                  />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <SectionDivider />

      {/* Senior Mentors */}
      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={mentorsRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          Senior Mentors
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {seniorMentors.filter((m) => matchesFilter(m.slug)).map((member) => {
            const tags = member.slug ? expertiseByMember.get(member.slug) || [] : []
            return (
              <div key={member.name} className="fade-in-up card p-4 sm:p-6">
                <div className="flex items-center gap-4">
                  <Avatar
                    name={member.name}
                    initials={member.initials}
                    photoUrl={member.photoUrl}
                    size="sm"
                    variant="gold"
                  />
                  <div>
                    <h3
                      className="text-base sm:text-lg"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 400, color: 'var(--ink)' }}
                    >
                      {member.name}{member.credentials ? `, ${member.credentials}` : ''}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--gold)', fontSize: '12px' }}>
                      {member.role}
                    </p>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {tags.slice(0, 3).map(t => (
                          <span
                            key={t.id}
                            className="inline-block px-2 py-0.5 rounded-full text-[11px] cursor-pointer transition-opacity hover:opacity-80"
                            style={{
                              fontWeight: 400,
                              background: 'rgba(45,138,138,0.10)',
                              color: 'var(--teal)',
                            }}
                            onClick={(e) => { e.preventDefault(); setSearchParams({ expertise: t.tag }) }}
                          >
                            {t.tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <SectionDivider />

      {/* Faculty Collaborators */}
      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={facultyRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          Faculty Collaborators
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
          {facultyCollaborators.filter(m => matchesFilter(m.slug)).map((member) => {
            const tags = member.slug ? expertiseByMember.get(member.slug) || [] : []
            return (
              <Link
                key={member.name}
                to={member.slug ? `/team/${member.slug}` : '#'}
                className="fade-in-up text-center p-4 rounded-lg transition-all duration-200 cursor-pointer group"
                style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.08)', textDecoration: 'none' }}
              >
                <div className="flex justify-center mb-2">
                  <Avatar
                    name={member.name}
                    initials={member.initials}
                    photoUrl={member.photoUrl}
                    size="sm"
                    variant="ice"
                  />
                </div>
                <h3
                  className="text-xs sm:text-sm font-normal mb-0.5 group-hover:text-[var(--gold)] transition-colors duration-200"
                  style={{ color: 'var(--ink)' }}
                >
                  {member.name}{member.credentials ? `, ${member.credentials}` : ''}
                </h3>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  {member.role}
                </p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                    {tags.slice(0, 2).map(t => (
                      <span
                        key={t.id}
                        className="inline-block px-1.5 py-0.5 rounded-full text-[10px]"
                        style={{
                          fontWeight: 400,
                          background: 'rgba(45,138,138,0.10)',
                          color: 'var(--teal)',
                        }}
                      >
                        {t.tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </section>

      <SectionDivider />

      {/* Research Team */}
      <section
        className="py-8 sm:py-12 lg:py-16 content-container"
        ref={researchRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          Research Team
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {researchTeam.filter(m => matchesFilter(m.slug)).map((member) => {
            const tags = member.slug ? expertiseByMember.get(member.slug) || [] : []
            return (
              <Link
                key={member.name}
                to={member.slug ? `/team/${member.slug}` : '#'}
                className="fade-in-up text-center p-4 rounded-lg transition-all duration-200 cursor-pointer group"
                style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.08)', textDecoration: 'none' }}
              >
                <div className="flex justify-center mb-2">
                  <Avatar
                    name={member.name}
                    initials={member.initials}
                    photoUrl={member.photoUrl}
                    size="sm"
                    variant="ice"
                  />
                </div>
                <h3
                  className="text-xs sm:text-sm font-normal mb-0.5 group-hover:text-[var(--gold)] transition-colors duration-200"
                  style={{ color: 'var(--ink)' }}
                >
                  {member.name}{member.credentials ? `, ${member.credentials}` : ''}
                </h3>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  {member.role}
                </p>
                {tags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mt-1.5">
                    {tags.slice(0, 2).map(t => (
                      <span
                        key={t.id}
                        className="inline-block px-1.5 py-0.5 rounded-full text-[10px]"
                        style={{
                          fontWeight: 400,
                          background: 'rgba(45,138,138,0.10)',
                          color: 'var(--teal)',
                        }}
                      >
                        {t.tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
