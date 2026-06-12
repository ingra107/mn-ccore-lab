import { useMemo, useState } from 'react'
import { useParams, Navigate, Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LabPageLayout, { PublicationsSection } from '../components/LabPageLayout'
import Breadcrumb from '../components/Breadcrumb'
import { FlaskConical, GraduationCap, Handshake, CheckCircle2, TrendingUp, Sparkles, X, Plus, Activity } from 'lucide-react'
import SectionDivider from '../components/SectionDivider'
import MenteeDashboard from '../components/MenteeDashboard'
import ActivityHeatmap from '../components/ActivityHeatmap'
import { usePageMeta } from '../hooks/usePageMeta'
import { usePublications, useExpertise, useMenteeMilestones, useContributionScore } from '../hooks/useApiData'
import type { MenteeMilestoneRow } from '../hooks/useApiData'
import { useCommitments } from '../hooks/useCommitments'
import { useAddExpertise, useRemoveExpertise } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import type { CommitmentRow } from '../hooks/useCommitments'
import { getMemberBySlug, getPersonInfo } from '../data/team'
import { getMenteeBySlug } from '../data/mentees'
import { projects } from '../data/projects'
import { formatShortDate, isOverdue } from '../lib/dateUtils'
import { displayName as formatTier, fullNameForSlug } from '../lib/nameUtils'
import { isProjectActive, normalizeProjectStatus } from '../lib/taskConstants'
import WatchButton from '../components/WatchButton'
import { PATHS } from '../constants/paths'

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
  ventilation: 'var(--green)',
  'decision-making': '#9333ea',
  quality: '#d97706',
  sepsis: '#db2777',
  disparities: '#0284c7',
}

// isOverdue imported from dateUtils

