import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp, Settings2, Plus, CalendarPlus, FolderPlus, Pin, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import DashboardGrid from '../components/dashboard/DashboardGrid'
import { Button } from '../components/ui/Button'
import { DASHBOARD_SECTIONS, resetLayouts } from '../lib/dashboardLayout'
import { useUserPref, useUserPrefsStatus } from '../hooks/useUserPref'
import { usePageMeta } from '../hooks/usePageMeta'
import { useAuth } from '../hooks/useAuth'
import { useMeetingsApi, useRecentTasks, useExpiringRegulatory, usePublications } from '../hooks/useApiData'
import PageHeader from '../components/PageHeader'
import { countPublications } from '../lib/publicationCounts'
import { formatMediumDate, localDateKey } from '../lib/dateUtils'
import { isProductionVisible } from '../lib/isProductionVisible'
import { getUserRoleFromAuth, ROLE_DEFAULTS } from '../lib/roleDefaults'
import WelcomeBanner from '../components/WelcomeBanner'
import ReleaseRibbon from '../components/ReleaseRibbon'
import { PATHS, PUBLIC_PATHS } from '../constants/paths'
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
import WeeklyProgressCard from '../components/dashboard/WeeklyProgressCard'
import QuickWinsCard from '../components/dashboard/QuickWinsCard'
import PomodoroStatsCard from '../components/dashboard/PomodoroStatsCard'
import ProactiveBriefCard from '../components/dashboard/ProactiveBriefCard'
import SystemHealthMiniCard from '../components/dashboard/SystemHealthMiniCard'
import FileActivityCard from '../components/dashboard/FileActivityCard'
import LabHealthScore from '../components/dashboard/LabHealthScore'
import StatusLine from '../components/dashboard/StatusLine'
import QuickCaptureBar from '../components/QuickCaptureBar'
import { PANEL_BG, withAlpha } from '../lib/taskGrouping'
import { DashboardMountedContext } from '../components/dashboard/dashboardMounted'

// Tab categories for card filtering
type DashboardTab = 'overview' | 'projects' | 'people' | 'deadlines'

const TAB_CONFIG: { id: DashboardTab; label: string }[] = [
  // Not "Overview": the host's own first tab already says that. This control
  // only filters which cards show, so its first option reads "All cards".
  { id: 'overview', label: 'All cards' },
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
  'weekly-progress': ['overview', 'deadlines'],
  'quick-wins': ['overview', 'deadlines'],
  'pomodoro-stats': ['overview'],
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
  { id: 'my-items', label: 'Meeting action items', component: MyItemsCard, defaultVisible: false },
  { id: 'clif', label: 'CLIF Network', component: CLIFMiniCard, defaultVisible: false },
  { id: 'topics', label: 'Research Topics', component: TopicBubblesCard, defaultVisible: false },
  { id: 'weekly-progress', label: 'Weekly Progress', component: WeeklyProgressCard, defaultVisible: true },
  { id: 'quick-wins', label: 'Quick Wins', component: QuickWinsCard, defaultVisible: true },
  { id: 'pomodoro-stats', label: 'Focus Time', component: PomodoroStatsCard, defaultVisible: false },
  { id: 'proactive-brief', label: 'Your Brief', component: ProactiveBriefCard, defaultVisible: true },
  { id: 'system-health', label: 'System Health', component: SystemHealthMiniCard, defaultVisible: false },
  { id: 'file-activity', label: 'File Activity', component: FileActivityCard, defaultVisible: false },
] as const

// Which cards show, which are pinned and the active tab are per-person prefs
// ('dashboard.cards' / 'dashboard.pinned' / 'dashboard.tab', useUserPref), so
// the Lab overview looks the same on every device (PB #911). The card click
// counts stay in this browser: they are usage telemetry, not a choice.
// A stored set that still names a retired card (the Cross-Project Insights
// card, id 'insights', left 2026-10-13) is ignored: the card lists filter on
// the registry and reconcileLayouts() drops layout entries for unknown cards.
const CLICKS_KEY = 'mnccore-dashboard-clicks'
const NO_PINS: string[] = []

const asIdList = (stored: unknown): string[] =>
  Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : NO_PINS
const asTab = (stored: unknown): DashboardTab =>
  TAB_CONFIG.some(t => t.id === stored) ? (stored as DashboardTab) : 'overview'

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

