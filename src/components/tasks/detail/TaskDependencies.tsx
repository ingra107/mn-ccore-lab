import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X, AlertTriangle, Plus, Ban, Link2, Search,
} from 'lucide-react'
import CollapsibleSection from '../../CollapsibleSection'
import { useTasks } from '../../../hooks/useApiData'
import type { TaskRow } from '../../../lib/api'
import { ICON_PROPS } from '../../../lib/iconProps'

// ── Helpers ─────────────────────────────────────────────────

function parseBlockedByIds(blockedBy: string | null): string[] {
  if (!blockedBy) return []
  return blockedBy.split(',').map(s => s.trim()).filter(Boolean)
}

function serializeBlockedByIds(ids: string[]): string | null {
  if (ids.length === 0) return null
  return ids.join(',')
}

// ── Task Dependencies Section ────────────────────────────────

export function TaskDependenciesSection({ task, onFieldUpdate, onOpenTask }: { task: TaskRow; onFieldUpdate: (field: string, value: unknown) => void; onOpenTask: (task: TaskRow) => void }) {
  const { data: allTasks = [] } = useTasks()
  const [showSearch, setShowSearch] = useState(false)

  const blockerIds = useMemo(() => parseBlockedByIds(task.blocked_by), [task.blocked_by])

  // Tasks that THIS task blocks (reverse lookup)
  const blockingTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (t.id === task.id) return false
      const ids = parseBlockedByIds(t.blocked_by)
      return ids.includes(task.id)
    })
  }, [allTasks, task.id])

  // Resolved blocker task objects
  const blockerTasks = useMemo(() => {
    return blockerIds.map(id => allTasks.find(t => t.id === id)).filter(Boolean) as TaskRow[]
  }, [blockerIds, allTasks])

  const hasBlockers = blockerTasks.length > 0
  const hasBlocking = blockingTasks.length > 0

  const addBlocker = (blockerId: string) => {
    if (blockerIds.includes(blockerId)) return
    const newIds = [...blockerIds, blockerId]
    onFieldUpdate('blocked_by', serializeBlockedByIds(newIds))
    // Auto-set status to blocked if not already
    if (task.status !== 'blocked' && task.status !== 'done') {
      onFieldUpdate('status', 'blocked')
    }
    setShowSearch(false)
  }

  const removeBlocker = (blockerId: string) => {
    const newIds = blockerIds.filter(id => id !== blockerId)
    onFieldUpdate('blocked_by', serializeBlockedByIds(newIds))
    // If no more blockers, auto-clear blocked status
    if (newIds.length === 0 && task.status === 'blocked') {
      onFieldUpdate('status', 'todo')
    }
  }

  return (
    <CollapsibleSection
      title="Dependencies"
      icon={<Link2 {...ICON_PROPS} size={11} style={{ color: hasBlockers ? 'var(--maroon)' : 'var(--slate)', opacity: hasBlockers ? 1 : 0.85 }} />}
      badge={hasBlockers ? `${blockerTasks.length} blocker${blockerTasks.length > 1 ? 's' : ''}` : null}
      defaultOpen={hasBlockers || hasBlocking}
      storageKey={`task-deps-${task.id}`}
    >
      <div className="flex flex-col gap-3">
        {/* Blocked by section */}
        <div>
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--maroon)', opacity: 0.85 }}>
            <AlertTriangle {...ICON_PROPS} size={10} />
            Blocked by
          </label>

          {blockerTasks.length > 0 ? (
            <div className="flex flex-col gap-1 mb-2">
              {blockerTasks.map(bt => (
                <div key={bt.id} className="flex items-center gap-2 py-1.5 px-2 -mx-1 rounded group hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors">
                  <Link2 {...ICON_PROPS} size={12} style={{ color: 'var(--teal)', flexShrink: 0, opacity: 0.85 }} />
                  <button
                    onClick={() => onOpenTask(bt)}
                    className="flex-1 min-w-0 text-left truncate text-sm"
                    style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 400 }}
                  >
                    {bt.title || bt.description}
                  </button>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    color: bt.status === 'done' ? 'var(--green)' : bt.status === 'in_progress' ? 'var(--teal)' : 'var(--slate)',
                    background: bt.status === 'done' ? 'rgba(34,197,94,0.1)' : bt.status === 'in_progress' ? 'var(--teal-active)' : 'rgba(100,116,139,0.1)',
                  }}>
                    {bt.status === 'done' ? 'Done' : bt.status === 'in_progress' ? 'In Progress' : bt.status === 'blocked' ? 'Blocked' : 'To Do'}
                  </span>
                  <button
                    onClick={() => removeBlocker(bt.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--slate)', flexShrink: 0 }}
                    title="Remove blocker"
                  >
                    <X {...ICON_PROPS} size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] mb-2" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)', margin: '0 0 var(--sp-sm) 0' }}>
              No blockers
            </p>
          )}

          {/* Add blocker button / search */}
          {showSearch ? (
            <BlockerSearchDropdown
              currentTaskId={task.id}
              excludeIds={blockerIds}
              allTasks={allTasks}
              onSelect={addBlocker}
              onClose={() => setShowSearch(false)}
            />
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{
                color: 'var(--teal)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 0',
                fontWeight: 'var(--label-weight)',
                opacity: 0.8,
              }}
            >
              <Plus {...ICON_PROPS} size={12} />
              Add blocker
            </button>
          )}
        </div>

        {/* Blocks section (reverse lookup) */}
        {hasBlocking && (
          <div>
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--gold)', opacity: 0.85 }}>
              <Ban {...ICON_PROPS} size={10} />
              Blocks
            </label>
            <div className="flex flex-col gap-1">
              {blockingTasks.map(bt => (
                <div key={bt.id} className="flex items-center gap-2 py-1.5 px-2 -mx-1 rounded hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors">
                  <Link2 {...ICON_PROPS} size={12} style={{ color: 'var(--gold)', flexShrink: 0, opacity: 0.85 }} />
                  <button
                    onClick={() => onOpenTask(bt)}
                    className="flex-1 min-w-0 text-left truncate text-sm"
                    style={{ color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 400 }}
                  >
                    {bt.title || bt.description}
                  </button>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    color: 'var(--maroon)',
                    background: 'var(--maroon-hover)',
                  }}>
                    Blocked
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

// ── Blocker Search Dropdown ──────────────────────────────────

function BlockerSearchDropdown({ currentTaskId, excludeIds, allTasks, onSelect, onClose }: {
  currentTaskId: string
  excludeIds: string[]
  allTasks: TaskRow[]
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const candidates = useMemo(() => {
    return allTasks
      .filter(t => t.id !== currentTaskId && !excludeIds.includes(t.id) && t.status !== 'done')
      .filter(t => {
        if (!query) return true
        const text = (t.title || t.description || '').toLowerCase()
        return text.includes(query.toLowerCase())
      })
      .slice(0, 10)
  }, [allTasks, currentTaskId, excludeIds, query])

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5" style={{ borderColor: 'var(--teal)', background: 'var(--teal-hover)' }}>
        <Search {...ICON_PROPS} size={13} style={{ color: 'var(--teal)', opacity: 'var(--ink-label)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && candidates.length === 1) {
              onSelect(candidates[0].id)
            }
          }}
          placeholder="Search tasks to add as blocker..."
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: 'var(--ink)', border: 'none' }}
        />
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 'var(--sp-xs)', minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <X {...ICON_PROPS} size={14} />
        </button>
      </div>

      {candidates.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 rounded-lg shadow-lg border py-1 max-h-[200px] overflow-y-auto"
          style={{ backgroundColor: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
        >
          {candidates.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              style={{ color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              <Link2 {...ICON_PROPS} size={12} style={{ color: 'var(--teal)', opacity: 'var(--ink-label)', flexShrink: 0 }} />
              <span className="flex-1 truncate">{t.title || t.description}</span>
              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
                {t.assignee}
              </span>
            </button>
          ))}
        </div>
      )}

      {query && candidates.length === 0 && (
        <div className="mt-1 py-3 text-center text-[11px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-hint)' }}>
          No matching tasks
        </div>
      )}
    </div>
  )
}
