import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare } from 'lucide-react'
import HermesMark from './HermesMark'
import HermesResponse from './HermesResponse'
import HermesPending, { isHermesPending } from './HermesPending'
import { useComments } from '../hooks/useApiData'
import { useAddComment } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { formatRelativeTime } from '../lib/dateUtils'
import { getPersonInfo } from '../data/team'
import Avatar from './Avatar'
import SmartCompose from './SmartCompose'
import ReactionBar from './ReactionBar'
import { useToast } from '../hooks/useToast'

interface Props {
  projectSlug: string
}

export default function ProjectComments({ projectSlug }: Props) {
  const { data: comments = [], isLoading } = useComments(projectSlug)
  const addComment = useAddComment(projectSlug)
  const { user, isAuthenticated } = useAuth()
  const { showSuccess } = useToast()

  const handleSubmit = (content: string) =>
    new Promise<void>((resolve) => {
      addComment.mutate({
        content,
        author: emailToSlug(user?.email) || 'anonymous',
      }, {
        onSuccess: () => { showSuccess('Comment posted'); resolve() },
        onError: () => resolve(),
      })
    })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.22 }}
      style={{ marginBottom: '2.5rem' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} style={{ color: 'var(--gold)' }} />
        <h2
          style={{
            fontWeight: 'var(--label-weight)',
            fontSize: '16px',
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          Comments
        </h2>
        {comments.length > 0 && (
          <span
            style={{
              fontSize: 'var(--label-size)',
              color: 'var(--slate)',
              opacity: 0.75,
            }}
          >
            {comments.length}
          </span>
        )}
      </div>

      <div
        style={{
          background: 'var(--ice)',
          borderRadius: 'var(--radius-xl)',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {/* Comment input — SmartCompose (D14). */}
        <div style={{ marginBottom: comments.length > 0 ? '16px' : 0 }}>
          {!isAuthenticated && import.meta.env.PROD ? (
            <span style={{ fontSize: '11px', color: 'var(--slate)', opacity: 0.75 }}>
              <a href="/api/auth/login" style={{ color: 'var(--teal)', fontWeight: 'var(--weight-ui)' as any, textDecoration: 'underline' }}>Sign in</a> to comment
            </span>
          ) : (
            <SmartCompose
              theme="light"
              bare
              onSubmit={handleSubmit}
              submitting={addComment.isPending}
              uploadContext={{ type: 'project', id: projectSlug }}
              placeholder="Add a comment... (use @mention to tag team)"
              rows={2}
              alwaysShowToolbar
              submitLabel="Comment"
            />
          )}
        </div>

        {/* Comments list */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin mx-auto"
              style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : comments.length > 0 ? (
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="popLayout">
              {comments.map((comment) => {
                const isAI = comment.author_slug === 'claude-ai'

                return (
                  <motion.div
                    key={comment.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex gap-3"
                  >
                    {isAI ? (
                      /* Hermes AI comment */
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            background: 'var(--gold-hover)',
                            border: '1px solid rgba(201,168,76,0.15)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--sp-sm) var(--sp-md)',
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <HermesMark size={14} variant="avatar" />
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--gold)',
                                fontWeight: 500,
                              }}
                            >
                              Hermes
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
                                marginLeft: 'auto',
                              }}
                            >
                              {formatRelativeTime(comment.created_at)}
                            </span>
                          </div>
                          {isHermesPending(comment.content) ? (
                            <HermesPending askedAt={comment.created_at} />
                          ) : (
                            <HermesResponse content={comment.content} />
                          )}
                          {/* PD-18: ReactionBar inside the gold card to match human comment placement */}
                          <ReactionBar targetType="comment" targetId={comment.id} />
                        </div>
                      </div>
                    ) : (
                      /* Regular human comment */
                      (() => {
                        // PD-17: prefer getPersonInfo(author_slug) over raw author_name; reuse initials from team data
                        const info = comment.author_slug ? getPersonInfo(comment.author_slug) : null
                        const isKnown = info && info.name !== 'Unknown'
                        const displayName = isKnown ? info!.name : (comment.author_name || 'Team Member')
                        const initials = isKnown
                          ? info!.initials
                          : (comment.author_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()
                        return (
                          <>
                            <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
                              <Avatar
                                name={displayName}
                                initials={initials}
                                variant="ice"
                                size="base-sm"
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div className="flex items-baseline gap-2">
                                <span
                                  style={{
                                    fontSize: 'var(--value-size)',
                                    fontWeight: 600,
                                    color: 'var(--ink)',
                                  }}
                                >
                                  {displayName}
                                </span>
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: 'var(--slate)',
                                    opacity: 'var(--ink-label)',
                                  }}
                                >
                                  {formatRelativeTime(comment.created_at)}
                                </span>
                              </div>
                              <p
                                style={{
                                  fontSize: 'var(--value-size)',
                                  color: 'var(--ink)',
                                  lineHeight: 1.5,
                                  margin: '2px 0 0',
                                  whiteSpace: 'pre-wrap',
                                }}
                              >
                                {comment.content}
                              </p>
                              <ReactionBar targetType="comment" targetId={comment.id} />
                            </div>
                          </>
                        )
                      })()
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <p
            style={{
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 'var(--ink-hint)',
              textAlign: 'center',
              padding: 'var(--sp-md) 0',
              margin: 0,
            }}
          >
            No comments yet — be the first to discuss this project
          </p>
        )}
      </div>
    </motion.div>
  )
}
