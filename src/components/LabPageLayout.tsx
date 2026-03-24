import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

interface ProfileLink {
  label: string
  href: string
}

interface LabPageLayoutProps {
  name: string
  credentials: string
  title: string
  role: string
  initials: string
  bio?: string
  links: ProfileLink[]
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
  children,
}: LabPageLayoutProps) {
  return (
    <div className="pt-28 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="lg:grid lg:grid-cols-12 lg:gap-12">
        {/* Left Column (Sticky) */}
        <aside className="lg:col-span-4 xl:col-span-3 mb-12 lg:mb-0">
          <div className="lg:sticky lg:top-28">
            {/* Headshot placeholder */}
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center mb-6 mx-auto lg:mx-0"
              style={{
                background: 'var(--gold-light)',
                border: '3px solid var(--gold)',
              }}
            >
              <span
                className="text-3xl font-bold"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--gold)',
                }}
              >
                {initials}
              </span>
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
                    <ExternalLink size={10} />
                  </a>
                ))}
              </div>
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
}

export function GrantsSection({ grants }: { grants: GrantRow[] }) {
  return (
    <section className="mb-16">
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        Active Grants
      </h2>
      <div className="space-y-4">
        {grants.map((grant) => (
          <div
            key={grant.title}
            className="card p-5 flex flex-col sm:flex-row sm:items-center gap-3"
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
  status: 'Active' | 'In Review' | 'Published'
  description?: string
}

export function ProjectsSection({
  title,
  projects,
}: {
  title: string
  projects: ProjectCard[]
}) {
  const badgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'badge badge-active'
      case 'In Review':
        return 'badge badge-review'
      case 'Published':
        return 'badge badge-published'
      default:
        return 'badge badge-active'
    }
  }

  return (
    <section className="mb-16">
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
          <div
            key={project.title}
            className="card p-5"
            style={{ borderLeft: '3px solid var(--gold)' }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3
                className="text-sm font-semibold leading-tight"
                style={{
                  fontFamily: 'var(--font-body)',
                  color: 'var(--ink)',
                }}
              >
                {project.title}
              </h3>
              <span className={badgeClass(project.status)}>
                {project.status}
              </span>
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
        ))}
      </div>
    </section>
  )
}

interface MenteeCard {
  name: string
  project: string
}

export function MenteesSection({ mentees }: { mentees: MenteeCard[] }) {
  return (
    <section className="mb-16">
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        Mentee Projects
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mentees.map((mentee) => (
          <div
            key={mentee.name}
            className="p-5 rounded-lg"
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
