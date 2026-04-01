import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark, BookmarkCheck, Pencil, Trash2, X, Check, Plus } from 'lucide-react'
import type { SavedView, ViewFilters } from '../../hooks/useSavedViews'

interface SavedViewsBarProps {
  views: SavedView[]
  activeViewId: string
  currentFilters: ViewFilters
  activeViewFilters: ViewFilters
  onSelectView: (id: string) => void
  onSaveView: (name: string, filters: ViewFilters) => string
  onRenameView: (id: string, name: string) => void
  onDeleteView: (id: string) => void
}

function filtersMatch(a: ViewFilters, b: ViewFilters): boolean {
  return (
    a.assignee === b.assignee &&
    a.status === b.status &&
    a.search === b.search &&
    a.sort === b.sort
  )
}

export default function SavedViewsBar({
  views,
  activeViewId,
  currentFilters,
  activeViewFilters,
  onSelectView,
  onSaveView,
  onRenameView,
  onDeleteView,
}: SavedViewsBarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveValue, setSaveValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLInputElement>(null)

  const isDirty = !filtersMatch(currentFilters, activeViewFilters)

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus()
  }, [renamingId])

  useEffect(() => {
    if (showSaveInput && saveRef.current) saveRef.current.focus()
  }, [showSaveInput])

  function startRename(view: SavedView) {
    setRenamingId(view.id)
    setRenameValue(view.name)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameView(renamingId, renameValue)
    }
    setRenamingId(null)
    setRenameValue('')
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  function commitSave() {
    if (saveValue.trim()) {
      const id = onSaveView(saveValue, currentFilters)
      onSelectView(id)
    }
    setShowSaveInput(false)
    setSaveValue('')
  }

  function cancelSave() {
    setShowSaveInput(false)
    setSaveValue('')
  }

  const pillBase: React.CSSProperties = {
    height: 32,
    borderRadius: 20,
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 12,
    cursor: 'pointer',
    transition: 'background 150ms, border-color 150ms',
    userSelect: 'none',
    flexShrink: 0,
  }

  const activePill: React.CSSProperties = {
    ...pillBase,
    background: 'var(--gold)',
    border: '1px solid var(--gold)',
    color: 'var(--ink)',
    fontWeight: 600,
  }

  const inactivePill: React.CSSProperties = {
    ...pillBase,
    background: 'var(--ice)',
    border: '1px solid var(--border)',
    color: 'var(--ink)',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        paddingBottom: 2,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <AnimatePresence mode="popLayout">
        {views.map((view) => {
          const isActive = view.id === activeViewId
          const isCustom = !view.isDefault
          const isRenaming = renamingId === view.id

          return (
            <motion.div
              key={view.id}
              layout
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}
            >
              <div
                onClick={() => {
                  if (!isRenaming) onSelectView(view.id)
                }}
                style={isActive ? activePill : inactivePill}
                className="group"
                onMouseEnter={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background = 'var(--border)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background = 'var(--ice)'
                  }
                }}
              >
                {isCustom ? (
                  <BookmarkCheck size={13} style={{ opacity: 0.7 }} />
                ) : (
                  <Bookmark size={13} style={{ opacity: 0.7 }} />
                )}

                {isRenaming ? (
                  <input
                    ref={renameRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'inherit',
                      width: Math.max(40, renameValue.length * 7.5),
                      padding: 0,
                    }}
                  />
                ) : (
                  <span>{view.name}</span>
                )}

                {/* Dirty indicator */}
                {isActive && isDirty && !isRenaming && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: 'var(--ink)',
                      opacity: 0.4,
                      marginLeft: 2,
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* Custom view actions (rename/delete) */}
                {isCustom && !isRenaming && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2,
                      marginLeft: 2,
                      opacity: 0,
                      transition: 'opacity 150ms',
                    }}
                    className="group-hover:!opacity-100"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(view)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                        color: 'inherit',
                        opacity: 0.5,
                      }}
                      title="Rename view"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteView(view.id)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--maroon)',
                        opacity: 0.5,
                      }}
                      title="Delete view"
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                )}
              </div>
            </motion.div>
          )
        })}

        {/* Save new view button / inline input */}
        <motion.div
          key="save-new"
          layout
          style={{ display: 'inline-flex', flexShrink: 0 }}
        >
          {showSaveInput ? (
            <div
              style={{
                ...pillBase,
                background: 'var(--ice)',
                border: '1px solid var(--gold)',
                gap: 4,
                paddingRight: 6,
              }}
            >
              <Plus size={13} style={{ opacity: 0.5 }} />
              <input
                ref={saveRef}
                value={saveValue}
                onChange={(e) => setSaveValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitSave()
                  if (e.key === 'Escape') cancelSave()
                }}
                onBlur={() => {
                  // Small delay to allow button click
                  setTimeout(() => {
                    if (!saveValue.trim()) cancelSave()
                  }, 150)
                }}
                placeholder="View name..."
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--ink)',
                  width: 90,
                  padding: 0,
                }}
              />
              <button
                onClick={commitSave}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--teal)',
                }}
                title="Save view"
              >
                <Check size={13} />
              </button>
              <button
                onClick={cancelSave}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--slate)',
                }}
                title="Cancel"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setShowSaveInput(true)}
              style={{
                ...pillBase,
                background: 'transparent',
                border: '1px dashed var(--border)',
                color: 'var(--slate)',
                opacity: 0.7,
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.opacity = '1'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.opacity = '0.7'
                ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
              }}
            >
              <Plus size={13} />
              <span>Save view</span>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