function MemberCommitmentCard({ item }: { item: CommitmentRow }) {
  const isDone = item.status === 'done'
  const overdue = !isDone && isOverdue(item.due_date)
  const borderColor = isDone ? 'var(--teal)' : overdue ? 'var(--maroon)' : 'var(--gold)'
  // to_slug is authoritative when present (WS2.4); falls back to to_whom text
  const toPersonInfo = item.to_slug ? getPersonInfo(item.to_slug) : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
      className="card"
      style={{
        padding: '1rem 1.25rem',
        marginBottom: '0.5rem',
        borderLeft: `3px solid ${borderColor}`,
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div
          style={{
            color: isDone ? 'var(--teal)' : 'var(--slate)',
            opacity: isDone ? 1 : 0.85,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {isDone ? <CheckCircle2 size={20} /> : <Handshake size={20} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              color: 'var(--ink)',
              lineHeight: 1.4,
              textDecoration: isDone ? 'line-through' : 'none',
              opacity: isDone ? 0.85 : 1,
            }}
          >
            {item.commitment}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.4rem',
            }}
          >
            {/* Due date */}
            {item.due_date && (
              <span
                style={{
                  fontSize: '11px',
                  color: overdue ? 'var(--maroon)' : 'var(--slate)',
                  opacity: overdue ? 1 : 0.85,
                  fontWeight: overdue ? 600 : 400,
                }}
              >
                {overdue ? 'overdue' : 'due'} {formatShortDate(item.due_date)}
              </span>
            )}

            {/* to whom — avatar chip when to_slug present, else text fallback */}
            {(item.to_slug || item.to_whom) && (
              <>
                {(item.due_date || item.source) && <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--slate)', opacity: 0.85 }}>
                  {toPersonInfo?.photoUrl ? (
                    <img src={toPersonInfo.photoUrl} alt={toPersonInfo.name} style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : toPersonInfo ? (
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--gold-light)', border: '1px solid var(--gold)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{toPersonInfo.initials}</span>
                  ) : null}
                  {toPersonInfo ? toPersonInfo.name : item.to_whom}
                </span>
              </>
            )}

            {/* Source */}
            {item.source && (
              <>
                {item.due_date && <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>}
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--slate)',
                    opacity: 0.75,
                  }}
                >
                  from {item.source.replace(/^meeting:\s*/i, '')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function MemberPage() {
  const { data: publications = [] } = usePublications()
  const { slug } = useParams<{ slug: string }>()
  // Same component renders at /team/:slug (public chrome) and
  // /portal/team/:slug (portal chrome). Trajectory link should preserve context.
  const location = useLocation()
  const teamBase = location.pathname.startsWith('/portal/') ? '/portal/team' : '/team'
  const member = slug ? getMemberBySlug(slug) : undefined

  // Check if this member is also a mentee (trainee)
  const mentee = slug ? getMenteeBySlug(slug) : undefined
  const menteeProjects = mentee?.projectSlugs
    ?.map((s) => projects.find((p) => p.slug === s))
    .filter(Boolean) ?? []

  // Expertise tags for this member
  const { data: expertiseTags = [] } = useExpertise(slug)
  const addExpertiseMut = useAddExpertise(slug || '')
  const removeExpertiseMut = useRemoveExpertise(slug || '')
  const [newTag, setNewTag] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const { isAuthenticated } = useAuth()
  const { data: allCommitments = [] } = useCommitments(slug)

  // Commitments to this person (slug does partial match on to_whom)
  const { openCommitments, doneCommitments } = useMemo(() => {
    const open: CommitmentRow[] = []
    const done: CommitmentRow[] = []
    for (const c of allCommitments) {
      if (c.status === 'done') {
        done.push(c)
      } else {
        open.push(c)
      }
    }
    open.sort((a, b) => {
      const aOver = isOverdue(a.due_date)
      const bOver = isOverdue(b.due_date)
      if (aOver !== bOver) return aOver ? -1 : 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    done.sort((a, b) => {
      if (a.completed_at && b.completed_at) return b.completed_at.localeCompare(a.completed_at)
      return 0
    })
    return { openCommitments: open, doneCommitments: done }
  }, [allCommitments])
  const hasCommitments = openCommitments.length + doneCommitments.length > 0

  if (!member) {
    return <Navigate to="/team" replace />
  }

  const displayName = member.slug
    ? formatTier(member.slug, 'formal')
    : member.credentials
      ? `${member.name}, ${member.credentials}`
      : member.name

  // P3-07: filter publications by authorSlugs first (canonical, post Phase
  // 36b rename) and fall back to substring match on `authors` for legacy
  // pubs that haven't been re-tagged. Member slug = team_members.slug.
  const memberPubs = useMemo(() => {
    if (!publications.length) return []
    return publications.filter((p) => {
      const slugs = (p as any).authorSlugs ?? (p as any).author_slugs ?? ''
      const slugList = typeof slugs === 'string'
        ? slugs.split(',').map((s) => s.trim().toLowerCase())
        : Array.isArray(slugs) ? slugs.map((s) => String(s).toLowerCase()) : []
      if (member.slug && slugList.includes(member.slug.toLowerCase())) return true
      if (member.authorName && p.authors?.includes(member.authorName)) return true
      return false
    })
  }, [publications, member.slug, member.authorName])

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
    `${displayName} — ${member.role} at MN-CCORE Lab, University of Minnesota.${publishedCount > 0 ? ` ${publishedCount} publications.` : ''}`,
    {
      ogType: 'profile',
      ogImage: slug ? `https://mn-ccore-lab.pages.dev/og/team/${slug}` : undefined,
    },
  )

  // Render the formal full name in the header ("Robert Adams Dudley" not
  // "Adams Dudley"). credentials stay separate so LabPageLayout's h1 keeps
  // its "name, credentials" composition with proper typography.
  const formalFullName = member.slug ? fullNameForSlug(member.slug) : member.name

  return (
    <LabPageLayout
      name={formalFullName}
      credentials={member.credentials ?? ''}
      title={member.role}
      role="MN-CCORE Team Member"
      initials={member.initials}
      bio={member.bio || mentee?.bio}
      links={memberLinks}
      photoUrl={member.photoUrl}
      portalChrome={location.pathname.startsWith('/portal/')}
      breadcrumb={<Breadcrumb backTo="/team" backLabel="Team" current={formalFullName} />}
      sections={[
        ...(mentee
          ? [{ id: 'research-focus', label: 'Research Focus' }]
          : []),
        ...(menteeProjects.length > 0
          ? [{ id: 'active-projects', label: 'Active Projects' }]
          : []),
        ...(expertiseTags.length > 0 || isAuthenticated
          ? [{ id: 'expertise', label: `Expertise${expertiseTags.length > 0 ? ` (${expertiseTags.length})` : ''}` }]
          : []),
        ...(slug
          ? [{ id: 'activity', label: 'Activity' }]
          : []),
        ...(topicCounts.length > 0
          ? [{ id: 'research-areas', label: 'Research Areas' }]
          : []),
        ...(hasCommitments
          ? [{ id: 'commitments', label: `Commitments (${openCommitments.length})` }]
          : []),
        ...(memberPubs.length > 0
          ? [{ id: 'publications', label: `Publications (${memberPubs.length})` }]
          : []),
      ]}
    >
      {/* View Trajectory link */}
      {slug && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Link
            to={`${teamBase}/${slug}/trajectory`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium hov-border hov-color"
            style={{
              background: 'var(--ice)',
              color: 'var(--slate)',
              border: '1px solid transparent',
              textDecoration: 'none',
              transition: 'border-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out)',
              '--hov-border': 'var(--teal)',
              '--hov-color': 'var(--teal)',
            } as React.CSSProperties}
          >
            <TrendingUp size={12} />
            View Trajectory
          </Link>
          <WatchButton id={slug} type="person" label={member.name} slug={slug} />
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
                  fontWeight: 500,
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
                      background: 'var(--gold-active)',
                      color: 'var(--gold)',
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
              <span className="text-xs" style={{ color: 'var(--slate)' }}>
                {mentee.mentor === 'shared'
                  ? 'Shared mentorship — Ingraham & Mesfin'
                  : `Mentor: ${mentee.mentor === 'nick-ingraham' ? 'Nick Ingraham, MD' : 'Nathan Mesfin, MD'}`}
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
                  fontWeight: 500,
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
                      className="text-sm sm:text-base font-normal"
                      style={{ color: 'var(--ink)' }}
                    >
                      {project.title}
                    </h3>
                    <span
                      className={`badge ${
                        isProjectActive(project.status) ? 'badge-active'
                          : normalizeProjectStatus(project.status) === 'waiting_external' ? 'badge-review'
                          : normalizeProjectStatus(project.status) === 'done' ? 'badge-published'
                          : 'badge-preparation'
                      }`}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {normalizeProjectStatus(project.status).replace('_', ' ')}
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
                      style={{ color: 'var(--muted)' }}
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

      {/* Expertise tags */}
      {(expertiseTags.length > 0 || isAuthenticated) && (
        <>
          <section className="mb-8" id="expertise">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                Expertise
              </h2>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              <AnimatePresence mode="popLayout">
                {expertiseTags.map((t) => (
                  <motion.span
                    key={t.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] cursor-pointer transition-opacity hover:opacity-80"
                    style={{
                      fontWeight: 400,
                      background: 'var(--teal-active)',
                      color: 'var(--teal)',
                      border: '1px solid rgba(45,138,138,0.2)',
                    }}
                    onClick={() => window.location.href = `/team?expertise=${encodeURIComponent(t.tag)}`}
                    role="link"
                    tabIndex={0}
                  >
                    {t.tag}
                    {t.source !== 'manual' && (
                      <span
                        style={{
                          fontSize: '10px',
                          opacity: 0.85,
                          marginLeft: '2px',
                        }}
                        title={`Source: ${t.source}, confidence: ${t.confidence}`}
                      >
                        {t.source === 'publication' ? 'pub' : t.source}
                      </span>
                    )}
                    {isAuthenticated && (
                      <button
                        onClick={() => removeExpertiseMut.mutate(t.id)}
                        className="ml-0.5 hover:opacity-100 opacity-40 transition-opacity"
                        style={{ lineHeight: 1 }}
                        title="Remove tag"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </motion.span>
                ))}
              </AnimatePresence>

              {isAuthenticated && !showAddTag && (
                <button
                  onClick={() => setShowAddTag(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium hov-border hov-color"
                  style={{
                    background: 'transparent',
                    color: 'var(--slate)',
                    border: '1px dashed rgba(100,116,139,0.3)',
                    cursor: 'pointer',
                    transition: 'border-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out)',
                    '--hov-border': 'var(--gold)',
                    '--hov-color': 'var(--gold)',
                  } as React.CSSProperties}
                >
                  <Plus size={10} />
                  Add
                </button>
              )}
            </div>

            {showAddTag && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 mb-4"
              >
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      addExpertiseMut.mutate({ tag: newTag.trim() }, {
                        onSuccess: () => {
                          setNewTag('')
                          setShowAddTag(false)
                        },
                      })
                    }
                    if (e.key === 'Escape') {
                      setNewTag('')
                      setShowAddTag(false)
                    }
                  }}
                  placeholder="e.g. mechanical ventilation, sepsis..."
                  autoFocus
                  className="px-3 py-1.5 rounded-md text-sm"
                  style={{
                    background: 'var(--ice)',
                    color: 'var(--ink)',
                    border: '1px solid rgba(201,168,76,0.2)',
                    outline: 'none',
                    width: '240px',
                  }}
                />
                <button
                  onClick={() => {
                    if (newTag.trim()) {
                      addExpertiseMut.mutate({ tag: newTag.trim() }, {
                        onSuccess: () => {
                          setNewTag('')
                          setShowAddTag(false)
                        },
                      })
                    }
                  }}
                  disabled={!newTag.trim() || addExpertiseMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium"
                  style={{
                    background: newTag.trim() ? 'var(--gold)' : 'var(--ice)',
                    color: newTag.trim() ? 'var(--ink)' : 'var(--slate)',
                    border: 'none',
                    cursor: newTag.trim() ? 'pointer' : 'default',
                    opacity: newTag.trim() ? 1 : 0.85,
                    transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out), opacity var(--duration-normal) var(--ease-out)',
                  }}
                >
                  {addExpertiseMut.isPending ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setNewTag(''); setShowAddTag(false) }}
                  className="px-2 py-1.5 rounded-md text-xs transition-opacity hover:opacity-100 opacity-50"
                  style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  Cancel
                </button>
              </motion.div>
            )}

            {expertiseTags.length === 0 && !showAddTag && (
              <p className="text-sm" style={{ color: 'var(--slate)', opacity: 0.75 }}>
                No expertise tags yet.{isAuthenticated ? ' Click + Add to tag areas of expertise.' : ''}
              </p>
            )}
          </section>
          <SectionDivider />
          <div className="py-4" />
        </>
      )}

      {/* Activity heatmap + contribution score */}
      {slug && (
        <>
          <section className="mb-8" id="activity">
            <div className="flex items-center gap-3 mb-4">
              <Activity size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                Activity
              </h2>
            </div>
            <ContributionScoreCard slug={slug} />
            <div style={{ marginTop: '1rem' }} />
            <ActivityHeatmap slug={slug} days={90} />
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
                fontWeight: 500,
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
                    fontWeight: 500,
                  }}
                >
                  {TOPIC_DISPLAY[topic] ?? topic}
                  <span
                    className="text-xs opacity-60"
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

      {/* Milestones — for fellows and research team members */}
      {slug && (mentee || member.role?.includes('Fellow') || member.role?.includes('Researcher')) && (
        <MemberMilestones slug={slug} />
      )}

      {/* Commitments to this person */}
      {hasCommitments && (
        <>
          <SectionDivider />
          <div className="py-4" />
          <section className="mb-8" id="commitments">
            <div className="flex items-center gap-3 mb-4">
              <Handshake size={20} style={{ color: 'var(--gold)' }} aria-hidden="true" />
              <h2
                className="text-xl sm:text-2xl"
                style={{
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                Commitments
              </h2>
              {openCommitments.length > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--slate)',
                    opacity: 0.75,
                  }}
                >
                  {openCommitments.length} open
                </span>
              )}
            </div>

            <AnimatePresence mode="popLayout">
              {openCommitments.map((c) => (
                <MemberCommitmentCard key={c.id} item={c} />
              ))}
            </AnimatePresence>

            {doneCommitments.length > 0 && (
              <div style={{ marginTop: '0.75rem', opacity: 0.85 }}>
                <AnimatePresence mode="popLayout">
                  {doneCommitments.map((c) => (
                    <MemberCommitmentCard key={c.id} item={c} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}

      {memberPubs.length > 0 && (
        <PublicationsSection publications={memberPubs} id="publications" />
      )}
      {memberPubs.length === 0 && (
        <div
          className="py-8 text-center"
          style={{ color: 'var(--slate)' }}
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

// ── Contribution Score Card ──────────────────────────────

const TREND_ARROWS: Record<string, { symbol: string; color: string }> = {
  increasing: { symbol: '\u2191', color: 'var(--green)' },
  stable: { symbol: '\u2192', color: 'var(--slate)' },
  declining: { symbol: '\u2193', color: 'var(--maroon)' },
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 0.1)
  const w = 120
  const h = 28
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ')

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--teal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  )
}

function ContributionScoreCard({ slug }: { slug: string }) {
  const { data, isLoading } = useContributionScore(slug)

  if (isLoading || !data) return null

  const trend = TREND_ARROWS[data.trend] || TREND_ARROWS.stable

  return (
    <div
      className="card"
      style={{
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.25rem',
        borderLeft: '3px solid var(--teal)',
      }}
    >
      {/* Score */}
      <div style={{ textAlign: 'center', minWidth: 60 }}>
        <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>
          {Math.round(data.total_score)}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, marginTop: 2 }}>
          contribution score
        </div>
      </div>

      {/* Trend arrow */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: '18px', color: trend.color, lineHeight: 1 }}>{trend.symbol}</span>
        <span style={{ fontSize: '10px', color: trend.color, textTransform: 'capitalize' }}>{data.trend}</span>
      </div>

      {/* Sparkline */}
      <div style={{ flex: 1 }}>
        <MiniSparkline data={data.sparkline} />
        <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75, marginTop: 2 }}>
          Last 14 days (decay-weighted)
        </div>
      </div>

      {/* Breakdown summary */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {Object.entries(data.breakdown)
          .filter(([, v]) => v.count > 0)
          .sort(([, a], [, b]) => b.decay_score - a.decay_score)
          .slice(0, 4)
          .map(([type, v]) => (
            <div key={type} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)' }}>{v.count}</div>
              <div style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>{type}s</div>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Member Milestones Section ──────────────────────────────

const MILESTONE_TYPE_LABELS: Record<string, string> = {
  committee_meeting: 'Committee Meeting',
  scholarly_project: 'Scholarly Project',
  irb_submission: 'IRB Submission',
  irb_renewal: 'IRB Renewal',
  program_eval: 'Program Evaluation',
  presentation: 'Presentation',
  publication: 'Publication',
  other: 'Other',
}

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  upcoming: 'var(--slate)',
  in_progress: 'var(--teal)',
  completed: 'var(--green)',
  overdue: 'var(--maroon)',
}

function MemberMilestones({ slug }: { slug: string }) {
  const { data: milestones = [], isLoading } = useMenteeMilestones({ mentee: slug })

  if (isLoading || milestones.length === 0) return null

  const enriched = milestones.map((m: MenteeMilestoneRow) => {
    const isOverdueCalc = m.status !== 'completed' && isOverdue(m.due_date)
    return { ...m, _isOverdue: isOverdueCalc || m.status === 'overdue' }
  })

  const open = enriched.filter((m) => m.status !== 'completed')
  const completed = enriched.filter((m) => m.status === 'completed')

  return (
    <>
      <SectionDivider />
      <div className="py-4" />
      <section className="mb-8" id="milestones">
        <div className="flex items-center gap-3 mb-4">
          <GraduationCap size={20} style={{ color: 'var(--teal)' }} aria-hidden="true" />
          <h2
            className="text-xl sm:text-2xl"
            style={{ fontWeight: 500, color: 'var(--ink)' }}
          >
            Milestones
          </h2>
          {open.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
              {open.length} upcoming
            </span>
          )}
          <Link
            to={PATHS.menteeMilestones}
            style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--teal)', textDecoration: 'none' }}
          >
            View all
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          {open.map((m) => (
            <MilestoneMiniCard key={m.id} milestone={m} isOverdue={m._isOverdue} />
          ))}
          {completed.slice(0, 3).map((m) => (
            <MilestoneMiniCard key={m.id} milestone={m} isOverdue={false} />
          ))}
        </div>
      </section>
    </>
  )
}

function MilestoneMiniCard({
  milestone,
  isOverdue,
}: {
  milestone: MenteeMilestoneRow
  isOverdue: boolean
}) {
  const isDone = milestone.status === 'completed'
  const borderColor = isDone ? 'var(--green)' : isOverdue ? 'var(--maroon)' : 'var(--teal)'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="card"
      style={{
        padding: '0.75rem 1rem',
        borderLeft: `3px solid ${borderColor}`,
        opacity: isDone ? 0.85 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 400,
              color: 'var(--ink)',
              textDecoration: isDone ? 'line-through' : 'none',
            }}
          >
            {milestone.title}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--gold)', opacity: 0.85 }}>
              {MILESTONE_TYPE_LABELS[milestone.milestone_type] || milestone.milestone_type}
            </span>
            {milestone.due_date && (
              <span
                style={{
                  fontSize: '10px',
                  color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                  fontWeight: isOverdue ? 500 : 400,
                  opacity: isOverdue ? 1 : 0.85,
                }}
              >
                {isOverdue ? 'Overdue' : formatShortDate(milestone.due_date)}
              </span>
            )}
          </div>
        </div>
        <span
          className="px-2 py-0.5 rounded-full"
          style={{
            fontSize: '10px',
            fontWeight: 500,
            color: MILESTONE_STATUS_COLORS[milestone.status] || 'var(--slate)',
            background: `color-mix(in srgb, ${MILESTONE_STATUS_COLORS[milestone.status] || 'var(--slate)'} 12%, transparent)`,
            flexShrink: 0,
          }}
        >
          {milestone.status === 'in_progress' ? 'In Progress' : milestone.status.charAt(0).toUpperCase() + milestone.status.slice(1)}
        </span>
      </div>
    </motion.div>
  )
}
