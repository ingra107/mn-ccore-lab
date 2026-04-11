import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings2, Plus, CalendarPlus, FolderPlus, Pin, RotateCcw, Clock, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { useMeetingsApi, useTasks } from '../hooks/useApiData'
import { formatMediumDate } from '../lib/dateUtils'
import { getUserRole, ROLE_DEFAULTS } from '../lib/roleDefaults'
import WelcomeBanner from '../components/WelcomeBanner'
import PageTooltip from '../components/PageTooltip'
import PipelineCard from '../components/dashboard/PipelineCard'
import StatsCard from '../components/dashboard/StatsCard'
import UpcomingCard from '../components/dashboard/UpcomingCard'
import ActivityFeedCard from '../components/dashboard/ActivityFeedCard'
import GrantTimelineCard from '../components/dashboard/GrantTimelineCard'
import CLIFMiniCard from '../components/dashboard/CLIFMiniCard'
import TopicBubblesCard from '../components/dashboard/TopicBubblesCard'
import ActionBoardCard from '../components/dashboard/ActionBoardCard'
import YourWeekCard from '../components/dashboard/YourWeekCard'
import ProjectHealthCard from '../components/dashboard/ProjectHealthCard'
import MyItemsCard from '../components/dashboard/MyItemsCard'
import TeamPulseCard from '../components/dashboard/TeamPulseCard'
import InsightsCard from '../components/dashboard/InsightsCard'
import WeeklyProgressCard from '../components/dashboard/WeeklyProgressCard'
import QuickWinsCard from '../components/dashboard/QuickWinsCard'
import PomodoroStatsCard from '../components/dashboard/PomodoroStatsCard'
import EmailDraftsCard from '../components/dashboard/EmailDraftsCard'
import ProactiveBriefCard from '../components/dashboard/ProactiveBriefCard'
import SystemHealthMiniCard from '../components/dashboard/SystemHealthMiniCard'
import FileActivityCard from '../components/dashboard/FileActivityCard'
import QuickCaptureBar from '../components/QuickCaptureBar'

// Tab categories for card filtering
type DashboardTab = 'overview' | 'projects' | 'people' | 'deadlines'

const TAB_CONFIG: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'people', label: 'People' },
  { id: 'deadlines', label: 'Deadlines' },
]

// Card-to-tab mapping: which tabs each card appears in (overview = all visible)
const CARD_TABS: Record<string, DashboardTab[]> = {
  'action-board': ['overview', 'deadlines'],
  'upcoming': ['overview', 'deadlines'],
  'project-health': ['overview', 'projects'],
  'pipeline': ['overview', 'projects'],
  'activity': ['overview', 'people'],
  'stats': ['overview'],
  'team-pulse': ['overview', 'people'],
  'grants': ['overview', 'projects', 'deadlines'],
  'my-items': ['overview', 'deadlines'],
  'clif': ['overview', 'projects'],
  'topics': ['overview', 'projects'],
  'insights': ['overview', 'projects'],
  'weekly-progress': ['overview', 'deadlines'],
  'quick-wins': ['overview', 'deadlines'],
  'pomodoro-stats': ['overview'],
  'email-drafts': ['overview', 'deadlines'],
  'proactive-brief': ['overview'],
  'system-health': ['overview'],
  'file-activity': ['overview', 'projects'],
}

