import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Bell,
  BellDot,
  ChevronDown,
  Clock,
  AlertTriangle,
  CheckCheck,
  Handshake,
} from 'lucide-react'
import { usePageMeta } from '../hooks/usePageMeta'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { useActionItems } from '../hooks/useApiData'
import type { ActionItemRow } from '../hooks/useApiData'
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '../hooks/useNotifications'
import type { NotificationRow } from '../hooks/useNotifications'
import { useToggleActionItem } from '../hooks/useMutations'
import { useUndoToast } from '../components/UndoToast'
import { useCommitments } from '../hooks/useCommitments'
import type { CommitmentRow } from '../hooks/useCommitments'
import { getPersonInfo } from '../data/team'
import { formatRelativeTime, formatShortDate, isOverdue } from '../lib/dateUtils'
import { parseCarriedForward } from '../lib/textUtils'
import { PATHS } from '../constants/paths'

// ── Helpers ─────────────────────────────────────────────────

// isOverdue imported from dateUtils

function notificationIcon(type: string) {
  switch (type) {
    case 'mention':
      return <BellDot size={16} />
    case 'assignment':
      return <Clock size={16} />
    case 'deadline':
      return <AlertTriangle size={16} />
    default:
      return <Bell size={16} />
  }
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({
  count,
  label,
  icon,
  accentColor,
}: {
  count: number
  label: string
  icon: React.ReactNode
  accentColor: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="card"
      style={{
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flex: '1 1 200px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-xl)',
          background: `${accentColor}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: accentColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: '1.5rem',
            color: 'var(--ink)',
            lineHeight: 1,
          }}
        >
          {count}
        </div>
        <div
          style={{
            fontSize: 'var(--label-size)',
            color: 'var(--slate)',
            opacity: 'var(--ink-label)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginTop: 2,
          }}
        >
          {label}
        </div>
      </div>
    </motion.div>
  )
}

// ── Section Header ──────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', marginBottom: '1rem' }}>
      <span
        style={{
          fontSize: 'var(--label-size)',
          color: 'var(--slate)',
          opacity: 'var(--ink-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      <div className="section-header-line" />
    </div>
  )
}

// ── Action Item Row ─────────────────────────────────────────

function ActionItemCard({
  item,
  onToggle,
}: {
  item: ActionItemRow
  onToggle: (id: string) => void
}) {
  const person = getPersonInfo(item.assignee)
  const overdue = !item.completed && isOverdue(item.due_date)

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
        borderLeft: overdue ? '3px solid var(--maroon)' : '3px solid transparent',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <button
          onClick={() => onToggle(item.id)}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            color: item.completed ? 'var(--teal)' : 'var(--slate)',
            opacity: item.completed ? 1 : 0.85,
            flexShrink: 0,
            marginTop: 2,
            transition: 'color 0.2s, opacity 0.2s',
          }}
          aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '15px',
              color: 'var(--ink)',
              lineHeight: 1.4,
              textDecoration: item.completed ? 'line-through' : 'none',
              opacity: item.completed ? 0.85 : 1,
            }}
          >
            {(() => { const { isCarried, clean } = parseCarriedForward(item.description); return (<>{isCarried && <span className="carried-badge">↻ carried</span>}{clean}</>); })()}
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
            {/* Assignee */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 'var(--radius-circle)',
                  background: person.photoUrl ? undefined : 'var(--gold-light)',
                  border: '1px solid var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize: 'var(--text-micro)',
                  fontWeight: 700,
                  color: 'var(--gold)',
                  flexShrink: 0,
                }}
              >
                {person.photoUrl ? (
                  <img
                    src={person.photoUrl}
                    alt={person.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  person.initials
                )}
              </div>
              <span
                style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                }}
              >
                {item.assignee}
              </span>
            </div>

            {/* Due date */}
            {item.due_date && (
              <>
                <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: overdue ? 'var(--maroon)' : 'var(--slate)',
                    opacity: overdue ? 1 : 0.85,
                    fontWeight: overdue ? 600 : 400,
                  }}
                >
                  {overdue ? 'overdue' : 'due'} {formatShortDate(item.due_date)}
                </span>
              </>
            )}

            {/* Source meeting */}
            {item.meeting_title && (
              <>
                <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    opacity: 'var(--ink-hint)',
                  }}
                >
                  from {item.meeting_title}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Notification Row ────────────────────────────────────────

function NotificationCard({
  notification,
  onMarkRead,
}: {
  notification: NotificationRow
  onMarkRead: (id: string) => void
}) {
  const isUnread = !notification.read

  const content = (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.2 }}
      className="card"
      onClick={() => {
        if (isUnread) onMarkRead(notification.id)
      }}
      style={{
        padding: '1rem 1.25rem',
        marginBottom: '0.5rem',
        cursor: notification.link ? 'pointer' : 'default',
        borderLeft: isUnread ? '3px solid var(--gold)' : '3px solid transparent',
        opacity: isUnread ? 1 : 0.85,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-lg)',
            background: isUnread ? 'var(--gold-emphasis)' : 'var(--ice)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isUnread ? 'var(--gold)' : 'var(--slate)',
            flexShrink: 0,
          }}
        >
          {notificationIcon(notification.type)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: isUnread ? 600 : 400,
              color: 'var(--ink)',
              lineHeight: 1.4,
            }}
          >
            {notification.title}
          </div>
          {notification.body && (
            <div
              style={{
                fontSize: 'var(--value-size)',
                color: 'var(--slate)',
                opacity: 'var(--ink-label)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {notification.body}
            </div>
          )}
          <div
            style={{
              fontSize: 'var(--label-size)',
              color: 'var(--slate)',
              opacity: 'var(--ink-hint)',
              marginTop: 'var(--sp-xs)',
            }}
          >
            {formatRelativeTime(notification.created_at)}
          </div>
        </div>

        {isUnread && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-circle)',
              background: 'var(--gold)',
              flexShrink: 0,
              marginTop: 6,
            }}
          />
        )}
      </div>
    </motion.div>
  )

  if (notification.link) {
    return (
      <Link to={notification.link} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </Link>
    )
  }
  return content
}

// ── Commitment Card ─────────────────────────────────────────

function CommitmentCard({ item }: { item: CommitmentRow }) {
  const isDone = item.status === 'done'
  const overdue = !isDone && isOverdue(item.due_date)
  const person = getPersonInfo(
    item.to_whom.split(' ').pop()?.toLowerCase() ?? ''
  )

  const borderColor = isDone ? 'var(--teal)' : overdue ? 'var(--maroon)' : 'var(--gold)'

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
            {/* To whom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 'var(--radius-circle)',
                  background: person.photoUrl ? undefined : 'var(--gold-light)',
                  border: '1px solid var(--gold)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  fontSize: 'var(--text-micro)',
                  fontWeight: 700,
                  color: 'var(--gold)',
                  flexShrink: 0,
                }}
              >
                {person.photoUrl ? (
                  <img
                    src={person.photoUrl}
                    alt={person.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  person.initials
                )}
              </div>
              <span
                style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                }}
              >
                To: {item.to_whom}
              </span>
            </div>

            {/* Due date */}
            {item.due_date && (
              <>
                <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: overdue ? 'var(--maroon)' : 'var(--slate)',
                    opacity: overdue ? 1 : 0.85,
                    fontWeight: overdue ? 600 : 400,
                  }}
                >
                  {overdue ? 'overdue' : 'due'} {formatShortDate(item.due_date)}
                </span>
              </>
            )}

            {/* Source */}
            {item.source && (
              <>
                <span style={{ color: 'var(--slate)', opacity: 0.75 }}>&middot;</span>
                <span
                  style={{
                    fontSize: 'var(--label-size)',
                    color: 'var(--slate)',
                    opacity: 'var(--ink-hint)',
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

// ── Main Page ───────────────────────────────────────────────

export default function MyItems() {
  usePageMeta(
    'My Items | MN-CCORE Lab',
    'Personal dashboard showing your action items, notifications, and assignments.'
  )
  const headerRef = useScrollReveal<HTMLDivElement>()
  const { user, isAuthenticated, isLoading } = useAuth()

  const [showCompleted, setShowCompleted] = useState(false)

  // Derive user slug from email; pre-launch (no CF Access cookie yet) defaults
  // to Nick so the page is useful instead of a sign-in wall.
  const userSlug = emailToSlug(user?.email) || 'nick-ingraham'

  // Data hooks
  const { data: allActionItems = [] } = useActionItems(
    userSlug ? { assignee: userSlug } : undefined
  )
  const { data: notifications = [] } = useNotifications(userSlug)
  const { data: unreadCount = 0 } = useUnreadCount(userSlug)
  const markRead = useMarkRead(userSlug)
  const markAllRead = useMarkAllRead(userSlug)
  const toggleAction = useToggleActionItem()
  const { showUndo } = useUndoToast()

  const handleToggle = (id: string) => {
    const item = allActionItems.find(a => a.id === id)
    const wasCompleted = item?.completed === 1
    toggleAction.mutate(id)
    showUndo(wasCompleted ? 'Reopened action item' : 'Completed action item', () => toggleAction.mutate(id))
  }
  const { data: allCommitments = [] } = useCommitments()

  // Split commitments into open vs done, sort open by due date (overdue first)
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

  // Deduplicate carried-forward items (keep most recent version)
  const dedupedItems = useMemo(() => {
    const seen = new Map<string, ActionItemRow>()
    for (const item of allActionItems) {
      const normalized = (item.description || '').replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
      const key = `${normalized}::${item.assignee}`
      const existing = seen.get(key)
      if (!existing || (item.created_at > existing.created_at)) {
        seen.set(key, item)
      }
    }
    return [...seen.values()]
  }, [allActionItems])

  // Split action items into pending vs completed
  const { pending, completed } = useMemo(() => {
    const p: ActionItemRow[] = []
    const c: ActionItemRow[] = []
    for (const item of dedupedItems) {
      if (item.completed) {
        c.push(item)
      } else {
        p.push(item)
      }
    }
    // Sort pending: overdue first, then by due date
    p.sort((a, b) => {
      const aOverdue = isOverdue(a.due_date)
      const bOverdue = isOverdue(b.due_date)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    // Sort completed: most recently completed first
    c.sort((a, b) => {
      if (a.completed_at && b.completed_at) return b.completed_at.localeCompare(a.completed_at)
      return 0
    })
    return { pending: p, completed: c }
  }, [allActionItems])

  // Unread notifications first, then by date
  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (a.read !== b.read) return a.read - b.read
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [notifications])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--gold)', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  const displayName = user?.name || userSlug

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="content-container" style={{ paddingBottom: '4rem' }}>
        {/* Back link */}
        <div style={{ paddingTop: '0.25rem', marginBottom: '0.5rem' }}>
          <Link
            to={PATHS.dashboard}
            className="hover:!opacity-100 transition-opacity"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '12px',
              color: 'var(--slate)',
              opacity: 0.75,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </Link>
        </div>

        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1.5rem' }}>
          <h1
            style={{
              fontWeight: 600,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            My Items
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--slate)',
              opacity: 0.85,
              marginTop: '4px',
            }}
          >
            {displayName ? `Welcome back, ${displayName}` : 'Your action items and notifications'}
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.85,
              marginTop: '1rem',
            }}
          />
        </div>

        {/* Unauthed banner — shown when CF Access cookie is absent. Pre-launch
            this is everyone; post-launch it's anyone who hits /my-items without
            signing in. We default the userSlug to nick-ingraham so the page is
            still useful in pre-launch. */}
        {!isAuthenticated && (
          <div
            className="card"
            style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              borderLeft: '3px solid var(--gold)',
              fontSize: '13px',
              color: 'var(--slate)',
            }}
          >
            <Bell size={16} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              Showing Nick's items. <a href="/api/auth/login" style={{ color: 'var(--teal)', textDecoration: 'underline' }}>Sign in with @umn.edu</a> to see your own.
            </span>
          </div>
        )}

        {/* Summary Stats */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            marginBottom: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <StatCard
            count={pending.length}
            label="Pending Action Items"
            icon={<Circle size={20} />}
            accentColor="#c9a84c"
          />
          <StatCard
            count={unreadCount}
            label="Unread Notifications"
            icon={<BellDot size={20} />}
            accentColor="#2d8a8a"
          />
          <StatCard
            count={openCommitments.length}
            label="Open Commitments"
            icon={<Handshake size={20} />}
            accentColor="#c9a84c"
          />
        </div>

        {/* Pending Action Items */}
        <div style={{ marginBottom: '2.5rem' }}>
          <SectionHeader title="Pending Action Items" />

          {pending.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '2rem',
                textAlign: 'center',
                fontSize: '14px',
                color: 'var(--slate)',
                opacity: 0.75,
              }}
            >
              No pending action items. You're all caught up.
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {pending.map((item) => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  onToggle={handleToggle}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Notifications */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <SectionHeader title="Notifications" />
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="hover:!opacity-100 transition-opacity"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-xs)',
                  fontSize: 'var(--label-size)',
                  color: 'var(--teal)',
                  opacity: markAllRead.isPending ? 0.85 : 0.8,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  padding: 'var(--sp-xs) 0',
                }}
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          {sortedNotifications.length === 0 ? (
            <div
              className="card"
              style={{
                padding: '2rem',
                textAlign: 'center',
                fontSize: '14px',
                color: 'var(--slate)',
                opacity: 0.75,
              }}
            >
              No notifications yet.
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {sortedNotifications.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Commitments */}
        {openCommitments.length + doneCommitments.length > 0 && (
          <div style={{ marginBottom: '2.5rem' }}>
            <SectionHeader title="Commitments" />

            {openCommitments.length === 0 ? (
              <div
                className="card"
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  fontSize: '14px',
                  color: 'var(--slate)',
                  opacity: 0.75,
                }}
              >
                All commitments fulfilled.
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {openCommitments.map((c) => (
                  <CommitmentCard key={c.id} item={c} />
                ))}
              </AnimatePresence>
            )}

            {doneCommitments.length > 0 && (
              <div style={{ marginTop: '1rem', opacity: 0.85 }}>
                <AnimatePresence mode="popLayout">
                  {doneCommitments.map((c) => (
                    <CommitmentCard key={c.id} item={c} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* Completed Section */}
        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted((s) => !s)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                padding: '0.5rem 0',
                marginBottom: '0.75rem',
                width: '100%',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--label-size)',
                  color: 'var(--slate)',
                  opacity: 'var(--ink-label)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                }}
              >
                Completed ({completed.length})
              </span>
              <div className="section-header-line" />
              <motion.span
                animate={{ rotate: showCompleted ? 0 : -90 }}
                transition={{ duration: 0.2 }}
                style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', flexShrink: 0 }}
              >
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  {completed.map((item) => (
                    <ActionItemCard
                      key={item.id}
                      item={item}
                      onToggle={handleToggle}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
