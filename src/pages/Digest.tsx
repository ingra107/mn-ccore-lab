import { useState, useMemo, useCallback } from 'react'
import {
  Newspaper,
  Bookmark,
  BookmarkCheck,
  X,
  ChevronDown,
  ChevronUp,
  Link2,
  Search,
  FolderPlus,
  Check,
  User,
  Copy,
  MessageCircle,
  Send,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { useDigest, useDigestDates, useProjects, useDigestComments, useDigestCommentCounts } from '../hooks/useApiData'
import type { DigestPaper, DigestComment } from '../hooks/useApiData'
import { useUpdateDigestStatus, useLinkPaper, useCreateDigestComment } from '../hooks/useMutations'
import { getPersonInfo } from '../data/team'
import { formatMediumDate } from '../lib/dateUtils'
import Avatar from '../components/Avatar'
import PageHeader from '../components/PageHeader'
import HeartbeatLine from '../components/HeartbeatLine'
import { ICON_PROPS } from '../lib/iconProps'

type StatusFilter = 'all' | 'new' | 'saved'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatPubDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return formatMediumDate(dateStr)
}

function truncateAuthors(authors: string | null): string {
  if (!authors) return ''
  const list = authors.split(',').map((a) => a.trim())
  if (list.length <= 3) return authors
  return `${list.slice(0, 3).join(', ')} et al.`
}

