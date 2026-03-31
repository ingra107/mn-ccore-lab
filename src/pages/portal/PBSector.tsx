import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Terminal,
  Circle,
  CheckCircle2,
  Flame,
  Target,
  Zap,
  ArrowRight,
  CalendarPlus,
  Archive,
  AlertTriangle,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Users,
  Flag,
  Handshake,
  Scale,
} from 'lucide-react'
import { usePBCommandCenter } from '../../hooks/useApiData'
import { usePBCapture, usePBDefer, useUpdateTaskStatus } from '../../hooks/useMutations'

// ── Helpers ────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  if (dateStr === todayStr) return 'Today'
  if (dateStr === tomorrowStr) return 'Tomorrow'
  const dayDiff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (dayDiff < 0) return `${Math.abs(dayDiff)}d ago`
  if (dayDiff <= 6) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function priorityColor(priority: string): string {
  switch (priority) {
    case 'urgent': return 'var(--maroon)'
    case 'high': return '#e67e22'
    case 'medium': return 'var(--gold)'
    case 'low': return 'var(--slate)'
    default: return 'var(--slate)'
  }
}

function stageColor(stage: string): string {
  const s = (stage || '').toLowerCase()
  if (s.includes('writing') || s.includes('analysis')) return 'var(--teal)'
  if (s.includes('submit') || s.includes('review')) return 'var(--gold)'
  if (s.includes('idea') || s.includes('data')) return 'var(--slate)'
  if (s.includes('publish') || s.includes('accept')) return '#22c55e'
  return 'var(--slate)'
}

const quickBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid rgba(201,168,76,0.15)',
  borderRadius: 4,
  padding: '2px 4px',
  cursor: 'pointer',
  color: 'var(--slate)',
  display: 'flex',
  alignItems: 'center',
}

// ── Task Row ──────────────────────────────────────────────

interface CommandTaskProps {
  task: any
  onComplete: (id: string) => void
  onDefer: (id: string, to: 'tomorrow' | 'next_week' | 'someday') => void
}

function CommandTask({ task, onComplete, onDefer }: CommandTaskProps) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.due_date && task.due_date < today

  return (
    <div className="flex items-center gap-3 py-2.5 group" style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
      {/* Complete button */}
      <button
        onClick={() => onComplete(task.id)}
        className="flex-shrink-0 hover:scale-110 transition-transform"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Circle size={18} style={{ color: 'var(--slate)', opacity: 0.3 }} />
      </button>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--ink)' }}>
            {task.title || task.description}
          </span>
          {task.project_title && (
            <Link
              to={`/projects/${task.project_slug}`}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', textDecoration: 'none', opacity: 0.7, flexShrink: 0 }}
            >
              {task.project_title}
            </Link>
          )}
        </div>
        {/* Context line — WHY this matters now */}
        {isOverdue && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--maroon)', fontWeight: 600 }}>
            Overdue since {task.due_date}
          </span>
        )}
      </div>

      {/* Due date */}
      {task.due_date && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: isOverdue ? 'var(--maroon)' : 'var(--slate)', whiteSpace: 'nowrap' }}>
          {formatShortDate(task.due_date)}
        </span>
      )}

      {/* Quick actions — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onDefer(task.id, 'tomorrow')} title="Tomorrow" style={quickBtnStyle}>
          <ArrowRight size={12} />
        </button>
        <button onClick={() => onDefer(task.id, 'next_week')} title="Next week" style={quickBtnStyle}>
          <CalendarPlus size={12} />
        </button>
        <button onClick={() => onDefer(task.id, 'someday')} title="Someday" style={quickBtnStyle}>
          <Archive size={12} />
        </button>
      </div>

      {/* Priority dot */}
      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: priorityColor(task.priority) }} />
    </div>
  )
}

// ── Completed Task Row ────────────────────────────────────

