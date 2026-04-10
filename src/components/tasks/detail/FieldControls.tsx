import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Circle, Flag, Check, FolderKanban,
} from 'lucide-react'
import Avatar from '../../Avatar'
import HoverCard from '../../HoverCard'
import type { HoverCardData } from '../../HoverCard'
import { useHoverCard } from '../../../hooks/useHoverCard'
import { getPersonInfo } from '../../../data/team'
import { formatMediumDate } from '../../../lib/dateUtils'
import { useTeam } from '../../../hooks/useApiData'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../../lib/taskConstants'

// ── Field Block Wrapper ──────────────────────────────────────

export function FieldBlock({ label, icon: Icon, children, noContainer }: { label: string; icon: typeof Circle; children: React.ReactNode; noContainer?: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-xs)' }}>
      <label className="flex items-center" style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
        <Icon size={11} style={{ opacity: 0.6 }} />
        {label}
      </label>
      {noContainer ? (
        <div className="min-w-0">{children}</div>
      ) : (
        <div className="field-container">{children}</div>
      )}
    </div>
  )
}

// ── Editable Title ───────────────────────────────────────────

export function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        className="w-full text-lg font-semibold outline-none border-b-2 pb-1"
        style={{ color: 'var(--ink)', borderColor: 'var(--teal)', background: 'none' }}
      />
    )
  }

  return (
    <h3
      onClick={() => setEditing(true)}
      className="text-lg font-normal cursor-text hover:bg-black/[0.02] dark:hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
      style={{ color: 'var(--ink)' }}
    >
      {value}
    </h3>
  )
}

// ── Editable Textarea ────────────────────────────────────────

export function EditableTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = () => {
    if (draft !== value) onSave(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        rows={3}
        className="w-full text-sm outline-none border rounded-md px-3 py-2 resize-none"
        style={{ color: 'var(--ink)', borderColor: 'var(--teal)', background: 'none' }}
      />
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="text-sm cursor-text hover:bg-black/[0.02] dark:hover:bg-white/[0.04] rounded px-3 py-2 -mx-1 transition-colors min-h-[60px]"
      style={{ color: value ? 'var(--ink)' : 'var(--slate)', opacity: value ? 1 : 0.5, whiteSpace: 'pre-wrap' }}
    >
      {value || placeholder}
    </div>
  )
}

// ── Status Select ────────────────────────────────────────────

