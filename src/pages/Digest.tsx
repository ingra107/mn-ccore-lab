import { useState, useMemo, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  Link2,
  Search,
  Copy,
  Send,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { useDigest, useDigestSaved, useDigestUnprocessed, useDigestUnprocessedCount, useDigestDates, useProjects, useDigestComments } from '../hooks/useApiData'
import type { DigestPaper, DigestComment, DigestStatus } from '../hooks/useApiData'
import { useUpdateDigestStatus, useLinkPaper, useCreateDigestComment, useMakeTaskFromNote } from '../hooks/useMutations'
import { useSwipeAction } from '../hooks/useSwipeAction'
import { useUndoToast } from '../components/UndoToast'
import { Button } from '../components/ui/Button'
import { getPersonInfo } from '../data/team'
import { firstNameFor } from '../lib/personLabel'
import { formatMediumDate, formatPublicationDate, formatRelativeTime, formatShortDate } from '../lib/dateUtils'
import { withAlpha } from '../lib/taskGrouping'
import { FaceDisc } from '../components/today/skin'
import FilterLinks from '../components/ui/FilterLinks'
import GhostSelect, { type GhostSelectOption } from '../components/ui/GhostSelect'
import { projectShortLabel } from '../lib/displayNames'
import PageHeader from '../components/PageHeader'
import HeartbeatLine from '../components/HeartbeatLine'
import { ICON_PROPS } from '../lib/iconProps'
import { QueryErrorNote } from '../components/QueryErrorNote'
import { tealRamp, BAR_TRACK } from '../lib/tealRamp'
import SectionHead from '../components/ui/SectionHead'
import BodyText from '../components/BodyText'

// All = one digest date; Unprocessed and Saved each span every date.
type StatusFilter = 'all' | 'unprocessed' | 'saved'

// The newest digest dates shown as links; every older date is in the picker.
const RECENT_DATES = 14

// #136, Nick: "when i click something it should get 'filed' so i can walk
// through the studies and don't need to click down ... at the very least, I
// need to get the sense that I've processed it."
//
// A processed paper sinks. Unread float to the top of the list in the
// server's relevance order, saved sit under them, dismissed go to the bottom
// -- so the next thing to read is always the next thing on screen, and the X
// visibly does something. Nothing is removed: every paper stays reachable,
// and clicking the same button again restores it.
const PROCESS_RANK: Record<string, number> = { new: 0, saved: 1, dismissed: 2 }

function processRank(status: string): number {
  return PROCESS_RANK[status] ?? 0
}

// #147, Nick: "once I had gone through everything, even though it said
// dismissed, it wasn't readily clear ... So I just kept clicking and I was
// actually undoing and redoing something."
//
// A saved or dismissed paper shrinks to one line, and the control that undoes
// it is a differently worded button (Restore / Unsave) in a different slot
// than Save / Dismiss. A click on it within this window of the paper being
// processed is ignored, so a click-through that lands on the card it just
// processed cannot undo it. Undo stays one deliberate click away, and the toast.
const REPEAT_GUARD_MS = 900

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

// ── Paper Card ───────────────────────────────────────────────

// Text actions share one slot and one hit size (principle 14).
const ACTION_CLASS = 'cursor-pointer px-2 py-2 rounded-md hover:underline'

/**
 * "Make task" on a note (Nick 2026-10-13): the note becomes a Hub task
 * assigned to whoever taps it, with the paper as its link. Once made, the
 * slot shows the task instead (a link when the viewer can open it).
 */
function NoteTaskAction({ noteId, paperId, taskId, taskVisible }: { noteId: string; paperId: string; taskId: string | null; taskVisible: boolean }) {
  const makeTask = useMakeTaskFromNote()
  const { showSuccess, showError } = useUndoToast()
  if (taskId) {
    return taskVisible ? (
      <Link
        to={`/portal/my-tasks?open=${taskId}`}
        className="text-xs hover:underline flex-shrink-0"
        style={{ color: 'var(--job-accent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        Task
      </Link>
    ) : (
      <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>Task made</span>
    )
  }
  return (
    <button
      type="button"
      className="cursor-pointer text-xs hover:underline flex-shrink-0"
      style={{ color: 'var(--slate)', background: 'none', border: 'none', padding: 0 }}
      disabled={makeTask.isPending}
      onClick={(e) => {
        e.stopPropagation()
        makeTask.mutate(
          { noteId, paperId },
          {
            onSuccess: (res) => showSuccess(res.data.created ? 'Added to your tasks' : 'Already a task'),
            onError: (err) => showError(err instanceof Error ? err.message : 'Could not make the task'),
          },
        )
      }}
    >
      Make task
    </button>
  )
}

function PaperCard({ paper, projects, compactWhenProcessed }: { paper: DigestPaper; projects: GhostSelectOption[]; compactWhenProcessed: boolean }) {
  const [expanded, setExpanded] = useState(false)
  // A processed paper is one line until the reader opens it (Show).
  const [reopened, setReopened] = useState(false)
  const [linkSuccess, setLinkSuccess] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const updateStatus = useUpdateDigestStatus()
  const linkPaper = useLinkPaper()
  const createComment = useCreateDigestComment()
  const { showUndo } = useUndoToast()
  const { data: comments } = useDigestComments(showComments ? paper.id : null)
  const topics = parseTopics(paper.topics)
  const isSaved = paper.status === 'saved'
  const isDismissed = paper.status === 'dismissed'
  const noteCount = paper.note_count ?? 0
  const latest = paper.latest_note ?? null

  const isProcessed = paper.status !== 'new'
  const compact = compactWhenProcessed && isProcessed && !reopened

  // When THIS card last processed the paper (a click, a swipe). Null otherwise:
  // a paper that arrives already processed, or is first shown, is not guarded, so
  // a real Restore or Unsave right after load works.
  const processedAt = useRef<number | null>(null)
  useEffect(() => {
    if (paper.status === 'new') processedAt.current = null
  }, [paper.status])
  const justProcessed = () => processedAt.current !== null && Date.now() - processedAt.current < REPEAT_GUARD_MS

  // Phone swipe (Nick 2026-10-13): right saves, left dismisses, each with an
  // Undo. A swipe SETS the status rather than toggling it, so a stray swipe on
  // a paper already saved does not unsave it. The hook drags only for a touch
  // or pen pointer below 768px; a desktop mouse never swipes.
  //
  // Undo waits for the swipe's own write to settle. Two POSTs in flight are
  // not ordered on the server, so a fast Undo could land first and leave the
  // paper saved; and the first write's rollback would restore a snapshot from
  // before the Undo. Settled first, the Undo is the last word either way.
  const swipeTo = (next: DigestStatus, label: string) => {
    const prev = paper.status
    if (prev === next) return
    processedAt.current = Date.now()
    // `settled` only orders the Undo after this write. A failure is not lost
    // here: the failed-write floor (lib/writeFailures) withdraws the Undo
    // toast and shows the error.
    const settled = updateStatus.mutateAsync({ id: paper.id, status: next }).then(() => undefined, () => undefined)
    showUndo(label, () => {
      void settled.then(() => updateStatus.mutate({ id: paper.id, status: prev }))
    })
  }
  const swipe = useSwipeAction({
    onSwipeRight: () => swipeTo('saved', 'Saved'),
    onSwipeLeft: () => swipeTo('dismissed', 'Dismissed'),
  })
  // Save / Dismiss SET the status (with an Undo toast) when the paper is new.
  // The reverse (Unsave, Restore) is its own deliberate click and is ignored
  // right after the paper was processed.
  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isSaved) return swipeTo('saved', 'Saved')
    if (justProcessed()) return
    updateStatus.mutate({ id: paper.id, status: 'new' })
  }
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDismissed) return swipeTo('dismissed', 'Dismissed')
    if (justProcessed()) return
    updateStatus.mutate({ id: paper.id, status: 'new' })
  }
  const handleUndoProcessed = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (justProcessed()) return
    setReopened(false)
    updateStatus.mutate({ id: paper.id, status: 'new' })
  }

  // No drag while typing a note. The project picker stops its own pointer
  // events, so it cannot start a drag.
  const swipeProps = showComments ? null : swipe.motionProps

  const submitNote = () => {
    if (!commentText.trim()) return
    createComment.mutate(
      { paperId: paper.id, content: commentText.trim() },
      { onSuccess: () => setCommentText('') },
    )
  }

  const pubmedUrl = paper.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/` : null
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : null

  const revealLayer: React.CSSProperties = {
    position: 'absolute', inset: 0,
    borderRadius: 'var(--radius-xl)',
    color: 'var(--sk-t2)',
    display: 'flex', alignItems: 'center',
    padding: '0 var(--sp-lg)',
    fontSize: '12px', fontWeight: 600,
    pointerEvents: 'none',
  }

  if (compact) {
    return (
      <div
        className="card px-4 py-2 flex items-center gap-3"
        data-testid={`digest-paper-${paper.id}`}
        data-processed={paper.status}
      >
        <span
          className="text-xs flex-shrink-0"
          style={{ fontWeight: 600, color: isSaved ? 'var(--job-accent)' : 'var(--muted)', minWidth: '4.5rem' }}
        >
          {isSaved ? 'Saved' : 'Dismissed'}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--slate)' }}>
          {paper.title}
        </span>
        <button
          type="button"
          onClick={() => setReopened(true)}
          className="cursor-pointer text-xs hover:underline flex-shrink-0"
          style={{ color: 'var(--slate)', background: 'none', border: 'none', padding: 0 }}
          aria-label={`Show ${paper.title}`}
        >
          Show
        </button>
        <button
          type="button"
          onClick={handleUndoProcessed}
          className="cursor-pointer text-xs hover:underline flex-shrink-0"
          style={{ color: 'var(--ink)', fontWeight: 500, background: 'none', border: 'none', padding: '4px 0 4px 12px' }}
          aria-label={isSaved ? 'Unsave this paper' : 'Restore this dismissed paper'}
        >
          {isSaved ? 'Unsave' : 'Restore'}
        </button>
      </div>
    )
  }

  return (
    // overflow-x clip keeps a dragged card from widening the page, and leaves
    // the "To project" menu free to open above the card.
    <div style={{ position: 'relative', overflowX: 'clip' }}>
      {/* Swipe reveal layers (phones only; they stay at opacity 0 when the
          card cannot drag). Save is the accent, Dismiss is gray. */}
      <motion.div
        aria-hidden
        style={{ ...revealLayer, justifyContent: 'flex-start', background: 'color-mix(in srgb, var(--job-accent) 12%, transparent)', opacity: swipe.leftActionOpacity }}
      >
        Save
      </motion.div>
      <motion.div
        aria-hidden
        style={{ ...revealLayer, justifyContent: 'flex-end', background: withAlpha('var(--sk-t1)', 8), opacity: swipe.rightActionOpacity }}
      >
        Dismiss
      </motion.div>
    <motion.div
      className="card p-4 sm:p-5"
      data-testid={`digest-paper-${paper.id}`}
      {...(swipeProps ?? {})}
      style={{
        position: 'relative',
        // Option A (wave 3): same anatomy as the other cards. The Save /
        // Dismiss buttons carry the filed state; there is no status chip.
        transition: 'box-shadow var(--duration-slow) var(--ease-out), background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out)',
        ...(swipeProps?.style ?? {}),
      }}
    >
      <div>
        {/* Main content */}
        <div className="min-w-0">
          {/* Title */}
          <h3
            className="text-sm sm:text-base leading-snug mb-1"
            style={{
              fontWeight: 500,
              // A dismissed paper reads quieter; color, never opacity.
              color: isDismissed ? 'var(--slate)' : 'var(--ink)',
            }}
          >
            {pubmedUrl ? (
              <a
                href={pubmedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:!text-[var(--job-accent)]"
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
                {formatPublicationDate(paper.pub_date)}
              </span>
            )}
            {doiUrl && (
              <a
                href={doiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--job-accent)' }}
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
              style={{ color: 'var(--slate)' }}
            >
              {paper.relevance_reason}
            </p>
          )}

          {/* Topic tags */}
          {topics.length > 0 && (
            <div className="tk flex flex-wrap gap-1.5 mb-2">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="tk-tag tk-n"
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
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                }}
              >
                Relevant for
              </span>
              <div className="flex -space-x-1">
                {paper.relevant_members.slice(0, 5).map((slug: string) => {
                  const p = getPersonInfo(slug)
                  return (
                    <div key={slug} title={p.name} style={{ width: 20, height: 20 }}>
                      <FaceDisc label={p.name} initials={p.initials} photo={p.photoUrl} px={20} />
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

          {/* Summary — the LLM TLDR. Always visible; the abstract is the
              progressive disclosure under it (#136). */}
          {paper.summary && (
            <p
              className="text-xs sm:text-sm leading-relaxed mb-2"
              style={{ color: 'var(--ink)' }}
            >
              {paper.summary}
            </p>
          )}

          {/* Why this matters */}
          {paper.significance && (
            <p
              className="text-xs leading-relaxed mb-2 pl-3"
              style={{
                color: 'var(--slate)',
                borderLeft: '2px solid var(--border-subtle)',
              }}
            >
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Why this matters — </span>
              {paper.significance}
            </p>
          )}

          {/* Abstract: two clamped lines, full text on demand (progressive
              disclosure). Shown only when the PubMed record stored one. */}
          {paper.abstract && (
            <div>
              <p
                className={`text-xs leading-relaxed mt-1 ${expanded ? '' : 'line-clamp-2'}`}
                style={{ color: 'var(--slate)', maxWidth: '70ch' }}
              >
                {paper.abstract}
              </p>
              <button
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="hit-area cursor-pointer flex items-center gap-1 text-xs"
                // 24px tall on every pointer (WCAG 2.5.8); .hit-area takes it to 44px on touch.
                style={{ color: 'var(--slate)', background: 'none', border: 'none', padding: '4px 0', minHeight: 24 }}
              >
                {expanded ? <ChevronUp {...ICON_PROPS} size={12} /> : <ChevronDown {...ICON_PROPS} size={12} />}
                {expanded ? 'Hide abstract' : 'Show abstract'}
              </button>
            </div>
          )}
        </div>

        {/* The newest note (Nick 2026-10-13): badge, first name, the note,
            muted time. Tapping it opens the thread, where it is listed. */}
        {latest && !showComments && (
          <div className="flex items-start gap-2 mt-3" data-testid="digest-latest-note">
            <FaceDisc label={getPersonInfo(latest.author_slug).name} initials={getPersonInfo(latest.author_slug).initials} photo={getPersonInfo(latest.author_slug).photoUrl} px={16} />
            <button
              type="button"
              onClick={() => setShowComments(true)}
              className="cursor-pointer flex-1 min-w-0 text-left text-xs line-clamp-2"
              style={{ background: 'none', border: 'none', padding: 0, lineHeight: 1.4 }}
              aria-label={`Open ${noteCount} note${noteCount === 1 ? '' : 's'}`}
            >
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{firstNameFor(latest.author_slug)}</span>{' '}
              {/* eslint-disable-next-line body/body-text -- preview inside a <button>; a nested anchor is invalid, the full note opens on click */}
              <span style={{ color: 'var(--ink)' }}>{latest.content}</span>
              <span style={{ color: 'var(--muted)' }}> · {formatRelativeTime(latest.created_at)}</span>
            </button>
            <NoteTaskAction noteId={latest.id} paperId={paper.id} taskId={latest.task_id} taskVisible={latest.task_visible} />
          </div>
        )}

        {/* Footer: actions in the fixed bottom-right slot */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 mt-3">
          <div className="flex flex-wrap items-center gap-x-1 text-xs">
            <button
              onClick={handleDismiss}
              className={ACTION_CLASS}
              style={{ color: 'var(--slate)' }}
              aria-label={isDismissed ? 'Restore paper' : 'Dismiss paper'}
            >
              {isDismissed ? 'Restore' : 'Dismiss'}
            </button>
            <button
              onClick={() => setShowComments(!showComments)}
              className={ACTION_CLASS}
              style={{ color: showComments ? 'var(--job-accent)' : 'var(--slate)' }}
              aria-label={`${noteCount} note${noteCount === 1 ? '' : 's'}`}
              aria-expanded={showComments}
            >
              Note{noteCount > 0 ? ` ${noteCount}` : ''}
            </button>
            {projects.length > 0 && (
              // GhostSelect brings the filter, Escape, outside-tap close and a
              // portal menu that is not clipped by the card. Its events still
              // bubble through the React tree, so stop them here: a tap in the
              // menu must not toggle the card, a drag must not start a swipe.
              <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <GhostSelect
                  aria-label="Link paper to a project"
                  value=""
                  triggerLabel={linkSuccess ? 'Linked' : 'To project'}
                  triggerColor={linkSuccess ? 'var(--job-accent)' : 'var(--slate)'}
                  triggerStyle={{ padding: 'var(--sp-sm)', fontSize: 'inherit' }}
                  searchable
                  options={projects}
                  onChange={(slug) => {
                    // "Linked" only once the Hub has the link; a refusal is
                    // toasted by the failed-write floor (lib/writeFailures).
                    linkPaper.mutate({ paper_id: paper.id, project_slug: slug }, {
                      onSuccess: () => {
                        setLinkSuccess(true)
                        setTimeout(() => setLinkSuccess(false), 2000)
                      },
                    })
                  }}
                />
              </div>
            )}
            <button
              onClick={handleSave}
              className={ACTION_CLASS}
              style={{ color: isSaved ? 'var(--job-accent)' : 'var(--ink)', fontWeight: 500 }}
              aria-label={isSaved ? 'Unsave paper' : 'Save paper'}
              aria-pressed={isSaved}
            >
              {isSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Notes thread */}
      {showComments && (
        <div
          className="mt-3 pt-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Note list */}
          {comments && comments.length > 0 && (
            <div className="space-y-2 mb-3">
              {comments.map((c: DigestComment) => {
                const info = getPersonInfo(c.author_slug)
                return (
                  <div key={c.id} className="flex items-start gap-2">
                    <FaceDisc label={info.name} initials={info.initials} photo={info.photoUrl} px={16} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-xs"
                          style={{ fontWeight: 500, color: 'var(--ink)' }}
                        >
                          {firstNameFor(c.author_slug)}
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: 'var(--muted)' }}
                          title={formatMediumDate(c.created_at)}
                        >
                          {formatRelativeTime(c.created_at)}
                        </span>
                      </div>
                      <p
                        className="text-xs sm:text-sm"
                        style={{ color: 'var(--ink)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}
                      >
                        <BodyText text={c.content} />
                      </p>
                    </div>
                    <NoteTaskAction noteId={c.id} paperId={paper.id} taskId={c.task_id} taskVisible={c.task_visible === 1} />
                  </div>
                )
              })}
            </div>
          )}

          {/* Note input: a real field edge, the send button inside its row
              (principle 20). Ctrl/Cmd+Enter sends; Enter is a new line. */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submitNote()
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submitNote()
                }
              }}
              rows={Math.min(6, Math.max(2, commentText.split('\n').length))}
              aria-label="Add a note"
              placeholder="Add a note, e.g. get the full text to see if the pooled analysis had data"
              className="flex-1 text-xs sm:text-sm px-3 py-1.5 rounded-md"
              style={{
                background: 'var(--cream)',
                border: '1px solid var(--field-edge)',
                color: 'var(--ink)',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.4,
              }}
            />
            <Button
              variant="primary"
              size="icon"
              type="submit"
              disabled={!commentText.trim() || createComment.isPending}
              aria-label="Save note"
              style={{
                padding: '6px',
                borderRadius: 'var(--radius-md)',
                background: commentText.trim() ? 'var(--job-accent)' : 'transparent',
                color: commentText.trim() ? 'var(--sk-card)' : 'var(--slate)',
                cursor: 'pointer',
                opacity: commentText.trim() ? 1 : 0.85,
              }}
            >
              <Send {...ICON_PROPS} size={14} />
            </Button>
          </form>
        </div>
      )}
    </motion.div>
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 sm:py-24">
      <div
        className="mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--ice)' }}
      >
        <Search size={28} style={{ color: 'var(--slate)', opacity: 0.85 }} />
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

function NoResults({ saved }: { saved?: boolean }) {
  return (
    <div className="text-center py-12">
      <p
        className="text-lg mb-2"
        style={{ color: 'var(--ink)' }}
      >
        {saved ? 'Nothing saved yet.' : 'No papers match your filters.'}
      </p>
      <p className="text-sm" style={{ color: 'var(--slate)' }}>
        {saved ? 'Save a paper (or swipe it right on a phone) and it stays here.' : 'Try selecting a different date or adjusting your filters.'}
      </p>
    </div>
  )
}

// ── All done ─────────────────────────────────────────────────

/**
 * #147: every paper in the view is processed. Says so in words, then points at
 * what is left elsewhere. Sits ABOVE the list: the click-through that got here
 * lands on this banner, not on the first processed row.
 */
function AllDone({ headline, detail, action }: { headline: string; detail: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="card px-5 py-4 text-center mb-3 sm:mb-4" role="status" data-testid="digest-all-done">
      <p className="text-base" style={{ color: 'var(--ink)', fontWeight: 600 }}>{headline}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{detail}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="cursor-pointer text-sm mt-2 hover:underline"
          style={{ color: 'var(--job-accent)', background: 'none', border: 'none', padding: 0, fontWeight: 500 }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── Main Digest Page ─────────────────────────────────────────

export default function Digest() {
  usePageMeta(
    'Research Digest · MN-CCORE',
    'Daily PubMed papers relevant to MNCCORE research including critical care, lung-protective ventilation, clinical decision-making, and CLIF data standards.'
  )

  const { user } = useAuth()
  const userSlug = user?.slug ?? ''

  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [topicFilter, setTopicFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [forYouFilter, setForYouFilter] = useState(false)
  // P2-04: collapse the topic chip cloud behind a toggle so default view
  // shows max 2 filter rows.
  const [topicsExpanded, setTopicsExpanded] = useState(false)

  // Saved is one list across every digest date (Nick 2026-10-13): a save from
  // an older digest used to sit behind a date the selector no longer showed.
  const isSavedView = statusFilter === 'saved'
  // Unprocessed is the same idea (#147): every paper not yet saved or
  // dismissed, from every digest date, not one day at a time.
  const isUnprocessedView = statusFilter === 'unprocessed'
  const isCrossDate = isSavedView || isUnprocessedView

  // Fetch projects for the "Link to Project" picker
  const { data: allProjects = [] } = useProjects()
  const projectOptions = useMemo(() =>
    allProjects
      .filter((p) => p.slug)
      // Short names (design principle 8): a full title filled the whole
      // picker on a phone, two projects to a screen.
      .map((p): GhostSelectOption => ({ value: p.slug, label: projectShortLabel(p) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [allProjects]
  )

  // Fetch available dates
  const { data: dates = [], isError: datesError, refetch: refetchDates } = useDigestDates()

  // Auto-select most recent date when dates load
  const activeDate = selectedDate ?? (dates.length > 0 ? dates[0].date : undefined)

  // Papers for the active date (with relevance matching)
  const dateQuery = useDigest({
    date: activeDate,
    topic: topicFilter ?? undefined,
    limit: 200,
    with_relevance: true,
  }, { enabled: !isCrossDate && !!activeDate })

  // Every paper this person saved, newest save first, across all dates. It
  // also feeds the Saved count and Copy reading list.
  // useDigestSaved pages past the server's 300-row cap, so nothing truncates.
  const savedQuery = useDigestSaved()
  const savedAll = useMemo(() => savedQuery.data ?? [], [savedQuery.data])

  // Everything not yet processed, across dates, a page at a time. Only the
  // Unprocessed tab loads the pages; the tab's count is its own cheap query.
  const unprocessedQuery = useDigestUnprocessed(isUnprocessedView)
  const unprocessedCountQuery = useDigestUnprocessedCount()
  const unprocessedCount = unprocessedCountQuery.data
  // The banner's "N more" counts OTHER digests only, asked of the server with this
  // date excluded: this date's own papers (even ones a topic or search filter hides)
  // never count, and processing one here cannot leave the number stale.
  const unprocessedElsewhereQuery = useDigestUnprocessedCount(activeDate)
  // A paper processed here leaves the list at once (the server list catches up
  // on the refetch), so the next one to do is always on top.
  const unprocessedAll = useMemo(
    () => (unprocessedQuery.data?.pages.flat() ?? []).filter((p) => p.status === 'new'),
    [unprocessedQuery.data],
  )
  const crossAll = isSavedView ? savedAll : unprocessedAll

  const papers = useMemo(() => {
    if (!isCrossDate) return dateQuery.data ?? []
    return topicFilter ? crossAll.filter((p) => parseTopics(p.topics).includes(topicFilter)) : crossAll
  }, [isCrossDate, dateQuery.data, crossAll, topicFilter])
  const activeQuery = isSavedView ? savedQuery : isUnprocessedView ? unprocessedQuery : dateQuery
  const isLoading = activeQuery.isLoading
  // A page of unprocessed papers that were all just processed is empty on
  // screen while more wait on the server: fetch the next page.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = unprocessedQuery
  useEffect(() => {
    if (isUnprocessedView && unprocessedAll.length === 0 && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [isUnprocessedView, unprocessedAll.length, hasNextPage, isFetchingNextPage, fetchNextPage])
  const papersError = activeQuery.isError

  // Gather all unique topics from ALL papers for this date (not just filtered)
  // Count papers by status for the active date
  const { data: allPapersForDate = [] } = useDigest({ date: activeDate, limit: 200, with_relevance: true }, { enabled: !!activeDate })

  const allTopics = useMemo(() => {
    const topicSet = new Set<string>()
    ;(isCrossDate ? crossAll : allPapersForDate).forEach((p) => {
      parseTopics(p.topics).forEach((t) => topicSet.add(t))
    })
    return Array.from(topicSet).sort()
  }, [allPapersForDate, crossAll, isCrossDate])
  const statusCounts = useMemo(() => {
    const counts = { all: allPapersForDate.length, new: 0, saved: 0, dismissed: 0 }
    allPapersForDate.forEach((p) => {
      if (p.status === 'new') counts.new++
      if (p.status === 'saved') counts.saved++
      if (p.status === 'dismissed') counts.dismissed++
    })
    return counts
  }, [allPapersForDate])

  // "For You" count (across all papers in view)
  const forYouCount = useMemo(() => {
    if (!userSlug) return 0
    return (isCrossDate ? crossAll : allPapersForDate).filter((p) => p.relevant_members?.includes(userSlug)).length
  }, [allPapersForDate, crossAll, isCrossDate, userSlug])

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
    // Processed papers sink (#136). Array.prototype.sort is stable, so within
    // a bucket the server's order is untouched.
    return [...result].sort((a, b) => processRank(a.status) - processRank(b.status))
  }, [papers, searchQuery, forYouFilter, userSlug])

  const isEmpty = dates.length === 0 && !isLoading

  // #147: every paper in the date view is processed. Counts come from what is
  // on screen, so a topic, For you or search filter is honored.
  const allDone = !isCrossDate && !isLoading && filteredPapers.length > 0 && filteredPapers.every((p) => p.status !== 'new')
  const doneSaved = filteredPapers.filter((p) => p.status === 'saved').length
  const doneDismissed = filteredPapers.length - doneSaved
  const unprocessedElsewhere = unprocessedElsewhereQuery.data ?? 0

  const recentDates = dates.slice(0, RECENT_DATES)
  const activeIsRecent = recentDates.some((d) => d.date === activeDate)

  // Reading progress bar — rendered as PageHeader child
  const progressBar = statusCounts.all > 0 ? (
    <div className="flex items-center gap-3">
      {/* Teal data ramp: dim early, the full accent once every paper is read. */}
      <div className="flex-1 max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: BAR_TRACK }}>
        <div
          style={{
            width: `${((statusCounts.saved + statusCounts.dismissed) / statusCounts.all) * 100}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: tealRamp((statusCounts.saved + statusCounts.dismissed) / statusCounts.all),
            transition: 'width var(--duration-slow) var(--ease-out)',
          }}
        />
      </div>
      <span className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
        {/* These counts are one digest day's. Name the day, so they do not read
            as contradicting the cross-date Unprocessed/Saved tab counts. */}
        {activeDate ? `${formatShortDate(activeDate)} digest: ` : ''}{statusCounts.new} unread of {statusCounts.all} · {statusCounts.saved} saved · {statusCounts.dismissed} dismissed
      </span>
    </div>
  ) : null

  return (
    <>
      {/* Header — compact PageHeader replaces oversized hero (H-02, H-03) */}
      <section className="content-container">
        <PageHeader
          title="Research Digest"
          subtitle="Daily PubMed papers relevant to MNCCORE research"
          // The digest's one telling number is what is new (color-back pick 2).
          // The total still reads in the All tab and the progress line below.
          hero={statusCounts.all > 0 ? { value: statusCounts.new, label: 'new' } : undefined}
        >
          {progressBar}
        </PageHeader>
      </section>

      {/* #507 follow-up: distinguish a thrown fetch failure (useDigestDates
          or the main useDigest papers query) from "no digest has run yet" --
          both used to fall through to the same "No research digest yet"
          empty state. */}
      {(datesError || papersError) ? (
        <section className="content-container pb-16">
          <div className="flex items-center justify-center py-16">
            <QueryErrorNote label="research digest" onRetry={() => { refetchDates(); activeQuery.refetch() }} />
          </div>
        </section>
      ) : isEmpty ? (
        <section className="content-container pb-16">
          <EmptyState />
        </section>
      ) : (
        <section className="content-container pb-12">
          {/* Date selector: the newest dates as filter links (one scrolling
              row on phones), every older date in the picker. Saved spans all
              dates, so it has none. */}
          {dates.length > 0 && (
            <div className="mb-6">
              <SectionHead title={isSavedView ? 'Saved papers' : isUnprocessedView ? 'Unprocessed papers' : 'Digest date'} />
              {isCrossDate ? (
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  {isSavedView
                    ? 'Every paper you saved, from every digest, newest first.'
                    : 'Every paper you have not saved or dismissed, from every digest, most relevant first.'}
                </p>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <FilterLinks
                    ariaLabel="Digest date"
                    className="tk-flt-scroll"
                    value={activeDate ?? ''}
                    onChange={(d) => {
                      setSelectedDate(d)
                      setTopicFilter(null)
                    }}
                    options={recentDates.map((d) => ({ value: d.date, label: formatDate(d.date), count: d.count }))}
                  />
                  {dates.length > RECENT_DATES && (
                    <GhostSelect
                      aria-label="Older digest dates"
                      value={activeDate ?? ''}
                      triggerLabel={activeIsRecent || !activeDate ? 'Older' : formatDate(activeDate)}
                      triggerColor={activeIsRecent ? undefined : 'var(--job-accent)'}
                      onChange={(d) => {
                        setSelectedDate(d)
                        setTopicFilter(null)
                      }}
                      options={dates.map((d) => ({ value: d.date, label: `${formatDate(d.date)} (${d.count})` }))}
                      searchable
                    />
                  )}
                </div>
              )}
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
              className="w-full max-w-md rounded-md px-3 py-2 pl-9 text-xs outline-none"
              style={{ color: 'var(--ink)', border: '1px solid var(--field-edge)', backgroundColor: 'var(--cream, white)' }}
            />
          </div>

          {/* Status filter tabs — minHeight prevents reflow as counts load */}
          <div className="flex flex-wrap items-center gap-4 mb-4" style={{ minHeight: '40px' }}>
            <FilterLinks
              ariaLabel="Paper status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all' as StatusFilter, label: 'All', count: statusCounts.all },
                { value: 'unprocessed' as StatusFilter, label: 'Unprocessed', count: unprocessedCount },
                { value: 'saved' as StatusFilter, label: 'Saved', count: savedAll.length },
              ]}
            />

            {/* "For You" filter */}
            {userSlug && forYouCount > 0 && (
              <div className="tk-flt">
                <button type="button" aria-pressed={forYouFilter} onClick={() => setForYouFilter(!forYouFilter)}>
                  For you
                  <span className="tk-cnt">{forYouCount}</span>
                </button>
              </div>
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

            {/* Copy reading list: every saved paper, not one date's */}
            {savedAll.length > 0 && (
              <button
                onClick={() => {
                  const bib = savedAll.map(p => {
                    const authors = truncateAuthors(p.authors)
                    const year = p.pub_date ? p.pub_date.slice(0, 4) : ''
                    return `${authors}. ${p.title}. ${p.journal || ''}${year ? ` (${year})` : ''}${p.doi ? `. doi:${p.doi}` : ''}`
                  }).join('\n\n')
                  navigator.clipboard.writeText(bib)
                }}
                className="tk-btn tk-sm"
                title="Copy saved papers as bibliography"
              >
                <Copy {...ICON_PROPS} size={10} />
                Copy reading list
              </button>
            )}
          </div>

          {/* Topic filter — collapsed behind a Topics toggle (P2-04), so the
              default view keeps two filter rows. The toggle reads pressed
              while a topic filter is on, even when collapsed. */}
          {allTopics.length > 0 && (
            <div className="mb-6">
              <div className="tk-flt mb-2">
                <button
                  type="button"
                  aria-pressed={!!topicFilter}
                  aria-expanded={topicsExpanded}
                  onClick={() => setTopicsExpanded((v) => !v)}
                >
                  Topics
                  {topicFilter && <span className="tk-cnt">1</span>}
                  {topicsExpanded ? <ChevronUp {...ICON_PROPS} size={12} /> : <ChevronDown {...ICON_PROPS} size={12} />}
                </button>
              </div>
              {topicsExpanded && (
                <FilterLinks
                  ariaLabel="Topic"
                  value={topicFilter ?? ''}
                  onChange={(t) => setTopicFilter(t === '' || t === topicFilter ? null : t)}
                  options={[{ value: '', label: 'All topics' }, ...allTopics.map((t) => ({ value: t, label: t }))]}
                />
              )}
            </div>
          )}

          {/* Paper list — outer wrapper reserves stable height to prevent CLS during load */}
          <div style={{ minHeight: '600px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading digest">
              <HeartbeatLine width={200} height={52} color="var(--slate)" ariaLabel="Loading digest" />
            </div>
          ) : filteredPapers.length === 0 ? (
            searchQuery ? (
              <div className="text-center py-12">
                <Search size={32} style={{ color: 'var(--slate)', opacity: 0.75, margin: '0 auto var(--sp-sm)' }} />
                <p className="text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  No papers matching "{searchQuery}"
                </p>
              </div>
            ) : isUnprocessedView && !topicFilter && !forYouFilter && !hasNextPage ? (
              <AllDone
                headline="All done"
                detail="Nothing is left to process, in any digest."
                action={dates.length > 0 ? { label: 'Back to the latest digest', onClick: () => { setStatusFilter('all'); setSelectedDate(undefined) } } : undefined}
              />
            ) : statusFilter !== 'all' || topicFilter || forYouFilter ? (
              <NoResults saved={isSavedView && !topicFilter && !forYouFilter} />
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
              {allDone && (
                <AllDone
                  headline="All done"
                  detail={`Every paper here is processed: ${doneSaved} saved, ${doneDismissed} dismissed.${unprocessedElsewhereQuery.data === 0 ? ' Nothing is waiting in any other digest either.' : ''}`}
                  action={unprocessedElsewhere > 0
                    ? { label: `${unprocessedElsewhere} more unprocessed in other digests. See them`, onClick: () => { setStatusFilter('unprocessed'); setTopicFilter(null) } }
                    : undefined}
                />
              )}
              {filteredPapers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} projects={projectOptions} compactWhenProcessed={!isSavedView} />
              ))}
              {isUnprocessedView && hasNextPage && (
                <div className="text-center pt-2">
                  <Button variant="secondary" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'Loading' : 'Show more'}
                  </Button>
                </div>
              )}
            </div>
          )}
          </div>
        </section>
      )}
    </>
  )
}
