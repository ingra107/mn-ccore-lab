// ArtifactPage — /portal/artifacts/:id (Hermes Artifacts v1).
//
// Renders an artifact's body_md (MarkdownView), a version badge + history
// dropdown (artifact_versions), origin task/project chips, a "Copy markdown"
// button, and the standard unified activity feed + composer below
// (entity_type='artifact'). The interactive loop: a team member comments here →
// activity_entries(entity_type='artifact'); @hermes please address the comments →
// ai_requests(source_type='artifact_comment') → the listener revises the
// artifact (version++) and posts a short reply.
//
// Design ref: docs/superpowers/plans/2026-06-11-hermes-artifacts-design.md.

import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { FileText, History, Copy, ClipboardList, FolderKanban, Send, Lock } from 'lucide-react'
import PageContainer from '../../components/PageContainer'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import EmptyState from '../../components/EmptyState'
import MarkdownView from '../../components/MarkdownView'
import HermesMark from '../../components/HermesMark'
import { ActivityEntryItem, type ActivityEntryItemRow } from '../../components/activity/activityRender'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { PATHS } from '../../constants/paths'
import { formatRelativeTime } from '../../lib/dateUtils'
import { parseDbUtc, formatDbLocal } from '../../lib/time'
import { getPersonInfo } from '../../data/team'

interface ArtifactVersion {
  artifact_id: string
  version: number
  revised_by: string | null
  revision_note: string | null
  created_at: string
}

interface Artifact {
  id: string
  title: string
  body_md: string
  version: number
  task_id: string | null
  project_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  versions: ArtifactVersion[]
}