export default function Dashboard() {
  usePageMeta(
    'Lab Overview · MN-CCORE',
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
  const { data: allTasks = [] } = useRecentTasks(undefined, { enabled: mounted })

  // Find next upcoming meeting (today or tomorrow). Date.now() is an
  // intentional snapshot at memoize time (recomputes when `meetings`
  // changes) — not a per-render purity concern in practice.
  const upcomingMeeting = useMemo(() => {
    const today = localDateKey()
    // eslint-disable-next-line react-hooks/purity -- deliberate snapshot, see comment above
    const tomorrow = localDateKey(new Date(Date.now() + 86400000))
    return meetings.find(m => m.date === today || m.date === tomorrow)
  }, [meetings])

  // Expiring regulatory items — drives RegulatoryAlertStrip
  const { data: rawRegulatory = [] } = useExpiringRegulatory(60)
  const expiringRegulatory = useMemo(
    () => rawRegulatory.filter((r: { title: string }) => isProductionVisible(r.title)),
    [rawRegulatory],
  )

  const [showMore, setShowMore] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  // Role-based defaults when the person has never chosen cards.
  const defaultCards = useMemo(
    () => roleCards ?? CARD_REGISTRY.filter(c => c.defaultVisible).map(c => c.id),
    [roleCards],
  )
  const [visibleList, setVisibleList] = useUserPref<string[]>('dashboard.cards', defaultCards, asIdList)
  const [pinnedList, setPinnedList] = useUserPref<string[]>('dashboard.pinned', NO_PINS, asIdList)
  const [activeTab, setActiveTab] = useUserPref<DashboardTab>('dashboard.tab', 'overview', asTab)
  const visibleCards = useMemo(() => new Set(visibleList), [visibleList])
  const pinnedCards = useMemo(() => new Set(pinnedList), [pinnedList])
  // The grids read their saved layout once, at mount. Remount them when the
  // first server read answers, so a layout arranged on the other laptop shows.
  const prefsStatus = useUserPrefsStatus()
  const [layoutResets, setLayoutResets] = useState(0)
  const gridRev = `${prefsStatus === 'loading' ? 'cached' : 'server'}-${layoutResets}`
  const [clickCounts, setClickCounts] = useState<Record<string, number>>(getClickCounts)
  const adaptive = useMemo(() => Object.values(clickCounts).some(c => c > 2), [clickCounts])

  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab)
  }, [setActiveTab])

  const handleCardInteraction = useCallback((cardId: string) => {
    recordCardClick(cardId)
    setClickCounts(getClickCounts())
  }, [])

  const resetAdaptive = useCallback(() => {
    localStorage.removeItem(CLICKS_KEY)
    setClickCounts({})
  }, [])

  const toggleCard = useCallback((id: string) => {
    const hiding = visibleCards.has(id)
    setVisibleList(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]))
    // Hiding a card also unpins it.
    if (hiding && pinnedCards.has(id)) setPinnedList(prev => prev.filter(c => c !== id))
  }, [visibleCards, pinnedCards, setVisibleList, setPinnedList])

  const togglePin = useCallback((id: string) => {
    setPinnedList(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]))
  }, [setPinnedList])

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

  // The lab's one telling number (color-back pick 2): papers published. Same
  // count the Publication Pipeline card shows; links to that filtered list.
  const { data: publications } = usePublications()
  const publishedCount = publications ? countPublications(publications).published : undefined

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
    <Button size="icon"
      onClick={(e) => { e.stopPropagation(); togglePin(id) }}
      className="dashboard-pin-btn"
      title="Unpin"
      aria-label="Unpin card"
    >
      <Pin size={12} strokeWidth={1.5} absoluteStrokeWidth />
    </Button>
  ), [togglePin])

  const renderUnpinOverlay = useCallback((id: string) => (
    <Button size="icon"
      onClick={(e) => { e.stopPropagation(); togglePin(id) }}
      className="dashboard-pin-btn dashboard-pin-btn--inactive"
      title="Pin to top"
      aria-label="Pin card"
    >
      <Pin size={12} strokeWidth={1.5} absoluteStrokeWidth />
    </Button>
  ), [togglePin])

  const resetLayout = useCallback(() => {
    for (const section of DASHBOARD_SECTIONS) resetLayouts(section)
    // Remount the grids so they read the defaults. Not a page reload: that
    // would cancel the reset before it reached the server.
    setLayoutResets(n => n + 1)
  }, [])

  return (
    <DashboardMountedContext.Provider value={mounted}>
    <div style={{ minHeight: '100vh', overflowX: 'hidden' }}>
      {/* P1-1 (Nick 2026-06-10): the band is universal — Lab Overview shares the
          same centered band + left edge as every other page. The old
          maxWidth:'100%' override is gone. Since 2026-10-10 (principle 17) the
          card grid stops at --page-width like every page; no exception. */}
      <div className="content-container" data-customizing={showCustomize || undefined} style={{ paddingBottom: '4rem', minHeight: 'calc(100vh - 120px)' }}>
        {/* Title, the hero number and the heartbeat line (color-back picks 2, 10). */}
        <PageHeader
          title="Lab overview"
          hero={publishedCount !== undefined
            ? { value: publishedCount, label: 'published', to: `${PUBLIC_PATHS.publications}?status=Published`, dest: 'Publications filtered to published' }
            : undefined}
        />
        {/* DD-#3: operational status chips replace the editorial greeting. */}
        {(() => {
          return (
            <div style={{ marginBottom: '0.625rem', paddingTop: '0.25rem' }}>
              {/* One wrapping row. Desktop: stats, lab health, card filter, then
                  Customize pushed right. Phone: stats on their own row, then lab
                  health beside Customize, then the card filter. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: '40px',
                  gap: '10px 22px',
                  flexWrap: 'wrap',
                }}
              >
                <div className="dash-stats-wrap" style={{ minWidth: 0 }}>
                  <StatusLine tasks={allTasks} loading={!mounted} />
                </div>
                <LabHealthScore />

                {/* Card filter (Wave 3): flat text, the chosen one underlined in
                    the accent. Still one tablist, so the keyboard and the saved
                    choice work as before. */}
                <div className="dashboard-tabs-wrap">
                  <div role="tablist" aria-label="Filter cards" className="bento-flt">
                    {TAB_CONFIG.map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={activeTab === tab.id ? 'bento-flt-on' : undefined}
                        onClick={() => handleTabChange(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right: adaptive indicator + customize + tooltip */}
                <div className="dash-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: 'auto' }}>
                  {adaptive && activeTab === 'overview' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--slate)', opacity: 0.75 }}>
                        Organized by your usage
                      </span>
                      <Button size="icon" aria-label="Reset to default order"
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
                        <RotateCcw size={10} strokeWidth={1.5} absoluteStrokeWidth />
                      </Button>
                    </div>
                  )}
                  <button
                    data-testid="dashboard-customize"
                    onClick={() => setShowCustomize(!showCustomize)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                    style={{
                      color: showCustomize ? 'var(--job-accent)' : 'var(--slate)',
                      backgroundColor: showCustomize ? 'color-mix(in srgb, var(--job-accent) 10%, transparent)' : 'transparent',
                      border: '1px solid',
                      borderColor: showCustomize ? 'var(--job-accent)' : 'var(--border-subtle)',
                      cursor: 'pointer',
                      opacity: showCustomize ? 1 : 0.85,
                    }}
                  >
                    <Settings2 size={12} strokeWidth={1.5} absoluteStrokeWidth />
                    Customize
                  </button>
                  {/* The one-time "Press F to toggle filters" hint lived here as a
                      floating layer; it covered the 'This week' banner (#8973) and its
                      text was wrong on this page (F is focus mode here, filters only on
                      task pages). The shortcut stays listed in ShortcutHelp ('?'). */}
                </div>
              </div>
            </div>
          )
        })()}

        {/* DD-5: version-keyed release ribbon for "what shipped this week."
            Self-dismisses 7 days after first view; bumped CURRENT_RELEASE in
            ReleaseRibbon.tsx intentionally re-raises it. Sits above the
            WelcomeBanner (onboarding fallback for day-1 users only). */}
        {/* One banner at a time (Wave 3): the first one that renders wins. The
            welcome note is first so a day-1 user sees it, then the ribbon. */}
        <div className="dash-banners">
          <WelcomeBanner />
          <ReleaseRibbon />
        </div>

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
                className={`tk-btn tk-sm${visibleCards.has(card.id) ? ' tk-sel' : ''}`}
              >
                {visibleCards.has(card.id) ? '\u2713' : '+'} {card.label}
              </button>
              {visibleCards.has(card.id) && (
                <Button size="icon"
                  onClick={() => togglePin(card.id)}
                  aria-label={pinnedCards.has(card.id) ? 'Unpin card' : 'Pin card to top'}
                  className="flex items-center justify-center"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    minHeight: 44,
                    minWidth: 44,
                    color: pinnedCards.has(card.id) ? 'var(--job-accent)' : 'var(--slate)',
                    opacity: pinnedCards.has(card.id) ? 1 : 0.85,
                  }}
                  title={pinnedCards.has(card.id) ? 'Unpin' : 'Pin to top'}
                >
                  <Pin size={14} strokeWidth={1.5} absoluteStrokeWidth />
                </Button>
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
                    // No scrollTo — user clicked "Done" where their eyes are;
                    // yanking to top (#39 sweep, 2026-06-16) violates click-stays-put rule.
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium"
                  style={{
                    color: 'var(--sk-card)',
                    background: 'var(--job-accent)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
              <div className="mb-4">
                <p className="text-[10px] tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 0.85, letterSpacing: '0.06em' }}>
                  Core - recommended
                </p>
                <div className="flex flex-wrap gap-2">
                  {alwaysOn.map(renderPill)}
                </div>
              </div>
              <div>
                <p className="text-[10px] tracking-wider mb-2" style={{ color: 'var(--slate)', opacity: 0.85, letterSpacing: '0.06em' }}>
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
            <Button
              as={Link}
              to={`${PATHS.myTasks}?create=true`}
              variant="primary"
              className="transition-colors portal-footer-link"
              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, borderRadius: 'var(--radius-lg)', textDecoration: 'none' }}
            >
              <Plus size={12} strokeWidth={1.5} absoluteStrokeWidth />
              Task
            </Button>
            <Button
              as={Link}
              to={PATHS.meetings}
              variant="secondary"
              className="transition-colors hover:bg-black/5 dark:hover:bg-white/5 portal-footer-link"
              style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 500, borderRadius: 'var(--radius-lg)', textDecoration: 'none' }}
            >
              <CalendarPlus size={12} strokeWidth={1.5} absoluteStrokeWidth />
              Meeting
            </Button>
            <Link
              to={`${PATHS.ideasTab}&create=true`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border hover:bg-black/5 dark:hover:bg-white/5 portal-footer-link"
              style={{ color: 'var(--slate)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <FolderPlus size={12} strokeWidth={1.5} absoluteStrokeWidth />
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
              background: upcomingMeeting.date === localDateKey() ? 'color-mix(in srgb, var(--job-wants) 8%, transparent)' : 'color-mix(in srgb, var(--sk-t1) 3%, transparent)',
              border: `1px solid ${upcomingMeeting.date === localDateKey() ? 'color-mix(in srgb, var(--job-wants) 25%, transparent)' : 'var(--sk-line2)'}`,
              textDecoration: 'none',
              color: 'var(--ink)',
            }}
          >
            <Clock size={18} strokeWidth={1.5} absoluteStrokeWidth style={{ color: upcomingMeeting.date === localDateKey() ? 'var(--job-wants)' : 'var(--sk-t3)', flexShrink: 0 }} />
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
              style={{ backgroundColor: 'var(--stage-fill-analysis)', color: '#fff' }}
            >
              Prepare
            </span>
          </Link>
        )}

        {expiringRegulatory.length > 0 && (
          <Link
            to={`${PATHS.deadlines}#regulatory`}
            className="flex items-center gap-3 mb-2 px-4 py-2.5 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--job-stale) 6%, transparent)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '3px solid var(--job-stale)',
              textDecoration: 'none',
              color: 'var(--ink)',
              transition: 'background-color 150ms ease',
            }}
          >
            <AlertTriangle size={15} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--job-stale)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--job-stale)' }}>
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
              <Pin size={14} strokeWidth={1.5} absoluteStrokeWidth style={{ color: 'var(--sk-t3)' }} />
              <h2
                style={{
                  fontSize: '12px',
                  color: 'var(--sk-t2)',
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Pinned
              </h2>
              <button
                type="button"
                onClick={resetLayout}
                className="dashboard-reset-layout hit-area"
                title="Reset all dashboard layouts to defaults"
              >
                <RotateCcw size={11} strokeWidth={1.5} absoluteStrokeWidth /> Reset layout
              </button>
            </div>
            <DashboardGrid
              key={`pinned-${gridRev}`}
              section="pinned"
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
              key={`primary-${gridRev}`}
              section="primary"
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
                <ChevronDown size={14} strokeWidth={1.5} absoluteStrokeWidth />
                Show {unpinnedSecondaryCards.length} more card{unpinnedSecondaryCards.length > 1 ? 's' : ''}
              </button>
            )}

            {showMore && (
              <>
                <div className="mt-4">
                  <DashboardGrid
                    key={`secondary-${gridRev}`}
                    section="secondary"
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
                  <ChevronUp size={14} strokeWidth={1.5} absoluteStrokeWidth />
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
        /* Show only the first banner that rendered (the banners set their own display inline). */
        .dash-banners > * ~ * { display: none !important; }

        /* Mobile header: stats fill their own row as 2 x 2 (no lone 4th stat),
           lab health and Customize share the next row, the filter sits last. */
        @media (max-width: 640px) {
          .dash-stats-wrap { flex: 1 1 100%; }
          .tk .tk-stats.dash-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
          .dash-controls { margin-left: auto; }
          .dashboard-tabs-wrap { order: 10; flex: 1 1 100%; overflow-x: auto; scrollbar-width: none; }
          .dashboard-tabs-wrap::-webkit-scrollbar { display: none; }
        }
        @media (max-width: 640px) {
          .bento-card {
            padding: 1rem 1rem !important;
            border-radius: 12px !important;
          }
        }

        /* Dark mode card overrides */
        .dark .bento-card {
          background-color: var(--surface-card) !important;
          border-color: var(--border-subtle) !important;
        }
        .dark .bento-card:hover {
          background-image: linear-gradient(color-mix(in srgb, var(--sk-t1) 10%, transparent), color-mix(in srgb, var(--sk-t1) 10%, transparent)) !important;
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
          background: ${withAlpha(PANEL_BG, 5)};
          color: var(--sk-t3);
          cursor: pointer;
          opacity: 0;
          /* Invisible means untouchable: a hidden pin takes no pointer events,
             so no width, display or tap-target rule elsewhere can give an
             unseen control a hit area over the card's own tabs (G8-01). */
          pointer-events: none;
          transition: opacity 120ms ease, background 120ms ease;
          z-index: 3;
        }
        .dashboard-grid-item:hover .dashboard-pin-btn,
        .dashboard-grid-item:focus-within .dashboard-pin-btn,
        .dashboard-pin-btn:focus-visible {
          opacity: 1;
          pointer-events: auto;
        }
        .dashboard-pin-btn--inactive {
          color: var(--slate);
        }
        .dark .dashboard-pin-btn { background: rgba(255, 255, 255, 0.08); }
        /* Touch has no hover, so the pin stayed invisible yet still took taps:
           on a phone its 44px box sat over Project Health's Heatmap tab and
           ate every tap (G8-01, 2026-10-14). A hover-only overlay does not
           exist on touch (the N1.07 rule in index.css); Customize carries the
           pin toggle there, at 44px. */
        @media (hover: none) {
          .dashboard-grid-item .dashboard-pin-btn { display: none; }
        }

        /* "Reset layout" link in section header */
        .dashboard-reset-layout {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
          padding: 2px 8px;
          font-size: 10px;
          letter-spacing: 0.04em;
          color: var(--slate);
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          cursor: pointer;
          opacity: 0.85;
          transition: opacity 120ms ease, color 120ms ease;
        }
        .dashboard-reset-layout:hover { opacity: 1; color: var(--ink); }

        .customize-panel { background-color: color-mix(in srgb, var(--sk-t1) 3%, transparent); }
        .dark .customize-panel { background-color: color-mix(in srgb, var(--sk-t1) 3%, transparent); }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px color-mix(in srgb, var(--job-accent) 40%, transparent); }
          50% { opacity: 0.85; box-shadow: 0 0 4px color-mix(in srgb, var(--job-accent) 20%, transparent); }
        }
      `}</style>
    </div>
    </DashboardMountedContext.Provider>
  )
}
