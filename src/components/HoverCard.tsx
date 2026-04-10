import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderKanban, Clock, Flag, Circle, CheckCircle2, Ban, BookOpen } from 'lucide-react'
import { getPersonInfo } from '../data/team'
import { formatRelativeTime } from '../lib/dateUtils'
import { STATUS_CONFIG, PRIORITY_CONFIG, STAGE_COLORS } from '../lib/taskConstants'

// ── Types ────────────────────────────────────────────────────

interface ProjectCardData {
  type: 'project'
  title: string
  stage?: string
  status?: string
  pi?: string
  category?: string
  description?: string
  updated_at?: string
  team?: string[]
}

interface MemberCardData {
  type: 'member'
  name: string
  role?: string
  photoUrl?: string
  initials: string
  expertise?: string[]
  publicationCount?: number
}

interface TaskCardData {
  type: 'task'
  title: string
  status?: string
  priority?: string
  assignee?: string
  due_date?: string | null
}

export type HoverCardData = ProjectCardData | MemberCardData | TaskCardData

interface HoverCardProps {
  data: HoverCardData
  isVisible: boolean
  position: { x: number; y: number; placement: 'above' | 'below' }
  cardRef: React.RefObject<HTMLDivElement | null>
  cardHandlers: {
    onMouseEnter: () => void
    onMouseLeave: () => void
  }
}

// ── Status helpers ───────────────────────────────────────────

const STATUS_ICON_MAP: Record<string, typeof Circle> = {
  Circle,
  Clock,
  CheckCircle2,
  Ban,
}

function getStatusConfig(status: string): { color: string; icon: typeof Circle; label: string } | undefined {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
  if (!cfg) return undefined
  return { color: cfg.color, icon: STATUS_ICON_MAP[cfg.icon] || Circle, label: cfg.label }
}

function getPriorityColor(priority: string): string {
  return PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG]?.color || 'var(--slate)'
}

// ── Mini avatar (24px) ──────────────────────────────────────

function MiniAvatar({ slug }: { slug: string }) {
  const info = getPersonInfo(slug)
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        background: info.photoUrl ? 'transparent' : 'rgba(201, 168, 76, 0.15)',
        border: '1px solid rgba(201, 168, 76, 0.2)',
        fontSize: '9px',
        color: 'var(--gold)',
        fontWeight: 500,
      }}
      title={info.name}
    >
      {info.photoUrl ? (
        <img src={info.photoUrl} alt={info.name} className="w-full h-full rounded-full object-cover" loading="lazy" />
      ) : (
        info.initials
      )}
    </div>
  )
}

// ── Stage badge ─────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] || 'var(--slate)'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        fontWeight: 400,
        letterSpacing: '0.04em',
      }}
    >
      {stage}
    </span>
  )
}

// ── Status badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = getStatusConfig(status)
  if (!config) return null
  const Icon = config.icon
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ color: config.color, fontWeight: 400 }}
    >
      <Icon size={11} />
      {config.label}
    </span>
  )
}

// ── Priority indicator ──────────────────────────────────────

function PriorityDot({ priority }: { priority: string }) {
  const color = getPriorityColor(priority)
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] capitalize"
      style={{ color, fontWeight: 400 }}
    >
      <Flag size={10} />
      {priority}
    </span>
  )
}

// ── Card variants ───────────────────────────────────────────

