import { ArrowRight } from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import { usePageMeta } from '../hooks/usePageMeta'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'
import { grants } from '../data/grants'
import { publications } from '../data/publications'
import { mentees } from '../data/mentees'

const researchKeywords: Record<string, string[]> = {
  nick: ['Provider Variation', 'Lung-Protective Ventilation', 'Clinical Decision-Making', 'CLIF Consortium'],
  nate: ['Cardiac Arrest', 'Goals of Care', 'Chronic Critical Illness'],
}

function getDirectorStats(slug: string) {
  const grantCount = grants.filter((g) => g.pi === slug).length
  const pubCount = publications.filter((p) => p.authorSlugs?.includes(slug)).length
  const menteeCount = mentees.filter((m) => m.mentor === slug).length
  return { grantCount, pubCount, menteeCount }
}

export default function Team() {
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
      <section className="pt-12 pb-8 sm:pb-12 lg:pb-16 content-container">
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

      <SectionDivider />

      {/* Co-Directors */}
      <section
        className="py-12 sm:py-16 lg:py-24 content-container"
        ref={directorsRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-8 sm:mb-12"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Co-Directors
        </h2>

        <div className="flex flex-col gap-6">
          {directors.map((director) => {
            const stats = getDirectorStats(director.slug)
            const keywords = researchKeywords[director.slug] ?? []
            return (
              <div
                key={director.name}
                className="fade-in-up card p-6 sm:p-8"
                style={{
                  borderTop: '3px solid var(--gold)',
                  textDecoration: 'none',
                }}
              >
                <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
                  {/* Avatar */}
                  <Avatar
                    name={director.name}
                    initials={director.initials}
                    photoUrl={director.photoUrl}
                    size="md"
                    variant="gold"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className="text-xl sm:text-2xl"
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        {director.name}, {director.credentials}
                      </h3>
                    </div>
                    <p
                      className="mb-1"
                      style={{
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                      }}
                    >
                      {director.role}
                    </p>
                    <p
                      className="text-sm mb-4"
                      style={{ color: 'var(--slate)' }}
                    >
                      {director.title}
                    </p>
                    <p
                      className="text-sm leading-relaxed mb-5"
                      style={{ color: 'var(--slate)' }}
                    >
                      {director.bio}
                    </p>

                    {/* Stats */}
                    <p
                      className="mb-4"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '13px',
                        color: 'var(--gold)',
                      }}
                    >
                      {stats.grantCount} Active Grant{stats.grantCount !== 1 ? 's' : ''}
                      {' \u00B7 '}
                      {stats.pubCount} Publication{stats.pubCount !== 1 ? 's' : ''}
                      {' \u00B7 '}
                      {stats.menteeCount} Mentee{stats.menteeCount !== 1 ? 's' : ''}
                    </p>

                    {/* Research keyword pills */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-3 py-1 rounded-full text-xs"
                          style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--gold)',
                            border: '1px solid rgba(201, 168, 76, 0.3)',
                            background: 'rgba(201, 168, 76, 0.05)',
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>

                    {/* View Lab button */}
                    <Button
                      to={director.path}
                      variant="ghost"
                      size="sm"
                      icon={<ArrowRight size={14} />}
                    >
                      View Lab
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <SectionDivider />

      {/* Senior Mentors */}
      <section
        className="py-12 sm:py-16 lg:py-24 content-container"
        ref={mentorsRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Senior Mentors
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {seniorMentors.map((member) => (
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
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--ink)' }}
                  >
                    {member.name}{member.credentials ? `, ${member.credentials}` : ''}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    {member.role}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* Faculty Collaborators */}
      <section
        className="py-12 sm:py-16 lg:py-24 content-container"
        ref={facultyRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Faculty Collaborators
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-6">
          {facultyCollaborators.map((member) => (
            <div key={member.name} className="fade-in-up text-center p-4 rounded-lg transition-all duration-200" style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.08)' }}>
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
                className="text-xs sm:text-sm font-semibold mb-0.5"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
              >
                {member.name}{member.credentials ? `, ${member.credentials}` : ''}
              </h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                {member.role}
              </p>
            </div>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* Research Team */}
      <section
        className="py-12 sm:py-16 lg:py-24 content-container"
        ref={researchRef}
      >
        <h2
          className="fade-in-up text-xl sm:text-2xl lg:text-3xl mb-6 sm:mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Research Team
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {researchTeam.map((member) => (
            <div key={member.name} className="fade-in-up text-center p-4 rounded-lg transition-all duration-200" style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.08)' }}>
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
                className="text-xs sm:text-sm font-semibold mb-0.5"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
              >
                {member.name}{member.credentials ? `, ${member.credentials}` : ''}
              </h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                {member.role}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
