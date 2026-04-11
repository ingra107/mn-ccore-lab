/**
 * RevisionTracker — Paper Revision Tracker component.
 *
 * Renders revision rounds with per-comment status tracking.
 * Used as a tab in ProjectDetail and as a standalone section on Manuscripts page.
 */

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  Send,
} from 'lucide-react'
import InlineSelect from './InlineSelect'
import Avatar from './Avatar'
import { useUndoToast } from './UndoToast'
import { useRevisions, useRevisionComments } from '../hooks/useApiData'
import type { RevisionRow, ReviewerCommentRow } from '../hooks/useApiData'
import {
  useCreateRevision,
  useUpdateRevision,
  useCreateRevisionComment,
  useUpdateRevisionComment,
} from '../hooks/useMutations'
import { getPersonInfo } from '../data/team'
import { formatMediumDate } from '../lib/dateUtils'
import { TableSkeleton } from './LoadingSkeleton'
import EmptyState from './EmptyState'
import { getStatusBg } from '../lib/statusColors'

// ── Constants ──

const REVISION_STATUS_OPTIONS = [
  { value: 'in_progress', label: 'In Progress', color: 'var(--teal)' },
  { value: 'submitted', label: 'Submitted', color: 'var(--green)' },
  { value: 'accepted', label: 'Accepted', color: 'var(--gold)' },
  { value: 'rejected', label: 'Rejected', color: 'var(--maroon)' },
]

const COMMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'var(--slate)' },
  { value: 'in_progress', label: 'Working', color: 'var(--teal)' },
  { value: 'done', label: 'Done', color: 'var(--green)' },
  { value: 'wont_fix', label: "Won't Fix", color: 'var(--maroon)' },
]

const COMMENT_STATUS_ICON: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  wont_fix: XCircle,
}

// ── Types ──

interface RevisionTrackerProps {
  projectId: string
}

// ── Main Component ──

