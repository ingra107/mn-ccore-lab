import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Settings, Type, Layers, Plus, X, GripVertical, Check, Bot, Info, Palette, RotateCcw, Sun, Moon, Users, ArrowRight } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { TextSkeleton } from '../../components/LoadingSkeleton'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { useTeam } from '../../hooks/useApiData'
import Avatar from '../../components/Avatar'
import { getPersonInfo } from '../../data/team'

interface WorkflowTemplate {
  id: string
  name: string
  stages: string
  is_default: number
  created_at: string
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: team = [] } = useTeam()

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

  // P2-05: tabbed layout. Hash-route deep-linkable (/settings#ai).
  const TABS = [
    { key: 'profile', label: 'Profile' },
    { key: 'templates', label: 'Templates' },
    { key: 'ai', label: 'AI' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'danger', label: 'Danger Zone' },
  ] as const
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
    <div>
      <PageHeader icon={<Settings size={20} />} title="Settings" subtitle="Changes are saved automatically" />

      {/* Team Directory shortcut */}
      <Link
        to="/team"
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

      {/* Tab strip — P2-05 */}
      <div
        className="flex gap-1 border-b mb-4"
        style={{ borderColor: 'var(--border-subtle)' }}
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className="px-3 py-2 text-sm transition-colors"
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
          <SettingsField label="Lab Icon (Emoji)" hint="Displayed next to your lab name">
            <SettingsInput
              value={settings.lab_icon || ''}
              onSave={(v) => updateSettings.mutate({ lab_icon: v })}
              placeholder="🧬"
            />
          </SettingsField>
          <SettingsField label="Lab Type">
            <select
              aria-label="Lab Type"
              value={settings.lab_type || 'clinical_research'}
              onChange={(e) => updateSettings.mutate({ lab_type: e.target.value })}
              className="w-full rounded-md border px-3 py-2 text-sm cursor-pointer"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink)' }}
            >
              <option value="clinical_research">Clinical Research</option>
              <option value="basic_science">Basic Science</option>
              <option value="translational">Translational</option>
              <option value="computational">Computational</option>
              <option value="mixed">Mixed Methods</option>
            </select>
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

        {/* AI Meeting Context */}
        {activeTab === 'ai' && (
        <SettingsSection title="AI Meeting Context" subtitle="Help AI recognize speakers and assign tasks accurately during meeting note analysis" icon={Bot}>
          <div className="flex flex-col gap-3">
            {team.filter(m => m.slug).slice(0, 20).map((member) => {
              const person = getPersonInfo(member.slug!)
              return (
                <div key={member.slug} className="flex items-center gap-3 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div style={{ width: 32, height: 32, flexShrink: 0 }}>
                    <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="base" variant="ice" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{person.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{member.role}</div>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g., stats expert, IRB contact, data lead"
                    className="w-48 rounded-md border px-2 py-1 text-xs outline-none"
                    style={{ fontSize: 'var(--label-size)', borderColor: 'var(--border-subtle)', color: 'var(--ink)' }}
                    defaultValue=""
                  />
                </div>
              )
            })}
          </div>
          <div className="flex items-start gap-2 mt-3 px-1">
            <Info size={12} style={{ color: 'var(--teal)', marginTop: 2, flexShrink: 0 }} />
            <p className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75, lineHeight: 1.5 }}>
              Expertise notes help AI meeting notes recognize who should be assigned which tasks. These are used when AI processes meeting transcripts.
            </p>
          </div>
        </SettingsSection>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
        <SettingsSection title="Appearance" subtitle="Theme and layout preferences" icon={Palette}>
          <div className="flex gap-4">
            {/* Light theme preview — hardcoded hex intentional (showing what themes look like) */}
            <button
              onClick={() => {
                document.documentElement.setAttribute('data-theme', 'light')
                localStorage.setItem('theme', 'light')
              }}
              className="flex-1 rounded-lg border-2 p-3 transition-all cursor-pointer"
              style={{
                borderColor: document.documentElement.getAttribute('data-theme') !== 'dark' ? 'var(--teal)' : 'var(--border-subtle)',
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
              onClick={() => {
                document.documentElement.setAttribute('data-theme', 'dark')
                localStorage.setItem('theme', 'dark')
              }}
              className="flex-1 rounded-lg border-2 p-3 transition-all cursor-pointer"
              style={{
                borderColor: document.documentElement.getAttribute('data-theme') === 'dark' ? 'var(--teal)' : 'var(--border-subtle)',
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
                <p className="text-sm" style={{ color: 'var(--ink)' }}>Show debug/test items</p>
                <p className="text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
                  Surface QA fixtures (`test_delete_*`, `deep-audit-sync-*`) in activity, calendar, mentee milestones
                </p>
              </div>
              <button
                role="switch"
                aria-checked={showDebugItems}
                onClick={() => {
                  const next = !showDebugItems
                  setShowDebugItems(next)
                  if (next) localStorage.setItem('showDebugItems', 'true')
                  else localStorage.removeItem('showDebugItems')
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
