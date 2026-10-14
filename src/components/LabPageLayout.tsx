import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { ExternalLink, FlaskConical } from 'lucide-react'
import { SecHead } from './public/PublicParts'
import MemberHead from './MemberHead'
import { FaceDisc } from './today/skin'
import PublicationCard from './PublicationCard'
import PageHeartbeat from './moments/PageHeartbeat'
import PageWithRail from './PageWithRail'
import HeroNumber, { type HeroNumberProps } from './moments/HeroNumber'
import type { Publication, Mentee, GrantBucket } from '../data/types'
import { getMemberBySlug } from '../data/team'
import { projects } from '../data/projects'
import { isProjectActive, normalizeProjectStatus } from '../lib/taskConstants'
import { ICON_PROPS } from '../lib/iconProps'
import { withAlpha } from '../lib/taskGrouping'
import { memberHue } from '../lib/memberHue'
import { statusLabel } from '../lib/textUtils'
import { realGrants } from '../lib/publicGrants'

// The public site has no portal band: cap the grid at the portal's width so main
// does not run past it, and keep the rail's stick offset (7rem, what the old
// aside used) clear of the fixed public nav, since --portal-header-h is only set
// inside the portal.
const PUBLIC_BAND = { maxWidth: 'var(--page-width)', margin: '0 auto', '--pwr-top': '7rem' } as CSSProperties

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
  /** Portal only: the page's one telling number under the name (color-back pick 2). */
  hero?: HeroNumberProps
  /** A member's own page passes their slug: the page then carries that
   *  member's one personal hue (avatar ring + activity cells; pick 8). */
  hueSeed?: string
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
  hero,
  hueSeed,
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
    <div
      className={`pt-8 pb-8 sm:pb-12 lg:pb-16 content-container${hueSeed ? ' member-hue' : ''}`}
      style={hueSeed ? ({ '--mh-h': memberHue(hueSeed) } as CSSProperties) : undefined}
    >
      {breadcrumb}
      <PageWithRail side="start" railFirst railLabel="Profile" testId="member-grid" railTestId="member-rail" bandStyle={portalChrome ? undefined : PUBLIC_BAND} rail={
          <div>
            {/* Avatar */}
            <div className="flex justify-center lg:justify-start mb-6">
              <FaceDisc label={credentials ? `${name}, ${credentials}` : name} initials={initials} photo={photoUrl} px={128} variant={hueSeed ? 'hue' : 'brand'} />
            </div>

            <div className="text-center lg:text-left">
              <h1
                className={portalChrome ? 'text-2xl mb-1' : 'text-3xl sm:text-4xl mb-1'}
                style={{
                  fontFamily: portalChrome ? 'var(--font-sans)' : 'var(--font-display)',
                  fontWeight: portalChrome ? 600 : 500,
                  color: 'var(--ink)',
                  letterSpacing: portalChrome ? '-0.01em' : undefined,
                }}
              >
                {credentials ? `${name}, ${credentials}` : name}
              </h1>
              {/* Portal: the heartbeat line under the title (color-back pick 10). */}
              {portalChrome && <PageHeartbeat className="pg-hb-tight" />}
              <p
                className="text-sm mb-1"
                style={{
                  /* R4-P2-03: muted caption replaces gold in portal chrome. */
                  color: portalChrome ? 'var(--ink-muted, var(--slate))' : 'var(--job-brand)',
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

              {portalChrome && hero && (
                <div className="mb-4 flex justify-center lg:justify-start">
                  <HeroNumber {...hero} />
                </div>
              )}

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
                    className="tk-btn tk-sm cursor-pointer hov-color"
                    style={{
                      color: 'var(--slate)',
                      '--hov-color': 'var(--job-brand)',
                    } as React.CSSProperties}
                  >
                    {link.label}
                    <ExternalLink {...ICON_PROPS} size={10} aria-hidden="true" />
                  </a>
                ))}
              </div>

              {/* On this page — anchor nav */}
              {sections && sections.length > 0 && (
                <nav className="pwr-wide-only mt-8" aria-label="On this page">
                  <p
                    className="mb-3"
                    style={{
                      fontSize: '11px',
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
                            className="cursor-pointer w-full text-left transition-all duration-200"
                            style={{
                              fontSize: '12px',
                              padding: '6px 12px',
                              /* Portal: the active item goes neutral so the
                                 member's personal hue stays the page's one
                                 accent (color rule 2026-10-11). The public
                                 site keeps its gold brand. */
                              color: isActive ? (portalChrome ? 'var(--ink)' : 'var(--job-brand)') : 'var(--slate)',
                              borderLeft: isActive
                                ? `2px solid ${portalChrome ? 'var(--ink)' : 'var(--job-brand)'}`
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
      }>
        {children}
      </PageWithRail>
    </div>
  )
}

/* ── Reusable section components ── */

interface GrantRow {
  mechanism: string
  title: string
  agency: string
  bucket: GrantBucket
}

export function GrantsSection({ grants, id, title = 'Active Funding' }: { grants: GrantRow[]; id?: string; title?: string }) {
  // Filter stub/placeholder rows from the public-facing list. Lead with real
  // mechanism-bearing grants so visitors don't see "---" first. P2-R2-11.
  const activeGrants = realGrants(grants).filter((g) => g.bucket === 'active')
  const pendingGrants = realGrants(grants).filter((g) => g.bucket === 'proposed')
  // No live row to show (an anonymous visitor gets none): no empty section head.
  if (activeGrants.length === 0 && pendingGrants.length === 0) return null

  return (
    <section className="mb-16" id={id}>
      <SecHead title={title} />
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
              }}
            >
              Pending review
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

export function PublicationsSection({
  publications,
  id,
  title = 'Papers',
  recentCount = 10,
  portalChrome = false,
}: {
  publications: Publication[]
  id?: string
  title?: string
  /** #906 — a member with >10 publications (routine post-#905, e.g. Dudley
   *  ~250) collapses to the `recentCount` most recent by default, with a
   *  "View all" toggle revealing the rest in place (design principle #3). */
  recentCount?: number
  /** Portal: the "View all" toggle is neutral, not the public gold brand. */
  portalChrome?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...publications].sort((a, b) => b.year - a.year)
  const hasOverflow = sorted.length > recentCount
  const visible = showAll ? sorted : sorted.slice(0, recentCount)

  return (
    <section className="mb-16" id={id}>
      <MemberHead title={title} />
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
            style={{ color: portalChrome ? 'var(--ink)' : 'var(--job-brand)', background: 'none', border: 'none' }}
          >
            {showAll ? 'Show fewer' : `View all ${sorted.length} papers`}
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
        borderLeft: hovered ? '4px solid var(--job-brand)' : '4px solid transparent',
        transition: 'border-color var(--duration-slow) var(--ease-out)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="p-5 sm:p-6">
        {/* Header: Photo + Name + Role */}
        <div className="flex items-start gap-4 mb-4">
          <FaceDisc label={mentee.name} initials={mentee.name.split(' ').map((n) => n[0]).join('')} photo={member?.photoUrl} px={64} pxSm={56} variant="brand" />
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
                color: 'var(--job-brand)',
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
                  background: 'var(--sk-panel)',
                  color: 'var(--slate)',
                  border: `1px solid ${withAlpha('var(--job-brand)', 12)}`,
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
            style={{ borderTop: `1px solid ${withAlpha('var(--job-brand)', 10)}` }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <FlaskConical {...ICON_PROPS} size={12} style={{ color: 'var(--job-brand)' }} aria-hidden="true" />
              <span
                className="text-xs"
                style={{
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 0.85,
                }}
              >
                Active projects
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
                    style={{ fontSize: '10px', padding: '1px 6px' }}
                  >
                    {statusLabel(normalizeProjectStatus(project.status))}
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
      <SecHead title={title} />
      <p className="text-sm mb-6" style={{ color: 'var(--slate)', marginTop: 4 }}>
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
