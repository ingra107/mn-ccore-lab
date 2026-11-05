import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { Check, RotateCcw, Sun, Moon, ArrowRight } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import Field from '../../components/ui/Field'
import SectionHead from '../../components/ui/SectionHead'
import SegmentedToggle from '../../components/ui/SegmentedToggle'
import DensityToggle, { useDensity } from '../../components/DensityToggle'
import { useTodayView, type TodayView } from '../../hooks/useTodayView'
import { useLabPrefs } from '../../hooks/useLabPrefs'
import { useUserPref } from '../../hooks/useUserPref'
import { DIGEST_EMAIL_PREF } from '../../../shared/userPrefKeys'
import { resetDashboardPrefs } from '../../lib/dashboardLayout'
import LauncherSettingsPanel from '../../components/LauncherSettingsPanel'
import RangeSlider from '../../components/RangeSlider'
import CalendarFeedsPanel from '../../components/CalendarFeedsPanel'
import { ICON_PROPS } from '../../lib/iconProps'
import { useDarkMode } from '../../hooks/useDarkMode'
import ConfirmButton from '../../components/ui/ConfirmButton'

// P3-7 (2026-06-09): the ONE global table-density control. Backed by the
// `hub-table-density` key, applied at the document root so every data table
// inherits `--row-height`. Per-view DensityToggles were removed — this is the
// single place density is set. Compact is the default.
function DensityControl() {
  const [density, setDensity] = useDensity()
  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sk-line)' }}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Table density</div>
          <div className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
            Row spacing on every data table (Tasks, Deadlines, Manuscripts…). Applies everywhere. Default: compact.
          </div>
        </div>
        <DensityToggle value={density} onChange={setDensity} />
      </div>
    </div>
  )
}

// Phase 2 (2026-06-18): Today default view. A per-person pref on the server
// ('today.defaultView', useUserPref; PB #911). Default = 'timeline'. In-session toggle
// is ephemeral; this setting controls what view opens on a fresh load.
function TodayDefaultViewControl() {
  const { defaultView, setDefault } = useTodayView()
  const views: { key: TodayView; label: string; desc: string }[] = [
    { key: 'timeline', label: 'Timeline', desc: 'Drag tasks into gaps — AM planning' },
    { key: 'agenda', label: 'Agenda', desc: 'Scan a line of meetings + tasks' },
  ]
  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sk-line)' }}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Today default view</div>
          <div className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
            Which view opens when you load the Today page. In-session toggles are ephemeral. Default: Timeline.
          </div>
        </div>
        <SegmentedToggle
          ariaLabel="Today default view"
          options={views.map((v) => ({ value: v.key, label: v.label, title: v.desc }))}
          value={defaultView}
          onChange={setDefault}
        />
      </div>
    </div>
  )
}

