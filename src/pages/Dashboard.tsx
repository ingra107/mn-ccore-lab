import { useState, useCallback, useMemo, useEffect, createContext, useContext } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings2, Plus, CalendarPlus, FolderPlus, Pin, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import DashboardGrid from '../components/dashboard/DashboardGrid'
import { resetLayouts } from '../lib/dashboardLayout'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { useMeetingsApi, useTasks, useExpiringRegulatory } from '../hooks/useApiData'
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
import LabHealthScore from '../components/dashboard/LabHealthScore'
import QuickCaptureBar from '../components/QuickCaptureBar'

// Context to defer non-critical queries until after first paint
export const DashboardMountedContext = createContext(false)
export function useDashboardMounted() { return useContext(DashboardMountedContext) }

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

export default function Dashboard() {
  usePageMeta(
    'Dashboard | MN-CCORE Lab',
    'Research command center for MN-CCORE. Track active projects, grant timelines, action items, and collaboration metrics across the consortium.'
  )
  const { user } = useAuth()
  const role = getUserRole(user?.email)
  const roleCards = useMemo(() => ROLE_DEFAULTS[role].dashboardCards, [role])

  // Defer non-critical queries until after first paint — lets the
  // shell/skeletons render immediately, then populate with data.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { data: meetings = [] } = useMeetingsApi({ enabled: mounted })
  const { data: allTasks = [] } = useTasks(undefined, { enabled: mounted })

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

  // Expiring regulatory items — drives RegulatoryAlertStrip
  const { data: expiringRegulatory = [] } = useExpiringRegulatory(60)

  const headerRef = useScrollReveal<HTMLDivElement>()
  const [showMore, setShowMore] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [visibleCards, setVisibleCards] = useState<Set<string>>(() => getVisibleCards(roleCards))
  const [pinnedCards, setPinnedCards] = useState<Set<string>>(getPinnedCards)
  const [activeTab, setActiveTab] = useState<DashboardTab>(getSavedTab)
  const [clickCounts, setClickCounts] = useState<Record<string, number>>(getClickCounts)
  const adaptive = useMemo(() => Object.values(clickCounts).some(c => c > 2), [clickCounts])

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

  const tabFilteredRegistry = useMemo(
    () => CARD_REGISTRY.filter(c => {
      if (activeTab === 'overview') return true
      return (CARD_TABS[c.id] || ['overview']).includes(activeTab)
    }),
    [activeTab]
  )

  const allVisibleCards = tabFilteredRegistry.filter(c => visibleCards.has(c.id))
  const pinnedVisibleCards = allVisibleCards.filter(c => pinnedCards.has(c.id))
  const unpinnedPrimaryCards = sortByUsage(tabFilteredRegistry.filter(c => c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id)))
  const unpinnedSecondaryCards = sortByUsage(tabFilteredRegistry.filter(c => !c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id)))

  // Stable slug for layout persistence per user
  const userSlug = user?.email?.split('@')[0] ?? undefined

  // Build GridCard arrays for DashboardGrid — per-section storage
  const cardLookup = useMemo(() => {
    const map = new Map<string, typeof CARD_REGISTRY[number]>()
    CARD_REGISTRY.forEach(c => map.set(c.id, c))
    return map
  }, [])

  const renderCard = useCallback((id: string) => {
    const entry = cardLookup.get(id)
    if (!entry) return null
    const Card = entry.component
    return <Card />
  }, [cardLookup])

  const renderPinOverlay = useCallback((id: string) => (
    <button
      onClick={(e) => { e.stopPropagation(); togglePin(id) }}
      className="dashboard-pin-btn"
      title="Unpin"
      aria-label="Unpin card"
    >
      <Pin size={12} />
    </button>
  ), [togglePin])

  const renderUnpinOverlay = useCallback((id: string) => (
    <button
      onClick={(e) => { e.stopPropagation(); togglePin(id) }}
      className="dashboard-pin-btn dashboard-pin-btn--inactive"
      title="Pin to top"
      aria-label="Pin card"
    >
      <Pin size={12} />
    </button>
  ), [togglePin])

  const resetLayout = useCallback(() => {
    resetLayouts('pinned', userSlug)
    resetLayouts('primary', userSlug)
    resetLayouts('secondary', userSlug)
    // Force a remount by toggling a key — cheapest way to reload RGL defaults
    window.location.reload()
  }, [userSlug])

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    const firstName = user?.email?.split('@')[0]?.split('.')[0]
    const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : null
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
    return name ? `${timeGreeting}, ${name}` : timeGreeting
  }, [user])

  return (
    <DashboardMountedContext.Provider value={mounted}>
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <div className="content-container" style={{ paddingBottom: '4rem', maxWidth: '100%', minHeight: 'calc(100vh - 120px)' }}>
        {/* ── STRATUM 1: Greeting + Tabs + Customize (single row) ── */}
        {(() => {
          const overdue = allTasks.filter(t => !t.completed && t.due_date && new Date(t.due_date + 'T23:59:59') < new Date())
          return (
            <div ref={headerRef} className="fade-in-up" style={{ marginBottom: '0.625rem', paddingTop: '0.25rem' }}>
              {/* Row A: greeting stats + tabs + customize */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: '40px',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: live dot + greeting + inline stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 'var(--radius-circle)',
                      background: 'var(--green-light)',
                      boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)',
                      animation: 'status-pulse 2s ease-in-out infinite',
                      flexShrink: 0,
                    }}
                  />
                  <h1
                    style={{
                      fontWeight: 600,
                      fontSize: 'clamp(1.1rem, 2.5vw, 1.4rem)',
                      color: 'var(--ink)',
                      lineHeight: 1.2,
                      letterSpacing: 'var(--tracking-display)',
                      whiteSpace: 'nowrap',
                      margin: 0,
                    }}
                  >
                    {greeting}
                  </h1>
                  <span style={{ color: 'var(--slate)', opacity: 0.35, fontSize: '14px', flexShrink: 0 }}>·</span>
                  <span style={{ fontSize: '13px', color: 'var(--slate)', opacity: 0.65, whiteSpace: 'nowrap' }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                  {todayProgress.completedToday > 0 && (
                    <>
                      <span style={{ color: 'var(--slate)', opacity: 0.35, fontSize: '14px', flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: '12px', color: 'var(--green)', whiteSpace: 'nowrap' }}>{todayProgress.completedToday} done</span>
                    </>
                  )}
                  {todayProgress.dueToday > 0 && (
                    <>
                      <span style={{ color: 'var(--slate)', opacity: 0.35, fontSize: '14px', flexShrink: 0 }}>·</span>
                      <span style={{ fontSize: '12px', color: 'var(--teal)', whiteSpace: 'nowrap' }}>{todayProgress.dueToday} due</span>
                    </>
                  )}
                  {overdue.length > 0 && (
                    <>
                      <span style={{ color: 'var(--slate)', opacity: 0.35, fontSize: '14px', flexShrink: 0 }}>·</span>
                      <a
                        href="/my-tasks"
                        className="portal-footer-link"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', whiteSpace: 'nowrap' }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 'var(--radius-circle)',
                            background: 'var(--maroon)',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--maroon)' }}>{overdue.length} overdue</span>
                      </a>
                    </>
                  )}
                  <span style={{ color: 'var(--slate)', opacity: 0.35, fontSize: '14px', flexShrink: 0 }}>·</span>
                  <LabHealthScore />
                </div>

                {/* Center: tabs */}
                <div className="dashboard-tabs" style={{ display: 'flex', gap: '2px', padding: '2px', borderRadius: 'var(--radius-lg)', background: 'var(--surface-1)', flexShrink: 0 }}>
                  {TAB_CONFIG.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-lg)',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: activeTab === tab.id ? 600 : 400,
                        color: activeTab === tab.id ? 'var(--ink)' : 'var(--slate)',
                        backgroundColor: activeTab === tab.id ? 'var(--gold)' : 'transparent',
                        opacity: activeTab === tab.id ? 1 : 0.6,
                        cursor: 'pointer',
                        transition: 'color 150ms ease, background-color 150ms ease, opacity 150ms ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Right: adaptive indicator + customize + tooltip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {adaptive && activeTab === 'overview' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                  <button
                    data-testid="dashboard-customize"
                    onClick={() => setShowCustomize(!showCustomize)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      color: showCustomize ? 'var(--teal)' : 'var(--slate)',
                      backgroundColor: showCustomize ? 'var(--teal-active)' : 'transparent',
                      border: '1px solid',
                      borderColor: showCustomize ? 'var(--teal)' : 'var(--border-subtle)',
                      cursor: 'pointer',
                      opacity: showCustomize ? 1 : 0.6,
                    }}
                  >
                    <Settings2 size={12} />
                    Customize
                  </button>
                  <span className="hidden md:block">
                    <PageTooltip id="dashboard-filter-hint" text="Press F to toggle filters on any page" />
                  </span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Welcome banner (first-visit onboarding — conditional, rarely shown) */}
        <WelcomeBanner />

        {/* Customize panel */}
        {showCustomize && (
          <div
            data-testid="customize-panel"
            className="rounded-xl border p-4 mb-3 customize-panel"
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
                      backgroundColor: visibleCards.has(card.id) ? 'var(--teal-active)' : 'transparent',
                      borderColor: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--border-subtle)',
                      cursor: 'pointer',
                      opacity: visibleCards.has(card.id) ? 1 : 0.5,
                    }}
                  >
                    {visibleCards.has(card.id) ? '\u2713' : '+'} {card.label}
                  </button>
                  {visibleCards.has(card.id) && (
                    <button
                      onClick={() => togglePin(card.id)}
                      aria-label={pinnedCards.has(card.id) ? 'Unpin card' : 'Pin card to top'}
                      className="flex items-center justify-center"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        minHeight: 44,
                        minWidth: 44,
                        color: pinnedCards.has(card.id) ? 'var(--gold)' : 'var(--slate)',
                        opacity: pinnedCards.has(card.id) ? 1 : 0.3,
                      }}
                      title={pinnedCards.has(card.id) ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STRATUM 2: QuickCapture + contextual alerts + cards ── */}
        {/* Quick Capture + Actions */}
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <QuickCaptureBar noMargin />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              to="/tasks?create=true"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors portal-footer-link"
              style={{ color: 'var(--ink-bright, #fff)', backgroundColor: 'var(--teal)', textDecoration: 'none' }}
            >
              <Plus size={12} />
              Task
            </Link>
            <Link
              to="/meetings"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5 portal-footer-link"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <CalendarPlus size={12} />
              Meeting
            </Link>
            <Link
              to="/ideas?create=true"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5 portal-footer-link"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <FolderPlus size={12} />
              Idea
            </Link>
          </div>
        </div>

        {/* Contextual alerts (conditional — quiet by default)
            CLS fix R7: reserve 56px slot so async mount of meeting/regulatory alerts
            doesn't shift the bento grid below. Covers max-one-alert common case. */}
        <div style={{ minHeight: '56px', contain: 'layout' }}>
        {upcomingMeeting && (
          <Link
            to={`/meetings/${upcomingMeeting.id}/prep`}
            className="flex items-center gap-3 mb-2 px-4 py-3 rounded-xl transition-all"
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

        {expiringRegulatory.length > 0 && (
          <Link
            to="/personal"
            className="flex items-center gap-3 mb-2 px-4 py-2.5 rounded-xl"
            style={{
              background: 'var(--maroon-hover)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '3px solid var(--maroon)',
              textDecoration: 'none',
              color: 'var(--ink)',
              transition: 'background-color 150ms ease',
            }}
          >
            <AlertTriangle size={15} style={{ color: 'var(--maroon)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--maroon)' }}>
              {expiringRegulatory.length} regulatory item{expiringRegulatory.length > 1 ? 's' : ''} expiring within 60 days
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>
              View details →
            </span>
          </Link>
        )}
        </div>

        {/* Pinned Cards — always at the top */}
        {pinnedVisibleCards.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Pin size={14} style={{ color: 'var(--gold)' }} />
              <h2
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--gold)',
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Pinned
              </h2>
              <button
                type="button"
                onClick={resetLayout}
                className="dashboard-reset-layout"
                title="Reset all dashboard layouts to defaults"
              >
                <RotateCcw size={11} /> Reset layout
              </button>
            </div>
            <DashboardGrid
              section="pinned"
              userSlug={userSlug}
              cards={pinnedVisibleCards.map(c => ({ id: c.id }))}
              onCardClick={handleCardInteraction}
              renderCard={renderCard}
              renderOverlay={renderPinOverlay}
            />
          </div>
        )}

        {/* Primary Cards — always visible (unpinned) */}
        {unpinnedPrimaryCards.length > 0 && (
          <div>
            <h2 className="sr-only">Dashboard cards</h2>
            <DashboardGrid
              section="primary"
              userSlug={userSlug}
              cards={unpinnedPrimaryCards.map(c => ({ id: c.id }))}
              onCardClick={handleCardInteraction}
              renderCard={renderCard}
              renderOverlay={renderUnpinOverlay}
            />
          </div>
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
                <div className="mt-4">
                  <DashboardGrid
                    section="secondary"
                    userSlug={userSlug}
                    cards={unpinnedSecondaryCards.map(c => ({ id: c.id }))}
                    onCardClick={handleCardInteraction}
                    renderCard={renderCard}
                    renderOverlay={renderUnpinOverlay}
                  />
                </div>

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

      {/* Inline styles for cards + animations (grid layout is owned by DashboardGrid) */}
      <style>{`
        /* Mobile tab row hotfix */
        @media (max-width: 640px) {
          .bento-card {
            padding: 1rem 1rem !important;
            border-radius: 12px !important;
          }
          .dashboard-tabs {
            order: 10;
            width: 100%;
            overflow-x: auto;
            flex-wrap: nowrap !important;
            scrollbar-width: none;
          }
          .dashboard-tabs::-webkit-scrollbar { display: none; }
          .dashboard-tabs > button { flex-shrink: 0; }
        }

        /* Dark mode card overrides */
        .dark .bento-card {
          background-color: var(--surface-card) !important;
          border-color: var(--border-subtle) !important;
        }
        .dark .bento-card:hover {
          background-image: linear-gradient(var(--surface-3), var(--surface-3)) !important;
        }

        /* Pin button (overlay on each DashboardGrid card) */
        .dashboard-pin-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: var(--radius-md);
          background: rgba(15, 25, 35, 0.05);
          color: var(--gold);
          cursor: pointer;
          opacity: 0;
          transition: opacity 120ms ease, background 120ms ease;
          z-index: 3;
        }
        .dashboard-grid-item:hover .dashboard-pin-btn,
        .dashboard-grid-item:focus-within .dashboard-pin-btn {
          opacity: 1;
        }
        .dashboard-pin-btn--inactive {
          color: var(--slate);
          opacity: 0;
        }
        .dark .dashboard-pin-btn { background: rgba(255, 255, 255, 0.08); }

        /* "Reset layout" link in section header */
        .dashboard-reset-layout {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
          padding: 2px 8px;
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--slate);
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 120ms ease, color 120ms ease;
        }
        .dashboard-reset-layout:hover { opacity: 1; color: var(--ink); }

        .customize-panel { background-color: var(--teal-hover); }
        .dark .customize-panel { background-color: var(--teal-hover); }
        .dark .dashboard-tabs { background: var(--hover-light) !important; }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          50% { opacity: 0.6; box-shadow: 0 0 4px rgba(34, 197, 94, 0.2); }
        }
      `}</style>
    </div>
    </DashboardMountedContext.Provider>
  )
}
