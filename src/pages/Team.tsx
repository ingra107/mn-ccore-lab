import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import Avatar from '../components/Avatar'
import { usePageMeta } from '../hooks/usePageMeta'
import { directors, seniorMentors, facultyCollaborators, researchTeam } from '../data/team'
import { grants } from '../data/grants'
import { publications } from '../data/publications'
import { mentees } from '../data/mentees'

function getDirectorStats(slug: string) {
  const grantCount = grants.filter((g) => g.pi === slug && !g.proposed).length
  const pubCount = publications.filter((p) => p.authorSlugs?.includes(slug)).length
  // Trainees are shared — show total MNCCORE trainees for both directors
  const menteeCount = mentees.filter((m) => m.mentor === 'shared' || m.mentor === slug).length
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
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Co-Directors
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {directors.map((director) => {
            const stats = getDirectorStats(director.slug)
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
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {director.name}, {director.credentials}
                    </h3>
                    <p
                      className="mb-0.5"
                      style={{
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-mono)',
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
                      className="text-sm leading-relaxed mb-3"
                      style={{ color: 'var(--slate)' }}
                    >
                      {director.bio}
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
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
        className="py-8 sm:py-12 lg:py-16 content-container"
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
                className="text-xs sm:text-sm font-semibold mb-0.5 group-hover:text-[var(--gold)] transition-colors duration-200"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
              >
                {member.name}{member.credentials ? `, ${member.credentials}` : ''}
              </h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                {member.role}
              </p>
            </Link>
          ))}
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
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Research Team
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {researchTeam.map((member) => (
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
                className="text-xs sm:text-sm font-semibold mb-0.5 group-hover:text-[var(--gold)] transition-colors duration-200"
                style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
              >
                {member.name}{member.credentials ? `, ${member.credentials}` : ''}
              </h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                {member.role}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
