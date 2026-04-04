import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, Sparkles } from 'lucide-react'
import { useComments } from '../hooks/useApiData'
import { useAddComment } from '../hooks/useMutations'
import { useAuth } from '../hooks/useAuth'
import { formatRelativeTime } from '../lib/dateUtils'
import Avatar from './Avatar'
import MentionInput from './MentionInput'
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
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content) return

    addComment.mutate({
      content,
      author: user?.email?.split('@')[0] || 'anonymous',
    }, {
      onSuccess: () => showSuccess('Comment posted'),
    })
    setText('')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.22 }}
      style={{ marginBottom: '2.5rem' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} style={{ color: 'var(--gold)' }} />
        <h2
          style={{
            fontWeight: 500,
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
              fontSize: '11px',
              color: 'var(--slate)',
              opacity: 0.6,
            }}
          >
            {comments.length}
          </span>
        )}
      </div>

      <div
        style={{
          background: 'var(--ice)',
          borderRadius: '12px',
          padding: '16px 20px',
        }}
        className="detail-card"
      >
        {/* Comment input */}
        <form onSubmit={handleSubmit} style={{ marginBottom: comments.length > 0 ? '16px' : 0 }}>
          <div className="flex gap-2 items-end">
            <MentionInput
              value={text}
              onChange={setText}
              placeholder={isAuthenticated ? 'Add a comment... (use @mention to tag team)' : 'Sign in to comment'}
              disabled={!isAuthenticated && import.meta.env.PROD}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              style={{
                width: '100%',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--ink)',
                background: 'var(--cream)',
                border: '1px solid rgba(201, 168, 76, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(201, 168, 76, 0.15)')}
            />
            {text.trim() && (
              <motion.button
                type="submit"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="cursor-pointer flex-shrink-0 p-2.5 rounded-lg"
                style={{
                  background: 'var(--gold)',
                  color: '#0f1923',
                  border: 'none',
                }}
                whileTap={{ scale: 0.9 }}
                disabled={addComment.isPending}
              >
                <Send size={16} />
              </motion.button>
            )}
          </div>
          <p
            style={{
              fontSize: '10px',
              color: 'var(--slate)',
              opacity: 0.4,
              marginTop: '4px',
            }}
          >
            Ctrl+Enter to send
          </p>
        </form>

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
                      /* AI Co-Scientist comment */
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            background: 'rgba(201,168,76,0.04)',
                            border: '1px solid rgba(201,168,76,0.15)',
                            borderRadius: 8,
                            padding: '8px 12px',
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Sparkles size={12} style={{ color: 'var(--gold)' }} />
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--gold)',
                              }}
                            >
                              AI Co-Scientist
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--slate)',
                                opacity: 0.5,
                                marginLeft: 'auto',
                              }}
                            >
                              {formatRelativeTime(comment.created_at)}
                            </span>
                          </div>
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '13px',
                              color: 'var(--ink)',
                              lineHeight: 1.5,
                              margin: 0,
                            }}
                          >
                            {comment.content}
                          </p>
                        </div>
                        <ReactionBar targetType="comment" targetId={comment.id} />
                      </div>
                    ) : (
                      /* Regular human comment */
                      <>
                        <div className="flex-shrink-0 mt-0.5" style={{ width: 28, height: 28 }}>
                          <Avatar
                            name={comment.author_name || 'User'}
                            initials={(comment.author_name || 'U').split(' ').map(n => n[0]).join('').toUpperCase()}
                            size="sm"
                            variant="ice"
                            className="!w-7 !h-7 !min-w-0 !min-h-0"
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="flex items-baseline gap-2">
                            <span
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--ink)',
                              }}
                            >
                              {comment.author_name || 'Team Member'}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--slate)',
                                opacity: 0.5,
                              }}
                            >
                              {formatRelativeTime(comment.created_at)}
                            </span>
                          </div>
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: '13px',
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
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ) : (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 0.4,
              textAlign: 'center',
              padding: '12px 0',
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