// Card registry — order matters for default layout
const CARD_REGISTRY = [
  { id: 'your-week', label: 'Your Week', component: YourWeekCard, defaultVisible: true },
  { id: 'action-board', label: 'Action Board', component: ActionBoardCard, defaultVisible: true },
  { id: 'upcoming', label: 'Upcoming Meeting', component: UpcomingCard, defaultVisible: true },
  { id: 'project-health', label: 'Project Health', component: ProjectHealthCard, defaultVisible: true },
  { id: 'pipeline', label: 'Research Pipeline', component: PipelineCard, defaultVisible: true },
  { id: 'activity', label: 'Activity Feed', component: ActivityFeedCard, defaultVisible: true },
  { id: 'stats', label: 'Quick Stats', component: StatsCard, defaultVisible: true },
  { id: 'team-pulse', label: 'Team Pulse', component: TeamPulseCard, defaultVisible: false },
  { id: 'grants', label: 'Grant Timeline', component: GrantTimelineCard, defaultVisible: false },
  { id: 'my-items', label: 'My Items', component: MyItemsCard, defaultVisible: false },
  { id: 'clif', label: 'CLIF Network', component: CLIFMiniCard, defaultVisible: false },
  { id: 'topics', label: 'Research Topics', component: TopicBubblesCard, defaultVisible: false },
  { id: 'insights', label: 'Cross-Project Insights', component: InsightsCard, defaultVisible: false },
  { id: 'weekly-progress', label: 'Weekly Progress', component: WeeklyProgressCard, defaultVisible: true },
  { id: 'quick-wins', label: 'Quick Wins', component: QuickWinsCard, defaultVisible: true },
  { id: 'pomodoro-stats', label: 'Focus Time', component: PomodoroStatsCard, defaultVisible: false },
  { id: 'email-drafts', label: 'Email Drafts', component: EmailDraftsCard, defaultVisible: false },
  { id: 'proactive-brief', label: 'Your Brief', component: ProactiveBriefCard, defaultVisible: true },
  { id: 'system-health', label: 'System Health', component: SystemHealthMiniCard, defaultVisible: false },
  { id: 'file-activity', label: 'File Activity', component: FileActivityCard, defaultVisible: false },
] as const

const STORAGE_KEY = 'mnccore-dashboard-cards'
const PINNED_KEY = 'mnccore-dashboard-pinned'
const DEFAULTS_VERSION_KEY = 'mnccore-dashboard-version'
const CLICKS_KEY = 'mnccore-dashboard-clicks'
const TAB_KEY = 'mnccore-dashboard-tab'
const ORDER_KEY = 'mnccore-dashboard-order'
const CURRENT_DEFAULTS_VERSION = 4 // bump to reset localStorage to new defaults

// ── Adaptive sorting helpers ──────────────────────────────

function getClickCounts(): Record<string, number> {
  try {
    const stored = localStorage.getItem(CLICKS_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* use defaults */ }
  return {}
}

function recordCardClick(cardId: string) {
  const counts = getClickCounts()
  counts[cardId] = (counts[cardId] || 0) + 1
  localStorage.setItem(CLICKS_KEY, JSON.stringify(counts))
}

function getSavedTab(): DashboardTab {
  try {
    const stored = localStorage.getItem(TAB_KEY) as DashboardTab
    if (stored && TAB_CONFIG.some(t => t.id === stored)) return stored
  } catch { /* use default */ }
  return 'overview'
}

function getPinnedCards(): Set<string> {
  try {
    const stored = localStorage.getItem(PINNED_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* use defaults */ }
  return new Set()
}

function getCardOrder(): string[] {
  try {
    const stored = localStorage.getItem(ORDER_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* use defaults */ }
  return []
}

function applyCardOrder<T extends { id: string }>(cards: T[], order: string[]): T[] {
  if (order.length === 0) return cards
  const orderMap = new Map(order.map((id, i) => [id, i]))
  return [...cards].sort((a, b) => {
    const ai = orderMap.get(a.id)
    const bi = orderMap.get(b.id)
    if (ai === undefined && bi === undefined) return 0
    if (ai === undefined) return 1
    if (bi === undefined) return -1
    return ai - bi
  })
}

function getVisibleCards(roleCards?: string[]): Set<string> {
  try {
    // Reset localStorage if defaults version changed
    const storedVersion = localStorage.getItem(DEFAULTS_VERSION_KEY)
    if (storedVersion && Number(storedVersion) < CURRENT_DEFAULTS_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PINNED_KEY)
      localStorage.setItem(DEFAULTS_VERSION_KEY, String(CURRENT_DEFAULTS_VERSION))
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* use defaults */ }
  // Role-based defaults when no localStorage preferences exist
  localStorage.setItem(DEFAULTS_VERSION_KEY, String(CURRENT_DEFAULTS_VERSION))
  if (roleCards) return new Set(roleCards)
  return new Set(CARD_REGISTRY.filter(c => c.defaultVisible).map(c => c.id))
}

function SortableCardWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 'var(--z-dropdown)' : ('auto' as const),
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="group/drag">
      <button
        {...listeners}
        className="absolute top-2 left-2 opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        style={{
          background: 'rgba(15,25,35,0.06)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--sp-xs)',
          color: 'var(--slate)',
          zIndex: 'var(--z-sticky)',
        }}
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </button>
      {children}
    </div>
  )
}

