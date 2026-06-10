import { useState, useCallback, useMemo, useEffect, createContext, useContext } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings2, Plus, CalendarPlus, FolderPlus, Pin, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import DashboardGrid from '../components/dashboard/DashboardGrid'
import { resetLayouts } from '../lib/dashboardLayout'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { emailToSlug } from '../lib/emailSlug'
import { useMeetingsApi, useTasks, useExpiringRegulatory } from '../hooks/useApiData'
import { formatMediumDate, localDateKey } from '../lib/dateUtils'
import { isProductionVisible } from '../lib/isProductionVisible'
import { getUserRoleFromAuth, ROLE_DEFAULTS } from '../lib/roleDefaults'
import WelcomeBanner from '../components/WelcomeBanner'
import ReleaseRibbon from '../components/ReleaseRibbon'
import { PATHS } from '../constants/paths'
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
import StatusLine from '../components/dashboard/StatusLine'
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
  const role = getUserRoleFromAuth(user)
  const roleCards = useMemo(() => ROLE_DEFAULTS[role].dashboardCards, [role])

  // Defer non-critical queries until after first paint — lets the
  // shell/skeletons render immediately, then populate with data.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const { data: meetings = [] } = useMeetingsApi({ enabled: mounted })
  const { data: allTasks = [] } = useTasks(undefined, { enabled: mounted })

  // Find next upcoming meeting (today or tomorrow)
  const upcomingMeeting = useMemo(() => {
    const today = localDateKey()
    const tomorrow = localDateKey(new Date(Date.now() + 86400000))
    return meetings.find(m => m.date === today || m.date === tomorrow)
  }, [meetings])

  // Expiring regulatory items — drives RegulatoryAlertStrip
  const { data: rawRegulatory = [] } = useExpiringRegulatory(60)
  const expiringRegulatory = useMemo(
    () => rawRegulatory.filter((r: any) => isProductionVisible(r.title)),
    [rawRegulatory],
  )

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

  // Memoize card partitioning so DashboardGrid's `cards` prop is
  // referentially stable across renders that didn't actually change
  // the visible/pinned sets or the active tab. Also pre-compute the
  // `[{id}]` shape DashboardGrid wants so we don't rebuild those
  // objects each render (drives RGL layout recompute).
  const {
    pinnedVisibleCards,
    unpinnedPrimaryCards,
    unpinnedSecondaryCards,
    pinnedGridCards,
    primaryGridCards,
    secondaryGridCards,
  } = useMemo(() => {
    const visible = tabFilteredRegistry.filter(c => visibleCards.has(c.id))
    const pinned = visible.filter(c => pinnedCards.has(c.id))
    const unpinnedPrimary = sortByUsage(tabFilteredRegistry.filter(c => c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id)))
    const unpinnedSecondary = sortByUsage(tabFilteredRegistry.filter(c => !c.defaultVisible && visibleCards.has(c.id) && !pinnedCards.has(c.id)))
    return {
      pinnedVisibleCards: pinned,
      unpinnedPrimaryCards: unpinnedPrimary,
      unpinnedSecondaryCards: unpinnedSecondary,
      pinnedGridCards: pinned.map(c => ({ id: c.id })),
      primaryGridCards: unpinnedPrimary.map(c => ({ id: c.id })),
      secondaryGridCards: unpinnedSecondary.map(c => ({ id: c.id })),
    }
  }, [tabFilteredRegistry, visibleCards, pinnedCards, sortByUsage])

  // Stable slug for layout persistence per user
  const userSlug = emailToSlug(user?.email) || undefined

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

  return (
    <DashboardMountedContext.Provider value={mounted}>
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      <div className="content-container" style={{ paddingBottom: '4rem', maxWidth: '100%', minHeight: 'calc(100vh - 120px)' }}>
        {/* DD-#3: operational status chips replace the editorial greeting. */}
        {(() => {
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
                {/* Left: live dot + operational status chips (DD-#3 Option C) */}
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
                    aria-label="Live"
                  />
                  <StatusLine tasks={allTasks} loading={!mounted} />
                  <span style={{ color: 'var(--slate)', opacity: 0.55, fontSize: '12px', flexShrink: 0 }}>{'·'}</span>
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
                        // Active tab: theme-agnostic dark-gold fill + white
                        // text = 7.5:1 AA both themes. --gold flips
                        // (#6b5420 light / #dcb355 dark) so #1a1a1a text
                        // failed on light mode. r7 2026-04-22.
                        color: activeTab === tab.id ? '#fff' : 'var(--slate)',
                        backgroundColor: activeTab === tab.id ? 'var(--stage-fill-analysis)' : 'transparent',
                        opacity: activeTab === tab.id ? 1 : 0.85,
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
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
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
                          opacity: 0.75,
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
                      opacity: showCustomize ? 1 : 0.85,
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

        {/* DD-5: version-keyed release ribbon for "what shipped this week."
            Self-dismisses 7 days after first view; bumped CURRENT_RELEASE in
            ReleaseRibbon.tsx intentionally re-raises it. Sits above the
            WelcomeBanner (onboarding fallback for day-1 users only). */}
        <ReleaseRibbon />
        <WelcomeBanner />

        {/* Customize panel \u2014 R4-P3-01: pills split into Always-on vs
            Optional so 20 toggles don't present as a flat wall of
            choices. Claude Design called out that users can't tell
            what "CLIF Network" vs "Team Pulse" are until they enable
            them; the split tells them which four are core. */}
        {showCustomize && (() => {
          const ALWAYS_ON_IDS = new Set(['action-board', 'upcoming', 'pipeline', 'activity'])
          const alwaysOn = CARD_REGISTRY.filter(c => ALWAYS_ON_IDS.has(c.id))
          const optional = CARD_REGISTRY.filter(c => !ALWAYS_ON_IDS.has(c.id))
          const renderPill = (card: typeof CARD_REGISTRY[number]) => (
            <div key={card.id} className="flex items-center gap-1">
              <button
                onClick={() => toggleCard(card.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border"
                style={{
                  color: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--slate)',
                  backgroundColor: visibleCards.has(card.id) ? 'var(--teal-active)' : 'transparent',
                  borderColor: visibleCards.has(card.id) ? 'var(--teal)' : 'var(--border-subtle)',
                  cursor: 'pointer',
                  opacity: visibleCards.has(card.id) ? 1 : 0.85,
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
                    opacity: pinnedCards.has(card.id) ? 1 : 0.85,
                  }}
                  title={pinnedCards.has(card.id) ? 'Unpin' : 'Pin to top'}
                >
                  <Pin size={14} />
                </button>
              )}
            </div>
          )
          return (
            <div
              data-testid="customize-panel"
              className="rounded-xl border p-4 mb-3 customize-panel"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                  Toggle cards visible on your dashboard
                </p>
                <button
                  onClick={() => {
                    setShowCustomize(false)
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium"
                  style={{
                    color: 'var(--ink-bright, #fff)',
                    background: 'var(--teal-solid)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 0.85, letterSpacing: '0.06em' }}>
                  Core - recommended
                </p>
                <div className="flex flex-wrap gap-2">
                  {alwaysOn.map(renderPill)}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 0.85, letterSpacing: '0.06em' }}>
                  Optional - turn on as needed
                </p>
                <div className="flex flex-wrap gap-2">
                  {optional.map(renderPill)}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── STRATUM 2: QuickCapture + contextual alerts + cards ── */}
        {/* Quick Capture + Actions */}
        <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <QuickCaptureBar noMargin />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              to={`${PATHS.myTasks}?create=true`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors portal-footer-link"
              style={{ color: 'var(--ink-bright, #fff)', backgroundColor: 'var(--teal-solid)', textDecoration: 'none' }}
            >
              <Plus size={12} />
              Task
            </Link>
            <Link
              to={PATHS.meetings}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5 portal-footer-link"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <CalendarPlus size={12} />
              Meeting
            </Link>
            <Link
              to={`${PATHS.ideas}?create=true`}
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
            to={PATHS.meetingPrep(upcomingMeeting.id)}
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
                {upcomingMeeting.date === localDateKey() ? 'Meeting today' : 'Meeting tomorrow'}: {upcomingMeeting.title}
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
            to={PATHS.personal}
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
              cards={pinnedGridCards}
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
              cards={primaryGridCards}
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
                  opacity: 0.85,
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
                    cards={secondaryGridCards}
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
                    opacity: 0.85,
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
          opacity: 0.85;
          transition: opacity 120ms ease, color 120ms ease;
        }
        .dashboard-reset-layout:hover { opacity: 1; color: var(--ink); }

        .customize-panel { background-color: var(--teal-hover); }
        .dark .customize-panel { background-color: var(--teal-hover); }
        .dark .dashboard-tabs { background: var(--hover-light) !important; }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 4px rgba(34, 197, 94, 0.2); }
        }
      `}</style>
    </div>
    </DashboardMountedContext.Provider>
  )
}