function parseTopics(topicsJson: string | null): string[] {
  if (!topicsJson) return []
  try {
    const parsed = JSON.parse(topicsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function relevanceColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 0.7) return { bg: 'rgba(34, 197, 94, 0.12)', text: 'var(--green)', label: 'High' }
  if (score >= 0.4) return { bg: 'var(--gold-emphasis)', text: 'var(--gold)', label: 'Medium' }
  return { bg: 'rgba(100, 116, 139, 0.1)', text: 'var(--slate)', label: 'Low' }
}

function relevanceColorDark(score: number): { bg: string; text: string } {
  if (score >= 0.7) return { bg: 'rgba(34, 197, 94, 0.15)', text: 'var(--green-light)' }
  if (score >= 0.4) return { bg: 'rgba(201, 168, 76, 0.2)', text: 'var(--gold)' }
  return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8' }
}

// ── Paper Card ───────────────────────────────────────────────

interface ProjectOption {
  slug: string
  title: string
}

function PaperCard({ paper, projects, commentCount }: { paper: DigestPaper; projects: ProjectOption[]; commentCount?: number }) {
  const [expanded, setExpanded] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const updateStatus = useUpdateDigestStatus()
  const linkPaper = useLinkPaper()
  const createComment = useCreateDigestComment()
  const { data: comments } = useDigestComments(showComments ? paper.id : null)
  const topics = parseTopics(paper.topics)
  const rel = relevanceColor(paper.relevance_score)
  const relDark = relevanceColorDark(paper.relevance_score)
  const isSaved = paper.status === 'saved'
  const isDismissed = paper.status === 'dismissed'

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      updateStatus.mutate({ id: paper.id, status: isSaved ? 'new' : 'saved' })
    },
    [paper.id, isSaved, updateStatus]
  )

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      updateStatus.mutate({ id: paper.id, status: isDismissed ? 'new' : 'dismissed' })
    },
    [paper.id, isDismissed, updateStatus]
  )

  const pubmedUrl = paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : null
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null

  return (
    <div
      className="card p-4 sm:p-5"
      style={{
        opacity: isDismissed ? 0.85 : 1,
        minHeight: '120px',
        transition: 'opacity var(--duration-normal) var(--ease-out), transform var(--duration-slow) cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow var(--duration-slow) var(--ease-out), background-color var(--duration-normal) var(--ease-out)',
      }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Relevance badge */}
        <div
          className="flex-shrink-0 rounded-md px-2 py-1 text-center"
          style={{
            minWidth: '52px',
            fontSize: 'var(--label-size)',
            fontWeight: 600,
          }}
        >
          <div
            className="rounded-md px-2 py-1"
            style={{ background: rel.bg, color: rel.text }}
          >
            <span className="dark:hidden">{Math.round(paper.relevance_score * 100)}%</span>
            <span className="hidden dark:inline" style={{ color: relDark.text }}>
              {Math.round(paper.relevance_score * 100)}%
            </span>
          </div>
          <div
            className="mt-0.5 text-center"
            style={{ fontSize: '10px', color: 'var(--slate)', letterSpacing: '0.05em' }}
          >
            {rel.label}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3
            className="text-sm sm:text-base leading-snug mb-1"
            style={{
              fontWeight: 400,
              color: 'var(--ink)',
            }}
          >
            {pubmedUrl ? (
              <a
                href={pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:!text-[var(--gold)]"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {paper.title}
              </a>
            ) : (
              paper.title
            )}
          </h3>

          {/* Authors */}
          {paper.authors && (
            <p
              className="text-xs sm:text-sm mb-1"
              style={{ color: 'var(--slate)' }}
            >
              {truncateAuthors(paper.authors)}
            </p>
          )}

          {/* Journal + date */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {paper.journal && (
              <span
                className="text-xs"
                style={{
                  color: 'var(--slate)',
                  opacity: 0.8,
                }}
              >
                {paper.journal}
              </span>
            )}
            {paper.pub_date && (
              <span
                className="text-xs"
                style={{
                  color: 'var(--slate)',
                  opacity: 0.75,
                }}
              >
                {formatPubDate(paper.pub_date)}
              </span>
            )}
            {doiUrl && (
              <a
                href={doiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--teal)' }}
                title="View via DOI"
              >
                <Link2 {...ICON_PROPS} size={11} />
                DOI
              </a>
            )}
          </div>

          {/* Relevance reason */}
          {paper.relevance_reason && (
            <p
              className="text-xs mb-2"
              style={{
                color: 'var(--teal)',
                fontStyle: 'italic',
              }}
            >
              {paper.relevance_reason}
            </p>
          )}

          {/* Topic tags */}
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="inline-block rounded-full px-2 py-0.5 text-xs"
                  style={{
                    fontSize: '10px',
                    background: 'var(--gold-active)',
                    color: 'var(--gold)',
                    border: '1px solid rgba(201, 168, 76, 0.2)',
                  }}
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Relevant members */}
          {paper.relevant_members && paper.relevant_members.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em',
                }}
              >
                Relevant for
              </span>
              <div className="flex -space-x-1">
                {paper.relevant_members.slice(0, 5).map((slug: string) => {
                  const p = getPersonInfo(slug)
                  return (
                    <div key={slug} title={p.name} style={{ width: 20, height: 20 }}>
                      <Avatar
                        name={p.name}
                        initials={p.initials}
                        photoUrl={p.photoUrl}
                        variant="ice"
                        size="xs"
                      />
                    </div>
                  )
                })}
                {paper.relevant_members.length > 5 && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-label)',
                      marginLeft: '4px',
                      alignSelf: 'center',
                    }}
                  >
                    +{paper.relevant_members.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Abstract (collapsible) */}
          {paper.abstract && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="cursor-pointer flex items-center gap-1 text-xs mb-1"
                style={{
                  color: 'var(--slate)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                {expanded ? <ChevronUp {...ICON_PROPS} size={12} /> : <ChevronDown {...ICON_PROPS} size={12} />}
                {expanded ? 'Hide abstract' : 'Show abstract'}
              </button>
              {expanded && (
                <p
                  className="text-xs sm:text-sm leading-relaxed mt-1 pl-3"
                  style={{
                    color: 'var(--slate)',
                    borderLeft: '2px solid rgba(201, 168, 76, 0.3)',
                  }}
                >
                  {paper.abstract}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={handleSave}
            className="cursor-pointer p-2 rounded-md transition-colors duration-200"
            style={{
              background: isSaved ? 'var(--gold-emphasis)' : 'transparent',
              color: isSaved ? 'var(--gold)' : 'var(--slate)',
              border: 'none',
              minWidth: '36px',
              minHeight: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isSaved ? 'Unsave' : 'Save paper'}
            aria-label={isSaved ? 'Unsave paper' : 'Save paper'}
          >
            {isSaved ? <BookmarkCheck {...ICON_PROPS} size={18} /> : <Bookmark {...ICON_PROPS} size={18} />}
          </button>
          <button
            onClick={handleDismiss}
            className="cursor-pointer p-2 rounded-md transition-colors duration-200"
            style={{
              background: isDismissed ? 'rgba(122, 0, 25, 0.1)' : 'transparent',
              color: isDismissed ? 'var(--maroon)' : 'var(--slate)',
              border: 'none',
              minWidth: '36px',
              minHeight: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={isDismissed ? 'Restore' : 'Dismiss paper'}
            aria-label={isDismissed ? 'Restore paper' : 'Dismiss paper'}
          >
            <X {...ICON_PROPS} size={18} />
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="cursor-pointer p-2 rounded-md transition-colors duration-200"
            style={{
              background: showComments ? 'var(--teal-hover)' : 'transparent',
              color: showComments ? 'var(--teal)' : 'var(--slate)',
              border: 'none',
              minWidth: '36px',
              minHeight: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
            title="Comments"
            aria-label={`${commentCount || 0} comments`}
          >
            <MessageCircle {...ICON_PROPS} size={18} />
            {(commentCount ?? 0) > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'var(--cream)',
                  background: 'var(--teal)',
                  borderRadius: '50%',
                  width: '14px',
                  height: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {commentCount}
              </span>
            )}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowLinkPicker(!showLinkPicker) }}
              className="cursor-pointer p-2 rounded-md transition-colors duration-200"
              style={{
                background: showLinkPicker ? 'var(--gold-emphasis)' : 'transparent',
                color: linkSuccess ? 'var(--teal)' : showLinkPicker ? 'var(--gold)' : 'var(--slate)',
                border: 'none',
                minWidth: '36px',
                minHeight: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Link to project"
              aria-label="Link paper to a project"
            >
              {linkSuccess ? <Check {...ICON_PROPS} size={18} /> : <FolderPlus {...ICON_PROPS} size={18} />}
            </button>
            {showLinkPicker && projects.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  background: 'var(--cream)',
                  border: '1px solid rgba(201, 168, 76, 0.2)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-menu)',
                  minWidth: '220px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  zIndex: 'var(--z-dropdown)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: 'var(--sp-sm) var(--sp-md) var(--sp-xs)',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--slate)',
                    opacity: 'var(--ink-label)',
                  }}
                >
                  Link to project
                </div>
                {projects.map((proj) => (
                  <button
                    key={proj.slug}
                    onClick={() => {
                      linkPaper.mutate({ paper_id: paper.id, project_slug: proj.slug })
                      setShowLinkPicker(false)
                      setLinkSuccess(proj.title)
                      setTimeout(() => setLinkSuccess(null), 2000)
                    }}
                    className="cursor-pointer w-full text-left px-3 py-2 text-sm transition-colors duration-150 hover:bg-[var(--gold-active)]"
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink)',
                      background: 'none',
                      border: 'none',
                      borderTop: '1px solid rgba(201, 168, 76, 0.06)',
                      display: 'block',
                    }}
                  >
                    {proj.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline comments section */}
      {showComments && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Comment list */}
          {comments && comments.length > 0 && (
            <div className="space-y-2 mb-3">
              {comments.map((c: DigestComment) => {
                const info = getPersonInfo(c.author_slug)
                return (
                  <div key={c.id} className="flex items-start gap-2">
                    <Avatar
                      name={info.name}
                      initials={info.initials}
                      photoUrl={info.photoUrl}
                      size="2xs"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-xs"
                          style={{ fontWeight: 500, color: 'var(--ink)' }}
                        >
                          {info.name}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--slate)', opacity: 0.75 }}
                        >
                          {formatMediumDate(c.created_at)}
                        </span>
                      </div>
                      <p
                        className="text-xs sm:text-sm"
                        style={{ color: 'var(--ink)', opacity: 0.85, lineHeight: 1.4 }}
                      >
                        {c.content}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Comment input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!commentText.trim()) return
              createComment.mutate(
                { paperId: paper.id, content: commentText.trim() },
                { onSuccess: () => setCommentText('') },
              )
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a note..."
              className="flex-1 text-xs sm:text-sm px-3 py-1.5 rounded-md"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--ink)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!commentText.trim() || createComment.isPending}
              className="cursor-pointer p-1.5 rounded-md transition-colors"
              style={{
                background: commentText.trim() ? 'var(--teal-solid)' : 'transparent',
                color: commentText.trim() ? 'var(--cream)' : 'var(--slate)',
                border: 'none',
                opacity: commentText.trim() ? 1 : 0.85,
              }}
              aria-label="Submit comment"
            >
              <Send {...ICON_PROPS} size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 sm:py-24">
      <div
        className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--gold-active)' }}
      >
        <Search size={28} style={{ color: 'var(--gold)', opacity: 0.85 }} />
      </div>
      <h2
        className="text-xl sm:text-2xl mb-3"
        style={{
          fontWeight: 500,
          color: 'var(--ink)',
        }}
      >
        No research digest yet
      </h2>
      <p
        className="text-sm sm:text-base max-w-md mx-auto"
        style={{ color: 'var(--slate)' }}
      >
        Papers will appear here when the daily PubMed scan runs. The digest
        searches for research relevant to MNCCORE topics including critical care,
        lung-protective ventilation, clinical decision-making, and CLIF data standards.
      </p>
    </div>
  )
}

// ── No Results State ─────────────────────────────────────────

function NoResults() {
  return (
    <div className="text-center py-12">
      <p
        className="text-lg mb-2"
        style={{ color: 'var(--ink)' }}
      >
        No papers match your filters.
      </p>
      <p className="text-sm" style={{ color: 'var(--slate)' }}>
        Try selecting a different date or adjusting your filters.
      </p>
    </div>
  )
}

// ── Main Digest Page ─────────────────────────────────────────

export default function Digest() {
  usePageMeta(
    'Research Digest | MN-CCORE Lab',
    'Daily PubMed papers relevant to MNCCORE research including critical care, lung-protective ventilation, clinical decision-making, and CLIF data standards.'
  )

  const { user } = useAuth()
  const userSlug = emailToSlug(user?.email)

  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [forYouFilter, setForYouFilter] = useState(false)
  // P2-04: collapse the topic chip cloud behind a toggle so default view
  // shows max 2 filter rows.
  const [topicsExpanded, setTopicsExpanded] = useState(false)

  // Fetch comment counts for badge display
  const { data: commentCounts = {} } = useDigestCommentCounts(selectedDate)

  // Fetch projects for the "Link to Project" picker
  const { data: allProjects = [] } = useProjects()
  const projectOptions = useMemo(() =>
    allProjects
      .filter((p) => p.slug)
      .map((p) => ({ slug: p.slug, title: p.title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    [allProjects]
  )

  // Fetch available dates
  const { data: dates = [] } = useDigestDates()

  // Auto-select most recent date when dates load
  const activeDate = selectedDate ?? (dates.length > 0 ? dates[0].date : undefined)

  // Fetch papers for the active date (with relevance matching)
  const { data: papers = [], isLoading } = useDigest({
    date: activeDate,
    status: statusFilter === 'all' ? undefined : statusFilter,
    topic: topicFilter ?? undefined,
    limit: 200,
    with_relevance: true,
  })

  // Gather all unique topics from ALL papers for this date (not just filtered)
  // Count papers by status for the active date
  const { data: allPapersForDate = [] } = useDigest({ date: activeDate, limit: 200, with_relevance: true })

  const allTopics = useMemo(() => {
    const topicSet = new Set<string>()
    allPapersForDate.forEach((p) => {
      parseTopics(p.topics).forEach((t) => topicSet.add(t))
    })
    return Array.from(topicSet).sort()
  }, [allPapersForDate])
  const statusCounts = useMemo(() => {
    const counts = { all: allPapersForDate.length, new: 0, saved: 0 }
    allPapersForDate.forEach((p) => {
      if (p.status === 'new') counts.new++
      if (p.status === 'saved') counts.saved++
    })
    return counts
  }, [allPapersForDate])

  // "For You" count (across all papers for this date)
  const forYouCount = useMemo(() => {
    if (!userSlug) return 0
    return allPapersForDate.filter((p) => p.relevant_members?.includes(userSlug)).length
  }, [allPapersForDate, userSlug])

  // Text search + "For You" filter within papers
  const filteredPapers = useMemo(() => {
    let result = papers
    if (forYouFilter && userSlug) {
      result = result.filter((p) => p.relevant_members?.includes(userSlug))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.authors || '').toLowerCase().includes(q) ||
        (p.journal || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [papers, searchQuery, forYouFilter, userSlug])

  const isEmpty = dates.length === 0 && !isLoading

  // Reading progress bar — rendered as PageHeader child
  const progressBar = statusCounts.all > 0 ? (
    <div className="flex items-center gap-3">
      <div className="flex-1 max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-subtle)' }}>
        <div
          style={{
            width: `${((statusCounts.saved + (statusCounts.all - statusCounts.new - statusCounts.saved)) / statusCounts.all) * 100}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: 'var(--gold)',
            transition: 'width var(--duration-slow) var(--ease-out)',
          }}
        />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
        {statusCounts.saved} saved · {statusCounts.new} unread · {statusCounts.all} total
      </span>
    </div>
  ) : null

  return (
    <>
      {/* Header — compact PageHeader replaces oversized hero (H-02, H-03) */}
      <section className="content-container">
        <PageHeader
          icon={<Newspaper {...ICON_PROPS} size={20} />}
          title="Research Digest"
          subtitle="Daily PubMed papers relevant to MNCCORE research"
          count={statusCounts.all || undefined}
        >
          {progressBar}
        </PageHeader>
      </section>

      {isEmpty ? (
        <section className="content-container pb-16">
          <EmptyState />
        </section>
      ) : (
        <section className="content-container pb-12">
          {/* Date selector */}
          {dates.length > 0 && (
            <div className="mb-6">
              <div
                className="flex items-center gap-2 mb-3"
                style={{
                  fontSize: 'var(--label-size)',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em',
                  color: 'var(--slate)',
                }}
              >
                <span>Digest Date</span>
                <span className="flex-1 h-px" style={{ background: 'rgba(201, 168, 76, 0.2)' }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {dates.slice(0, 14).map((d) => {
                  const isActive = d.date === activeDate
                  return (
                    <button
                      key={d.date}
                      onClick={() => {
                        setSelectedDate(d.date)
                        setTopicFilter(null)
                      }}
                      className="cursor-pointer rounded-full px-3 py-1.5 text-sm"
                      style={{
                        fontWeight: isActive ? 600 : 400,
                        background: isActive ? 'var(--gold)' : 'var(--gold-active)',
                        color: isActive ? 'var(--cream)' : 'var(--ink)',
                        border: isActive
                          ? '1px solid var(--gold)'
                          : '1px solid rgba(201, 168, 76, 0.2)',
                        transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out)',
                      }}
                    >
                      {formatDate(d.date)}
                      <span
                        className="ml-1.5"
                        style={{
                          fontSize: '10px',
                          opacity: 0.85,
                        }}
                      >
                        ({d.count})
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Search within papers */}
          <div className="mb-4 relative">
            <Search {...ICON_PROPS} size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)', opacity: 0.75 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, author, or journal..."
              className="w-full max-w-md rounded-full border px-3 py-2 pl-9 text-xs outline-none"
              style={{ color: 'var(--ink)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream, white)' }}
            />
          </div>

          {/* Status filter tabs — minHeight prevents reflow as counts load */}
          <div className="flex flex-wrap items-center gap-4 mb-4" style={{ minHeight: '40px' }}>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--gold-hover)' }}>
              {(
                [
                  { key: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
                  { key: 'new' as StatusFilter, label: 'New', count: statusCounts.new },
                  { key: 'saved' as StatusFilter, label: 'Saved', count: statusCounts.saved },
                ] as const
              ).map((tab) => {
                const isActive = statusFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className="cursor-pointer rounded-md px-3 py-1.5 text-sm"
                    style={{
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'var(--cream)' : 'transparent',
                      color: isActive ? 'var(--ink)' : 'var(--slate)',
                      border: 'none',
                      boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                      transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out)',
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        className="ml-1"
                        style={{
                          fontSize: '10px',
                          opacity: 0.85,
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* "For You" filter */}
            {userSlug && forYouCount > 0 && (
              <button
                onClick={() => setForYouFilter(!forYouFilter)}
                className="cursor-pointer rounded-full px-3 py-1.5 text-sm flex items-center gap-1.5"
                style={{
                  // N1b de-box: filter toggle = teal TINT when active, never a
                  // solid --teal-solid fill (those are reserved for action buttons).
                  // Converges on the TableControls/ViewPicker pill anatomy.
                  fontWeight: forYouFilter ? 600 : 400,
                  background: forYouFilter ? 'var(--teal-active)' : 'transparent',
                  color: 'var(--teal)',
                  border: forYouFilter
                    ? '1px solid var(--teal)'
                    : '1px solid var(--border-subtle)',
                  transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out)',
                }}
              >
                <User {...ICON_PROPS} size={12} />
                For You
                <span
                  style={{
                    fontSize: '10px',
                    opacity: 0.85,
                  }}
                >
                  ({forYouCount})
                </span>
              </button>
            )}

            {/* Paper count */}
            <span
              className="text-xs"
              style={{
                color: 'var(--slate)',
                opacity: 0.85,
              }}
            >
              {filteredPapers.length} paper{filteredPapers.length !== 1 ? 's' : ''}
            </span>

            {/* Copy reading list */}
            {statusCounts.saved > 0 && (
              <button
                onClick={() => {
                  const saved = allPapersForDate.filter(p => p.status === 'saved')
                  const bib = saved.map(p => {
                    const authors = truncateAuthors(p.authors)
                    const year = p.pub_date ? new Date(p.pub_date).getFullYear() : ''
                    return `${authors}. ${p.title}. ${p.journal || ''}${year ? ` (${year})` : ''}${p.doi ? `. doi:${p.doi}` : ''}`
                  }).join('\n\n')
                  navigator.clipboard.writeText(bib)
                }}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors"
                style={{ color: 'var(--slate)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer', opacity: 0.85 }}
                title="Copy saved papers as bibliography"
              >
                <Copy {...ICON_PROPS} size={10} />
                Copy reading list
              </button>
            )}
          </div>

          {/* Topic filter pills — collapsed behind a Topics toggle (P2-04).
              Saves a 3rd filter row by default; click to expand the chip
              cloud. Active topic count shows on the toggle so users know a
              filter is on even when collapsed. */}
          {allTopics.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setTopicsExpanded((v) => !v)}
                className="cursor-pointer rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5 mb-2"
                style={{
                  fontSize: '11px',
                  background: topicFilter ? 'var(--gold-hover)' : 'transparent',
                  color: topicFilter ? 'var(--gold)' : 'var(--slate)',
                  border: `1px solid ${topicFilter ? 'var(--gold)' : 'var(--border-subtle)'}`,
                  fontWeight: topicFilter ? 500 : 400,
                }}
                aria-expanded={topicsExpanded}
              >
                Topics
                {topicFilter && (
                  <span style={{ fontSize: '10px', background: 'var(--gold)', color: 'var(--cream)', padding: '0 5px', borderRadius: 'var(--radius-full)' }}>
                    1
                  </span>
                )}
                <span style={{ opacity: 0.6 }}>{topicsExpanded ? '▾' : '▸'}</span>
              </button>
              {topicsExpanded && (
              <div className="flex flex-wrap gap-1.5">
              {topicFilter && (
                <button
                  onClick={() => setTopicFilter(null)}
                  className="cursor-pointer rounded-full px-2.5 py-1 text-xs"
                  style={{
                    fontSize: '10px',
                    background: 'var(--maroon-hover)',
                    color: 'var(--maroon)',
                    border: '1px solid rgba(122, 0, 25, 0.2)',
                    transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out)',
                  }}
                >
                  Clear filter
                </button>
              )}
              {allTopics.map((topic) => {
                const isActive = topicFilter === topic
                return (
                  <button
                    key={topic}
                    onClick={() => setTopicFilter(isActive ? null : topic)}
                    className="cursor-pointer rounded-full px-2.5 py-1 text-xs"
                    style={{
                      fontSize: '10px',
                      background: isActive
                        ? 'var(--gold)'
                        : 'var(--gold-active)',
                      color: isActive ? 'var(--cream)' : 'var(--gold)',
                      border: isActive
                        ? '1px solid var(--gold)'
                        : '1px solid var(--gold-emphasis)',
                      transition: 'background-color var(--duration-normal) var(--ease-out), color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out)',
                    }}
                  >
                    {topic}
                  </button>
                )
              })}
              </div>
              )}
            </div>
          )}

          {/* Paper list — outer wrapper reserves stable height to prevent CLS during load */}
          <div style={{ minHeight: '600px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading digest">
              <HeartbeatLine width={200} height={52} color="var(--gold)" ariaLabel="Loading digest" />
            </div>
          ) : filteredPapers.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-12">
                <Search size={32} style={{ color: 'var(--slate)', opacity: 0.75, margin: '0 auto var(--sp-sm)' }} />
                <p className="text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  No papers matching "{searchQuery}"
                </p>
              </div>
            ) : statusFilter !== 'all' || topicFilter || forYouFilter ? (
              <NoResults />
            ) : (
              <EmptyState />
            )
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {searchQuery && (
                <p className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  {filteredPapers.length} of {papers.length} papers matching "{searchQuery}"
                </p>
              )}
              {filteredPapers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} projects={projectOptions} commentCount={commentCounts[paper.id] || 0} />
              ))}
            </div>
          )}
          </div>
        </section>
      )}
    </>
  )
}
