import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PUBLIC_PATHS } from '../../constants/paths'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Settings, Type, Layers, Plus, X, GripVertical, Check, Palette, RotateCcw, Sun, Moon, Users, ArrowRight,
  FlaskConical, Microscope, Brain, Heart, Activity, Stethoscope, Dna, Atom, BookOpen, Beaker, Link2,
} from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { staggerContainer, staggerItem } from '../../lib/animations'
import InlineSelect from '../../components/InlineSelect'
import DensityToggle, { useDensity } from '../../components/DensityToggle'
import { useLabPrefs } from '../../hooks/useLabPrefs'
import RangeSlider from '../../components/RangeSlider'
import CalendarFeedsPanel from '../../components/CalendarFeedsPanel'

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

// Global table-density preference. Backed by the same `hub-table-density`
// localStorage key the per-view DensityToggles use, so setting it here becomes
// the default every data table inherits on its next mount. The in-table toggles
// remain as in-context overrides (kept deliberately — additive-first).
function DensityControl() {
  const [density, setDensity] = useDensity()
  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>Table density</div>
          <div className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>
            Row spacing on data tables (Tasks, Deadlines, Manuscripts…). Each table also has its own toggle.
          </div>
        </div>
        <DensityToggle value={density} onChange={setDensity} />
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
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={name}
            aria-pressed={isSelected}
            className="transition-colors"
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${isSelected ? 'var(--teal)' : 'var(--border-subtle)'}`,
              background: isSelected ? 'color-mix(in oklch, var(--teal) 12%, transparent)' : 'transparent',
              color: isSelected ? 'var(--teal)' : 'var(--slate)',
              cursor: 'pointer',
            }}
          >
            <Icon size={18} />
          </button>
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

  // P6-A6: drive theme selection from React state, not DOM attribute reads.
  // DOM reads at render time produce stale values; React state stays in sync.
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'dark'
  })

  const applyTheme = (theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme)
    // Per CLAUDE.md rule 14: theme localStorage key is 'mn-ccore-theme', NOT 'theme'
    localStorage.setItem('mn-ccore-theme', theme)
    setCurrentTheme(theme)
  }

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
  const initialSettingsRef = useRef<any>(null)
  useEffect(() => {
    if (settings && !initialSettingsRef.current) initialSettingsRef.current = { ...settings }
  }, [settings])
  const dirtyTabs = useMemo(() => {
    const out = new Set<string>()
    const initial = initialSettingsRef.current
    if (!initial || !settings) return out
    const profileKeys = ['lab_name', 'lab_description', 'lab_icon', 'lab_type']
    if (profileKeys.some((k) => JSON.stringify(initial[k]) !== JSON.stringify((settings as any)[k]))) out.add('profile')
    // Other tabs either save outside the settings row (appearance = localStorage,
    // danger = actions) or have no tracked fields yet.
    return out
  }, [settings])
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
      <PageHeader icon={<Settings size={20} />} title="Settings" subtitle="Changes are saved automatically" />

      {/* Team Directory shortcut */}
      <Link
        to={PUBLIC_PATHS.publicTeam}
        className="inline-flex items-center gap-2 mb-4 px-4 py-2.5 rounded-lg border transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        style={{
          borderColor: 'var(--border-subtle)',
          textDecoration: 'none',
          color: 'var(--ink)',
          backgroundColor: 'var(--surface-1)',
        }}
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-md flex-shrink-0" style={{ backgroundColor: 'var(--teal-active)' }}>
          <Users size={14} style={{ color: 'var(--teal)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Team Directory</span>
          <span className="ml-2 text-[11px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>Manage members, roles, and expertise tags</span>
        </div>
        <ArrowRight size={14} style={{ color: 'var(--slate)', opacity: 0.75 }} />
      </Link>

      {/* Tab strip — P2-05. overflow-x:auto + flex-shrink-0 on buttons so
          the 5-tab strip scrolls horizontally at <400px instead of pushing
          the page and causing horizontal body overflow (audit 2026-04-22). */}
      <div
        className="flex gap-1 border-b mb-4 overflow-x-auto"
        style={{ borderColor: 'var(--border-subtle)', WebkitOverflowScrolling: 'touch' }}
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive ? "true" : "false"}
              onClick={() => setActiveTab(tab.key)}
              className="px-3 py-2 text-sm transition-colors flex-shrink-0 whitespace-nowrap"
              style={{
                color: isActive ? 'var(--teal)' : 'var(--slate)',
                borderBottom: `2px solid ${isActive ? 'var(--teal)' : 'transparent'}`,
                background: 'none',
                cursor: 'pointer',
                marginBottom: '-1px',
                fontWeight: isActive ? 'var(--weight-ui, 500)' : 400,
              }}
            >
              {tab.label}
              {dirtyTabs.has(tab.key) && (
                <span
                  aria-label="Edited this session"
                  style={{
                    display: 'inline-block',
                    width: 6, height: 6, borderRadius: '50%',
                    marginLeft: 6, verticalAlign: 'middle',
                    background: 'var(--teal)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col max-w-2xl" style={{ marginTop: 'var(--sp-xl)' }}>
        {/* Basic Information */}
        {activeTab === 'profile' && (
        <SettingsSection title="Basic Information" subtitle="These appear in the sidebar header and dashboard" icon={Type}>
          <SettingsField label="Lab Name" hint="Shown in the sidebar and page titles">
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
          <SettingsField label="Lab Icon" hint="Displayed next to your lab name">
            <LabIconPicker
              value={settings.lab_icon || ''}
              onChange={(v) => updateSettings.mutate({ lab_icon: v })}
            />
          </SettingsField>
          <SettingsField label="Lab Type">
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
        <SettingsSection title="Workflow Templates" subtitle="Define the stages your projects move through (e.g., Idea → Analysis → Writing → Published)" icon={Layers}>
          {templates.length === 0 && (
            <EmptyState
              icon={<Layers size={32} />}
              title="No workflow templates"
              subtitle="Create a template to define custom project stages."
            />
          )}
          <motion.div className="grid grid-cols-1 lg:grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="visible">
            {templates.map((template) => {
              const stages: string[] = JSON.parse(template.stages)
              return (
                <motion.div key={template.id} variants={staggerItem} className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {template.name}
                    </span>
                    {template.is_default === 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--teal)', backgroundColor: 'var(--teal-active)' }}>
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {stages.map((stage, i) => {
                      // Cycle through palette colors for each stage
                      const colors = [
                        { bg: 'var(--teal-active)', text: 'var(--teal)', border: 'rgba(45,138,138,0.3)' },
                        { bg: 'var(--gold-active)', text: 'var(--gold)', border: 'rgba(201,168,76,0.3)' },
                        { bg: 'var(--maroon-hover)', text: 'var(--maroon)', border: 'rgba(122,0,25,0.2)' },
                        { bg: 'rgba(34,197,94,0.1)', text: 'var(--green)', border: 'rgba(34,197,94,0.3)' },
                        // Lighter blue/purple for AA contrast on near-black
                        // dark-mode bg (was #2563eb/#7c3aed — 3.4/3.1 on tinted
                        // alpha backgrounds). 2026-04-18 axe AA.
                        { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
                        { bg: 'rgba(168,85,247,0.1)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
                      ]
                      const c = colors[i % colors.length]
                      return (
                        <span
                          key={i}
                          className="text-[11px] px-2.5 py-1 rounded-full border font-medium"
                          style={{
                            color: c.text,
                            backgroundColor: c.bg,
                            borderColor: c.border,
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
        <SettingsSection title="Lab Preferences" subtitle="Staleness & attention thresholds — one definition (days since meaningful movement), per-domain defaults" icon={FlaskConical}>
          <LabPrefsPanel />
        </SettingsSection>
        )}

        {/* Integrations — issue #45 */}
        {activeTab === 'integrations' && (
        <SettingsSection title="Integrations" subtitle="Connect external services to surface their data inside the Hub" icon={Link2}>
          <IntegrationsPanel />
        </SettingsSection>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
        <SettingsSection title="Appearance" subtitle="Theme and layout preferences" icon={Palette}>
          <div className="flex gap-4">
            {/* Light theme preview — hardcoded hex intentional (showing what themes look like) */}
            <button
              onClick={() => applyTheme('light')}
              className="flex-1 rounded-lg border-2 p-3 transition-all cursor-pointer"
              aria-pressed={currentTheme === 'light' ? "true" : "false"}
              style={{
                borderColor: currentTheme !== 'dark' ? 'var(--teal)' : 'var(--border-subtle)',
                background: '#ffffff',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sun size={12} style={{ color: '#c9a84c' }} />
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
                borderColor: currentTheme === 'dark' ? 'var(--teal)' : 'var(--border-subtle)',
                background: '#0b1017',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Moon size={12} style={{ color: '#c9a84c' }} />
                <span className="text-[11px] font-medium" style={{ color: '#e2e8f0' }}>Dark</span>
              </div>
              <div className="rounded" style={{ background: 'color-mix(in oklch, var(--cream), white 3%)', padding: 6 }}>
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '80%', background: '#e2e8f0', opacity: 0.2 }} />
                <div className="h-1.5 rounded-full mb-1.5" style={{ width: '60%', background: '#e2e8f0', opacity: 0.15 }} />
                <div className="h-1.5 rounded-full" style={{ width: '70%', background: '#2d8a8a', opacity: 0.85 }} />
              </div>
            </button>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--slate)', opacity: 0.75 }}>
            You can also toggle with <kbd className="text-[10px] px-1 py-0.5 rounded" style={{ background: 'var(--border-subtle)' }}>Ctrl+.</kbd>
          </p>
          <DensityControl />
        </SettingsSection>
        )}

        {/* Danger Zone — Reset + debug toggle */}
        {activeTab === 'danger' && (
        <SettingsSection title="Danger Zone" subtitle="Clear cached preferences and surface QA fixtures" icon={RotateCcw}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Reset Dashboard Layout</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Clears pinned cards, card order, and view preferences
                </p>
              </div>
              <button
                onClick={() => {
                  const keys = Object.keys(localStorage).filter(k =>
                    k.startsWith('dashboard-') || k.startsWith('mnccore-dashboard') || k === 'dashboardCards' || k === 'dashboardRole'
                  )
                  keys.forEach(k => localStorage.removeItem(k))
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{ color: 'var(--maroon)', border: '1px solid rgba(122,0,25,0.2)', background: 'none', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Clear Recent Searches</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Removes saved search history
                </p>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('mnccore-recent-searches')
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{ color: 'var(--maroon)', border: '1px solid rgba(122,0,25,0.2)', background: 'none', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Re-enable product tips</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Restores all dismissed page tooltips ("Press F to toggle filters", etc.)
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
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{ color: 'var(--teal)', border: '1px solid rgba(13,111,104,0.25)', background: 'none', cursor: 'pointer' }}
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
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{
                  color: showDebugItems ? 'var(--teal)' : 'var(--slate)',
                  border: `1px solid ${showDebugItems ? 'var(--teal)' : 'var(--border-subtle)'}`,
                  background: showDebugItems ? 'var(--teal-hover)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {showDebugItems ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </SettingsSection>
        )}

        {/* Save indicator */}
        {saved && (
          <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--teal)' }}>
            <Check size={14} style={{ color: 'var(--teal)' }} />
            <span className="text-sm" style={{ color: 'var(--teal)' }}>Saved</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Settings Section ─────────────────────────────────────────
// All 4 layout zones (Basic Info / Workflow Templates / AI Meeting Context / Appearance + Reset)
// share this single container for consistent rhythm:
//   - marginBottom: var(--sp-2xl) (32px inter-zone gap)
//   - border: var(--border-subtle) + radius: var(--radius-lg)
//   - padding: var(--sp-xl) (24px)
//   - backgroundColor: var(--surface-1)
//   - h3: var(--text-md) / var(--weight-ui) (16px / 500)
//   - subtitle: var(--text-small) (12px)

function SettingsSection({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 'var(--sp-2xl)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--sp-xl)',
      backgroundColor: 'var(--surface-1)',
    }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--teal-active)' }}>
          <Icon size={16} style={{ color: 'var(--teal)' }} />
        </div>
        <div>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-ui)', color: 'var(--ink)', margin: 0 }}>{title}</h3>
          <p style={{ fontSize: 'var(--text-small)', color: 'var(--slate)', opacity: 0.75, margin: 0 }}>{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
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
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded"
          style={{
            fontSize: '11px', fontWeight: 500, padding: '6px 12px',
            background: 'transparent', border: '1px solid var(--border-subtle)',
            color: 'var(--slate)', cursor: 'pointer',
          }}
        >
          <RotateCcw size={11} />
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

// Settings → Integrations tab thin wrapper. The real UI lives in
// src/components/CalendarFeedsPanel so it can also embed in the Profile page.
function IntegrationsPanel() {
  return <CalendarFeedsPanel />
}


function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-0.5" style={{ color: 'var(--slate)' }}>
        {label}
      </label>
      {hint && (
        <p className="text-[11px] mb-1.5" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {hint}
        </p>
      )}
      {children}
    </div>
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
    borderColor: 'var(--border-subtle)',
    backgroundColor: 'var(--cream)',
  }

  if (multiline) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={2}
        className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-none"
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
      className="w-full rounded-md border px-3 py-2 text-sm outline-none"
      style={inputStyle}
    />
  )
}

// ── Create Template Form ─────────────────────────────────────

function CreateTemplateForm({ onSubmit }: { onSubmit: (name: string, stages: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [stages, setStages] = useState<string[]>([''])

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
        className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors hover:bg-black/5 mt-2"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--teal)', cursor: 'pointer', background: 'none' }}
      >
        <Plus size={14} />
        Create Custom Template
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border p-4" style={{ borderColor: 'var(--teal)', backgroundColor: 'var(--teal-hover)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>New Workflow Template</span>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g., Clinical Trial)"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--border-subtle)' }}
          autoFocus
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Stages (in order)</span>
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical size={12} style={{ color: 'var(--slate)', opacity: 0.75 }} />
              <input
                type="text"
                value={stage}
                onChange={(e) => updateStage(i, e.target.value)}
                placeholder={`Stage ${i + 1}`}
                className="flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
                style={{ borderColor: 'var(--border-subtle)' }}
              />
              {stages.length > 1 && (
                <button onClick={() => removeStage(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addStage}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded self-start"
            style={{ color: 'var(--teal)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <Plus size={12} /> Add stage
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || stages.filter((s) => s.trim()).length < 2}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ backgroundColor: 'var(--teal-solid)', color: 'white', cursor: 'pointer', border: 'none', opacity: (!name.trim() || stages.filter((s) => s.trim()).length < 2) ? 0.85 : 1 }}
          >
            Create Template
          </button>
        </div>
      </div>
    </div>
  )
}