function CompletedTask({ task }: { task: any }) {
  return (
    <div className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid rgba(201,168,76,0.04)' }}>
      <CheckCircle2 size={16} style={{ color: 'var(--teal)', opacity: 0.5, flexShrink: 0 }} />
      <span className="truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--slate)', textDecoration: 'line-through', opacity: 0.6 }}>
        {task.title || task.description}
      </span>
      {task.completed_at && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.4, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatShortDate(task.completed_at.split('T')[0])}
        </span>
      )}
    </div>
  )
}

// ── Task Section ─────────────────────────────────────────

interface TaskSectionProps {
  title: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  tasks: any[]
  color: string
  glow?: boolean
  defaultCollapsed?: boolean
  onComplete: (id: string) => void
  onDefer: (id: string, to: 'tomorrow' | 'next_week' | 'someday') => void
}

function TaskSection({ title, icon: Icon, tasks, color, glow, defaultCollapsed, onComplete, onDefer }: TaskSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed || false)

  if (tasks.length === 0) return null

  return (
    <div
      className="mb-4 rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${color}20`,
        boxShadow: glow ? `0 0 12px ${color}12` : undefined,
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
        style={{ background: `${color}06`, border: 'none', cursor: 'pointer' }}
      >
        <Icon size={14} style={{ color }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color }}>
          {title}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color, opacity: 0.6, marginLeft: 4 }}>
          {tasks.length}
        </span>
        <div className="flex-1" />
        {collapsed ? <ChevronRightIcon size={14} style={{ color, opacity: 0.5 }} /> : <ChevronDown size={14} style={{ color, opacity: 0.5 }} />}
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-2"
          >
            {tasks.map((task: any) => (
              <CommandTask key={task.id} task={task} onComplete={onComplete} onDefer={onDefer} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────

export default function PBSector() {
  const { data, isLoading } = usePBCommandCenter()
  const capture = usePBCapture()
  const defer = usePBDefer()
  const completeTask = useUpdateTaskStatus()
  const [captureText, setCaptureText] = useState('')
  const [showBacklog] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const handleComplete = (id: string) => {
    completeTask.mutate({ id, status: 'done' })
  }

  const handleDefer = (id: string, to: 'tomorrow' | 'next_week' | 'someday') => {
    defer.mutate({ id, to })
  }

  const handleCapture = () => {
    if (!captureText.trim()) return
    const isIdea = captureText.startsWith('idea:')
    capture.mutate({
      text: isIdea ? captureText.slice(5).trim() : captureText.trim(),
      type: isIdea ? 'idea' : 'task',
    })
    setCaptureText('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Terminal size={24} style={{ color: 'var(--gold)', opacity: 0.5 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--slate)' }}>Loading command center...</span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle size={24} style={{ color: 'var(--maroon)', opacity: 0.5 }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--slate)' }}>Could not load command center data.</span>
        </div>
      </div>
    )
  }

  const { greeting, mode, today, nudges, sections, stats, projects, milestones, commitments, meetings, decisionsForReview } = data

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Terminal size={16} style={{ color: 'var(--gold)', opacity: 0.7 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {mode} mode
            </span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>
            {greeting}, Nick
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--slate)', marginTop: 4 }}>
            {today} &middot; {stats.totalOpen} open &middot; {stats.overdue > 0 ? `${stats.overdue} overdue` : 'all current'}
          </p>
        </div>
      </div>

      {/* ── Quick Capture ────────────────────────────── */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Capture anything — task, idea, or note..."
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCapture()
            }}
            className="w-full px-4 py-3 rounded-xl text-sm"
            style={{ fontFamily: 'var(--font-body)', border: '2px solid rgba(201,168,76,0.15)', background: 'var(--cream)', color: 'var(--ink)', outline: 'none' }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.3 }}>
            Enter to capture
          </span>
        </div>
      </div>

      {/* ── Nudges ───────────────────────────────────── */}
      {nudges.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {nudges.map((nudge, i) => (
            <span key={i} className="px-3 py-1 rounded-full text-xs" style={{
              fontFamily: 'var(--font-mono)',
              background: nudge.includes('overdue') ? 'rgba(122,0,25,0.08)' : nudge.includes('blocked') ? 'rgba(122,0,25,0.06)' : 'rgba(201,168,76,0.08)',
              color: nudge.includes('overdue') ? 'var(--maroon)' : nudge.includes('blocked') ? 'var(--maroon)' : 'var(--gold)',
              border: `1px solid ${nudge.includes('overdue') || nudge.includes('blocked') ? 'rgba(122,0,25,0.15)' : 'rgba(201,168,76,0.15)'}`,
            }}>
              {nudge}
            </span>
          ))}
        </div>
      )}

      {/* ── Main Grid ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left Column — Tasks */}
        <div>
          <TaskSection
            title="Focus Now"
            icon={Flame}
            tasks={sections.focusNow}
            color="var(--maroon)"
            glow
            onComplete={handleComplete}
            onDefer={handleDefer}
          />
          <TaskSection
            title="Today"
            icon={Target}
            tasks={sections.today}
            color="var(--gold)"
            onComplete={handleComplete}
            onDefer={handleDefer}
          />
          <TaskSection
            title="This Week"
            icon={Zap}
            tasks={sections.thisWeek}
            color="var(--teal)"
            onComplete={handleComplete}
            onDefer={handleDefer}
          />
          {sections.backlog.length > 0 && (
            <TaskSection
              title="Backlog"
              icon={Archive}
              tasks={showBacklog ? sections.backlog : sections.backlog.slice(0, 5)}
              color="var(--slate)"
              defaultCollapsed
              onComplete={handleComplete}
              onDefer={handleDefer}
            />
          )}

          {/* ── Recently Completed ────────────────────── */}
          {sections.recentlyCompleted.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 mb-2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <CheckCircle2 size={14} style={{ color: 'var(--teal)', opacity: 0.5 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--slate)', opacity: 0.6 }}>
                  Recently Completed
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--teal)', opacity: 0.5 }}>
                  {sections.recentlyCompleted.length}
                </span>
                {showCompleted ? <ChevronDown size={12} style={{ color: 'var(--slate)', opacity: 0.4 }} /> : <ChevronRightIcon size={12} style={{ color: 'var(--slate)', opacity: 0.4 }} />}
              </button>
              <AnimatePresence>
                {showCompleted && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {sections.recentlyCompleted.map((task: any) => (
                      <CompletedTask key={task.id} task={task} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Right Column — Upcoming & Context */}
        <div className="space-y-5">
          {/* ── Meetings ───────────────────────────────── */}
          {meetings.length > 0 && (
            <UpcomingCard
              title="Meetings"
              icon={Users}
              items={meetings.map((m: any) => ({
                id: m.id,
                label: m.title,
                meta: formatShortDate(m.date),
                highlight: m.date === today,
                badge: m.agenda_count > 0 ? `${m.agenda_count} agenda` : undefined,
                subBadge: m.pending_actions > 0 ? `${m.pending_actions} actions` : undefined,
                link: `/meetings/${m.id}`,
              }))}
            />
          )}

          {/* ── Milestones ─────────────────────────────── */}
          {milestones.length > 0 && (
            <UpcomingCard
              title="Milestones"
              icon={Flag}
              items={milestones.map((m: any) => ({
                id: m.id,
                label: m.title,
                meta: formatShortDate(m.target_date),
                highlight: m.target_date && m.target_date <= today,
                note: m.future_note,
                projectLabel: m.project_title,
                link: m.project_slug ? `/projects/${m.project_slug}` : undefined,
              }))}
            />
          )}

          {/* ── Commitments ────────────────────────────── */}
          {commitments.length > 0 && (
            <UpcomingCard
              title="Commitments"
              icon={Handshake}
              items={commitments.map((c: any) => ({
                id: c.id,
                label: c.commitment,
                meta: c.due_date ? formatShortDate(c.due_date) : 'No date',
                highlight: c.due_date && c.due_date <= today,
                badge: c.to_whom,
              }))}
            />
          )}

          {/* ── Decisions Needing Review ────────────────── */}
          {decisionsForReview.length > 0 && (
            <UpcomingCard
              title="Decisions for Review"
              icon={Scale}
              items={decisionsForReview.map((d: any) => ({
                id: d.id,
                label: d.title,
                meta: `Decided ${formatShortDate(d.created_at.split('T')[0])}`,
                link: '/decisions',
              }))}
            />
          )}
        </div>
      </div>

      {/* ── Project Pulse ────────────────────────────── */}
      {projects.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
              Project Pulse
            </span>
            <div className="flex-1" style={{ height: 1, background: 'rgba(201,168,76,0.1)' }} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {projects.map((p: any) => (
              <Link to={`/projects/${p.slug}`} key={p.id} className="p-3 rounded-lg transition-colors hover:shadow-sm" style={{
                background: p.blocked_count > 0 ? 'rgba(122,0,25,0.04)' : 'rgba(201,168,76,0.03)',
                border: `1px solid ${p.blocked_count > 0 ? 'rgba(122,0,25,0.12)' : 'rgba(201,168,76,0.08)'}`,
                textDecoration: 'none',
              }}>
                <span className="line-clamp-2" style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600, color: 'var(--ink)', display: 'block', lineHeight: 1.3 }}>
                  {p.title}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: stageColor(p.stage) }}>{p.stage}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)' }}>{p.open_tasks}t</span>
                  {p.blocked_count > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--maroon)' }}>{p.blocked_count}b</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Upcoming Card Component ────────────────────────────────

interface UpcomingItem {
  id: string
  label: string
  meta: string
  highlight?: boolean
  badge?: string
  subBadge?: string
  note?: string
  projectLabel?: string
  link?: string
}

interface UpcomingCardProps {
  title: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  items: UpcomingItem[]
}

function UpcomingCard({ title, icon: Icon, items }: UpcomingCardProps) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(201,168,76,0.1)' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(201,168,76,0.04)' }}>
        <Icon size={13} style={{ color: 'var(--gold)', opacity: 0.7 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
          {title}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--slate)', opacity: 0.5 }}>
          {items.length}
        </span>
      </div>
      <div className="px-3 py-1">
        {items.map((item) => {
          const content = (
            <div
              key={item.id}
              className="py-2"
              style={{ borderBottom: '1px solid rgba(201,168,76,0.06)' }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <span className="block truncate" style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    color: item.highlight ? 'var(--maroon)' : 'var(--ink)',
                    fontWeight: item.highlight ? 600 : 400,
                  }}>
                    {item.label}
                  </span>
                  {item.projectLabel && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', opacity: 0.7 }}>
                      {item.projectLabel}
                    </span>
                  )}
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: item.highlight ? 'var(--maroon)' : 'var(--slate)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {item.meta}
                </span>
              </div>
              {(item.badge || item.subBadge) && (
                <div className="flex items-center gap-2 mt-1">
                  {item.badge && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--teal)', background: 'rgba(45,138,138,0.08)', padding: '1px 6px', borderRadius: 4 }}>
                      {item.badge}
                    </span>
                  )}
                  {item.subBadge && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.6 }}>
                      {item.subBadge}
                    </span>
                  )}
                </div>
              )}
              {item.note && (
                <div className="mt-1.5 px-2 py-1.5 rounded" style={{
                  background: 'rgba(201,168,76,0.04)',
                  borderLeft: '2px solid var(--gold)',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.4, display: 'block' }}>
                    {item.note}
                  </span>
                </div>
              )}
            </div>
          )

          return item.link ? (
            <Link key={item.id} to={item.link} style={{ textDecoration: 'none', display: 'block' }}>
              {content}
            </Link>
          ) : (
            <div key={item.id}>{content}</div>
          )
        })}
      </div>
    </div>
  )
}
