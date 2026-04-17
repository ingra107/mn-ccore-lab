import { useState } from 'react'
import { Link2, Plus, Pencil, Trash2, Check, X, ExternalLink, FolderOpen, Play } from 'lucide-react'

// Shared editor for the 3-slot key_link_1/2/3 + _desc pattern used on tasks
// and projects. Display mode shows teal underlined links; edit mode swaps in
// URL + description inputs. Empty state shows a single "+ Add a link" button.

export interface KeyLink {
  url: string | null | undefined
  desc: string | null | undefined
}

interface Props {
  /** Current value for the 3 slots. Fewer than 3 OK — empties are just `{url:null, desc:null}`. */
  links: KeyLink[]
  /**
   * Called with the full 3-slot array after any change (add, edit, remove).
   * Slots that are removed collapse left, so [slot1, slot3] → [slot1, slot3, empty]
   * keeps the same 1-based ordering the caller passes as key_link_1/2/3.
   */
  onSave: (next: KeyLink[]) => void
  /** Max slots. Defaults to 3 to match the schema. */
  maxSlots?: number
}

function classifyUrl(url: string) {
  const isHttp = url.startsWith('http')
  const isLocalPath = url.startsWith('file:///') || url.startsWith('C:') || (url.startsWith('/') && !url.startsWith('//'))
  const isBat = url.endsWith('.bat') || url.endsWith('.cmd') || url.endsWith('.ps1')
  let Icon = ExternalLink
  let href = url
  let typeLabel = 'Link'
  if (isBat) {
    Icon = Play
    href = `mnccore://launch/${url.replace('file:///', '')}`
    typeLabel = 'Script'
  } else if (isLocalPath) {
    Icon = FolderOpen
    href = `mnccore://open/${url.replace('file:///', '')}`
    typeLabel = 'Folder'
  }
  return { href, Icon, typeLabel, isHttp }
}

function LinkRow({
  link,
  onEdit,
  onRemove,
}: {
  link: KeyLink
  onEdit: () => void
  onRemove: () => void
}) {
  const url = link.url || ''
  const { href, Icon, typeLabel, isHttp } = classifyUrl(url)
  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ backgroundColor: 'var(--ice)' }}
    >
      <a
        href={href}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
      >
        <Icon size={14} />
      </a>
      <div className="flex-1 min-w-0">
        <a
          href={href}
          target={isHttp ? '_blank' : undefined}
          rel={isHttp ? 'noopener noreferrer' : undefined}
          className="text-sm truncate block hover:underline"
          style={{ color: 'var(--teal)', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 500 }}
          title={url}
        >
          {link.desc || url}
        </a>
        <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          {typeLabel}
        </span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          onClick={onEdit}
          title="Edit link"
          aria-label="Edit link"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '2px' }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onRemove}
          title="Remove link"
          aria-label="Remove link"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: '2px' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

function LinkForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: KeyLink
  onSave: (v: KeyLink) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState(initial.url || '')
  const [desc, setDesc] = useState(initial.desc || '')
  const canSave = url.trim().length > 0

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 'var(--text-small)',
    color: 'var(--ink)',
    background: 'var(--cream)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    padding: '6px 10px',
    outline: 'none',
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      if (canSave) onSave({ url: url.trim(), desc: desc.trim() || null })
    }
  }

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-lg"
      style={{ background: 'var(--ice)', border: '1px solid var(--border-subtle)' }}
      onKeyDown={handleKey}
    >
      <input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://... or file:///C:/... or .bat path"
        style={inputStyle}
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Description (optional)"
        style={inputStyle}
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 10px',
            fontSize: 'var(--text-small)',
            color: 'var(--slate)',
            cursor: 'pointer',
          }}
          title="Cancel (Esc)"
        >
          <X size={12} style={{ display: 'inline', marginRight: 4 }} /> Cancel
        </button>
        <button
          onClick={() => canSave && onSave({ url: url.trim(), desc: desc.trim() || null })}
          disabled={!canSave}
          style={{
            background: canSave ? 'var(--teal)' : 'var(--border-subtle)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '4px 10px',
            fontSize: 'var(--text-small)',
            color: canSave ? 'var(--ink-bright)' : 'var(--slate)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            fontWeight: 500,
          }}
          title="Save (Ctrl+Enter)"
        >
          <Check size={12} style={{ display: 'inline', marginRight: 4 }} /> Save
        </button>
      </div>
    </div>
  )
}

export default function KeyLinksEditor({ links, onSave, maxSlots = 3 }: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  // Normalize: drop empties, then pad to maxSlots for caller's 1..N slots semantics.
  const normalize = (arr: KeyLink[]) => {
    const populated = arr.filter((l) => (l.url || '').trim().length > 0)
    while (populated.length < maxSlots) populated.push({ url: null, desc: null })
    return populated.slice(0, maxSlots)
  }

  const populated = links.filter((l) => (l.url || '').trim().length > 0)
  const canAdd = populated.length < maxSlots

  const handleEditSave = (idx: number, v: KeyLink) => {
    const next = [...links]
    next[idx] = v
    onSave(normalize(next))
    setEditingIdx(null)
  }

  const handleRemove = (idx: number) => {
    const next = [...links]
    next[idx] = { url: null, desc: null }
    onSave(normalize(next))
  }

  const handleAdd = (v: KeyLink) => {
    const next = [...populated, v]
    onSave(normalize(next))
    setAddingNew(false)
  }

  return (
    <div>
      <label
        className="flex items-center gap-1.5 mb-1.5"
        style={{
          color: 'var(--slate)',
          opacity: 'var(--ink-label)',
          fontWeight: 'var(--label-weight)',
          fontSize: 'var(--label-size)',
        }}
      >
        <Link2 size={11} />
        Key Links
      </label>

      <div className="flex flex-col gap-1.5">
        {populated.map((link, idx) => {
          if (editingIdx === idx) {
            return (
              <LinkForm
                key={`edit-${idx}`}
                initial={link}
                onSave={(v) => handleEditSave(idx, v)}
                onCancel={() => setEditingIdx(null)}
              />
            )
          }
          return (
            <LinkRow
              key={`row-${idx}`}
              link={link}
              onEdit={() => setEditingIdx(idx)}
              onRemove={() => handleRemove(idx)}
            />
          )
        })}

        {addingNew && (
          <LinkForm
            initial={{ url: null, desc: null }}
            onSave={handleAdd}
            onCancel={() => setAddingNew(false)}
          />
        )}

        {canAdd && !addingNew && (
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 self-start"
            style={{
              background: 'none',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              fontSize: 'var(--text-small)',
              color: 'var(--slate)',
              opacity: 0.7,
              cursor: 'pointer',
              transition: 'opacity 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.background = 'var(--ice)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7'
              e.currentTarget.style.background = 'none'
            }}
          >
            <Plus size={12} />
            {populated.length === 0 ? 'Add a key link' : 'Add another'}
          </button>
        )}
      </div>
    </div>
  )
}