export default function Dashboard() {
  usePageMeta(
    'Dashboard | MN-CCORE Lab',
    'Research command center for MN-CCORE. Track active projects, grant timelines, action items, and collaboration metrics across the consortium.'
  )
  const { user } = useAuth()
  const role = getUserRole(user?.email)
  const roleCards = useMemo(() => ROLE_DEFAULTS[role].dashboardCards, [role])
  const { data: meetings = [] } = useMeetingsApi()
  const { data: allTasks = [] } = useTasks()

  // Today's progress summary
  const todayProgress = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const completedToday = allTasks.filter(t => t.completed_at && t.completed_at.startsWith(todayStr)).length
    const dueToday = allTasks.filter(t => !t.completed && t.due_date === todayStr).length
    return { completedToday, dueToday }
  }, [allTasks])

  // Find next upcoming meeting (today or tomorrow)
  const upcomingMeeting = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]
    return meetings.find(m => m.date === today || m.date === tomorrow)
  }, [meetings])

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [showMore, setShowMore] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<string>>(() => getVisibleCards(roleCards))
  const [pinnedCards, setPinnedCards] = useState<Set<string>>(getPinnedCards)
  const [activeTab, setActiveTab] = useState<DashboardTab>(getSavedTab)
  const [clickCounts, setClickCounts] = useState<Record<string, number>>(getClickCounts)
  const [cardOrder, setCardOrder] = useState<string[]>(getCardOrder)
  const adaptive = useMemo(() => Object.values(clickCounts).some(c => c > 2), [clickCounts])

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab)
    localStorage.setItem(TAB_KEY, tab)
  }, [])

  const handleCardInteraction = useCallback((cardId: string) => {
    recordCardClick(cardId)
    setClickCounts(getClickCounts())
  }, [])

  const resetAdaptive = useCallback(() => {
    localStorage.removeItem(CLICKS_KEY)
    setClickCounts({})
  }, [])

  const toggleCard = useCallback((id: string) => {
    setVisibleCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
    // Also unpin if hiding a card
    setPinnedCards(prev => {
      if (prev.has(id) && visibleCards.has(id)) {
        // Card is being toggled off — remove from pinned
        const next = new Set(prev)
        next.delete(id)
        localStorage.setItem(PINNED_KEY, JSON.stringify([...next]))
        return next
      }
      return prev
    })
  }, [visibleCards])

  const togglePin = useCallback((id: string) => {
    setPinnedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(PINNED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  // Filter by active tab, then sort adaptively
  const sortByUsage = useCallback((cards: typeof CARD_REGISTRY[number][]) => {
    if (!adaptive) return cards
    return [...cards].sort((a, b) => (clickCounts[b.id] || 0) - (clickCounts[a.id] || 0))
  }, [adaptive, clickCounts])

  const handleCardDragEnd = useCallback((sectionCards: typeof CARD_REGISTRY[number][], event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sectionCards.findIndex(c => c.id === active.id)
    const newIndex = sectionCards.findIndex(c => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Build full order from current visual arrangement
    const reordered = arrayMove(sectionCards, oldIndex, newIndex)
    const newOrder = reordered.map(c => c.id)

    // Merge into existing order: replace positions of this section's cards
    setCardOrder(_prev => {
      // Start with all card IDs in current order
      const allIds = CARD_REGISTRY.map(c => c.id)
      // Build full order: keep previous positions, override section cards
      const sectionIds = new Set(sectionCards.map(c => c.id))
      const nonSection = allIds.filter(id => !sectionIds.has(id))
      const full = [...nonSection]
      // Insert reordered section cards at their new positions
      newOrder.forEach(id => full.push(id))
      localStorage.setItem(ORDER_KEY, JSON.stringify(full))
      return full
    })
  }, [])

  const tabFilteredRegistry = useMemo(
    () => CARD_REGISTRY.filter(c => {
      if (activeTab === 'overview') return true
      return (CARD_TABS[c.id] || ['overview']).includes(activeTab)
    }),
    [activeTab]
  )

  const allVisibleCards = tabFilteredRegistry.filter(c => visibleCards.has(c.id))
  const pinnedVisibleCards = applyCardOrder(allVisibleCards.filter(c => pinnedCards.has(c.id)), cardOrder)
  const unpinnedPrimaryCards = applyCardOrder(sortByUsage(tabFilteredRegistry.filter(c => c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id))), cardOrder)
  const unpinnedSecondaryCards = applyCardOrder(sortByUsage(tabFilteredRegistry.filter(c => !c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id))), cardOrder)

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    const firstName = user?.email?.split('@')[0]?.split('.')[0]
    const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : null
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    return name ? `${timeGreeting}, ${name}` : timeGreeting
  }, [user])

  return (
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <div className="content-container" style={{ paddingBottom: '4rem', maxWidth: '100%' }}>
        {/* Page Header */}
        <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '1.5rem', paddingTop: '0.25rem' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-circle)',
                  background: 'var(--green-light)',
                  boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)',
                  animation: 'status-pulse 2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--slate)',
                  opacity: 0.6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Live overview
              </span>
            </div>

            {/* Customize button */}
            <button
              data-testid="dashboard-customize"
              onClick={() => setShowCustomize(!showCustomize)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                color: showCustomize ? 'var(--teal)' : 'var(--slate)',
                backgroundColor: showCustomize ? 'rgba(45,138,138,0.08)' : 'transparent',
                border: '1px solid',
                borderColor: showCustomize ? 'var(--teal)' : 'var(--border-light)',
                cursor: 'pointer',
                opacity: showCustomize ? 1 : 0.6,
              }}
            >
              <Settings2 size={12} />
              Customize
            </button>
            <PageTooltip id="dashboard-filter-hint" text="Press F to toggle filters on any page" />
          </div>

          <h1
            style={{
              fontWeight: 600,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.15,
              letterSpacing: 'var(--tracking-display)',
            }}
          >
            {greeting}
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--muted)',
              marginTop: '6px',
              maxWidth: '520px',
            }}
          >
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {todayProgress.completedToday > 0 && <> · <span style={{ color: 'var(--green)' }}>{todayProgress.completedToday} done today</span></>}
            {todayProgress.dueToday > 0 && <> · <span style={{ color: 'var(--teal)' }}>{todayProgress.dueToday} due today</span></>}
          </p>

          {/* Gold rule */}
          <div
            style={{
              height: '1px',
              background: 'linear-gradient(to right, var(--gold), transparent)',
              opacity: 0.3,
              marginTop: '1.25rem',
            }}
          />
        </div>

        {/* Notion-style tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: 'var(--radius-lg)', background: 'rgba(15,25,35,0.03)' }}>
            {TAB_CONFIG.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-lg)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--ink)' : 'var(--slate)',
                  backgroundColor: activeTab === tab.id ? 'var(--gold)' : 'transparent',
                  opacity: activeTab === tab.id ? 1 : 0.6,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Adaptive sorting indicator */}
          {adaptive && activeTab === 'overview' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.55 }}>
                Organized by your usage
              </span>
              <button
                onClick={resetAdaptive}
                title="Reset to default order"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--slate)',
                  opacity: 0.3,
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <RotateCcw size={10} />
              </button>
            </div>
          )}
        </div>

        {/* Welcome banner (first-visit onboarding) */}
        <WelcomeBanner />

        {/* Overdue alert banner */}
        {(() => {
          const overdue = allTasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date())
          if (overdue.length === 0) return null
          return (
            <div
              className="mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border"
              style={{
                background: 'rgba(122,0,25,0.04)',
                borderColor: 'rgba(122,0,25,0.15)',
              }}
            >
              <Clock size={16} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <span className="text-sm" style={{ color: 'var(--ink)' }}>
                  <strong style={{ color: 'var(--maroon)' }}>{overdue.length}</strong> overdue task{overdue.length !== 1 ? 's' : ''} need attention
                </span>
                {overdue.length <= 3 && (
                  <span className="text-[11px] ml-2" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                    {overdue.map(t => t.title || t.description).join(' · ')}
                  </span>
                )}
              </div>
              <a
                href="/my-tasks"
                className="text-[11px] px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                style={{ color: 'var(--maroon)', background: 'rgba(122,0,25,0.08)', textDecoration: 'none' }}
              >
                View
              </a>
            </div>
          )
        })()}

        {/* Customize panel */}
        {showCustomize && (
          <div
            data-testid="customize-panel"
            className="rounded-xl border p-4 mb-4 customize-panel"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--ink)' }}>
              Toggle cards visible on your dashboard
            </p>
            <div className="flex flex-wrap gap-2">
              {CARD_REGISTRY.map(card => (
                <div key={card.id} className="flex items-center gap-1">
                  <button
                    onClick={() => toggleCard(card.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border"
                    style={{
                      color: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--slate)',
                      backgroundColor: visibleCards.has(card.id) ? 'rgba(45,138,138,0.08)' : 'transparent',
                      borderColor: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--border-light)',
                      cursor: 'pointer',
                      opacity: visibleCards.has(card.id) ? 1 : 0.5,
                    }}
                  >
                    {visibleCards.has(card.id) ? '\u2713' : '+'} {card.label}
                  </button>
                  {visibleCards.has(card.id) && (
                    <button
                      onClick={() => togglePin(card.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 'var(--sp-xs)',
                        color: pinnedCards.has(card.id) ? 'var(--gold)' : 'var(--slate)',
                        opacity: pinnedCards.has(card.id) ? 1 : 0.3,
                      }}
                      title={pinnedCards.has(card.id) ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meeting Prep Banner */}
        {upcomingMeeting && (
          <Link
            to={`/meetings/${upcomingMeeting.id}/prep`}
            className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(45,138,138,0.06) 100%)',
              border: '1px solid rgba(201,168,76,0.2)',
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <Clock size={18} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <div className="flex-1">
              <div style={{ fontSize: '13px', fontWeight: 500 }}>
                {upcomingMeeting.date === new Date().toISOString().split('T')[0] ? 'Meeting today' : 'Meeting tomorrow'}: {upcomingMeeting.title}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {formatMediumDate(upcomingMeeting.date)}
              </div>
            </div>
            <span
              className="px-3 py-1 rounded-lg text-[11px] font-medium"
              style={{ backgroundColor: 'var(--gold)', color: '#0f1923' }}
            >
              Prepare
            </span>
          </Link>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 mb-4 flex-wrap">
          <Link
            to="/tasks?create=true"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ color: 'var(--ink-bright, #fff)', backgroundColor: 'var(--teal)', textDecoration: 'none' }}
          >
            <Plus size={14} />
            New Task
          </Link>
          <Link
            to="/meetings"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
          >
            <CalendarPlus size={14} />
            Schedule Meeting
          </Link>
          <Link
            to="/ideas?create=true"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
          >
            <FolderPlus size={14} />
            Submit Idea
          </Link>
        </div>

        {/* Quick Capture */}
        <QuickCaptureBar />

        {/* Pinned Cards — always at the top */}
        {pinnedVisibleCards.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Pin size={14} style={{ color: 'var(--gold)' }} />
              <span
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--gold)',
                }}
              >
                Pinned
              </span>
            </div>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCardDragEnd(pinnedVisibleCards, e)}>
              <SortableContext items={pinnedVisibleCards.map(c => c.id)} strategy={rectSortingStrategy}>
                <div className="bento-grid">
                  {pinnedVisibleCards.map(card => {
                    const Card = card.component
                    return (
                      <SortableCardWrapper key={card.id} id={card.id}>
                        <div data-testid={`card-${card.id}`} className="relative group" onClick={() => handleCardInteraction(card.id)}>
                          <Card />
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePin(card.id) }}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              background: 'rgba(201,168,76,0.15)',
                              border: 'none',
                              borderRadius: 'var(--radius-md)',
                              padding: 'var(--sp-xs)',
                              cursor: 'pointer',
                              color: 'var(--gold)',
                            }}
                            title="Unpin"
                          >
                            <Pin size={12} />
                          </button>
                        </div>
                      </SortableCardWrapper>
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Primary Cards — always visible (unpinned) */}
        {unpinnedPrimaryCards.length > 0 && (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCardDragEnd(unpinnedPrimaryCards, e)}>
            <SortableContext items={unpinnedPrimaryCards.map(c => c.id)} strategy={rectSortingStrategy}>
              <div className="bento-grid">
                {unpinnedPrimaryCards.map(card => {
                  const Card = card.component
                  return (
                    <SortableCardWrapper key={card.id} id={card.id}>
                      <div data-testid={`card-${card.id}`} className="relative group" onClick={() => handleCardInteraction(card.id)}>
                        <Card />
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePin(card.id) }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pin-btn"
                          style={{
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--sp-xs)',
                            cursor: 'pointer',
                            color: 'var(--slate)',
                            opacity: 0.5,
                          }}
                          title="Pin to top"
                        >
                          <Pin size={12} />
                        </button>
                      </div>
                    </SortableCardWrapper>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Secondary Cards — behind "Show more" (unpinned) */}
        {unpinnedSecondaryCards.length > 0 && (
          <>
            {!showMore && (
              <button
                onClick={() => setShowMore(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-medium transition-colors border"
                style={{
                  color: 'var(--slate)',
                  borderColor: 'var(--border-subtle)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
              >
                <ChevronDown size={14} />
                Show {unpinnedSecondaryCards.length} more card{unpinnedSecondaryCards.length > 1 ? 's' : ''}
              </button>
            )}

            {showMore && (
              <>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCardDragEnd(unpinnedSecondaryCards, e)}>
                  <SortableContext items={unpinnedSecondaryCards.map(c => c.id)} strategy={rectSortingStrategy}>
                    <div className="bento-grid mt-4">
                      {unpinnedSecondaryCards.map(card => {
                        const Card = card.component
                        return (
                          <SortableCardWrapper key={card.id} id={card.id}>
                            <div data-testid={`card-${card.id}`} className="relative group" onClick={() => handleCardInteraction(card.id)}>
                              <Card />
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePin(card.id) }}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pin-btn"
                                style={{
                                  border: 'none',
                                  borderRadius: 'var(--radius-md)',
                                  padding: 'var(--sp-xs)',
                                  cursor: 'pointer',
                                  color: 'var(--slate)',
                                  opacity: 0.5,
                                }}
                                title="Pin to top"
                              >
                                <Pin size={12} />
                              </button>
                            </div>
                          </SortableCardWrapper>
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>

                <button
                  onClick={() => setShowMore(false)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    color: 'var(--slate)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: 0.5,
                  }}
                >
                  <ChevronUp size={14} />
                  Show less
                </button>
              </>
            )}
          </>
        )}

        {/* Empty state if all cards hidden */}
        {pinnedVisibleCards.length === 0 && unpinnedPrimaryCards.length === 0 && unpinnedSecondaryCards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              All cards are hidden. Click "Customize" to add cards back.
            </p>
          </div>
        )}
      </div>

      {/* Inline styles for bento grid + animations */}
      <style>{`
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-auto-rows: minmax(200px, auto);
          gap: 1.25rem;
          max-width: 100%;
          overflow: hidden;
        }

        .bento-grid > * {
          min-width: 0;
          overflow: hidden;
        }

        .bento-span-2 {
          grid-column: span 2;
        }

        .bento-span-2x2 {
          grid-column: span 2;
          grid-row: span 2;
        }

        .bento-span-1x2 {
          grid-row: span 2;
        }

        /* Tablet: 2 columns */
        @media (max-width: 1024px) {
          .bento-grid {
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: minmax(180px, auto);
          }
          .bento-span-2x2 {
            grid-column: span 2;
            grid-row: span 2;
          }
          .bento-span-2 {
            grid-column: span 2;
          }
          .bento-span-1x2 {
            grid-row: span 2;
          }
        }

        /* Mobile: 1 column */
        @media (max-width: 640px) {
          .bento-grid {
            grid-template-columns: 1fr;
            grid-auto-rows: minmax(160px, auto);
            gap: 0.75rem;
          }
          .bento-span-2,
          .bento-span-2x2,
          .bento-span-1x2 {
            grid-column: span 1;
            grid-row: span 1;
          }
          .bento-card {
            padding: 1rem 1rem !important;
            border-radius: 12px !important;
          }
        }

        /* Dark mode card overrides */
        .dark .bento-card {
          background-color: var(--cream) !important;
          background-image: linear-gradient(var(--surface-2), var(--surface-2)) !important;
          border-color: var(--border-subtle) !important;
        }

        .dark .bento-card:hover {
          background-image: linear-gradient(var(--surface-3), var(--surface-3)) !important;
        }

        /* Pin button background — light/dark */
        .pin-btn { background: rgba(15,25,35,0.05); }
        .dark .pin-btn { background: rgba(255,255,255,0.08); }

        /* Drag handle — light/dark */
        .group\\/drag > button:first-child { background: rgba(15,25,35,0.06); }
        .dark .group\\/drag > button:first-child { background: rgba(255,255,255,0.08); }

        /* Customize panel — light/dark */
        .customize-panel { background-color: rgba(45,138,138,0.02); }
        .dark .customize-panel { background-color: rgba(45,138,138,0.06); }

        /* Dark mode tab background */
        .dark .dashboard-tabs { background: rgba(255,255,255,0.04) !important; }

        /* Status pulse for header */
        @keyframes status-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          50% { opacity: 0.6; box-shadow: 0 0 4px rgba(34, 197, 94, 0.2); }
        }
      `}</style>
    </div>
  )
}
