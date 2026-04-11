import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bell, AtSign, UserPlus, Clock, RefreshCw, CheckCheck, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '../hooks/useNotifications'
import { formatRelativeTime, formatMediumDate } from '../lib/dateUtils'

const TYPE_ICONS: Record<string, typeof Bell> = {
  mention: AtSign,
  assignment: UserPlus,
  deadline: Clock,
  update: RefreshCw,
  impact: Sparkles,
}

export default function NotificationBell() {
  const { user, isAuthenticated } = useAuth()
  const slug = useMemo(() => user?.email?.split('@')[0] || '', [user?.email])
  const { data: notifications = [] } = useNotifications(slug)
  const { data: unreadCount = 0 } = useUnreadCount(slug)
  const markRead = useMarkRead(slug)
  const markAllRead = useMarkAllRead(slug)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  // Show up to 20 most recent notifications, grouped by day
  const displayNotifications = isAuthenticated ? notifications.slice(0, 20) : []

  const groupedByDay = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const groups: { label: string; items: typeof displayNotifications }[] = []
    const map = new Map<string, typeof displayNotifications>()

    for (const n of displayNotifications) {
      const date = (n.created_at || '').split('T')[0] || 'unknown'
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(n)
    }

    for (const [date, items] of map) {
      const label = date === today ? 'Today' : date === yesterday ? 'Yesterday' : formatMediumDate(date)
      groups.push({ label, items })
    }

    return groups
  }, [displayNotifications])

  if (!isAuthenticated) return null

  return (
    <div ref={ref} className="relative" style={{ display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-md cursor-pointer transition-colors duration-200 relative"
        style={{ color: 'var(--slate)' }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: 'var(--gold)',
              color: '#0f1923',
              fontSize: '10px',
              lineHeight: '16px',
              minWidth: '16px',
              height: '16px',
              borderRadius: 'var(--radius-circle)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              animation: 'badge-pop 200ms ease-out',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '360px',
              maxHeight: '480px',
              background: 'var(--cream)',
              border: '1px solid rgba(201, 168, 76, 0.2)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-elevated)',
              zIndex: 'var(--z-sidebar)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: 'var(--sp-md) var(--sp-lg)',
                borderBottom: '1px solid rgba(201, 168, 76, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  color: 'var(--ink)',
                }}
              >
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors duration-150"
                  style={{
                    fontSize: '10px',
                    color: 'var(--gold)',
                    background: 'rgba(201, 168, 76, 0.08)',
                    border: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(201, 168, 76, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(201, 168, 76, 0.08)'
                  }}
                >
                  <CheckCheck size={11} />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {displayNotifications.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--sp-2xl) var(--sp-lg)',
                    textAlign: 'center',
                  }}
                >
                  <Bell
                    size={24}
                    style={{ color: 'var(--slate)', opacity: 0.3, margin: '0 auto var(--sp-sm)' }}
                  />
                  <p
                    style={{
                      fontSize: 'var(--value-size)',
                      color: 'var(--slate)',
                      opacity: 'var(--ink-label)',
                      margin: 0,
                    }}
                  >
                    No notifications yet
                  </p>
                </div>
              ) : (
                groupedByDay.map((group) => (
                  <div key={group.label}>
                    {/* Day header */}
                    <div
                      style={{
                        padding: '6px 16px 4px',
                        fontSize: '10px',
                        color: group.label === 'Today' ? 'var(--teal)' : 'var(--slate)',
                        opacity: group.label === 'Today' ? 1 : 'var(--ink-label)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                      }}
                    >
                      {group.label}
                    </div>
                    {group.items.map((notification) => {
                      const Icon = TYPE_ICONS[notification.type] || Bell
                      const isUnread = !notification.read
                      const isImpact = notification.type === 'impact'

                      const content = (
                        <div
                          className="flex items-start gap-3"
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            background: isImpact
                              ? 'rgba(201, 168, 76, 0.07)'
                              : isUnread ? 'rgba(201, 168, 76, 0.04)' : 'transparent',
                            borderLeft: isImpact
                              ? '3px solid var(--gold)'
                              : isUnread ? '3px solid var(--gold)' : '3px solid transparent',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isImpact
                              ? 'rgba(201, 168, 76, 0.12)'
                              : 'rgba(201, 168, 76, 0.08)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isImpact
                              ? 'rgba(201, 168, 76, 0.07)'
                              : isUnread
                                ? 'rgba(201, 168, 76, 0.04)'
                                : 'transparent'
                          }}
                        >
                          <div
                            className="flex-shrink-0 mt-0.5"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: 'var(--radius-circle)',
                              background: isImpact
                                ? 'rgba(201, 168, 76, 0.2)'
                                : isUnread ? 'rgba(201, 168, 76, 0.12)' : 'var(--ice)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon size={14} style={{ color: isImpact ? 'var(--gold)' : isUnread ? 'var(--gold)' : 'var(--slate)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 'var(--value-size)',
                                fontWeight: isUnread ? 600 : 400,
                                color: 'var(--ink)',
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {notification.title}
                            </div>
                            {notification.body && (
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--slate)',
                                  lineHeight: 1.4,
                                  marginTop: '2px',
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
                                fontSize: '10px',
                                color: 'var(--slate)',
                                opacity: 'var(--ink-label)',
                                marginTop: '2px',
                              }}
                            >
                              {formatRelativeTime(notification.created_at)}
                            </div>
                          </div>
                          {isUnread && (
                            <div
                              className="flex-shrink-0 mt-2"
                              style={{ width: '6px', height: '6px', borderRadius: 'var(--radius-circle)', background: 'var(--gold)' }}
                            />
                          )}
                        </div>
                      )

                      function handleClick() {
                        if (isUnread) markRead.mutate(notification.id)
                        setOpen(false)
                      }

                      if (notification.link) {
                        return (
                          <Link key={notification.id} to={notification.link} onClick={handleClick} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                            {content}
                          </Link>
                        )
                      }

                      return (
                        <div key={notification.id} onClick={handleClick}>
                          {content}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* View all link */}
            <Link
              to="/my-items"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '10px 16px',
                textAlign: 'center',
                fontSize: 'var(--label-size)',
                color: 'var(--gold)',
                textDecoration: 'none',
                borderTop: '1px solid rgba(201, 168, 76, 0.15)',
              }}
            >
              View all items
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