export default function ArtifactPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth()
  const { showSuccess } = useToast()

  const [showHistory, setShowHistory] = useState(false)
  const [comment, setComment] = useState('')
  const [authorOnly, setAuthorOnly] = useState(false)

  const { data: artifact, isLoading } = useQuery<Artifact | null>({
    queryKey: ['artifact', id],
    queryFn: async () => {
      const res = await fetch(`/api/artifacts/${id}`)
      if (!res.ok) return null
      const data = await res.json() as { data?: Artifact }
      return data.data ?? null
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })

  const { data: activity = [] } = useQuery<ActivityEntryItemRow[]>({
    queryKey: ['artifact-activity', id],
    queryFn: async () => {
      const res = await fetch(`/api/artifacts/${id}/activity`)
      if (!res.ok) return []
      const data = await res.json() as { data?: ActivityEntryItemRow[] }
      return data.data || []
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })

  const postComment = useMutation({
    mutationFn: async (payload: { content: string; visibility?: string }) => {
      const res = await fetch(`/api/artifacts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to post comment')
      return res.json()
    },
    onSuccess: () => {
      setComment('')
      setAuthorOnly(false)
      qc.invalidateQueries({ queryKey: ['artifact-activity', id] })
      showSuccess('Comment posted')
    },
    onError: () => showSuccess('Could not post comment — try again'),
  })

  const handlePostComment = () => {
    const content = comment.trim()
    if (!content) return
    postComment.mutate({ content, visibility: authorOnly ? 'author' : undefined })
  }

  const copyMarkdown = async () => {
    if (!artifact) return
    try {
      await navigator.clipboard.writeText(artifact.body_md)
      showSuccess('Markdown copied to clipboard')
    } catch {
      showSuccess('Could not copy to clipboard')
    }
  }

  const updatedAbs = useMemo(() => {
    if (!artifact) return ''
    const d = parseDbUtc(artifact.updated_at)
    return isNaN(d.getTime()) ? artifact.updated_at : formatDbLocal(artifact.updated_at, 'datetime')
  }, [artifact])

  if (isLoading) {
    return (
      <PageContainer>
        <div style={{ paddingTop: '1.5rem' }}>
          <TextSkeleton lines={8} />
        </div>
      </PageContainer>
    )
  }

  if (!artifact) {
    return (
      <PageContainer>
        <div style={{ paddingTop: '2rem' }}>
          {/* N1.24 — was a dead end: no recovery action from a stale link. */}
          <EmptyState
            icon={<FileText size={28} />}
            title="Artifact not found"
            subtitle="This artifact may have been deleted, or the link is incorrect."
            action={{ label: 'Search the Hub →', onClick: () => navigate(PATHS.search) }}
          />
        </div>
      </PageContainer>
    )
  }

  const creator = getPersonInfo(artifact.created_by)

  return (
    <PageContainer>
      <div style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {/* ── Header ── */}
        <div className="flex items-start gap-3" style={{ marginBottom: '0.75rem' }}>
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: 'var(--gold-active)', color: 'var(--gold)' }}
          >
            <FileText size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)', margin: 0, lineHeight: 1.25 }}>
              {artifact.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 4 }}>
              {artifact.created_by === 'claude-ai' ? (
                <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 500 }}>
                  <HermesMark size={12} variant="avatar" /> Hermes
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--slate)' }}>{creator.name}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--slate)', opacity: 0.7 }} title={updatedAbs}>
                · updated {formatRelativeTime(artifact.updated_at)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Meta row: version badge + history + origin chips + copy ── */}
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: '1.25rem' }}>
          {/* Version badge + history dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 cursor-pointer"
              aria-expanded={showHistory ? 'true' : 'false'}
              aria-label="Version history"
              style={{
                fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                background: 'var(--teal-active)', color: 'var(--teal)', border: '1px solid var(--teal)',
              }}
            >
              <History size={11} /> v{artifact.version}
              {artifact.versions.length > 0 && <span style={{ opacity: 0.7 }}>· {artifact.versions.length + 1} total</span>}
            </button>
            {showHistory && (
              <div
                role="menu"
                style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, minWidth: 280,
                  background: 'var(--cream)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15))',
                  padding: '8px', maxHeight: 320, overflowY: 'auto',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)', opacity: 0.7, padding: '4px 8px' }}>
                  Version history
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink)', padding: '6px 8px', borderRadius: 'var(--radius-md)', background: 'var(--teal-active)' }}>
                  <strong>v{artifact.version}</strong> (current) · {getPersonInfo(artifact.created_by).name}
                </div>
                {artifact.versions.map((v) => (
                  <div key={v.version} style={{ fontSize: 12, color: 'var(--slate)', padding: '6px 8px' }}>
                    <strong style={{ color: 'var(--ink)' }}>v{v.version}</strong>
                    {v.revised_by ? ` · ${getPersonInfo(v.revised_by).name}` : ''}
                    <span style={{ opacity: 0.6 }}> · {formatRelativeTime(v.created_at)}</span>
                    {v.revision_note && <div style={{ marginTop: 2, opacity: 0.85 }}>{v.revision_note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Origin task chip */}
          {artifact.task_id && (
            <Link
              to={`${PATHS.myTasks}?openTask=${encodeURIComponent(artifact.task_id)}`}
              className="inline-flex items-center gap-1"
              style={{ fontSize: 11, color: 'var(--teal)', background: 'var(--teal-active)', borderRadius: 'var(--radius-full)', padding: '3px 10px', textDecoration: 'none' }}
            >
              <ClipboardList size={11} /> origin task
            </Link>
          )}

          {/* Origin project chip */}
          {artifact.project_id && (
            <Link
              to={PATHS.project(artifact.project_id)}
              className="inline-flex items-center gap-1"
              style={{ fontSize: 11, color: 'var(--gold)', background: 'var(--gold-active)', borderRadius: 'var(--radius-full)', padding: '3px 10px', textDecoration: 'none' }}
            >
              <FolderKanban size={11} /> origin project
            </Link>
          )}

          {/* Copy markdown */}
          <button
            type="button"
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1 cursor-pointer"
            style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 'var(--radius-full)', background: 'var(--surface-2, rgba(100,116,139,0.12))', color: 'var(--slate)', border: '1px solid var(--border-subtle)', marginLeft: 'auto' }}
          >
            <Copy size={11} /> Copy markdown
          </button>
        </div>

        {/* ── Document body ── */}
        <div
          className="detail-card"
          style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '1.5rem 1.75rem', marginBottom: '2rem' }}
        >
          <MarkdownView source={artifact.body_md} />
        </div>

        {/* ── Activity feed + composer ── */}
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.75rem' }}>
          Discussion
        </h2>

        {/* Composer */}
        <div
          className="detail-card"
          style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)', padding: '14px 18px', marginBottom: '1.25rem' }}
        >
          {!isAuthenticated && import.meta.env.PROD ? (
            <span style={{ fontSize: 12, color: 'var(--slate)', opacity: 0.85 }}>
              <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 500, textDecoration: 'underline' }}>Sign in</a> to comment.
            </span>
          ) : (
            <>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handlePostComment() }
                }}
                rows={3}
                aria-label="Add a comment"
                placeholder="Comment, or ask @hermes to revise this document based on the discussion (⌘⏎ to post)"
                style={{
                  width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5,
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                  padding: '8px 10px', background: 'var(--cream)', color: 'var(--ink)', fontFamily: 'var(--font-body)',
                }}
              />
              <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setAuthorOnly((v) => !v)}
                  className="inline-flex items-center gap-1 cursor-pointer"
                  aria-pressed={authorOnly ? 'true' : 'false'}
                  title="Only you will see this comment"
                  style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 'var(--radius-full)',
                    background: authorOnly ? 'var(--surface-2, rgba(100,116,139,0.15))' : 'transparent',
                    color: 'var(--slate)', border: '1px solid var(--border-subtle)',
                    opacity: authorOnly ? 1 : 0.7,
                  }}
                >
                  <Lock size={9} /> {authorOnly ? 'Only you' : 'Visible to team'}
                </button>
                <button
                  type="button"
                  onClick={handlePostComment}
                  disabled={!comment.trim() || postComment.isPending}
                  className="inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    marginLeft: 'auto', fontSize: 12, fontWeight: 500, padding: '5px 14px',
                    borderRadius: 'var(--radius-md)', border: 'none',
                    background: comment.trim() ? 'var(--teal-solid)' : 'var(--surface-2, rgba(100,116,139,0.2))',
                    color: comment.trim() ? 'var(--ink-bright, #fff)' : 'var(--slate)',
                    cursor: comment.trim() ? 'pointer' : 'not-allowed', opacity: postComment.isPending ? 0.7 : 1,
                  }}
                >
                  <Send size={11} /> {postComment.isPending ? 'Posting…' : 'Comment'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Stream */}
        {activity.length === 0 ? (
          <div className="detail-card" style={{ background: 'var(--ice)', borderRadius: 'var(--radius-xl)' }}>
            <EmptyState
              icon={<FileText size={24} />}
              title="No discussion yet"
              subtitle="Comment above, or @hermes to revise this document."
              compact
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activity.map((entry) => (
              <ActivityEntryItem
                key={entry.id}
                entry={entry}
                // Artifact feed: canonical defaults.
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
