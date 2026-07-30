import { type ReactNode, useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, GraduationCap, FlaskConical } from 'lucide-react'
import Avatar from './Avatar'
import PublicationCard from './PublicationCard'
import type { Publication, Mentee } from '../data/types'
import { getMemberBySlug } from '../data/team'
import { projects } from '../data/projects'
import { isProjectActive, normalizeProjectStatus } from '../lib/taskConstants'
import { ICON_PROPS } from '../lib/iconProps'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'

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
  breadcrumb?: ReactNode
  /** R4-P2-03: portal context uses DM Sans on the name + muted caption.
   *  Public marketing context keeps Fraunces display. */
  portalChrome?: boolean
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
  breadcrumb,
  portalChrome = false,
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
      {breadcrumb}
      <div className="lg:grid lg:grid-cols-12 lg:gap-12">
        {/* Left Column (Sticky) */}
        <aside className="lg:col-span-4 xl:col-span-3 mb-12 lg:mb-0">
          <div className="lg:sticky lg:top-28">
            {/* Avatar */}
            <div className="flex justify-center lg:justify-start mb-6">
              <Avatar
                name={credentials ? `${name}, ${credentials}` : name}
                initials={initials}
                photoUrl={photoUrl}
                size="lg"
                variant="gold"
              />
            </div>

            <div className="text-center lg:text-left">
              <h1
                className={portalChrome ? 'text-2xl mb-1' : 'text-2xl sm:text-3xl mb-1'}
                style={{
                  fontFamily: portalChrome ? 'var(--font-sans)' : 'var(--font-display)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  letterSpacing: portalChrome ? '-0.01em' : undefined,
                }}
              >
                {credentials ? `${name}, ${credentials}` : name}
              </h1>
              <p
                className="text-sm mb-1"
                style={{
                  /* R4-P2-03: muted caption replaces gold in portal chrome. */
                  color: portalChrome ? 'var(--ink-muted, var(--slate))' : 'var(--gold)',
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
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 hov-border hov-color"
                    style={{
                      background: 'var(--ice)',
                      color: 'var(--slate)',
                      border: '1px solid transparent',
                      '--hov-border': 'var(--gold)',
                      '--hov-color': 'var(--gold)',
                    } as React.CSSProperties}
                  >
                    {link.label}
                    <ExternalLink {...ICON_PROPS} size={10} aria-hidden="true" />
                  </a>
                ))}
              </div>

              {/* On this page — anchor nav */}
              {sections && sections.length > 0 && (
                <nav className="hidden lg:block mt-8" aria-label="On this page">
                  <p
                    className="mb-3 uppercase"
                    style={{
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
  status?: 'Active' | 'Pending' | 'Completed'
}

export function GrantsSection({ grants, id, title = 'Active Funding' }: { grants: GrantRow[]; id?: string; title?: string }) {
  // Filter stub/placeholder rows from the public-facing list. Lead with real
  // mechanism-bearing grants so visitors don't see "---" first. P2-R2-11.
  const isRealGrant = (g: GrantRow) =>
    g.title?.trim() &&
    g.title.trim() !== '---' &&
    g.title.trim() !== 'Departmental Operational Support' &&
    g.mechanism?.trim() &&
    g.mechanism.trim() !== '---'
  const activeGrants = grants.filter((g) => !g.proposed && isRealGrant(g))
  const pendingGrants = grants.filter((g) => g.proposed && isRealGrant(g))

  return (
    <section className="mb-16" id={id}>
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <div className="space-y-3">
        {activeGrants.map((grant) => (
          <div
            key={grant.title}
            className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <span className="mechanism-pill flex-shrink-0">
              {grant.mechanism}
            </span>
            <div className="flex-1 min-w-0">
              <h3
                className="text-base font-normal"
                style={{
                  color: 'var(--ink)',
                }}
              >
                {grant.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="badge badge-active">Active</span>
              <span
                className="text-xs"
                style={{ color: 'var(--slate)' }}
              >
                {grant.agency}
              </span>
            </div>
          </div>
        ))}
        {pendingGrants.length > 0 && (
          <>
            <p
              className="text-xs mt-4 mb-2"
              style={{
                color: 'var(--slate)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Pending Review
            </p>
            {pendingGrants.map((grant) => (
              <div
                key={grant.title}
                className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
                style={{ opacity: 0.85 }}
              >
                <span className="mechanism-pill flex-shrink-0">
                  {grant.mechanism}
                </span>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-sm font-normal"
                    style={{
                      color: 'var(--ink)',
                    }}
                  >
                    {grant.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="badge badge-review">Pending</span>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--slate)' }}
                  >
                    {grant.agency}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
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
      className="card p-5 sm:p-6 pl-6 sm:pl-8 cursor-pointer relative"
      style={{
        borderLeft: hovered ? '5px solid var(--gold)' : '3px solid var(--gold)',
        outline: 'none',
        transition: 'border-left-width var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out)',
      }}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3
          className="text-sm sm:text-base font-normal leading-snug"
          style={{
            color: 'var(--ink)',
          }}
        >
          {project.title}
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={badgeClass(project.status)}>
            {project.status}
          </span>
          <ArrowRight {...ICON_PROPS}
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
          fontWeight: 500,
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

export function PublicationsSection({
  publications,
  id,
  title = 'Publications',
  recentCount = 10,
}: {
  publications: Publication[]
  id?: string
  title?: string
  /** #906 — a member with >10 publications (routine post-#905, e.g. Dudley
   *  ~250) collapses to the `recentCount` most recent by default, with a
   *  "View all" toggle revealing the rest in place (design principle #3). */
  recentCount?: number
}) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...publications].sort((a, b) => b.year - a.year)
  const hasOverflow = sorted.length > recentCount
  const visible = showAll ? sorted : sorted.slice(0, recentCount)

  return (
    <section className="mb-16" id={id}>
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: 'var(--ink)',
        }}
      >
        {title}
      </h2>
      <div className="space-y-4">
        {visible.map((pub) => (
          <PublicationCard key={pub.id} pub={pub} />
        ))}
      </div>
      {hasOverflow && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-sm font-medium cursor-pointer transition-opacity duration-200 hover:opacity-80"
            style={{ color: 'var(--gold)', background: 'none', border: 'none' }}
          >
            {showAll ? 'Show fewer' : `View all ${sorted.length} publications`}
          </button>
        </div>
      )}
    </section>
  )
}

function MenteeProfileCard({ mentee }: { mentee: Mentee }) {
  const [hovered, setHovered] = useState(false)
  const member = getMemberBySlug(mentee.slug)
  const menteeProjects = mentee.projectSlugs
    ?.map((slug) => projects.find((p) => p.slug === slug))
    .filter(Boolean) ?? []

  return (
    <a
      href={mentee.slug ? `/team/${mentee.slug}` : undefined}
      className="card p-0 overflow-hidden cursor-pointer block"
      style={{
        textDecoration: 'none',
        borderLeft: hovered ? '4px solid var(--gold)' : '4px solid transparent',
        transition: 'border-color var(--duration-slow) var(--ease-out)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="p-5 sm:p-6">
        {/* Header: Photo + Name + Role */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar
            name={mentee.name}
            initials={mentee.name.split(' ').map((n) => n[0]).join('')}
            photoUrl={member?.photoUrl}
            size="sm"
            variant="gold"
          />
          <div className="flex-1 min-w-0">
            <h3
              className="text-base font-normal leading-tight"
              style={{
                color: 'var(--ink)',
              }}
            >
              {mentee.name}{mentee.credentials ? `, ${mentee.credentials}` : ''}
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{
                color: 'var(--gold)',
                letterSpacing: '0.02em',
              }}
            >
              {mentee.role}
            </p>
            {mentee.mentor !== 'shared' && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--slate)', opacity: 0.85 }}>
                Mentor: {mentee.mentor === 'nick-ingraham' ? 'Nick Ingraham' : 'Nathan Mesfin'}
              </p>
            )}
          </div>
        </div>

        {/* Bio */}
        {mentee.bio && (
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: 'var(--slate)' }}
          >
            {mentee.bio}
          </p>
        )}

        {/* Research Interests */}
        {mentee.researchInterests && mentee.researchInterests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {mentee.researchInterests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.02em',
                  background: 'var(--ice)',
                  color: 'var(--slate)',
                  border: `1px solid ${withAlpha(ACCENT_GOLD, 12)}`,
                }}
              >
                {interest}
              </span>
            ))}
          </div>
        )}

        {/* Linked Projects */}
        {menteeProjects.length > 0 && (
          <div
            className="pt-3"
            style={{ borderTop: `1px solid ${withAlpha(ACCENT_GOLD, 10)}` }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <FlaskConical {...ICON_PROPS} size={12} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <span
                className="text-xs uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  color: 'var(--slate)',
                  opacity: 0.85,
                }}
              >
                Active Projects
              </span>
            </div>
            <div className="space-y-1.5">
              {menteeProjects.map((project) => project && (
                <div
                  key={project.slug}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className="text-xs truncate"
                    style={{
                      color: 'var(--ink)',
                      fontWeight: 500,
                    }}
                  >
                    {project.title}
                  </span>
                  <span
                    className={`badge ${
                      isProjectActive(project.status) ? 'badge-active'
                        : normalizeProjectStatus(project.status) === 'waiting_external' ? 'badge-review'
                        : normalizeProjectStatus(project.status) === 'done' ? 'badge-published'
                        : 'badge-preparation'
                    }`}
                    style={{ fontSize: '10px', padding: '1px 6px', textTransform: 'capitalize' }}
                  >
                    {normalizeProjectStatus(project.status).replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </a>
  )
}

export function MenteesSection({ mentees, id, title = 'MNCCORE Trainees' }: { mentees: Mentee[]; id?: string; title?: string }) {
  return (
    <section className="mb-16" id={id}>
      <div className="flex items-center gap-3 mb-2">
        <GraduationCap size={22} style={{ color: 'var(--gold)' }} aria-hidden="true" />
        <h2
          className="text-xl sm:text-2xl"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
        Trainees are shared across MNCCORE — we mentor as a team.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mentees.map((mentee) => (
          <MenteeProfileCard key={mentee.name} mentee={mentee} />
        ))}
      </div>
    </section>
  )
}