export function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUS_OPTIONS.map((s) => {
        const Icon = s.icon
        const active = value === s.value
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs border transition-colors status-transition"
            style={{
              fontWeight: active ? 600 : 400,
              color: active ? s.color : 'var(--slate)',
              borderColor: active ? s.color : 'var(--border-light)',
              backgroundColor: active ? `color-mix(in srgb, ${s.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.7,
            }}
          >
            <Icon size={12} />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Priority Select ──────────────────────────────────────────

export function PrioritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {PRIORITY_OPTIONS.map((p) => {
        const active = value === p.value
        return (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className="flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs border transition-colors status-transition"
            style={{
              fontWeight: active ? 600 : 400,
              color: active ? p.color : 'var(--slate)',
              borderColor: active ? p.color : 'var(--border-light)',
              backgroundColor: active ? `color-mix(in srgb, ${p.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.7,
            }}
          >
            <Flag size={10} />
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Assignee Select ──────────────────────────────────────────

export function AssigneeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: team = [] } = useTeam()
  const person = getPersonInfo(value)
  const members = team.filter((m) => m.slug).sort((a, b) => a.name.localeCompare(b.name))

  // Workload counts — lightweight query
  const { data: taskCounts } = useQuery<Record<string, number>>({
    queryKey: ['assignee-workload'],
    queryFn: async () => {
      const res = await fetch('/api/tasks?status=todo,in_progress')
      const json = await res.json() as { data: { assignee: string }[] }
      const counts: Record<string, number> = {}
      for (const t of json.data || []) {
        if (t.assignee) counts[t.assignee] = (counts[t.assignee] || 0) + 1
      }
      return counts
    },
    staleTime: 60_000,
    enabled: open,
  })

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ borderColor: 'var(--border-subtle)', cursor: 'pointer', background: 'none' }}
      >
        <div style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="sm" variant="ice" className="!w-7 !h-7 !min-w-0 !min-h-0 !text-[8px]" />
        </div>
        <span className="text-sm" style={{ color: 'var(--ink)' }}>{person.name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[200px] max-h-[240px] overflow-y-auto" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          {members.map((m) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            const selected = slug === value
            return (
              <button
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                <div style={{ width: 24, height: 24 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="sm" variant="ice" className="!w-6 !h-6 !min-w-0 !min-h-0 !text-[7px]" />
                </div>
                <span className="flex-1">{m.name}</span>
                {taskCounts && taskCounts[slug] ? (
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: taskCounts[slug] > 8 ? 'rgba(122,0,25,0.1)' : taskCounts[slug] > 4 ? 'rgba(194,65,12,0.1)' : 'rgba(45,138,138,0.08)',
                    color: taskCounts[slug] > 8 ? 'var(--maroon)' : taskCounts[slug] > 4 ? 'var(--orange)' : 'var(--teal)',
                  }}>
                    {taskCounts[slug]} tasks
                  </span>
                ) : null}
                {selected && <Check size={14} style={{ color: 'var(--teal)' }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Date Input ───────────────────────────────────────────────

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isOverdue = value && new Date(value + 'T23:59:59') < new Date()

  const formatted = value ? formatMediumDate(value) : null

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => inputRef.current?.showPicker()}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{
          color: isOverdue ? 'var(--maroon)' : formatted ? 'var(--ink)' : 'var(--slate)',
          fontWeight: isOverdue ? 600 : 400,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          opacity: formatted ? 1 : 0.6,
        }}
      >
        {formatted || 'Set date...'}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 'var(--ink-hint)' }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ── Project Select ───────────────────────────────────────────

export function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { data: projectList = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.data as { slug: string; title: string; stage?: string; status?: string; pi?: string; category?: string; description?: string; updated_at?: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  const current = projectList.find((p) => p.slug === value)

  // Hover card for project preview
  const hoverCard = useHoverCard()
  const hoverCardData: HoverCardData | null = current ? {
    type: 'project',
    title: current.title,
    stage: current.stage,
    status: current.status,
    pi: current.pi,
    category: current.category,
    description: current.description,
    updated_at: current.updated_at,
  } : null

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        ref={hoverCard.triggerRef as React.RefObject<HTMLButtonElement>}
        onClick={() => setOpen(!open)}
        onMouseEnter={current && !open ? hoverCard.handlers.onMouseEnter : undefined}
        onMouseLeave={current && !open ? hoverCard.handlers.onMouseLeave : undefined}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{
          color: current ? 'var(--teal)' : 'var(--slate)',
          cursor: 'pointer',
          background: current ? 'rgba(45,138,138,0.06)' : 'none',
          border: 'none',
          opacity: current ? 1 : 0.6,
        }}
      >
        <FolderKanban size={13} style={{ opacity: 0.7 }} />
        {current ? current.title : 'No project'}
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {/* Project hover preview card */}
      {hoverCardData && !open && (
        <HoverCard
          data={hoverCardData}
          isVisible={hoverCard.isVisible}
          position={hoverCard.position}
          cardRef={hoverCard.cardRef}
          cardHandlers={hoverCard.cardHandlers}
        />
      )}
      {open && (() => {
        const q = search.toLowerCase()
        const filtered = q ? projectList.filter((p) => p.title.toLowerCase().includes(q)) : projectList
        return (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border min-w-[260px]" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          <div className="px-2 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <input
              ref={searchRef}
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full text-sm bg-transparent outline-none px-2 py-1"
              style={{ color: 'var(--ink)' }}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearch(''); setOpen(false) } }}
            />
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
            {!q && (
              <button
                onClick={() => { onChange(''); setSearch(''); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.6 }}
              >
                No project
                {!value && <Check size={14} style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
              </button>
            )}
            {filtered.map((p) => {
              const selected = p.slug === value
              return (
                <button
                  key={p.slug}
                  onClick={() => { onChange(p.slug); setSearch(''); setOpen(false) }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  style={{ color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
                >
                  <span className="flex-1 truncate">{p.title}</span>
                  {selected && <Check size={14} style={{ color: 'var(--teal)' }} />}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No matches</div>
            )}
          </div>
        </div>
        )
      })()}
    </div>
  )
}
