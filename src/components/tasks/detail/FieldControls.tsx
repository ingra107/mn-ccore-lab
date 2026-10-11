import { useState, useEffect, useRef } from 'react'
import { useProjectPickerList } from '../../../hooks/useProjectPickerList'
import { TASK_KIND_OPTIONS, statusOptionsFor } from '../../../../shared/taskKinds'
import GhostSelect from '../../ui/GhostSelect'
import {
  Circle, Clock, Handshake,
} from 'lucide-react'
import InlineDatePicker from '../../InlineDatePicker'
import { isDoneStatus } from '../../../lib/dateUtils'
import { ICON_PROPS } from '../../../lib/iconProps'
import { projectShortLabel } from '../../../lib/displayNames'

// ── Field Block Wrapper ──────────────────────────────────────

export function FieldBlock({ label, icon: Icon, children, noContainer }: { label: string; icon: typeof Circle; children: React.ReactNode; noContainer?: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--sp-xs)' }}>
      <label className="flex items-center" style={{ gap: 'var(--sp-xs)', fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
        <Icon {...ICON_PROPS} size={11} style={{ opacity: 0.85 }} />
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
        className="w-full outline-none border-b-2 pb-1"
        style={{
          fontSize: '1.125rem',
          fontWeight: 'var(--weight-heading, 600)',
          color: 'var(--ink)',
          borderColor: 'var(--teal)',
          background: 'none',
        }}
      />
    )
  }

  return (
    <h3
      onClick={() => setEditing(true)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true) } }}
      aria-label="Edit title"
      className="cursor-text rounded px-1 -mx-1 py-0.5 transition-colors hov-bg"
      style={{
        fontSize: '1.125rem',
        fontWeight: 'var(--weight-heading, 600)',
        color: 'var(--ink)',
        // Resting: no border, no box. Hover: subtle bg tint only.
        background: 'none',
        '--hov-bg': 'var(--hover-subtle)',
      } as React.CSSProperties}
    >
      {value}
    </h3>
  )
}

// ── Editable Short Title ─────────────────────────────────────
// Mirrors ProjectDetail's short_name affordance (click-to-edit span → input,
// save on blur/Enter, Escape cancels). The row renders `short_title || title`
// (Rule 68), so edits surface immediately. Empty state invites adding one.

