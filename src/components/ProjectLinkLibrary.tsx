/**
 * ProjectLinkLibrary — the project page's ONE Links card.
 *
 * WHY THIS EXISTS (Nick, 2026-08-25): "the project page should have all links
 * and documents and artifacts with time stamps and such but only the current
 * ones should be used." Before it, the page rendered only the three
 * denormalized key_link_1/2/3 slots via KeyLinksEditor, while task cards
 * inherited the WHOLE unbounded links table — exactly backwards.
 *
 * ONE CARD, NOT TWO (#2091, 2026-09-24). The pinned slots are the top row of
 * this card (the `pinnedEditor` the page passes in), the library lists every
 * OTHER current row, and the archive sits collapsed at the bottom.
 *
 * TWO TIERS AND A KIND (#151, 2026-10-22; Nick's desk picks, layout "B: tier
 * first"). Pinned on top; then "On every task" (project-owned links: every task
 * on the project inherits them); then "From tasks" (documents the project's
 * tasks hold, this page only, each with its source task, Promote and Archive);
 * then the collapsed Archived group, both owners, each restorable. A kind
 * filter row (the kinds present, plus Unfiled) narrows every tier, and every
 * stored row carries its kind as a label and a picker. "Add document" files a
 * project-owned row. The project_documents table and its form are retired
 * (schema-v146): a project document is a `links` row with a kind.
 *
 * ARCHIVE / RESTORE: one meaning for both owners — archive stops a link
 * propagating beyond its owner, and the owner keeps it. A project link leaves
 * the task cards; a task link stays on its own task and moves here to
 * Archived. Restore sets the same row back to current; it never promotes.
 * PROMOTE copies a task's document onto the project (the task keeps its row),
 * so it moves from "From tasks" to "On every task". Derived rows (primary_folder
 * / github_url / box_url) have no stored row, so they carry no control.
 *
 * Dates: `updated_at` is the archive stamp for an archived link; `created_at`
 * is when a current one was filed. Both render through `formatDbLocal`.
 */

import { useState, type ReactNode } from 'react'
import { Archive, ArchiveRestore, ArrowUpToLine, Plus } from 'lucide-react'
import StoredLinkChip from './StoredLinkChip'
import CollapsibleSection from './CollapsibleSection'
import InlineSelect from './InlineSelect'
import { Button } from './ui/Button'
import { FilterLinks } from './ui/FilterLinks'
import {
  canChangeRole, canEditKind, kindFilterOptions, kindLabel, matchesKind, partitionForProjectPage,
  type KindFilter, type TaskDoc,
} from '../lib/projectLinkLibrary'
import { formatDbLocal } from '../lib/time'
import { stripLinkKindSuffix } from '../lib/linkIcon'
import { ICON_PROPS } from '../lib/iconProps'
import type { LinkKind, StoredLink } from '../hooks/useApiData'

import SectionHead from './ui/SectionHead'

type Role = 'key' | 'archive'

const iconBtnClass = 'tip opacity-60 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'

function KindPicker({ link, kinds, onSetKind }: {
  link: StoredLink
  kinds: ReadonlyArray<LinkKind>
  onSetKind: (link: StoredLink, kind: string | null) => void
}) {
  const label = kindLabel(link.kind, kinds)
  return (
    <InlineSelect
      value={link.kind ?? ''}
      options={[{ value: '', label: 'Unfiled' }, ...kinds.map((k) => ({ value: k.key, label: k.label }))]}
      onChange={(v) => onSetKind(link, v === '' ? null : v)}
      ariaLabel={`Kind: ${label}`}
      display={<span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</span>}
    />
  )
}

function LinkRow({
  link,
  dateField,
  onSetRole,
  kinds,
  onSetKind,
  source,
  onPromote,
}: {
  link: StoredLink
  dateField: 'created_at' | 'updated_at'
  onSetRole?: (link: StoredLink, role: Role) => void
  kinds?: ReadonlyArray<LinkKind>
  onSetKind?: (link: StoredLink, kind: string | null) => void
  /** "From tasks": the task name(s) holding this document. */
  source?: string
  onPromote?: (link: StoredLink) => void
}) {
  const date = formatDbLocal(link[dateField], 'date')
  const archived = link.role === 'archive'
  const label = archived ? 'Restore link' : 'Archive link'
  const name = link.short_title || link.canonical_url
  const chip = <StoredLinkChip link={{ ...link, short_title: link.short_title ? stripLinkKindSuffix(link.short_title) : link.short_title }} />
  return (
    <div className="group flex items-center justify-between gap-2">
      {source ? (
        <span className="flex flex-col" style={{ minWidth: 0, alignItems: 'flex-start' }}>
          {chip}
          <span style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            from {source}
          </span>
        </span>
      ) : chip}
      <span className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
        {kinds && onSetKind && canEditKind(link) && (
          <KindPicker link={link} kinds={kinds} onSetKind={onSetKind} />
        )}
        {date && (
          // --muted, not a dimmed --slate: the opacity policy floors secondary
          // text at 0.85 and reserves 0.55-0.70 for decoration.
          <span style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {date}
          </span>
        )}
        {onPromote && !archived && (
          <Button
            variant="ghost"
            onClick={() => onPromote(link)}
            data-tip="Put on every task"
            aria-label={`Put on every task: ${name}`}
            className={iconBtnClass}
            size="icon"
            style={{ color: 'var(--slate)' }}
          >
            <ArrowUpToLine {...ICON_PROPS} size={12} />
          </Button>
        )}
        {onSetRole && canChangeRole(link) && (
          <Button
            variant="ghost"
            onClick={() => onSetRole(link, archived ? 'key' : 'archive')}
            data-tip={label}
            aria-label={`${label}: ${name}`}
            className={iconBtnClass}
            size="icon"
            style={{ color: 'var(--slate)' }}
          >
            {archived
              ? <ArchiveRestore {...ICON_PROPS} size={12} />
              : <Archive {...ICON_PROPS} size={12} />}
          </Button>
        )}
      </span>
    </div>
  )
}

