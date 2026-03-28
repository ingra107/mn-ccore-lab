import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Type, Layers, Plus, X, GripVertical, Check } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'

interface WorkflowTemplate {
  id: string
  name: string
  stages: string
  is_default: number
  created_at: string
}

export default function SettingsPage() {
  const queryClient = useQueryClient()

  // Load settings
  const { data: settings = {} } = useQuery({
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

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Customize your lab workspace" />

      <div className="mt-6 flex flex-col gap-8 max-w-2xl">
        {/* Basic Information */}
        <SettingsSection title="Basic Information" subtitle="Your lab name and description" icon={Type}>
          <SettingsField label="Lab Name">
            <SettingsInput
              value={settings.lab_name || ''}
              onSave={(v) => updateSettings.mutate({ lab_name: v })}
              placeholder="Enter lab name"
            />
          </SettingsField>
          <SettingsField label="Description">
            <SettingsInput
              value={settings.lab_description || ''}
              onSave={(v) => updateSettings.mutate({ lab_description: v })}
              placeholder="Describe your lab's focus"
              multiline
            />
          </SettingsField>
          <SettingsField label="Lab Icon (Emoji)">
            <SettingsInput
              value={settings.lab_icon || ''}
              onSave={(v) => updateSettings.mutate({ lab_icon: v })}
              placeholder="🧬"
            />
          </SettingsField>
          <SettingsField label="Lab Type">
            <select
              value={settings.lab_type || 'clinical_research'}
              onChange={(e) => updateSettings.mutate({ lab_type: e.target.value })}
              className="w-full rounded-md border px-3 py-2 text-sm cursor-pointer"
              style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)', color: 'var(--ink)' }}
            >
              <option value="clinical_research">Clinical Research</option>
              <option value="basic_science">Basic Science</option>
              <option value="translational">Translational</option>
              <option value="computational">Computational</option>
              <option value="mixed">Mixed Methods</option>
            </select>
          </SettingsField>
        </SettingsSection>

        {/* Workflow Templates */}
        <SettingsSection title="Workflow Templates" subtitle="Define custom project stages for different project types" icon={Layers}>
          <div className="flex flex-col gap-4">
            {templates.map((template) => {
              const stages: string[] = JSON.parse(template.stages)
              return (
                <div key={template.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                        {template.name}
                      </span>
                      {template.is_default === 1 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.08)' }}>
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((stage, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-xs px-2 py-1 rounded-full border" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', borderColor: 'var(--border-light)' }}>
                          {stage}
                        </span>
                        {i < stages.length - 1 && (
                          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.3 }}>→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <CreateTemplateForm onSubmit={(name, stages) => createTemplate.mutate({ name, stages })} />
        </SettingsSection>

        {/* Save indicator */}
        {saved && (
          <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border" style={{ backgroundColor: 'white', borderColor: 'var(--teal)' }}>
            <Check size={14} style={{ color: 'var(--teal)' }} />
            <span className="text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)' }}>Saved</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Settings Section ─────────────────────────────────────────

function SettingsSection({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: 'var(--border-light)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(45,138,138,0.08)' }}>
          <Icon size={16} style={{ color: 'var(--teal)' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{title}</h3>
          <p className="text-xs" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.6 }}>{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}

// ── Settings Field ───────────────────────────────────────────

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>
        {label}
      </label>
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
    fontFamily: 'var(--font-sans)',
    fontSize: '14px',
    color: 'var(--ink)',
    borderColor: 'var(--border-light)',
    backgroundColor: 'white',
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
        style={{ borderColor: 'var(--border-light)', color: 'var(--teal)', fontFamily: 'var(--font-sans)', cursor: 'pointer', background: 'none' }}
      >
        <Plus size={14} />
        Create Custom Template
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-lg border p-4" style={{ borderColor: 'var(--teal)', backgroundColor: 'rgba(45,138,138,0.02)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>New Workflow Template</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)' }}>
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
          style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
          autoFocus
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)' }}>Stages (in order)</span>
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <GripVertical size={12} style={{ color: 'var(--slate)', opacity: 0.3 }} />
              <input
                type="text"
                value={stage}
                onChange={(e) => updateStage(i, e.target.value)}
                placeholder={`Stage ${i + 1}`}
                className="flex-1 rounded-md border px-3 py-1.5 text-sm outline-none"
                style={{ fontFamily: 'var(--font-sans)', borderColor: 'var(--border-light)' }}
              />
              {stages.length > 1 && (
                <button onClick={() => removeStage(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', opacity: 0.5 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addStage}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded self-start"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            <Plus size={12} /> Add stage
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || stages.filter((s) => s.trim()).length < 2}
            className="px-3 py-1.5 rounded-md text-sm font-medium"
            style={{ fontFamily: 'var(--font-sans)', backgroundColor: 'var(--teal)', color: 'white', cursor: 'pointer', border: 'none', opacity: (!name.trim() || stages.filter((s) => s.trim()).length < 2) ? 0.5 : 1 }}
          >
            Create Template
          </button>
        </div>
      </div>
    </div>
  )
}