function ProjectContent({ data }: { data: ProjectCardData }) {
  const piInfo = data.pi ? getPersonInfo(data.pi) : null
  return (
    <div className="flex flex-col gap-2.5">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <FolderKanban size={14} style={{ color: 'var(--teal)', marginTop: 2, flexShrink: 0, opacity: 0.8 }} />
        <span
          className="text-[13px] leading-tight"
          style={{ color: 'var(--ink)', fontWeight: 400 }}
        >
          {data.title}
        </span>
      </div>

      {/* Stage + category row */}
      <div className="flex items-center gap-2 flex-wrap">
        {data.stage && <StageBadge stage={data.stage} />}
        {data.category && (
          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
            {data.category}
          </span>
        )}
      </div>

      {/* Description snippet */}
      {data.description && (
        <p
          className="text-[11px] leading-relaxed line-clamp-2"
          style={{ color: 'var(--slate)', opacity: 0.7, fontWeight: 400, margin: 0 }}
        >
          {data.description}
        </p>
      )}

      {/* Bottom row: PI + team avatars + activity */}
      <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          {piInfo && (
            <div className="flex items-center gap-1.5">
              <MiniAvatar slug={data.pi!} />
              <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                {piInfo.name.split(' ')[0]}
              </span>
            </div>
          )}
          {data.team && data.team.length > 0 && (
            <div className="flex -space-x-1.5">
              {data.team.slice(0, 3).map((slug) => (
                <MiniAvatar key={slug} slug={slug} />
              ))}
              {data.team.length > 3 && (
                <span className="text-[9px] pl-1" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  +{data.team.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        {data.updated_at && (
          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.4 }}>
            {formatRelativeTime(data.updated_at)}
          </span>
        )}
      </div>
    </div>
  )
}

function MemberContent({ data }: { data: MemberCardData }) {
  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{
          background: data.photoUrl ? 'transparent' : 'rgba(201, 168, 76, 0.15)',
          border: '1px solid rgba(201, 168, 76, 0.25)',
          fontSize: '12px',
          color: 'var(--gold)',
          fontWeight: 500,
        }}
      >
        {data.photoUrl ? (
          <img src={data.photoUrl} alt={data.name} className="w-full h-full rounded-full object-cover" loading="lazy" />
        ) : (
          data.initials
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div>
          <div
            className="text-[13px] leading-tight"
            style={{ color: 'var(--ink)', fontWeight: 400 }}
          >
            {data.name}
          </div>
          {data.role && (
            <div className="text-[11px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
              {data.role}
            </div>
          )}
        </div>

        {/* Expertise tags */}
        {data.expertise && data.expertise.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.expertise.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex px-1.5 py-0.5 rounded text-[9px]"
                style={{
                  color: 'var(--teal)',
                  background: 'rgba(45, 138, 138, 0.1)',
                  border: '1px solid rgba(45, 138, 138, 0.15)',
                  fontWeight: 400,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Publication count */}
        {data.publicationCount !== undefined && data.publicationCount > 0 && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            <BookOpen size={10} />
            {data.publicationCount} publication{data.publicationCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function TaskContent({ data }: { data: TaskCardData }) {
  const assigneeInfo = data.assignee ? getPersonInfo(data.assignee) : null
  return (
    <div className="flex flex-col gap-2.5">
      {/* Title */}
      <span
        className="text-[13px] leading-tight"
        style={{ color: 'var(--ink)', fontWeight: 400 }}
      >
        {data.title}
      </span>

      {/* Status + priority row */}
      <div className="flex items-center gap-3">
        {data.status && <StatusBadge status={data.status} />}
        {data.priority && <PriorityDot priority={data.priority} />}
      </div>

      {/* Bottom row: assignee + due */}
      <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        {assigneeInfo && (
          <div className="flex items-center gap-1.5">
            <MiniAvatar slug={data.assignee!} />
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.6 }}>
              {assigneeInfo.name.split(' ')[0]}
            </span>
          </div>
        )}
        {data.due_date && (
          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
            Due {formatRelativeTime(data.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main HoverCard ──────────────────────────────────────────

export default function HoverCard({ data, isVisible, position, cardRef, cardHandlers }: HoverCardProps) {
  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: position.placement === 'below' ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: position.placement === 'below' ? -4 : 4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
          onMouseEnter={cardHandlers.onMouseEnter}
          onMouseLeave={cardHandlers.onMouseLeave}
          style={{
            position: 'fixed',
            left: position.x,
            top: position.placement === 'below' ? position.y : undefined,
            bottom: position.placement === 'above' ? `${window.innerHeight - position.y}px` : undefined,
            zIndex: 9999,
            maxWidth: 320,
            width: 'max-content',
            minWidth: 240,
            padding: '12px 16px',
            backgroundColor: '#111820',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-elevated), 0 8px 32px rgba(0, 0, 0, 0.3)',
            pointerEvents: 'auto',
            // Force dark text colors inside the card regardless of page theme
            '--ink': '#e2e8f0',
            '--slate': '#94a3b8',
            '--border-subtle': 'rgba(255, 255, 255, 0.06)',
          } as React.CSSProperties}
        >
          {data.type === 'project' && <ProjectContent data={data} />}
          {data.type === 'member' && <MemberContent data={data} />}
          {data.type === 'task' && <TaskContent data={data} />}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