export default function RevisionTracker({ projectId }: RevisionTrackerProps) {
  const { data: revisions = [], isLoading } = useRevisions(projectId)
  const createRevision = useCreateRevision(projectId)
  const updateRevision = useUpdateRevision(projectId)
  const { showUndo } = useUndoToast()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Add round form state
  const [newJournal, setNewJournal] = useState('')
  const [newResponseDue, setNewResponseDue] = useState('')

  function handleAddRound() {
    createRevision.mutate({
      project_id: projectId,
      journal: newJournal || undefined,
      response_due: newResponseDue || undefined,
    })
    setShowAddForm(false)
    setNewJournal('')
    setNewResponseDue('')
  }

  function handleStatusChange(revision: RevisionRow, newStatus: string) {
    const prev = revision.status
    updateRevision.mutate({ id: revision.id, fields: { status: newStatus } })
    showUndo(`R${revision.round} status -> ${newStatus}`, () =>
      updateRevision.mutate({ id: revision.id, fields: { status: prev } }),
    )
  }

  if (isLoading) return <TableSkeleton rows={3} cols={4} />

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: 'var(--teal)' }} />
          <h3
            style={{
              fontWeight: 600,
              fontSize: '15px',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            Revision Rounds
          </h3>
          {revisions.length > 0 && (
            <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
              {revisions.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{
            background: 'transparent',
            color: 'var(--teal)',
            fontSize: '12px',
            fontWeight: 500,
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            transition: 'background 150ms ease-out',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(45,138,138,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={14} />
          Add Round
        </button>
      </div>

      {/* Add round form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: '16px' }}
          >
            <div
              className="rounded-xl p-4"
              style={{
                background: 'rgba(45, 138, 138, 0.04)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex flex-wrap gap-3 items-end">
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--label-size)',
                      fontWeight: 'var(--label-weight)',
                      color: 'var(--slate)',
                      marginBottom: '4px',
                    }}
                  >
                    Journal
                  </label>
                  <input
                    type="text"
                    value={newJournal}
                    onChange={(e) => setNewJournal(e.target.value)}
                    placeholder="e.g., AJRCCM"
                    className="w-full rounded-lg px-3 py-1.5"
                    style={{
                      fontSize: 'var(--value-size)',
                      color: 'var(--ink)',
                      background: 'var(--ice)',
                      border: '1px solid var(--border-subtle)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ minWidth: '160px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--label-size)',
                      fontWeight: 'var(--label-weight)',
                      color: 'var(--slate)',
                      marginBottom: '4px',
                    }}
                  >
                    Response Due
                  </label>
                  <input
                    type="date"
                    value={newResponseDue}
                    onChange={(e) => setNewResponseDue(e.target.value)}
                    className="rounded-lg px-3 py-1.5"
                    style={{
                      fontSize: 'var(--value-size)',
                      color: 'var(--ink)',
                      background: 'var(--ice)',
                      border: '1px solid var(--border-subtle)',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  onClick={handleAddRound}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg"
                  style={{
                    background: 'var(--teal)',
                    color: '#fff',
                    fontSize: 'var(--value-size)',
                    fontWeight: 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 150ms',
                  }}
                >
                  <Send size={13} />
                  Create
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Revision rounds list */}
      {revisions.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={32} />}
          title="No revision rounds yet"
          subtitle='Click "Add Round" to start tracking.'
        />
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {revisions.map((rev, idx) => (
              <motion.div
                key={rev.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, delay: idx * 0.03 }}
              >
                <RevisionRound
                  revision={rev}
                  projectId={projectId}
                  isExpanded={expandedId === rev.id}
                  onToggle={() => setExpandedId(expandedId === rev.id ? null : rev.id)}
                  onStatusChange={handleStatusChange}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

// ── Revision Round ──

interface RevisionRoundProps {
  revision: RevisionRow
  projectId: string
  isExpanded: boolean
  onToggle: () => void
  onStatusChange: (revision: RevisionRow, status: string) => void
}

function RevisionRound({ revision, projectId, isExpanded, onToggle, onStatusChange }: RevisionRoundProps) {
  const commentCount = revision.comment_count ?? 0
  const resolvedCount = revision.resolved_count ?? 0
  const progress = commentCount > 0 ? Math.round((resolvedCount / commentCount) * 100) : 0

  const statusOpt = REVISION_STATUS_OPTIONS.find((o) => o.value === revision.status)

  const isOverdue = revision.response_due && new Date(revision.response_due) < new Date() && revision.status === 'in_progress'

  return (
    <div
      className="rounded-xl"
      style={{
        border: '1px solid var(--border-subtle)',
        background: 'var(--ice)',
        overflow: 'hidden',
      }}
    >
      {/* Round header */}
      <button
        onClick={onToggle}
        className="w-full text-left"
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr auto',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 150ms',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(201, 168, 76, 0.04)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Round badge */}
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 36,
            height: 36,
            background: getStatusBg(revision.status),
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 'var(--value-size)', fontWeight: 600, color: statusOpt?.color || 'var(--teal)' }}>
            R{revision.round}
          </span>
        </div>

        {/* Info */}
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap">
            <InlineSelect
              value={revision.status}
              options={REVISION_STATUS_OPTIONS}
              onChange={(val) => onStatusChange(revision, val)}
            />
            {revision.journal && (
              <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.7 }}>
                {revision.journal}
              </span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1" style={{ fontSize: 'var(--label-size)', color: 'var(--maroon)' }}>
                <AlertTriangle size={12} />
                Overdue
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            {revision.submitted_at && (
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                Submitted {formatMediumDate(revision.submitted_at)}
              </span>
            )}
            {revision.response_due && (
              <span style={{ fontSize: 'var(--label-size)', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', opacity: isOverdue ? 0.9 : 'var(--ink-label)' }}>
                Due {formatMediumDate(revision.response_due)}
              </span>
            )}
            {commentCount > 0 && (
              <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                {resolvedCount}/{commentCount} resolved
              </span>
            )}
          </div>
        </div>

        {/* Progress + expand */}
        <div className="flex items-center gap-3">
          {commentCount > 0 && (
            <div style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.6 }}>
                {progress}%
              </span>
              <div
                style={{
                  width: '100%',
                  height: 4,
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(148, 163, 184, 0.15)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    borderRadius: 'var(--radius-sm)',
                    background: progress === 100 ? 'var(--green)' : 'var(--teal)',
                    transition: 'width 250ms ease-out',
                  }}
                />
              </div>
            </div>
          )}
          {isExpanded ? (
            <ChevronDown size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} />
          ) : (
            <ChevronRight size={16} style={{ color: 'var(--slate)', opacity: 0.4 }} />
          )}
        </div>
      </button>

      {/* Expanded comments section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: '12px 16px',
              }}
            >
              <RevisionCommentsList
                revisionId={revision.id}
                projectId={projectId}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Comments List ──

interface RevisionCommentsListProps {
  revisionId: string
  projectId: string
}

function RevisionCommentsList({ revisionId, projectId }: RevisionCommentsListProps) {
  const { data: comments = [], isLoading } = useRevisionComments(revisionId)
  const createComment = useCreateRevisionComment(revisionId, projectId)
  const updateComment = useUpdateRevisionComment(revisionId, projectId)
  const { showUndo } = useUndoToast()

  const [showAddComment, setShowAddComment] = useState(false)
  const [newReviewerNum, setNewReviewerNum] = useState(1)
  const [newCommentText, setNewCommentText] = useState('')
  const [newAssignedTo, setNewAssignedTo] = useState('nick')
  const [editingResponse, setEditingResponse] = useState<string | null>(null)
  const [responseDraft, setResponseDraft] = useState('')

  // Group comments by reviewer
  const grouped = useMemo(() => {
    const map = new Map<number, ReviewerCommentRow[]>()
    for (const c of comments) {
      const group = map.get(c.reviewer_number) || []
      group.push(c)
      map.set(c.reviewer_number, group)
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0])
  }, [comments])

  function handleAddComment() {
    if (!newCommentText.trim()) return
    createComment.mutate({
      reviewer_number: newReviewerNum,
      comment_text: newCommentText.trim(),
      assigned_to: newAssignedTo,
    })
    setNewCommentText('')
    setShowAddComment(false)
  }

  function handleStatusChange(comment: ReviewerCommentRow, newStatus: string) {
    const prev = comment.status
    updateComment.mutate({ id: comment.id, fields: { status: newStatus } })
    showUndo(`Comment status -> ${newStatus}`, () =>
      updateComment.mutate({ id: comment.id, fields: { status: prev } }),
    )
  }

  function handleSaveResponse(commentId: string) {
    updateComment.mutate({ id: commentId, fields: { response_text: responseDraft.trim() || '' } })
    setEditingResponse(null)
    setResponseDraft('')
  }

  if (isLoading) return <TableSkeleton rows={3} cols={3} />

  return (
    <div>
      {/* Comments table */}
      {grouped.length > 0 ? (
        <div className="flex flex-col gap-4">
          {grouped.map(([reviewerNum, reviewerComments]) => (
            <div key={reviewerNum}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    fontWeight: 'var(--label-weight)',
                    color: 'var(--slate)',
                    opacity: 0.6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Reviewer {reviewerNum}
                </span>
                <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.35 }}>
                  {reviewerComments.length}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              </div>

              <div className="flex flex-col gap-1">
                <AnimatePresence mode="popLayout">
                  {reviewerComments.map((comment, ci) => {
                    const StatusIcon = COMMENT_STATUS_ICON[comment.status] || Circle
                    const statusOpt = COMMENT_STATUS_OPTIONS.find((o) => o.value === comment.status)
                    const assignee = getPersonInfo(comment.assigned_to)

                    return (
                      <motion.div
                        key={comment.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.15, delay: ci * 0.02 }}
                        className="rounded-lg"
                        style={{
                          padding: '10px 12px',
                          background: getStatusBg(comment.status),
                          transition: 'background 250ms ease-out',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Status icon */}
                          <StatusIcon
                            size={14}
                            style={{
                              color: statusOpt?.color || 'var(--slate)',
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          />

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 'var(--value-size)',
                                color: 'var(--ink)',
                                lineHeight: 1.5,
                                margin: 0,
                                fontWeight: 400,
                              }}
                            >
                              {comment.comment_text}
                            </p>

                            {/* Response text */}
                            {comment.response_text && editingResponse !== comment.id && (
                              <div
                                className="mt-2 pl-3 rounded"
                                style={{
                                  borderLeft: '2px solid var(--teal)',
                                  paddingTop: 4,
                                  paddingBottom: 4,
                                }}
                              >
                                <p
                                  style={{
                                    fontSize: '12px',
                                    color: 'var(--ink)',
                                    opacity: 0.8,
                                    lineHeight: 1.5,
                                    margin: 0,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => {
                                    setEditingResponse(comment.id)
                                    setResponseDraft(comment.response_text || '')
                                  }}
                                  title="Click to edit response"
                                >
                                  {comment.response_text}
                                </p>
                              </div>
                            )}

                            {/* Response editor */}
                            {editingResponse === comment.id && (
                              <div className="mt-2 flex gap-2">
                                <textarea
                                  value={responseDraft}
                                  onChange={(e) => setResponseDraft(e.target.value)}
                                  placeholder="Your response to this comment..."
                                  rows={2}
                                  className="flex-1 rounded-lg px-3 py-1.5"
                                  style={{
                                    fontSize: '12px',
                                    color: 'var(--ink)',
                                    background: 'rgba(255,255,255,0.5)',
                                    border: '1px solid var(--border-subtle)',
                                    outline: 'none',
                                    resize: 'vertical',
                                  }}
                                  autoFocus
                                />
                                <div className="flex flex-col gap-1">
                                  <button
                                    onClick={() => handleSaveResponse(comment.id)}
                                    style={{
                                      fontSize: 'var(--label-size)',
                                      color: '#fff',
                                      background: 'var(--teal)',
                                      border: 'none',
                                      borderRadius: 'var(--radius-md)',
                                      padding: '4px 10px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingResponse(null)}
                                    style={{
                                      fontSize: 'var(--label-size)',
                                      color: 'var(--slate)',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: '4px 10px',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Add response link (when no response yet) */}
                            {!comment.response_text && editingResponse !== comment.id && (
                              <button
                                onClick={() => {
                                  setEditingResponse(comment.id)
                                  setResponseDraft('')
                                }}
                                style={{
                                  fontSize: 'var(--label-size)',
                                  color: 'var(--teal)',
                                  opacity: 0.6,
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px 0 0',
                                  marginTop: 4,
                                  display: 'block',
                                }}
                              >
                                + Add response
                              </button>
                            )}
                          </div>

                          {/* Right side: assignee + status */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div style={{ width: 20, height: 20 }}>
                              <Avatar
                                name={assignee.name}
                                initials={assignee.initials}
                                photoUrl={assignee.photoUrl}
                                size="sm"
                                variant="ice"
                                className="!w-5 !h-5 !min-w-0 !min-h-0 !text-[7px]"
                              />
                            </div>
                            <InlineSelect
                              value={comment.status}
                              options={COMMENT_STATUS_OPTIONS}
                              onChange={(val) => handleStatusChange(comment, val)}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--slate)',
            opacity: 0.4,
            textAlign: 'center',
            padding: '12px 0',
            margin: 0,
          }}
        >
          No reviewer comments yet
        </p>
      )}

      {/* Add comment button / form */}
      <div style={{ marginTop: '12px' }}>
        {!showAddComment ? (
          <button
            onClick={() => setShowAddComment(true)}
            className="flex items-center gap-1.5"
            style={{
              fontSize: '12px',
              color: 'var(--teal)',
              opacity: 0.7,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Plus size={14} />
            Add Comment
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg p-3"
            style={{
              background: 'rgba(45, 138, 138, 0.04)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex gap-3 mb-2">
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'var(--slate)', marginBottom: 2 }}>
                  Reviewer #
                </label>
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={newReviewerNum}
                  onChange={(e) => setNewReviewerNum(parseInt(e.target.value) || 1)}
                  className="rounded-md px-2 py-1"
                  style={{
                    width: 52,
                    fontSize: '12px',
                    color: 'var(--ink)',
                    background: 'var(--ice)',
                    border: '1px solid var(--border-subtle)',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 500, color: 'var(--slate)', marginBottom: 2 }}>
                  Assigned To
                </label>
                <input
                  type="text"
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  className="rounded-md px-2 py-1"
                  style={{
                    width: 100,
                    fontSize: '12px',
                    color: 'var(--ink)',
                    background: 'var(--ice)',
                    border: '1px solid var(--border-subtle)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Paste reviewer comment..."
              rows={3}
              className="w-full rounded-lg px-3 py-2 mb-2"
              style={{
                fontSize: 'var(--value-size)',
                color: 'var(--ink)',
                background: 'var(--ice)',
                border: '1px solid var(--border-subtle)',
                outline: 'none',
                resize: 'vertical',
              }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddComment}
                disabled={!newCommentText.trim()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md"
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#fff',
                  background: newCommentText.trim() ? 'var(--teal)' : 'var(--slate)',
                  border: 'none',
                  cursor: newCommentText.trim() ? 'pointer' : 'not-allowed',
                  opacity: newCommentText.trim() ? 1 : 0.5,
                }}
              >
                <Plus size={13} />
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddComment(false)
                  setNewCommentText('')
                }}
                style={{
                  fontSize: '12px',
                  color: 'var(--slate)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Active Revisions Dashboard Section ──

export function ActiveRevisionsDashboard({ revisions }: { revisions: RevisionRow[] }) {
  if (!revisions || revisions.length === 0) return null

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} style={{ color: 'var(--gold)' }} />
        <h2
          style={{
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Active Revisions
        </h2>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6 }}>
          {revisions.length}
        </span>
      </div>

      <div className="table-container">
        {/* Header */}
        <div
          className="hidden sm:grid"
          style={{
            gridTemplateColumns: 'minmax(200px, 1fr) 60px 100px 100px 100px',
            padding: '8px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {['Project', 'Round', 'Journal', 'Due', 'Progress'].map((col) => (
            <span
              key={col}
              style={{
                fontSize: 'var(--label-size)',
                fontWeight: 'var(--label-weight)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {col}
            </span>
          ))}
        </div>

        {/* Rows */}
        <AnimatePresence mode="popLayout">
          {revisions.map((rev, idx) => {
            const commentCount = rev.comment_count ?? 0
            const resolvedCount = rev.resolved_count ?? 0
            const progress = commentCount > 0 ? Math.round((resolvedCount / commentCount) * 100) : 0
            const isOverdue = rev.response_due && new Date(rev.response_due) < new Date()
            const slug = rev.project_slug || rev.project_id

            return (
              <motion.a
                key={rev.id}
                href={`/projects/${slug}?tab=revisions`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.15 }}
                className="active-revision-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1fr) 60px 100px 100px 100px',
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-subtle)',
                  textDecoration: 'none',
                  color: 'inherit',
                  alignItems: 'center',
                  transition: 'background 150ms',
                  cursor: 'pointer',
                }}
              >
                {/* Project title */}
                <span style={{ fontSize: 'var(--value-size)', fontWeight: 500, color: 'var(--ink)' }}>
                  {rev.project_title || rev.project_id}
                </span>

                {/* Round */}
                <span
                  className="inline-flex items-center justify-center rounded-md"
                  style={{
                    fontSize: 'var(--label-size)',
                    fontWeight: 600,
                    color: 'var(--teal)',
                    background: getStatusBg('in_progress'),
                    padding: '2px 8px',
                    width: 'fit-content',
                  }}
                >
                  R{rev.round}
                </span>

                {/* Journal */}
                <span style={{ fontSize: '12px', color: 'var(--slate)', opacity: 0.7 }}>
                  {rev.journal || '--'}
                </span>

                {/* Due date */}
                <span
                  style={{
                    fontSize: '12px',
                    color: isOverdue ? 'var(--maroon)' : 'var(--slate)',
                    opacity: isOverdue ? 0.9 : 0.6,
                    fontWeight: isOverdue ? 500 : 400,
                  }}
                >
                  {rev.response_due ? formatMediumDate(rev.response_due) : '--'}
                </span>

                {/* Progress */}
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 0.6, whiteSpace: 'nowrap' }}>
                    {resolvedCount}/{commentCount}
                  </span>
                  {commentCount > 0 && (
                    <div
                      style={{
                        flex: 1,
                        maxWidth: 48,
                        height: 4,
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(148, 163, 184, 0.15)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${progress}%`,
                          height: '100%',
                          borderRadius: 'var(--radius-sm)',
                          background: progress === 100 ? 'var(--green)' : 'var(--teal)',
                          transition: 'width 250ms ease-out',
                        }}
                      />
                    </div>
                  )}
                </div>
              </motion.a>
            )
          })}
        </AnimatePresence>
      </div>

      <style>{`
        .active-revision-row:hover {
          background: rgba(201, 168, 76, 0.06) !important;
        }
      `}</style>
    </div>
  )
}
