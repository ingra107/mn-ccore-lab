import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Plus, Trash2, X } from 'lucide-react'
import { useSavedViews, type SavedView } from '../hooks/useSavedViews'

interface Props {
  /** Page scope — saved views are namespaced per page so MyTasks views don't
   *  appear on Projects. */
  page: string
  /** Current URL query string (without the leading "?"); SavedViewsMenu uses
   *  this to capture state on save + highlight the currently-applied view. */
  currentQuery: string
  /** Called with the stored query when user clicks a saved view. The page
   *  routes this into its own setSearchParams. */
  onApply: (query: string) => void
}

export default function SavedViewsMenu({ page, currentQuery, onApply }: Props) {
  const { views, save, remove } = useSavedViews(page)
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setNaming(false)
        setDraftName('')
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setNaming(false) } }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (naming) inputRef.current?.focus() }, [naming])

  const activeId = views.find((v) => v.query === currentQuery)?.id ?? null

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Saved views"
        aria-expanded={open ? 'true' : 'false'}
        className="inline-flex items-center gap-1.5 rounded-full"
        style={{
          fontSize: '11px',
          fontWeight: 500,
          padding: '3px 10px',
          border: '1px solid var(--border-subtle)',
          background: activeId ? 'var(--teal-active)' : 'var(--surface-2)',
          color: activeId ? 'var(--teal)' : 'var(--slate)',
          cursor: 'pointer',
        }}
      >
        <Bookmark size={11} />
        {activeId ? views.find((v) => v.id === activeId)!.name : 'Views'}
        {views.length > 0 && <span style={{ opacity: 0.7 }}>· {views.length}</span>}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            minWidth: 220, maxWidth: 320,
            background: 'var(--cream)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
            zIndex: 'var(--z-dropdown)' as unknown as number,
            padding: '6px 0',
          }}
        >
          {views.length === 0 && !naming && (
            <div className="px-3 py-2" style={{ fontSize: '11px', color: 'var(--muted)' }}>
              No saved views yet. Save the current filters + sort as a named view.
            </div>
          )}
          {views.map((v) => (
            <SavedViewRow
              key={v.id}
              view={v}
              active={v.id === activeId}
              onApply={() => { onApply(v.query); setOpen(false) }}
              onRemove={() => remove(v.id)}
            />
          ))}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 0' }} />
          {!naming ? (
            <button
              type="button"
              onClick={() => { setNaming(true); setDraftName('') }}
              className="w-full flex items-center gap-2 px-3 py-2"
              style={{ border: 'none', background: 'transparent', color: 'var(--teal)', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}
            >
              <Plus size={12} />
              Save current as view…
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!draftName.trim()) return
                save(draftName, currentQuery)
                setNaming(false)
                setDraftName('')
              }}
              className="flex items-center gap-1 px-2 py-1"
            >
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="View name…"
                aria-label="View name"
                style={{
                  flex: 1, fontSize: '12px', padding: '4px 8px',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none',
                }}
              />
              <button
                type="submit"
                aria-label="Save"
                disabled={!draftName.trim()}
                style={{
                  padding: '4px 6px', border: 'none', background: 'transparent',
                  color: 'var(--teal)', cursor: draftName.trim() ? 'pointer' : 'default',
                  opacity: draftName.trim() ? 1 : 0.45,
                }}
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                onClick={() => { setNaming(false); setDraftName('') }}
                aria-label="Cancel"
                style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: 'var(--slate)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function SavedViewRow({ view, active, onApply, onRemove }: {
  view: SavedView
  active: boolean
  onApply: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5" style={{ background: active ? 'var(--teal-active)' : 'transparent' }}>
      <button
        type="button"
        onClick={onApply}
        className="flex-1 text-left"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: '12px', fontWeight: active ? 600 : 500,
          color: active ? 'var(--teal)' : 'var(--ink)',
          padding: '2px 0',
        }}
      >
        {active && <Check size={10} style={{ display: 'inline-block', marginRight: 4 }} />}
        {view.name}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Delete view ${view.name}`}
        style={{
          padding: '4px 6px', border: 'none', background: 'transparent',
          color: 'var(--slate)', cursor: 'pointer', opacity: 0.55,
        }}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}
