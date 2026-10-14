import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bell, AtSign, UserPlus, Clock, RefreshCw, CheckCheck, Sparkles, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead } from '../hooks/useNotifications'
import { formatRelativeTime, formatMediumDate, localDateKey } from '../lib/dateUtils'
import { ICON_PROPS } from '../lib/iconProps'
import { withAlpha } from '../lib/taskGrouping'
import { clampToViewport, type AnchoredBox } from '../lib/viewportClamp'

const PANEL_WIDTH = 360

const TYPE_ICONS: Record<string, typeof Bell> = {
  mention: AtSign,
  assignment: UserPlus,
  deadline: Clock,
  update: RefreshCw,
  impact: Sparkles,
  meeting_debrief: Calendar,
}

// align: which edge of the bell the dropdown anchors to. 'right' (default)
// suits a top-right header (public Layout); 'left' lets the dropdown open
// rightward when the bell lives in the portal sidebar.
// triggerColor: the bell icon's ink. The public bar passes a light ink while it
// sits on the Home hero's dark band; the dropdown keeps the theme's colors.
export default function NotificationBell({ align = 'right', triggerColor = 'var(--slate)' }: { align?: 'left' | 'right'; triggerColor?: string }) {
  const { user, isAuthenticated } = useAuth()
  const slug = user?.slug ?? ''
  const { data: notifications = [] } = useNotifications(slug)
  const { data: unreadCount = 0 } = useUnreadCount(slug)
  const markRead = useMarkRead(slug)
  const markAllRead = useMarkAllRead(slug)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Width and left offset come from one clamp (lib/viewportClamp), measured
  // when the panel opens and again on resize, so the panel stays on screen
  // wherever the bell sits (a phone header put it 72px off the left edge).
  const [box, setBox] = useState<AnchoredBox | null>(null)
  const measure = () => {
    const el = ref.current
    if (el) setBox(clampToViewport(el.getBoundingClientRect(), PANEL_WIDTH, window.innerWidth, align))
  }
  const measureRef = useRef(measure)
  measureRef.current = measure
  useEffect(() => {
    if (!open) return
    const onResize = () => measureRef.current()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // Slack-style read semantics (Nick 2026-06-11): opening the list IS seeing
  // it. Unread highlights stay visible while the dropdown is open; when it
  // closes (or unmounts mid-navigation), everything is marked read. No
  // per-item "mark as read" chore. Refs keep the unmount cleanup current
  // without re-running the effect.
  const wasOpen = useRef(false)
  const unreadRef = useRef(0)
  unreadRef.current = unreadCount
  const markAllRef = useRef(markAllRead.mutate)
  markAllRef.current = markAllRead.mutate
  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (wasOpen.current) {
      wasOpen.current = false
      if (unreadRef.current > 0) markAllRef.current()
    }
  }, [open])
  useEffect(() => () => {
    if (wasOpen.current && unreadRef.current > 0) markAllRef.current()
  }, [])

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

  // Every notification the API returns (its LIMIT 50), grouped by day in the
  // scrolling list. The bell is the only list now that My Items folded into
  // Today, so it no longer caps at 20.
  const displayNotifications = useMemo(
    () => (isAuthenticated ? notifications : []),
    [isAuthenticated, notifications],
  )

  const groupedByDay = useMemo(() => {
    const today = localDateKey()
    // Intentional snapshot at memoize time (day-boundary label), not a bug —
    // recomputes whenever displayNotifications changes, which is frequent
    // enough that a day-stale label is not observable in practice.
    // eslint-disable-next-line react-hooks/purity -- see comment above
    const yesterday = localDateKey(new Date(Date.now() - 86400000))
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
        onClick={() => { if (!open) measure(); setOpen(!open) }}
        className="p-2 rounded-md cursor-pointer transition-colors duration-200 relative"
        style={{ color: triggerColor }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell {...ICON_PROPS} size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              background: 'var(--job-wants)',
              // Ink that holds AA on the gold in each theme (white on light gold, dark on dark-mode gold).
              color: 'var(--job-wants-fg)',
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
              left: box ? `${box.left}px` : align === 'left' ? 0 : undefined,
              right: box || align === 'left' ? undefined : 0,
              marginTop: '8px',
              width: box ? `${box.width}px` : `min(${PANEL_WIDTH}px, calc(100vw - 24px))`,
              maxHeight: '480px',
              background: 'var(--cream)',
              border: `1px solid ${withAlpha('var(--sk-t1)', 10)}`,
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
                borderBottom: `1px solid ${withAlpha('var(--sk-t1)', 6)}`,
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
                  className="cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors duration-150 hov-bg"
                  style={{
                    fontSize: '10px',
                    color: 'var(--sk-t2)',
                    background: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)',
                    border: 'none',
                    '--hov-bg': 'color-mix(in srgb, var(--sk-t1) 10%, transparent)',
                  } as React.CSSProperties}
                >
                  <CheckCheck {...ICON_PROPS} size={11} />
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
                    style={{ color: 'var(--slate)', opacity: 0.75, margin: '0 auto var(--sp-sm)' }}
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
                        color: group.label === 'Today' ? 'var(--job-accent)' : 'var(--slate)',
                        opacity: group.label === 'Today' ? 1 : 'var(--ink-label)',
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
                          className="flex items-start gap-3 hov-bg"
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            background: isImpact
                              ? 'color-mix(in srgb, var(--job-wants) 10%, transparent)'
                              : isUnread ? 'color-mix(in srgb, var(--job-wants) 6%, transparent)' : 'transparent',
                            borderLeft: isImpact
                              ? '3px solid var(--job-wants)'
                              : isUnread ? '3px solid var(--job-wants)' : '3px solid transparent',
                            '--hov-bg': isImpact ? 'color-mix(in srgb, var(--job-wants) 15%, transparent)' : 'color-mix(in srgb, var(--job-wants) 10%, transparent)',
                          } as React.CSSProperties}
                        >
                          <div
                            className="flex-shrink-0 mt-0.5"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: 'var(--radius-circle)',
                              background: isImpact
                                ? withAlpha('var(--job-wants)', 20)
                                : isUnread ? 'color-mix(in srgb, var(--job-wants) 15%, transparent)' : 'var(--ice)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon {...ICON_PROPS} size={14} style={{ color: isImpact ? 'var(--job-wants)' : isUnread ? 'var(--job-wants)' : 'var(--slate)' }} />
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
                              style={{ width: '6px', height: '6px', borderRadius: 'var(--radius-circle)', background: 'var(--job-wants)' }}
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
                        <div key={notification.id} role="button" tabIndex={0} onClick={handleClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}>
                          {content}
                        </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