export function EditableShortTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = () => {
    setEditing(false)
    if (draft.trim() !== value.trim()) onSave(draft.trim())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
        placeholder="Short title (concise row label)…"
        className="w-full text-sm outline-none border-b pb-0.5"
        style={{ color: 'var(--ink)', borderColor: 'var(--teal)', background: 'none', minWidth: 0 }}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-text hover:bg-black/[0.02] dark:hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
      style={{
        display: 'block',
        fontSize: 'var(--value-size)',
        color: 'var(--slate)',
        opacity: 0.85,
        fontStyle: value ? 'normal' : 'italic',
        overflowWrap: 'anywhere',
      }}
    >
      {value || 'Add short title…'}
    </span>
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

// ── Date Input ───────────────────────────────────────────────
// One date affordance everywhere (handoff §3): the boxed date button is
// retired in favour of the shared, portal-positioned InlineDatePicker (which
// also carries the canonical overdue/today/this-week labels + quick presets).
// Kept as a thin wrapper so the `''`↔`null` contract its callers rely on is
// preserved.

export function DateInput({ value, onChange, done }: { value: string; onChange: (v: string) => void; done?: boolean }) {
  return <InlineDatePicker value={value || null} onChange={(d) => onChange(d ?? '')} done={done} />
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

function WorkflowTextInput({ value, placeholder, onSave, compact }: { value: string; placeholder: string; onSave: (v: string | null) => void; compact?: boolean }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => { onSave(draft.trim() || null) }
  // compact=true (Today drawer): smaller input — px-2 py-1 text-xs vs px-3 py-1.5 text-sm.
  const sizeClass = compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
      // compact (Today drawer) = the .tk ghost: no box at rest, hover tint only,
      // a quiet ring on focus. The full editor keeps the boxed field.
      className={`w-full outline-none rounded-md ${sizeClass}${compact ? ' hov-bg' : ''}`}
      style={compact
        ? ({ color: 'var(--ink)', background: 'transparent', border: `1px solid ${focused ? 'var(--teal)' : 'transparent'}`, '--hov-bg': 'var(--hover-subtle)' } as React.CSSProperties)
        : { color: 'var(--ink)', background: 'var(--field-bg, rgba(0,0,0,0.04))', border: '1px solid var(--border-subtle)' }}
    />
  )
}

// P1-4: route through the shared InlineDatePicker so the FIRST click opens the
// rich in-app popover (presets + month grid + Clear), not the native OS picker
// via showPicker(). The native-input path was the last surviving instance of
// the date click-chain class P1-3 retired.
function WorkflowDateInput({ value, onSave }: { value: string; onSave: (v: string | null) => void }) {
  return <InlineDatePicker value={value || null} onChange={onSave} />
}

export function WorkflowSection({ fields, onChange, compact }: { fields: WorkflowFields; onChange: (patch: Partial<WorkflowFields>) => void; compact?: boolean }) {
  // compact=true (Today drawer): smaller label font + tighter row gap.
  const labelSize = compact ? '10px' : 'var(--label-size)'
  const rowGap = compact ? 4 : undefined  // undefined → falls back to CSS var
  return (
    <div className="flex flex-col" style={{ gap: compact ? 8 : 'var(--sp-sm, 10px)' }}>
      <div className="grid grid-cols-2" style={{ gap: compact ? 8 : 'var(--sp-sm, 10px)' }}>
        {/* Waiting on */}
        <div className="flex flex-col" style={{ gap: rowGap ?? 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 4, fontSize: labelSize, color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Clock {...ICON_PROPS} size={10} style={{ opacity: 0.75 }} />
            Waiting on
          </label>
          <WorkflowTextInput
            value={fields.waiting_on ?? ''}
            placeholder="Who or what…"
            onSave={(v) => onChange({ waiting_on: v })}
            compact={compact}
          />
        </div>
        {/* Next check-in */}
        <div className="flex flex-col" style={{ gap: rowGap ?? 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 4, fontSize: labelSize, color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Clock {...ICON_PROPS} size={10} style={{ opacity: 0.75 }} />
            Next check-in
          </label>
          <WorkflowDateInput value={fields.next_checkin_date ?? ''} onSave={(v) => onChange({ next_checkin_date: v })} />
        </div>
        {/* Promised to */}
        <div className="flex flex-col" style={{ gap: rowGap ?? 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 4, fontSize: labelSize, color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Handshake {...ICON_PROPS} size={10} style={{ opacity: 0.75 }} />
            Promised to
          </label>
          <WorkflowTextInput
            value={fields.promised_to ?? ''}
            placeholder="Who I committed to…"
            onSave={(v) => onChange({ promised_to: v })}
            compact={compact}
          />
        </div>
        {/* Promise date */}
        <div className="flex flex-col" style={{ gap: rowGap ?? 'var(--sp-xs, 6px)' }}>
          <label className="flex items-center" style={{ gap: 4, fontSize: labelSize, color: 'var(--slate)', opacity: 'var(--ink-label)', fontWeight: 'var(--label-weight)' }}>
            <Handshake {...ICON_PROPS} size={10} style={{ opacity: 0.75 }} />
            By when
          </label>
          <WorkflowDateInput value={fields.promise_date ?? ''} onSave={(v) => onChange({ promise_date: v })} />
        </div>
      </div>
    </div>
  )
}

// ── Inline Ghost Selects (shared by TaskDetailPanel, TaskDetailDrawer, InlineDetail) ──
//
// The option list lives in hooks/useProjectPickerList so sibling controls (e.g.
// TaskRowActions' navigation arrow) resolve a row's project from the SAME cache
// this chip labels itself from — see that file for the divergence it prevents.

export function ProjectInlineGhostSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: projectList = [] } = useProjectPickerList()

  const options = [
    { value: '', label: 'No project' },
    ...projectList.map((p) => ({ value: p.slug, label: projectShortLabel(p) })),
  ]

  return (
    <GhostSelect
      aria-label="Project"
      value={value}
      onChange={onChange}
      options={options}
      triggerColor={value ? 'var(--teal)' : undefined}
      maxWidth={160}
      searchable
    />
  )
}

export function DueInlineSelect({ value, onChange, title = 'Due date', done }: { value: string; onChange: (v: string) => void; title?: string; done?: boolean }) {
  // #82 (Nick 2026-06-24): the date control is a single ghost pill — the inner
  // InlineDatePicker already provides the hover tint. The old wrapper added its
  // OWN hover tint + padding around the picker, which double-layered and read as
  // a box. Keep only the tooltip + alignment; let the picker be the one ghost.
  //
  // `title` override (Nick 2026-09-17): a milestone shows TWO of these side by
  // side (due_date = internal date, deadline = hard date) and each needs its
  // own tooltip to disambiguate — a plain task keeps the "Due date" default.
  return (
    <div data-ghost-pill title={title} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <DateInput value={value} onChange={onChange} done={done} />
    </div>
  )
}

// ── Task Inline Field Row ────────────────────────────────────
// THE canonical Status·Priority·Project·Due row for the inline expand
// surfaces (TaskDetailDrawer on Today, InlineDetail on MyTasks). One
// shared renderer — Rule 68: add a prop, never re-fork per surface.
// TaskDetailPanel keeps its own variant (Delete button + recurrence
// context) as the reference; the two DRAWERS share this one.

const STATUS_INLINE_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_external', label: 'Waiting (Ext.)' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]
const PRIORITY_INLINE_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export function TaskInlineFieldRow({
  status,
  priority,
  kind,
  projectId,
  dueDate,
  hideDue,
  onUpdate,
  style,
}: {
  status: string
  priority: string | null | undefined
  /** schema-v109 — every caller passes task.kind. */
  kind: string | null | undefined
  projectId: string | null | undefined
  dueDate: string | null | undefined
  /** #143: the Today drawer renders the due-date control in its action row
   *  instead, so the same fact is not shown twice. Default false: every other
   *  surface keeps Due in this row. */
  hideDue?: boolean
  onUpdate: (fields: Record<string, unknown>) => void
  onOpenEditor: () => void
  /** Wrapper style override — surfaces differ only in outer spacing. */
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 4, ...style }}
      onClick={(e) => e.stopPropagation()}
    >
      <GhostSelect
        aria-label="Status"
        value={status}
        onChange={(v) => onUpdate({ status: v })}
        options={statusOptionsFor(STATUS_INLINE_OPTIONS, kind, status)}
      />
      <GhostSelect
        aria-label="Priority"
        value={priority || 'medium'}
        onChange={(v) => onUpdate({ priority: v })}
        options={PRIORITY_INLINE_OPTIONS}
      />
      {/* A question is minted, never picked (its kind isn't in
          TASK_KIND_OPTIONS) — hide the select rather than show a value the
          picker cannot represent (shared/taskKinds.ts). */}
      {kind !== 'question' && (
        <GhostSelect
          aria-label="Kind"
          value={kind || 'task'}
          onChange={(v) => onUpdate({ kind: v })}
          options={[...TASK_KIND_OPTIONS]}
        />
      )}
      <ProjectInlineGhostSelect
        value={projectId || ''}
        onChange={(v) => onUpdate({ project_id: v || null })}
      />
      {!hideDue && (
        <DueInlineSelect
          value={dueDate || ''}
          onChange={(v) => onUpdate({ due_date: v || null })}
          done={isDoneStatus(status)}
        />
      )}
      {/* "Open full editor" moved to the surface-level action bar (#114).
          onOpenEditor prop kept for TaskDetailDrawer, which still needs it
          for the "view all →" / full-panel open path. */}
    </div>
  )
}