/** The source line for a task document: its task names, short. */
function sourceOf(doc: TaskDoc): string {
  const names = [...new Set(doc.rows.map((r) => r.task_title || 'a task'))]
  return names.length <= 2 ? names.join(', ') : `${names[0]} and ${names.length - 1} more tasks`
}

const inputStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--ink)',
  background: 'var(--cream)',
  border: '1px solid var(--field-edge)',
  borderRadius: 'var(--radius-md)',
  padding: '6px 8px',
  outline: 'none',
  width: '100%',
}

function AddDocument({ kinds, onAdd }: {
  kinds: ReadonlyArray<LinkKind>
  onAdd: (input: { url: string; title?: string; kind?: string | null }) => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('')
  const reset = () => { setUrl(''); setTitle(''); setKind(''); setOpen(false) }
  const canSave = url.trim().length > 0

  if (!open) {
    return (
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="Add a document to every task"
        className="flex items-center gap-1 self-start rounded transition-colors hov-opacity hov-bg"
        style={{
          padding: '3px 4px',
          fontSize: 'var(--text-small)',
          color: 'var(--job-accent)',
          opacity: 0.75,
          fontFamily: 'inherit',
          '--hov-opacity': '1',
          '--hov-bg': 'color-mix(in srgb, var(--job-accent) 6%, transparent)',
        } as React.CSSProperties}
      >
        <Plus {...ICON_PROPS} size={11} />
        Add document
      </Button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSave) return
        onAdd({ url: url.trim(), title: title.trim() || undefined, kind: kind || null })
        reset()
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); reset() } }}
      className="flex flex-col gap-2 p-3 rounded-lg"
      style={{ background: 'color-mix(in srgb, var(--sk-t1) 3%, transparent)' }}
    >
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" aria-label="Document link" autoFocus style={inputStyle} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Document title" style={inputStyle} />
      <div className="flex items-center justify-between gap-2">
        <InlineSelect
          value={kind}
          options={[{ value: '', label: 'Unfiled' }, ...kinds.map((k) => ({ value: k.key, label: k.label }))]}
          onChange={setKind}
          ariaLabel="Document kind"
          alwaysShowChevron
        />
        <span className="flex items-center gap-2">
          <Button variant="secondary" type="button" onClick={reset}
            style={{ borderRadius: 'var(--radius-md)', padding: '4px 10px', fontSize: 'var(--text-small)' }}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!canSave}
            style={{ borderRadius: 'var(--radius-md)', padding: '4px 10px', fontSize: 'var(--text-small)', fontWeight: 500 }}>
            Add
          </Button>
        </span>
      </div>
    </form>
  )
}

function TierHead({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', margin: '12px 0 6px' }}>{children}</div>
  )
}

interface Props {
  links: StoredLink[] | undefined
  isLoading?: boolean
  /** URLs the host already renders as pinned chips; matching rows are not repeated below. */
  slotUrls?: ReadonlyArray<string | null | undefined>
  /** The pinned-slot editor (KeyLinksEditor on the project page), rendered as the card's top row. */
  pinnedEditor?: ReactNode
  onSetRole?: (link: StoredLink, role: Role) => void
  /** Leave out the derived "Project folder" chip: the host shows the folder actions itself. */
  hideFolder?: boolean
  /** #151 tiers: the project's task-owned documents. Passing it turns the tiers on. */
  taskLinks?: StoredLink[]
  /** The link_kinds vocabulary; with onSetKind, every stored row gets a kind picker. */
  kinds?: LinkKind[]
  onSetKind?: (link: StoredLink, kind: string | null) => void
  onPromote?: (link: StoredLink) => void
  onAdd?: (input: { url: string; title?: string; kind?: string | null }) => void
}