// The daily digest email, on or off, per person on the server. The Worker skips a
// saved false (handleSendDailyDigests); the email's Manage notifications link lands here.
const isOn = (stored: unknown) => stored !== false
function DigestEmailSwitch() {
  const [on, setOn] = useUserPref<boolean>(DIGEST_EMAIL_PREF, true, isOn)
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p id="digest-email-label" className="text-sm" style={{ color: 'var(--ink)' }}>Daily digest email</p>
        <p id="digest-email-help" className="text-[11px]" style={{ color: 'var(--muted)' }}>
          The morning summary of overdue work, what is due today and today's meetings. Turn it off and it stops; nothing else in the Hub changes.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        data-testid="digest-email-switch"
        aria-checked={on ? 'true' : 'false'}
        aria-labelledby="digest-email-label"
        aria-describedby="digest-email-help"
        onClick={() => setOn(!on)}
        className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
        style={{
          color: on ? 'var(--job-accent)' : 'var(--slate)',
          border: `1px solid ${on ? 'var(--job-accent)' : 'var(--border-subtle)'}`,
          background: on ? 'color-mix(in srgb, var(--job-accent) 6%, transparent)' : 'none',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  )
}

// P2-05: tabbed layout. Hash-route deep-linkable (/settings#ai).
// P1-9: AI tab removed (Nick, 2026-06-09) — it was placeholder copy + a
// duplicate Team Directory link. The Directory link already lives at the top
// of this page (its sensible home), so nothing is lost.
// F08/F09 (2026-11-05): the Profile tab (four lab_settings keys nothing
// read) and the Templates tab (workflow templates nothing read) are gone;
// an old #profile or #templates link lands on Lab (TAB_ALIASES).
const TABS = [
  { key: 'lab', label: 'Lab' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'danger', label: 'Danger Zone' },
] as const

type TabKey = (typeof TABS)[number]['key']

// Old hash links from before the Profile and Templates tabs were removed.
const TAB_ALIASES: Record<string, string> = { profile: 'lab', templates: 'lab' }

function tabFromHash(): TabKey {
  const raw = window.location.hash.replace('#', '')
  const hash = TAB_ALIASES[raw] ?? raw
  return TABS.find((t) => t.key === hash)?.key ?? 'lab'
}

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [showDebugItems, setShowDebugItems] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('showDebugItems') === 'true'
  })

  // The theme cards drive the one theme store (useDarkMode: html.dark plus the
  // 'mn-ccore-theme' key), the same store Ctrl+. and the sidebar use. The old
  // version wrote html[data-theme], which nothing reads, so a tap did nothing.
  // The selected card is the theme on screen ('system' shows what it resolved to).
  const { isDark, setTheme } = useDarkMode()
  const currentTheme: 'light' | 'dark' = isDark ? 'dark' : 'light'
  const applyTheme = (theme: 'light' | 'dark') => setTheme(theme)


  const [activeTab, setActiveTab] = useState<TabKey>(() => (typeof window === 'undefined' ? 'lab' : tabFromHash()))
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`)
    }
  }, [activeTab])
  useEffect(() => {
    function onHash() { setActiveTab(tabFromHash()) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="content-container">
      <PageHeader title="Settings" subtitle="Changes are saved automatically" />

      {/* Team Directory shortcut: a plain link, no card. */}
      <Link
        to={PATHS.team}
        className="inline-link inline-flex items-center gap-1.5 mb-4 text-[13px] hover:underline"
        style={{ color: 'var(--sk-t2)', textDecoration: 'none' }}
      >
        Team directory
        <ArrowRight {...ICON_PROPS} size={13} />
      </Link>

      {/* Tab strip: the one segmented control. The dot marks a tab edited this
          session; it rides the option's icon slot. scrollable keeps the strip
          from pushing the page wide on a phone. */}
      <div className="mb-4">
        <SegmentedToggle
          scrollable
          ariaLabel="Settings sections"
          idPrefix="settings"
          value={activeTab}
          onChange={setActiveTab}
          options={TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
        />
      </div>

      <div className="flex flex-col max-w-2xl" role="tabpanel" id={`settings-tabpanel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`} style={{ marginTop: 'var(--sp-xl)' }}>
        {/* Lab preferences — T-29 attention thresholds */}
        {activeTab === 'lab' && (
        <SettingsSection title="Lab Preferences" subtitle="Staleness & attention thresholds — one definition (days since meaningful movement), per-domain defaults">
          <LabPrefsPanel />
        </SettingsSection>
        )}

        {activeTab === 'notifications' && (
        <SettingsSection title="Notifications" subtitle="What the Hub emails you">
          <DigestEmailSwitch />
        </SettingsSection>
        )}

        {/* Integrations — issue #45 */}
        {activeTab === 'integrations' && (
        <SettingsSection title="Integrations" subtitle="Connect external services to surface their data inside the Hub">
          <IntegrationsPanel />
        </SettingsSection>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
        <SettingsSection title="Appearance" subtitle="Theme and layout preferences">
          <div className="flex gap-4">
            {/* Light theme preview — hardcoded hex intentional (showing what themes look like) */}
            <button
              onClick={() => applyTheme('light')}
              className="flex-1 rounded-lg border-2 p-3 transition-all cursor-pointer"
              aria-pressed={currentTheme === 'light' ? "true" : "false"}
              style={{
                borderColor: currentTheme === 'light' ? 'var(--job-accent)' : 'var(--border-subtle)',
                background: '#ffffff',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sun {...ICON_PROPS} size={12} style={{ color: 'var(--sk-t3)' }} />
                <span className="text-[11px] font-medium" style={{ color: '#0f1923' }}>Light</span>
              </div>
              <div className="rounded" style={{ background: '#f5f5f5', padding: 6 }}>
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '80%', background: '#0f1923', opacity: 0.2 }} />
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '60%', background: '#0f1923', opacity: 0.15 }} />
                <div className="h-1.5 rounded-full" style={{ width: '70%', background: '#2d8a8a', opacity: 0.85 }} />
              </div>
            </button>
            {/* Dark theme preview — hardcoded hex intentional (showing what themes look like) */}
            <button
              onClick={() => applyTheme('dark')}
              className="flex-1 rounded-lg border-2 p-3 transition-all cursor-pointer"
              aria-pressed={currentTheme === 'dark' ? "true" : "false"}
              style={{
                borderColor: currentTheme === 'dark' ? 'var(--job-accent)' : 'var(--border-subtle)',
                background: '#0b1017',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Moon {...ICON_PROPS} size={12} style={{ color: 'var(--sk-t3)' }} />
                <span className="text-[11px] font-medium" style={{ color: '#e2e8f0' }}>Dark</span>
              </div>
              <div className="rounded" style={{ background: 'color-mix(in oklch, var(--cream), white 3%)', padding: 6 }}>
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '80%', background: '#e2e8f0', opacity: 0.2 }} />
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '60%', background: '#e2e8f0', opacity: 0.15 }} />
                <div className="h-1.5 rounded-full" style={{ width: '70%', background: '#2d8a8a', opacity: 0.85 }} />
              </div>
            </button>
          </div>
          <p className="kbd-hint text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.75 }}>
            You can also toggle with <kbd className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--border-subtle)' }}>Ctrl+.</kbd>
          </p>
          <DensityControl />
          <TodayDefaultViewControl />
        </SettingsSection>
        )}

        {/* Danger Zone — Reset + debug toggle */}
        {activeTab === 'danger' && (
        <SettingsSection title="Danger Zone" subtitle="Clear cached preferences and surface QA fixtures">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Reset Dashboard Layout</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Clears pinned cards, card order, and view preferences
                </p>
              </div>
              <ConfirmButton
                confirmLabel="Reset?"
                ariaLabel="Reset dashboard layout"
                onConfirm={() => {
                  // The layout, cards, pins and tab live on the server (every device);
                  // the card click counts and any old per-browser keys live here.
                  resetDashboardPrefs()
                  const keys = Object.keys(localStorage).filter(k =>
                    k.startsWith('dashboard-') || k.startsWith('mnccore-dashboard') || k === 'dashboardCards' || k === 'dashboardRole'
                  )
                  keys.forEach(k => localStorage.removeItem(k))
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
              >
                Reset
              </ConfirmButton>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Clear Recent Searches</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Removes saved search history
                </p>
              </div>
              <ConfirmButton
                confirmLabel="Clear?"
                ariaLabel="Clear recent searches"
                onConfirm={() => {
                  localStorage.removeItem('mnccore-recent-searches')
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
              >
                Clear
              </ConfirmButton>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Re-enable product tips</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Restores all dismissed page tooltips ("Click a meeting for prep and actions", etc.)
                </p>
              </div>
              <button
                onClick={() => {
                  Object.keys(localStorage)
                    .filter(k => k.startsWith('mnccore-tooltip-seen-'))
                    .forEach(k => localStorage.removeItem(k))
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
                className="tk-btn tk-sm"
              >
                Restore
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Show debug/test items</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Surface QA fixtures (`test_delete_*`, `deep-audit-sync-*`) in activity, calendar, mentee milestones
                </p>
              </div>
              <button
                role="switch"
                aria-checked={showDebugItems ? "true" : "false"}
                onClick={() => {
                  const next = !showDebugItems
                  setShowDebugItems(next)
                  if (next) localStorage.setItem('showDebugItems', 'true')
                  else localStorage.removeItem('showDebugItems')
                  // Invalidate the same-tab isProductionVisible cache so
                  // filter rows flip immediately without reload.
                  window.dispatchEvent(new Event('showDebugItems-changed'))
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
                className={`tk-btn tk-sm${showDebugItems ? ' tk-sel' : ''}`}
              >
                {showDebugItems ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </SettingsSection>
        )}

        {/* Save indicator */}
        {saved && (
          <div className="sk-mat fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2" style={{ borderRadius: 'var(--radius-lg)' }}>
            <Check {...ICON_PROPS} size={14} style={{ color: 'var(--job-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--job-accent)' }}>Saved</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Settings Section ─────────────────────────────────────────
// One flat section per tab: a SectionHead, a muted line under it, then the
// fields on the page. Leaf cards (a template, the new-template form) carry the
// card material; the section itself is not a box.

function SettingsSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--sp-2xl)' }}>
      <SectionHead title={title} />
      <p style={{ fontSize: 'var(--text-small)', color: 'var(--sk-t3)', margin: '0 0 var(--sp-lg)' }}>{subtitle}</p>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </section>
  )
}

// ── Settings Field ───────────────────────────────────────────

// ── Lab Preferences Panel — T-29 threshold controls ──

function LabPrefsPanel() {
  const { prefs, update, reset, defaults } = useLabPrefs()

  return (
    <div className="flex flex-col gap-4">
      <SettingsField
        label="Awaiting your review — flag after"
        hint={`Reviewer comments assigned to you that stay pending past this many days surface as "Awaiting your review". Default ${defaults.manuscriptsReviewDays}d.`}
      >
        <RangeSlider
          value={prefs.manuscriptsReviewDays}
          onChange={(n) => update({ manuscriptsReviewDays: n })}
          min={0}
          max={365}
          unitLabel="days"
          ariaLabel="Awaiting review threshold in days"
        />
      </SettingsField>

      <SettingsField
        label="Stale drafts — flag after"
        hint={`Publications in "In Preparation" with no activity for this many days surface as "Stale drafts". Default ${defaults.manuscriptsStaleDays}d.`}
      >
        <RangeSlider
          value={prefs.manuscriptsStaleDays}
          onChange={(n) => update({ manuscriptsStaleDays: n })}
          min={0}
          max={365}
          unitLabel="days"
          ariaLabel="Stale drafts threshold in days"
        />
      </SettingsField>

      <SettingsField
        label="Stale tasks — flag after"
        hint={`In-progress tasks with no meaningful movement for this many days show a "stale" chip on My Tasks and feed the Stale quick-filter. Default ${defaults.taskStaleDays}d.`}
      >
        <RangeSlider
          value={prefs.taskStaleDays}
          onChange={(n) => update({ taskStaleDays: n })}
          min={0}
          max={365}
          unitLabel="days"
          ariaLabel="Stale tasks threshold in days"
        />
      </SettingsField>

      <SettingsField
        label="Stale projects — flag after"
        hint={`Active projects with no meaningful movement for this many days surface in the Projects "Needs Attention" filter (alongside low-health projects). Default ${defaults.projectStaleDays}d.`}
      >
        <RangeSlider
          value={prefs.projectStaleDays}
          onChange={(n) => update({ projectStaleDays: n })}
          min={0}
          max={365}
          unitLabel="days"
          ariaLabel="Stale projects threshold in days"
        />
      </SettingsField>

      <div>
        <ConfirmButton confirmLabel="Reset all thresholds?" onConfirm={reset}>
          <RotateCcw {...ICON_PROPS} size={11} />
          Reset to defaults
        </ConfirmButton>
      </div>
    </div>
  )
}

// Settings → Integrations tab thin wrapper. The real UI lives in
// src/components/CalendarFeedsPanel so it can also embed in the Profile page.
function IntegrationsPanel() {
  return (
    <>
      <CalendarFeedsPanel />
      <LauncherSettingsPanel />
    </>
  )
}


function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Field label={label} noContainer>
      {hint && (
        <p className="text-[11px] mb-1.5" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {hint}
        </p>
      )}
      {children}
    </Field>
  )
}

