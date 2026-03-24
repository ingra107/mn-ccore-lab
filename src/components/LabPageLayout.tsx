import { type ReactNode, useEffect, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import Avatar from './Avatar'

interface ProfileLink {
  label: string
  href: string
}

interface SectionAnchor {
  id: string
  label: string
}

interface LabPageLayoutProps {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  bio?: string
  links: ProfileLink[]
  sections?: SectionAnchor[]
  photoUrl?: string
  children: ReactNode
}

export default function LabPageLayout({
  name,
  credentials,
  title,
  role,
  initials,
  bio,
  links,
  sections,
  photoUrl,
  children,
}: LabPageLayoutProps) {
  const [activeSection, setActiveSection] = useState<string>('')

  useEffect(() => {
    if (!sections || sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first section that is intersecting
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    )

    for (const section of sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sections])

  const handleAnchorClick = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="pt-8 pb-8 sm:pb-12 lg:pb-16 content-container">
      <div className="lg:grid lg:grid-cols-12 lg:gap-12">
        {/* Left Column (Sticky) */}
        <aside className="lg:col-span-4 xl:col-span-3 mb-12 lg:mb-0">
          <div className="lg:sticky lg:top-28">
            {/* Avatar */}
            <div className="flex justify-center lg:justify-start mb-6">
              <Avatar
                name={`${name}, ${credentials}`}
                initials={initials}
                photoUrl={photoUrl}
                size="lg"
                variant="gold"
              />
            </div>

            <div className="text-center lg:text-left">
              <h1
                className="text-2xl sm:text-3xl mb-1"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  color: 'var(--ink)',
                }}
              >
                {name}, {credentials}
              </h1>
              <p
                className="text-sm mb-1"
                style={{
                  color: 'var(--gold)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                }}
              >
                {role}
              </p>
              <p
                className="text-sm mb-4"
                style={{ color: 'var(--slate)' }}
              >
                {title}
              </p>

              {bio && (
                <p
                  className="text-sm leading-relaxed mb-6"
                  style={{ color: 'var(--slate)' }}
                >
                  {bio}
                </p>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                {links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--ice)',
                      color: 'var(--slate)',
                      border: '1px solid transparent',
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
                    {link.label}
                    <ExternalLink size={10} aria-hidden="true" />
                  </a>
                ))}
              </div>

              {/* On this page — anchor nav */}
              {sections && sections.length > 0 && (
                <nav className="hidden lg:block mt-8" aria-label="On this page">
                  <p
                    className="mb-3 uppercase"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                      color: 'var(--slate)',
                    }}
                  >
                    On this page
                  </p>
                  <ul className="space-y-0.5">
                    {sections.map((section) => {
                      const isActive = activeSection === section.id
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => handleAnchorClick(section.id)}
                            className="cursor-pointer w-full text-left uppercase tracking-wider transition-all duration-200"
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '11px',
                              letterSpacing: '0.05em',
                              padding: '6px 12px',
                              color: isActive ? 'var(--gold)' : 'var(--slate)',
                              borderLeft: isActive
                                ? '2px solid var(--gold)'
                                : '2px solid transparent',
                            }}
                          >
                            {section.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
              )}
            </div>
          </div>
        </aside>

        {/* Right Column (Scrolling) */}
        <div className="lg:col-span-8 xl:col-span-9">
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── Reusable section components ── */

interface GrantRow {
  mechanism: string
  title: string
  agency: string
  proposed?: boolean
}

export function GrantsSection({ grants, id, title = 'Active Grants' }: { grants: GrantRow[]; id?: string; title?: string }) {
  return (
    <section className="mb-16" id={id}>
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <div className="space-y-4">
        {grants.map((grant) => (
          <div
            key={grant.title}
            className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3"
            style={grant.proposed ? { opacity: 0.75 } : undefined}
          >
            <span className="mechanism-pill flex-shrink-0">
              {grant.mechanism}
            </span>
            <div className="flex-1 min-w-0">
              <h3
                className="text-base font-semibold"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink)',
                }}
              >
                {grant.title}
              </h3>
              {grant.proposed && (
                <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>
                  Under review
                </p>
              )}
            </div>
            <span
              className="text-xs flex-shrink-0"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--slate)',
              }}
            >
              {grant.agency}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

interface ProjectCard {
  title: string
  status: 'Active' | 'In Review' | 'Published' | 'In Preparation'
  description?: string
}

function ProjectCardItem({ project }: { project: ProjectCard }) {
  const [hovered, setHovered] = useState(false)

  const badgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'badge badge-active'
      case 'In Review':
        return 'badge badge-review'
      case 'Published':
        return 'badge badge-published'
      case 'In Preparation':
        return 'badge badge-preparation'
      default:
        return 'badge badge-active'
    }
  }

  return (
    <div
      className="card p-5 sm:p-6 pl-6 sm:pl-8 cursor-pointer transition-all duration-200 relative"
      style={{
        borderLeft: hovered ? '5px solid var(--gold)' : '3px solid var(--gold)',
        outline: 'none',
      }}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3
          className="text-sm sm:text-base font-semibold leading-snug"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--ink)',
          }}
        >
          {project.title}
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={badgeClass(project.status)}>
            {project.status}
          </span>
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="transition-opacity duration-200"
            style={{
              color: 'var(--gold)',
              opacity: hovered ? 1 : 0,
            }}
          />
        </div>
      </div>
      {project.description && (
        <p
          className="text-sm leading-relaxed"
          style={{ color: 'var(--slate)' }}
        >
          {project.description}
        </p>
      )}
    </div>
  )
}

export function ProjectsSection({
  title,
  projects,
  id,
}: {
  title: string
  projects: ProjectCard[]
  id?: string
}) {
  return (
    <section className="mb-16" id={id}>
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {projects.map((project) => (
          <ProjectCardItem key={project.title} project={project} />
        ))}
      </div>
    </section>
  )
}

interface MenteeCard {
  name: string
  project: string
}

export function MenteesSection({ mentees, id, title = 'MNCCORE Trainees' }: { mentees: MenteeCard[]; id?: string; title?: string }) {
  return (
    <section className="mb-16" id={id}>
      <h2
        className="text-xl sm:text-2xl mb-2"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--slate)', fontFamily: 'var(--font-body)' }}>
        Trainees are shared across MNCCORE — we mentor as a team.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mentees.map((mentee) => (
          <div
            key={mentee.name}
            className="p-5 sm:p-6 rounded-lg"
            style={{
              background: 'var(--gold-light)',
              border: '1px solid rgba(201, 168, 76, 0.15)',
            }}
          >
            <h3
              className="text-sm font-semibold mb-1"
              style={{
                fontFamily: 'var(--font-body)',
                color: 'var(--ink)',
              }}
            >
              {mentee.name}
            </h3>
            <p
              className="text-sm"
              style={{ color: 'var(--slate)' }}
            >
              {mentee.project}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
