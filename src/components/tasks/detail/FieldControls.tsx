import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Circle, Flag, Check, FolderKanban, Clock, Handshake,
} from 'lucide-react'
import Avatar from '../../Avatar'
import HoverCard from '../../HoverCard'
import type { HoverCardData } from '../../HoverCard'
import { useHoverCard } from '../../../hooks/useHoverCard'
import { getPersonInfo } from '../../../data/team'
import { formatShortDate } from '../../../lib/dateUtils'
import InlineDatePicker from '../../InlineDatePicker'
import { useTeam } from '../../../hooks/useApiData'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../../lib/taskConstants'

// ── Field Block Wrapper ──────────────────────────────────────

export function FieldBlock({ label, icon: Icon, children, noContainer }: { label: string; icon: typeof Circle; children: React.ReactNode; noContainer?: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-xs)' }}>
      <label className="flex items-center" style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
        <Icon size={11} style={{ opacity: 0.85 }} />
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
      style={{ color: value ? 'var(--ink)' : 'var(--slate)', opacity: value ? 1 : 0.85, whiteSpace: 'pre-wrap' }}
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
              borderColor: active ? s.color : 'var(--border-subtle)',
              backgroundColor: active ? `color-mix(in srgb, ${s.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.85,
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
              borderColor: active ? p.color : 'var(--border-subtle)',
              backgroundColor: active ? `color-mix(in srgb, ${p.color} 8%, transparent)` : 'transparent',
              cursor: 'pointer',
              opacity: active ? 1 : 0.85,
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
  const [search, setSearch] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { data: team = [] } = useTeam()
  const person = getPersonInfo(value)
  const members = team.filter((m) => m.slug).sort((a, b) => a.name.localeCompare(b.name))
  const q = search.toLowerCase()
  const filteredMembers = q ? members.filter((m) => m.name.toLowerCase().includes(q) || (m.slug || '').toLowerCase().includes(q)) : members

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
    setSearch('')
    setFocusedIdx(-1)
    setTimeout(() => searchRef.current?.focus(), 0)
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, filteredMembers.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = focusedIdx >= 0 ? focusedIdx : 0
      const pick = filteredMembers[idx]
      if (pick?.slug) { onChange(pick.slug); setOpen(false) }
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ borderColor: 'var(--border-subtle)', cursor: 'pointer', background: 'none' }}
      >
        <div style={{ width: 28, height: 28 }}>
          <Avatar name={person.name} initials={person.initials} photoUrl={person.photoUrl} size="base-sm" variant="ice" />
        </div>
        <span className="text-sm" style={{ color: 'var(--ink)' }}>{person.name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border min-w-[220px]" style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}>
          <div className="px-2 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0) }}
              onKeyDown={handleKeyDown}
              placeholder="Filter people..."
              className="w-full text-sm bg-transparent outline-none px-2 py-1"
              style={{ color: 'var(--ink)' }}
            />
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
          {filteredMembers.length === 0 && (
            <div className="px-3 py-2 text-sm" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>No matches</div>
          )}
          {filteredMembers.map((m, idx) => {
            const slug = m.slug!
            const mp = getPersonInfo(slug)
            const selected = slug === value
            const focused = idx === focusedIdx
            return (
              <button
                key={slug}
                onClick={() => { onChange(slug); setOpen(false) }}
                onMouseEnter={() => setFocusedIdx(idx)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors"
                style={{ color: 'var(--ink)', cursor: 'pointer', background: focused ? 'var(--teal-active)' : 'none', border: 'none' }}
              >
                <div style={{ width: 24, height: 24 }}>
                  <Avatar name={mp.name} initials={mp.initials} photoUrl={mp.photoUrl} size="tight" variant="ice" />
                </div>
                <span className="flex-1">{m.name}</span>
                {taskCounts && taskCounts[slug] ? (
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: taskCounts[slug] > 8 ? 'rgba(122,0,25,0.1)' : taskCounts[slug] > 4 ? 'rgba(194,65,12,0.1)' : 'var(--teal-active)',
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
        </div>
      )}
    </div>
  )
}

// ── Date Input ───────────────────────────────────────────────
// One date affordance everywhere (handoff §3): the boxed date button is
// retired in favour of the shared, portal-positioned InlineDatePicker (which
// also carries the canonical overdue/today/this-week labels + quick presets).
// Kept as a thin wrapper so the `''`↔`null` contract its callers rely on is
// preserved.

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <InlineDatePicker value={value || null} onChange={(d) => onChange(d ?? '')} />
}

// ── Workflow Section ─────────────────────────────────────────
// Renders the v55 follow-up fields: waiting_on, next_checkin_date,
// promised_to, promise_date. Distinct from HandoffSection (to_slug + ack).

export interface WorkflowFields {
  waiting_on?: string | null
  next_checkin_date?: string | null
  promised_to?: string | null
  promise_date?: string | null
}

function WorkflowTextInput({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => { onSave(draft.trim() || null) }
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
      className="w-full text-sm outline-none rounded-md px-3 py-1.5"
      style={{ color: 'var(--ink)', background: 'var(--field-bg, rgba(0,0,0,0.04))', border: '1px solid var(--border-subtle)' }}
    />
  )
}

function WorkflowDateInput({ value, onSave }: { value: string; onSave: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const formatted = value ? formatShortDate(value) : null
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => inputRef.current?.showPicker()}
        className="text-sm rounded-md px-2.5 py-1.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{ color: formatted ? 'var(--ink)' : 'var(--slate)', opacity: formatted ? 1 : 0.7, cursor: 'pointer', background: 'none', border: '1px solid var(--border-subtle)' }}
      >
        {formatted || 'Set date…'}
      </button>
      <input ref={inputRef} type="date" value={value} onChange={(e) => onSave(e.target.value || null)} className="sr-only" tabIndex={-1} />
      {value && (
        <button onClick={() => onSave(null)} className="text-xs px-1 rounded" style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.6 }}>&times;</button>
      )}
    </div>
  )
}

export function WorkflowSection({ fields, onChange }: { fields: WorkflowFields; onChange: (patch: Partial<WorkflowFields>) => void }) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-sm, 10px)' }}>
      <div className="grid grid-cols-2" style={{ gap: 'var(--sp-sm, 10px)' }}>
        {/* Waiting on */}
        <div className="flex flex-col" style={{ gap: 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 'var(--sp-xs, 6px)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Clock size={11} style={{ opacity: 0.85 }} />
            Waiting on
          </label>
          <WorkflowTextInput
            value={fields.waiting_on ?? ''}
            placeholder="Who or what am I waiting on…"
            onSave={(v) => onChange({ waiting_on: v })}
          />
        </div>
        {/* Next check-in */}
        <div className="flex flex-col" style={{ gap: 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 'var(--sp-xs, 6px)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Clock size={11} style={{ opacity: 0.85 }} />
            Next check-in
          </label>
          <WorkflowDateInput value={fields.next_checkin_date ?? ''} onSave={(v) => onChange({ next_checkin_date: v })} />
        </div>
        {/* Promised to */}
        <div className="flex flex-col" style={{ gap: 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 'var(--sp-xs, 6px)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Handshake size={11} style={{ opacity: 0.85 }} />
            Promised to
          </label>
          <WorkflowTextInput
            value={fields.promised_to ?? ''}
            placeholder="Who did I commit this to…"
            onSave={(v) => onChange({ promised_to: v })}
          />
        </div>
        {/* Promise date */}
        <div className="flex flex-col" style={{ gap: 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 'var(--sp-xs, 6px)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Handshake size={11} style={{ opacity: 0.85 }} />
            By when
          </label>
          <WorkflowDateInput value={fields.promise_date ?? ''} onSave={(v) => onChange({ promise_date: v })} />
        </div>
      </div>
    </div>
  )
}

// ── Project Select ───────────────────────────────────────────

export function ProjectSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [])
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
    updatePosition()
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, updatePosition])

  return (
    <div className="relative" ref={ref}>
      <button
        ref={(el) => {
          buttonRef.current = el
          ;(hoverCard.triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = el
        }}
        onClick={() => setOpen(!open)}
        onMouseEnter={current && !open ? hoverCard.handlers.onMouseEnter : undefined}
        onMouseLeave={current && !open ? hoverCard.handlers.onMouseLeave : undefined}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
        style={{
          color: current ? 'var(--teal)' : 'var(--slate)',
          cursor: 'pointer',
          background: current ? 'var(--teal-hover)' : 'none',
          border: 'none',
          opacity: current ? 1 : 0.85,
        }}
      >
        <FolderKanban size={13} style={{ opacity: 0.85 }} />
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
        const handleKeyDown = (e: React.KeyboardEvent) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter') {
            e.preventDefault()
            const idx = focusedIdx >= 0 ? focusedIdx : 0
            const pick = filtered[idx]
            if (pick) { onChange(pick.slug); setSearch(''); setOpen(false) }
          }
          else if (e.key === 'Escape') { setSearch(''); setOpen(false) }
        }
        return createPortal(
        <div
          ref={dropdownRef}
          className="rounded-lg border min-w-[260px]"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            backgroundColor: 'var(--cream)',
            borderColor: 'var(--border-subtle)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 'var(--z-toast)' as unknown as number,
            maxHeight: '320px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <input
              ref={searchRef}
              autoFocus
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0) }}
              placeholder="Search projects..."
              className="w-full text-sm bg-transparent outline-none px-2 py-1"
              style={{ color: 'var(--ink)' }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="py-1 max-h-[240px] overflow-y-auto">
            {!q && (
              <button
                onClick={() => { onChange(''); setSearch(''); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--slate)', cursor: 'pointer', background: 'none', border: 'none', opacity: 0.85 }}
              >
                No project
                {!value && <Check size={14} style={{ color: 'var(--teal)', marginLeft: 'auto' }} />}
              </button>
            )}
            {filtered.map((p, idx) => {
              const selected = p.slug === value
              const focused = idx === focusedIdx
              return (
                <button
                  key={p.slug}
                  onClick={() => { onChange(p.slug); setSearch(''); setOpen(false) }}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors"
                  style={{ color: 'var(--ink)', cursor: 'pointer', background: focused ? 'var(--teal-active)' : 'none', border: 'none' }}
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
        </div>,
        document.body
        )
      })()}
    </div>
  )
}
