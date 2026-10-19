import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Layers, Plus, X, GripVertical, Check, RotateCcw, Sun, Moon, ArrowRight,
  FlaskConical, Microscope, Brain, Heart, Activity, Stethoscope, Dna, Atom, BookOpen, Beaker,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { Button } from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import SectionHead from '../../components/ui/SectionHead'
import SegmentedToggle from '../../components/ui/SegmentedToggle'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { staggerContainer, staggerItem } from '../../lib/animations'
import InlineSelect from '../../components/InlineSelect'
import DensityToggle, { useDensity } from '../../components/DensityToggle'
import { useTodayView, type TodayView } from '../../hooks/useTodayView'
import { useLabPrefs } from '../../hooks/useLabPrefs'
import LauncherSettingsPanel from '../../components/LauncherSettingsPanel'
import RangeSlider from '../../components/RangeSlider'
import CalendarFeedsPanel from '../../components/CalendarFeedsPanel'
import { ICON_PROPS } from '../../lib/iconProps'
import { useDarkMode } from '../../hooks/useDarkMode'
import ConfirmButton from '../../components/ui/ConfirmButton'

interface WorkflowTemplate {
  id: string
  name: string
  stages: string
  is_default: number
  created_at: string
}

const LAB_ICON_OPTIONS = [
  { name: 'flask', Icon: FlaskConical },
  { name: 'microscope', Icon: Microscope },
  { name: 'brain', Icon: Brain },
  { name: 'heartbeat', Icon: Activity },
  { name: 'heart', Icon: Heart },
  { name: 'stethoscope', Icon: Stethoscope },
  { name: 'dna', Icon: Dna },
  { name: 'atom', Icon: Atom },
  { name: 'beaker', Icon: Beaker },
  { name: 'book', Icon: BookOpen },
] as const

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

// Phase 2 (2026-06-18): Today default view. Persisted in localStorage
// 'mnccore.today.defaultView'. Default = 'timeline'. In-session toggle
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

function LabIconPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  // Legacy emoji values fall through to no-selection — picking any tile migrates.
  const selected = LAB_ICON_OPTIONS.some(o => o.name === value) ? value : ''
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {LAB_ICON_OPTIONS.map(({ name, Icon }) => {
        const isSelected = selected === name
        return (
          <Button size="icon"
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={name}
            aria-pressed={isSelected}
            className={`tk-btn${isSelected ? ' tk-sel' : ''}`}
            style={{ width: 40, height: 40, justifyContent: 'center', padding: 0 }}
          >
            <Icon {...ICON_PROPS} size={18} />
          </Button>
        )
      })}
    </div>
  )
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // Load settings
  const { data: settings = {}, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return {}
      const data = await res.json()
      return data.data as Record<string, string>
    },
    staleTime: 60 * 1000,
  })

  // Load workflow templates
  const { data: templates = [] } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () => {
      const res = await fetch('/api/workflow-templates')
      if (!res.ok) return []
      const data = await res.json()
      return data.data as WorkflowTemplate[]
    },
    staleTime: 60 * 1000,
  })

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return res.json()
    },
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  // Create workflow template mutation
  const createTemplate = useMutation({
    mutationFn: async (template: { name: string; stages: string[] }) => {
      const res = await fetch('/api/workflow-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      return res.json()
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['workflow-templates'] }),
  })

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

  // P2-05: tabbed layout. Hash-route deep-linkable (/settings#ai).
  // P1-9: AI tab removed (Nick, 2026-06-09) — it was placeholder copy + a
  // duplicate Team Directory link. The Directory link already lives at the top
  // of this page (its sensible home), so nothing is lost.
  const TABS = [
    { key: 'profile', label: 'Profile' },
    { key: 'templates', label: 'Templates' },
    { key: 'lab', label: 'Lab' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'danger', label: 'Danger Zone' },
  ] as const

  // T-34 "changed-this-session" dots. Snapshot settings on first load;
  // compare current per-tab to detect dirty tabs. Auto-saves clear nothing —
  // the dot signals "you edited this tab since opening settings."
  // Adjust state during render (React-endorsed "store info from a prop"
  // pattern: https://react.dev/learn/you-might-not-need-an-effect) rather
  // than an effect — avoids both a ref-read-during-render and a
  // setState-in-effect cascading render for what's a one-time snapshot.
  const [initialSettings, setInitialSettings] = useState<Record<string, unknown> | null>(null)
  // Snapshot only once the query has loaded: while loading, `settings` is the
  // {} default, and snapshotting that marked Profile dirty with no edit.
  if (!settingsLoading && !initialSettings) {
    setInitialSettings({ ...settings })
  }
  const dirtyTabs = useMemo(() => {
    const out = new Set<string>()
    if (!initialSettings || !settings) return out
    const profileKeys = ['lab_name', 'lab_description', 'lab_icon', 'lab_type']
    if (profileKeys.some((k) => JSON.stringify(initialSettings[k]) !== JSON.stringify((settings as Record<string, unknown>)[k]))) out.add('profile')
    // Other tabs either save outside the settings row (appearance = localStorage,
    // danger = actions) or have no tracked fields yet.
    return out
  }, [settings, initialSettings])
  type TabKey = (typeof TABS)[number]['key']
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === 'undefined') return 'profile'
    const fromHash = window.location.hash.replace('#', '') as TabKey
    return TABS.some((t) => t.key === fromHash) ? fromHash : 'profile'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, '', `#${activeTab}`)
    }
  }, [activeTab])
  useEffect(() => {
    function onHash() {
      const next = window.location.hash.replace('#', '') as TabKey
      if (TABS.some((t) => t.key === next)) setActiveTab(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (settingsLoading) return <TextSkeleton lines={8} />

  return (
    <div className="content-container">
      <PageHeader title="Settings" subtitle="Changes are saved automatically" />

      {/* Team Directory shortcut: a plain link, no card. */}
      <Link
        to={PATHS.team}
        className="inline-flex items-center gap-1.5 mb-4 text-[13px] hover:underline"
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
          options={TABS.map((tab) => ({
            value: tab.key,
            label: tab.label,
            icon: dirtyTabs.has(tab.key) ? (
              <span
                aria-label="Edited this session"
                style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--job-accent)' }}
              />
            ) : undefined,
          }))}
        />
      </div>

      <div className="flex flex-col max-w-2xl" role="tabpanel" id={`settings-tabpanel-${activeTab}`} aria-labelledby={`settings-tab-${activeTab}`} style={{ marginTop: 'var(--sp-xl)' }}>
        {/* Basic Information */}
        {activeTab === 'profile' && (
        <SettingsSection title="Basic Information" subtitle="These appear in the sidebar header and dashboard">
          <SettingsField label="Lab name" hint="Shown in the sidebar and page titles">
            <SettingsInput
              value={settings.lab_name || ''}
              onSave={(v) => updateSettings.mutate({ lab_name: v })}
              placeholder="Enter lab name"
            />
          </SettingsField>
          <SettingsField label="Description" hint="Brief summary of your lab's research focus">
            <SettingsInput
              value={settings.lab_description || ''}
              onSave={(v) => updateSettings.mutate({ lab_description: v })}
              placeholder="Describe your lab's focus"
              multiline
            />
          </SettingsField>
          <SettingsField label="Lab icon" hint="Displayed next to your lab name">
            <LabIconPicker
              value={settings.lab_icon || ''}
              onChange={(v) => updateSettings.mutate({ lab_icon: v })}
            />
          </SettingsField>
          <SettingsField label="Lab type">
            <InlineSelect
              value={settings.lab_type || 'clinical_research'}
              options={[
                { value: 'clinical_research', label: 'Clinical Research' },
                { value: 'basic_science', label: 'Basic Science' },
                { value: 'translational', label: 'Translational' },
                { value: 'computational', label: 'Computational' },
                { value: 'mixed', label: 'Mixed Methods' },
              ]}
              onChange={(v) => updateSettings.mutate({ lab_type: v })}
              size="md"
              alwaysShowChevron
            />
          </SettingsField>
        </SettingsSection>
        )}

        {/* Workflow Templates */}
        {activeTab === 'templates' && (
        <SettingsSection title="Workflow Templates" subtitle="Define the stages your projects move through (e.g., Idea → Analysis → Writing → Published)">
          {templates.length === 0 && (
            <EmptyState
              icon={<Layers size={32} />}
              title="No workflow templates"
              subtitle="Create a template to define custom project stages."
            />
          )}
          <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
            {templates.map((template) => {
              const stages: string[] = JSON.parse(template.stages)
              return (
                <motion.div key={template.id} variants={staggerItem} className="sk-mat" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--sp-lg)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {template.name}
                    </span>
                    {template.is_default === 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--sk-t2)', backgroundColor: 'var(--sk-line)' }}>
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {stages.map((stage, i) => {
                      // One neutral chip for every stage: a stage is not a color
                      // job (rules-ui-design principle 21).
                      const colors = [
                        { bg: 'var(--sk-line)', text: 'var(--sk-t2)' },
                      ]
                      const c = colors[i % colors.length]
                      return (
                        <span
                          key={i}
                          className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                          style={{
                            color: c.text,
                            backgroundColor: c.bg,
                          }}
                        >
                          {stage}
                        </span>
                      )
                    })}
                  </div>
                  <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                    {stages.length} stage{stages.length !== 1 ? 's' : ''}
                  </span>
                </motion.div>
              )
            })}
          </motion.div>

          <CreateTemplateForm onSubmit={(name, stages) => createTemplate.mutate({ name, stages })} />
        </SettingsSection>
        )}

        {/* Lab preferences — T-29 attention thresholds */}
        {activeTab === 'lab' && (
        <SettingsSection title="Lab Preferences" subtitle="Staleness & attention thresholds — one definition (days since meaningful movement), per-domain defaults">
          <LabPrefsPanel />
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

// ── Settings Input (auto-save on blur) ───────────────────────

function SettingsInput({ value, onSave, placeholder, multiline }: { value: string; onSave: (v: string) => void; placeholder: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  const handleBlur = () => {
    if (draft !== value) onSave(draft)
  }

  const inputStyle = {
    fontSize: '14px',
    color: 'var(--ink)',
    border: '1px solid var(--field-edge)',
    backgroundColor: 'var(--field-bg)',
  }

  if (multiline) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={2}
        className="w-full rounded-md px-3 py-2 text-sm outline-none resize-none"
        style={inputStyle}
      />
    )
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      className="w-full rounded-md px-3 py-2 text-sm outline-none"
      style={inputStyle}
    />
  )
}

// ── Create Template Form ─────────────────────────────────────

function CreateTemplateForm({ onSubmit }: { onSubmit: (name: string, stages: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [stages, setStages] = useState<string[]>([''])
  const nameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) nameInputRef.current?.focus({ preventScroll: true })
  }, [open])

  const addStage = () => setStages([...stages, ''])
  const removeStage = (i: number) => setStages(stages.filter((_, idx) => idx !== i))
  const updateStage = (i: number, v: string) => setStages(stages.map((s, idx) => idx === i ? v : s))

  const handleSubmit = () => {
    const validStages = stages.filter((s) => s.trim())
    if (!name.trim() || validStages.length < 2) return
    onSubmit(name.trim(), validStages)
    setName('')
    setStages([''])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="tk-btn self-start mt-2"
      >
        <Plus {...ICON_PROPS} size={14} />
        Create Custom Template
      </button>
    )
  }

  return (
    <div className="sk-mat mt-2" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--sp-lg)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>New Workflow Template</span>
        <Button size="icon" onClick={() => setOpen(false)} aria-label="Close" className="hit-area" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>
          <X {...ICON_PROPS} size={16} />
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g., Clinical Trial)"
          className="w-full rounded-md px-3 py-2 text-sm outline-none"
          style={{ border: '1px solid var(--field-edge)', backgroundColor: 'var(--field-bg)' }}
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Stages (in order)</span>
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical {...ICON_PROPS} size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
              <input
                type="text"
                value={stage}
                onChange={(e) => updateStage(i, e.target.value)}
                placeholder={`Stage ${i + 1}`}
                className="flex-1 rounded-md px-3 py-1.5 text-sm outline-none"
                style={{ border: '1px solid var(--field-edge)', backgroundColor: 'var(--field-bg)' }}
              />
              {stages.length > 1 && (
                <Button size="icon"
                  type="button"
                  onClick={() => removeStage(i)}
                  aria-label={`Remove stage ${i + 1}`}
                  title={`Remove stage ${i + 1}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)', padding: 5, margin: -5 }}
                >
                  <X {...ICON_PROPS} size={14} />
                </Button>
              )}
            </div>
          ))}
          <button
            onClick={addStage}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded self-start"
            style={{ color: 'var(--job-accent)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <Plus {...ICON_PROPS} size={12} /> Add stage
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={() => setOpen(false)} className="tk-btn">
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!name.trim() || stages.filter((s) => s.trim()).length < 2}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', opacity: (!name.trim() || stages.filter((s) => s.trim()).length < 2) ? 0.85 : 1 }}
          >
            Create Template
          </Button>
        </div>
      </div>
    </div>
  )
}
