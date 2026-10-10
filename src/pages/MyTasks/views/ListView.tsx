// ListView — the Today task card as a list (Nick 2026-10-09: "List view = Today
// cards"). Each row is the SAME card Today renders (today/TaskRow.tsx over
// tasks/TaskCardRow.tsx): title, project · due · workflow line, the assignee face
// over folder + Work on, fixed tinted link slots, and the inline drawer on expand.
// The dense sortable table that used to be this view is TableView.
//
// What stays from the old List: j/k cursor, e opens the full editor panel (Enter acts on the focused card or control),
// x/Space selects, Esc clears, shift-click range select, ctrl/cmd-click toggle,
// double-click opens the editor, title click opens the editor, virtualized so 600+
// tasks do not paint up front. What the card adds: click expands in place (the
// card's own contract), the Today pin, and the Today drawer (plan, section, due,
// links). The skin is the `.tk` wrapper below: its --sk-* tokens are global, but
// every card rule in index.css is scoped under `.tk`, exactly as TodayPage does.

import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useState, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TaskRow as CardTaskRow } from '../../../components/today/TaskRow'
import { useTodayState } from '../../../hooks/useTodayState'
import { useListKeyboard } from '../hooks/useListKeyboard'
import { useSelectMode } from '../../../hooks/useSelectMode'
import { isTaskDone } from '../constants'
import { OverdueBanner } from './OverdueBanner'
import { NoTasksMatch, AllCaughtUp } from './MyTasksEmpty'
import type { TaskRow } from '../../../lib/api'

interface ListViewProps {
  filtered: TaskRow[]
  /** True when the page has NO tasks at all (not a filter artifact). */
  isEmpty: boolean
  selected: Set<string>
  toggleSelect: (id: string) => void
  selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void
  anchorId: string | null
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  setDrawer: (id: string | null) => void
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
  /** Phone: the page shell scrolls (toolbar scrolls away with the list) and the
   *  virtualizer follows it, instead of an inner scroller under fixed chrome. */
  pageScrollRef?: RefObject<HTMLElement | null>
}

// A card is 69px collapsed; 8px gap. measureElement corrects it per row, so an
// expanded drawer pushes the rows below it down instead of overlapping them.
const ESTIMATE = 80

export function ListView({ filtered, isEmpty, selected, toggleSelect, selectRange, anchorId, setSelected, setDrawer, projectsByPid, pageScrollRef }: ListViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const { cursor, setCursor } = useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected })
  const selectModeActive = useSelectMode(true)
  const state = useTodayState(filtered)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), [])

  // The cursor ring appears once the cursor has been used (a click or j/k), not on
  // first paint: row 0 ringed from the start would read as "selected".
  const [showCursor, setShowCursor] = useState(false)
  const [prevCursor, setPrevCursor] = useState(cursor)
  if (cursor !== prevCursor) {
    setPrevCursor(cursor)
    setShowCursor(true)
  }

  const filteredIds = useMemo(() => filtered.map((t) => t.id), [filtered])
  const handleRowSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (e.shiftKey) selectRange(id, filteredIds, anchorId)
    else toggleSelect(id)
  }, [selectRange, filteredIds, anchorId, toggleSelect])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => (pageScrollRef ? pageScrollRef.current : scrollRef.current),
    scrollMargin: pageScrollRef ? scrollMargin : 0,
    estimateSize: () => ESTIMATE,
    overscan: 8,
  })

  // Offset of the list inside the page scroller, so rows line up when chrome
  // (toolbar, banners) sits above it in the same scroll.
  useLayoutEffect(() => {
    const sp = pageScrollRef?.current
    const el = listRef.current
    if (!sp || !el) { setScrollMargin(0); return }
    const measure = () => {
      const m = Math.round(el.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop)
      setScrollMargin((p) => (p === m ? p : m))
    }
    measure()
    const ro = new ResizeObserver(measure)
    Array.from(sp.children).forEach((c) => ro.observe(c))
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageScrollRef, filtered.length])

  useEffect(() => {
    if (cursor < 0 || cursor >= filtered.length) return
    virtualizer.scrollToIndex(cursor, { align: 'auto', behavior: 'auto' })
  }, [cursor, filtered.length, virtualizer])

  const kbdStyle = { fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 9, padding: '1px 4px', background: 'var(--sk-line)', borderRadius: 2, color: 'var(--sk-t3)' }

  return (
    <div style={pageScrollRef ? { display: 'flex', flexDirection: 'column' } : { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} className="fab-clear" style={pageScrollRef ? undefined : { flex: 1, overflow: 'auto' }}>
        <div className="mt-band">
          <div className="tk" style={{ paddingTop: 10 }}>
            <OverdueBanner tasks={filtered} />
            {filtered.length === 0 && (isEmpty ? <AllCaughtUp /> : <NoTasksMatch />)}
            {filtered.length > 0 && (
              <div ref={listRef} style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map((row) => {
                  const t = filtered[row.index]
                  const isSel = selected.has(t.id)
                  const isCur = showCursor && row.index === cursor
                  return (
                    <div
                      key={t.id}
                      data-index={row.index}
                      ref={virtualizer.measureElement}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start - (pageScrollRef ? scrollMargin : 0)}px)`, paddingBottom: 8 }}
                    >
                      <div
                        className="tk-lrow"
                        data-cursor={isCur ? 'true' : undefined}
                        data-selected={isSel ? 'true' : undefined}
                        style={selectModeActive ? { cursor: 'cell' } : undefined}
                        // Capture phase: a modifier-click selects and never reaches
                        // the card (which would expand). Plain clicks fall through
                        // to the card and only move the cursor.
                        onClickCapture={(e) => {
                          if (e.shiftKey || e.ctrlKey || e.metaKey) {
                            e.preventDefault()
                            e.stopPropagation()
                            handleRowSelect(t.id, e)
                            return
                          }
                          setCursor(row.index)
                          setShowCursor(true)
                        }}
                        onMouseDownCapture={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
                        onDoubleClick={(e) => {
                          // Not when the second click landed on a control (done box,
                          // link, pin, folder): those act on their own.
                          if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
                          setDrawer(t.id)
                        }}
                      >
                        {isSel && <span className="sr-only">Selected. </span>}
                        <CardTaskRow
                          task={t}
                          project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                          state={state}
                          expandedId={expandedId}
                          onExpand={onExpand}
                          projectsByPid={projectsByPid}
                          done={isTaskDone(t)}
                          noDrag
                          onOpenEditor={() => setDrawer(t.id)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {!pageScrollRef && <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
        <div className="mt-band" style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10, color: 'var(--sk-t3)', display: 'flex', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>{filtered.length > 0 ? `${cursor + 1}/${filtered.length}` : '0/0'}</span>
          <span style={{ flex: 1 }} />
          <span><kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> move</span>
          <span><kbd style={kbdStyle}>x</kbd>/⇧click select</span>
          <span><kbd style={kbdStyle}>e</kbd> editor</span>
          <span><kbd style={kbdStyle}>esc</kbd> deselect</span>
        </div>
      </div>}
    </div>
  )
}
