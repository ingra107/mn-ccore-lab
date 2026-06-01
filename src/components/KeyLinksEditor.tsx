import { useState } from 'react'
import { Link2, Plus, Pencil, Check, X } from 'lucide-react'
import { classifyUrl } from '../lib/urlClassify'
import { useToast } from '../hooks/useToast'

// Shared editor for the 3-slot key_link_1/2/3 + _desc pattern used on tasks
// and projects. Display mode shows teal underlined links; edit mode swaps in
// URL + description inputs. Empty state shows a single "+ Add a link" button.

interface KeyLink {
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
  const { showSuccess } = useToast()

  // Local paths + .bat scripts use the `mnccore://` custom protocol that
  // requires a Windows URL handler registration on the user's machine. If
  // the handler isn't installed the browser silently does nothing, so
  // click-to-copy is the reliable fallback: the path lands in clipboard,
  // user can paste into Win+R or File Explorer. The protocol nav still
  // fires (fire-and-forget) in case the handler IS installed.
  const handleNonHttpClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(url)
      showSuccess(`${typeLabel} path copied — paste in Win+R or Explorer`)
    } catch {
      window.prompt('Copy path:', url)
    }
    try {
      window.location.href = href
    } catch {
      // ignore — custom protocol without handler is a no-op on most systems
    }
  }

  // Compact inline chip (handoff §2): icon + label + remove, with a
  // hover-revealed edit pencil. Replaces the full-width padded row so links
  // sit in a wrapping chip strip on both the task editor and ProjectDetail.
  return (
    <span
      className="group inline-flex items-center gap-1.5"
      style={{ padding: '4px 7px 4px 9px', borderRadius: 'var(--radius-md)', background: 'var(--ice)', border: '1px solid var(--border-subtle)', maxWidth: 220 }}
    >
      <a
        href={isHttp ? href : url}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={isHttp ? undefined : handleNonHttpClick}
        style={{ color: 'var(--teal)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
        title={isHttp ? url : `Click to copy path: ${url}`}
      >
        <Icon size={13} />
      </a>
      <a
        href={isHttp ? href : url}
        target={isHttp ? '_blank' : undefined}
        rel={isHttp ? 'noopener noreferrer' : undefined}
        onClick={isHttp ? undefined : handleNonHttpClick}
        className="text-xs hover:underline"
        style={{ color: 'var(--teal)', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={isHttp ? url : `Click to copy path: ${url}`}
      >
        {link.desc || typeLabel || url}
      </a>
      <button
        onClick={onEdit}
        title="Edit link"
        aria-label="Edit link"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 0, display: 'grid', flexShrink: 0 }}
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={onRemove}
        title="Remove link"
        aria-label="Remove link"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 0, display: 'grid', flexShrink: 0, opacity: 0.7 }}
      >
        <X size={12} />
      </button>
    </span>
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
            background: canSave ? 'var(--teal-solid)' : 'var(--border-subtle)',
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

      <div className="flex flex-wrap items-center gap-2">
        {populated.map((link, idx) => {
          if (editingIdx === idx) {
            return (
              <div key={`edit-${idx}`} style={{ flexBasis: '100%', minWidth: 240 }}>
                <LinkForm
                  initial={link}
                  onSave={(v) => handleEditSave(idx, v)}
                  onCancel={() => setEditingIdx(null)}
                />
              </div>
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
          <div style={{ flexBasis: '100%', minWidth: 240 }}>
            <LinkForm
              initial={{ url: null, desc: null }}
              onSave={handleAdd}
              onCancel={() => setAddingNew(false)}
            />
          </div>
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
              opacity: 0.85,
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
