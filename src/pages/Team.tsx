import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'
import { usePageMeta } from '../hooks/usePageMeta'

interface Director {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  path: string
  bio: string
}

interface TeamMember {
  name: string
  initials: string
  role: string
  credentials?: string
}

const directors: Director[] = [
  {
    name: 'Nick Ingraham',
    credentials: 'MD',
    title: 'Assistant Professor, Pulmonary & Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NI',
    path: '/nick',
    bio: 'Physician-scientist focused on provider variation, lung-protective ventilation, and clinical decision-making in the ICU. Founding member of the CLIF Consortium.',
  },
  {
    name: 'Nathan Mesfin',
    credentials: 'MD',
    title: 'Assistant Professor, Critical Care Medicine',
    role: 'Co-Director, MN-CCORE',
    initials: 'NM',
    path: '/nate',
    bio: 'Critical care physician investigating in-hospital cardiac arrest survivability, DNR order variation, and chronic critical illness outcomes.',
  },
]

const seniorMentors: TeamMember[] = [
  { name: 'Adams Dudley', initials: 'AD', role: 'Senior Mentor', credentials: 'MD, MBA' },
  { name: 'Jeff Chipman', initials: 'JC', role: 'Senior Mentor & Surgical Critical Care', credentials: 'MD' },
]

const facultyCollaborators: TeamMember[] = [
  { name: 'Abbie Begnaud', initials: 'AB', role: 'Faculty', credentials: 'MD' },
  { name: 'Ben Henkle', initials: 'BH', role: 'Faculty', credentials: 'MD, MPH' },
  { name: 'Dave MacDonald', initials: 'DM', role: 'Faculty', credentials: 'MD, MS' },
  { name: 'Josh Trujeque', initials: 'JT', role: 'Faculty', credentials: 'MD' },
  { name: 'Katie Pendleton', initials: 'KP', role: 'Faculty', credentials: 'MD' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Faculty', credentials: 'MD' },
]

const researchTeam: TeamMember[] = [
  { name: 'Dan Shyu', initials: 'DS', role: 'Critical Care Fellow', credentials: 'MD' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Critical Care Fellow', credentials: 'MD' },
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Coordinator' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Data Analyst' },
  { name: 'Claire Collins', initials: 'CC', role: 'Medical Student Researcher' },
]

export default function Team() {
  usePageMeta(
    'Team | MN-CCORE Lab',
    'Meet the MN-CCORE research team: co-directors Nick Ingraham and Nathan Mesfin, and our research coordinators, fellows, analysts, and students.'
  )
  const directorsRef = useScrollRevealGroup('.fade-in-up', 200)
  const membersRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Hero */}
      <section className="pt-12 pb-8 sm:pb-12 lg:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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
        className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {directors.map((director) => (
            <div
              key={director.name}
              className="fade-in-up card p-4 sm:p-6 group"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex items-start gap-4 sm:gap-6">
                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-200"
                  style={{
                    background: 'var(--gold-light)',
                    border: '2px solid var(--gold)',
                  }}
                >
                  <span
                    className="text-xl sm:text-2xl font-bold"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color: 'var(--gold)',
                    }}
                  >
                    {director.initials}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className="text-lg sm:text-xl"
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
                    className="text-sm mb-1"
                    style={{
                      color: 'var(--gold)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                  >
                    {director.role}
                  </p>
                  <p
                    className="text-sm mb-3"
                    style={{ color: 'var(--slate)' }}
                  >
                    {director.title}
                  </p>
                  <p
                    className="text-sm leading-relaxed mb-4"
                    style={{ color: 'var(--slate)' }}
                  >
                    {director.bio}
                  </p>
                  <Link
                    to={director.path}
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200"
                    style={{
                      fontFamily: 'var(--font-body)',
                      background: 'rgba(201, 168, 76, 0.1)',
                      color: 'var(--gold)',
                      border: '1px solid rgba(201, 168, 76, 0.2)',
                      minHeight: '44px',
                    }}
                  >
                    View Lab
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* Senior Mentors */}
      <section className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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
                <div
                  className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: 'var(--gold-light)',
                    border: '2px solid var(--gold)',
                  }}
                >
                  <span
                    className="text-base sm:text-lg font-bold"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}
                  >
                    {member.initials}
                  </span>
                </div>
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
      <section className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6" ref={membersRef}>
          {facultyCollaborators.map((member) => (
            <div key={member.name} className="fade-in-up text-center">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full flex items-center justify-center mb-2 transition-all duration-200"
                style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.2)' }}
              >
                <span
                  className="text-sm sm:text-base font-semibold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--slate)' }}
                >
                  {member.initials}
                </span>
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
      <section className="py-8 sm:py-12 lg:py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
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
            <div key={member.name} className="fade-in-up text-center">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full flex items-center justify-center mb-2 transition-all duration-200"
                style={{ background: 'var(--ice)', border: '1px solid rgba(201, 168, 76, 0.2)' }}
              >
                <span
                  className="text-sm sm:text-base font-semibold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--slate)' }}
                >
                  {member.initials}
                </span>
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