export default function ProjectLinkLibrary({
  links, isLoading, slotUrls = [], pinnedEditor, onSetRole, hideFolder = false,
  taskLinks, kinds = [], onSetKind, onPromote, onAdd,
}: Props) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const tiers = taskLinks !== undefined
  const shown = hideFolder ? (links ?? []).filter((l) => !(l.role === 'derived' && l.type === 'local_folder')) : (links ?? [])
  const parts = isLoading
    ? { current: [], archived: [], fromTasks: [], archivedFromTasks: [] }
    : partitionForProjectPage(shown, slotUrls, taskLinks ?? [])

  const options = tiers ? kindFilterOptions([...shown, ...(taskLinks ?? [])], kinds) : []
  // A filter whose last row went away falls back to everything.
  const filter = kindFilter !== 'all' && !options.some((o) => o.value === kindFilter) ? 'all' : kindFilter
  const keep = (l: StoredLink) => matchesKind(l, filter)
  const current = parts.current.filter(keep)
  const archived = parts.archived.filter(keep)
  const fromTasks = parts.fromTasks.filter((d) => keep(d.link))
  const archivedFromTasks = parts.archivedFromTasks.filter((d) => keep(d.link))
  const archivedCount = archived.length + archivedFromTasks.length

  // A task document is one entry over every row holding its URL: archive /
  // restore acts on each task's own row; promote copies the first.
  const setDocRole = (doc: TaskDoc, role: Role) => {
    if (!onSetRole) return
    for (const r of doc.rows) if ((r.role ?? 'key') !== role) onSetRole(r, role)
  }
  const setDocKind = (doc: TaskDoc, kind: string | null) => {
    if (!onSetKind) return
    for (const r of doc.rows) if ((r.kind ?? null) !== kind) onSetKind(r, kind)
  }

  // With no pinned row to host, an empty library renders nothing at all.
  if (!pinnedEditor && !onAdd && parts.current.length === 0 && parts.archived.length === 0
      && parts.fromTasks.length === 0 && parts.archivedFromTasks.length === 0) return null

  const kindProps = onSetKind ? { kinds, onSetKind } : {}

  return (
    <div>
      <SectionHead as="h3" title="Links" />

      {pinnedEditor}

      {options.length > 1 && (
        <div style={{ marginTop: pinnedEditor ? '10px' : 0 }}>
          <FilterLinks<KindFilter>
            ariaLabel="Filter documents by kind"
            options={[{ value: 'all', label: 'All' }, ...options]}
            value={filter}
            onChange={(v) => setKindFilter(v === filter ? 'all' : v)}
          />
        </div>
      )}

      {tiers && (current.length > 0 || onAdd) && <TierHead>On every task</TierHead>}
      {current.length > 0 && (
        <div className="flex flex-col gap-1.5" style={{ marginTop: !tiers && pinnedEditor ? '10px' : 0 }}>
          {current.map((link) => (
            <LinkRow key={link.id} link={link} dateField="created_at" onSetRole={onSetRole} {...kindProps} />
          ))}
        </div>
      )}
      {onAdd && (
        <div style={{ marginTop: current.length > 0 ? '6px' : 0 }}>
          <AddDocument kinds={kinds} onAdd={onAdd} />
        </div>
      )}

      {tiers && fromTasks.length > 0 && (
        <>
          <TierHead>From tasks</TierHead>
          <div className="flex flex-col gap-1.5">
            {fromTasks.map((doc) => (
              <LinkRow
                key={doc.url}
                link={doc.link}
                dateField="created_at"
                source={sourceOf(doc)}
                onSetRole={onSetRole ? (_l, role) => setDocRole(doc, role) : undefined}
                onPromote={onPromote ? () => onPromote(doc.link) : undefined}
                {...(onSetKind ? { kinds, onSetKind: (_l: StoredLink, k: string | null) => setDocKind(doc, k) } : {})}
              />
            ))}
          </div>
        </>
      )}

      {archivedCount > 0 && (
        <div style={{ marginTop: '10px' }}>
          <CollapsibleSection
            title="Archived"
            badge={archivedCount}
            storageKey="project-links-archived"
          >
            {/* No wrapper opacity: it multiplies into every child (the design
                system forbids compound opacity). */}
            <div className="flex flex-col gap-1.5">
              {archived.map((link) => (
                <LinkRow key={link.id} link={link} dateField="updated_at" onSetRole={onSetRole} {...kindProps} />
              ))}
              {archivedFromTasks.map((doc) => (
                <LinkRow
                  key={`task:${doc.url}`}
                  link={doc.link}
                  dateField="updated_at"
                  source={sourceOf(doc)}
                  onSetRole={onSetRole ? (_l, role) => setDocRole(doc, role) : undefined}
                  {...(onSetKind ? { kinds, onSetKind: (_l: StoredLink, k: string | null) => setDocKind(doc, k) } : {})}
                />
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  )
}
