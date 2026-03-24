import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useScrollRevealGroup } from '../hooks/useScrollReveal'
import SectionDivider from '../components/SectionDivider'

interface Director {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  path: string
  bio: string
}

interface LabMember {
  name: string
  initials: string
  role: string
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

const labMembers: LabMember[] = [
  { name: 'Emma Bromley', initials: 'EB', role: 'Research Assistant' },
  { name: 'Claire Collins', initials: 'CC', role: 'Research Coordinator' },
  { name: 'Dan Shyu', initials: 'DS', role: 'Research Associate' },
  { name: 'Casey Eddington', initials: 'CE', role: 'Research Assistant' },
  { name: 'Michael Kalinoski', initials: 'MK', role: 'Research Assistant' },
  { name: 'Beret Fitzgerald', initials: 'BF', role: 'Research Assistant' },
]

export default function Team() {
  const directorsRef = useScrollRevealGroup('.fade-in-up', 200)
  const membersRef = useScrollRevealGroup('.fade-in-up', 100)

  return (
    <>
      {/* Hero */}
      <section
        className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      >
        <h1
          className="text-4xl sm:text-5xl mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: 'var(--ink)',
          }}
        >
          Our Team
        </h1>
        <p
          className="text-lg max-w-2xl"
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
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={directorsRef}
      >
        <h2
          className="fade-in-up text-2xl sm:text-3xl mb-12"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Co-Directors
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {directors.map((director) => (
            <Link
              key={director.name}
              to={director.path}
              className="fade-in-up card p-8 cursor-pointer group"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex items-start gap-6">
                {/* Avatar */}
                <div
                  className="flex-shrink-0 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200"
                  style={{
                    background: 'var(--gold-light)',
                    border: '2px solid var(--gold)',
                  }}
                >
                  <span
                    className="text-2xl font-bold"
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
                      className="text-xl"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {director.name}, {director.credentials}
                    </h3>
                    <ArrowRight
                      size={16}
                      className="opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                      style={{ color: 'var(--gold)' }}
                    />
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
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--slate)' }}
                  >
                    {director.bio}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <SectionDivider />

      {/* Lab Members */}
      <section
        className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
        ref={membersRef}
      >
        <h2
          className="fade-in-up text-2xl sm:text-3xl mb-12"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          Lab Members
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {labMembers.map((member) => (
            <div
              key={member.name}
              className="fade-in-up text-center"
            >
              <div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-3 transition-all duration-200"
                style={{
                  background: 'var(--ice)',
                  border: '1px solid rgba(201, 168, 76, 0.2)',
                }}
              >
                <span
                  className="text-lg font-semibold"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--slate)',
                  }}
                >
                  {member.initials}
                </span>
              </div>
              <h3
                className="text-sm font-semibold mb-1"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink)',
                }}
              >
                {member.name}
              </h3>
              <p
                className="text-xs"
                style={{ color: 'var(--slate)' }}
              >
                {member.role}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
