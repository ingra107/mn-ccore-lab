/**
 * Todoist-style quick-add input with real-time token highlighting.
 *
 * Uses the "textarea mirror" pattern:
 *   - A transparent textarea captures keystrokes (caret visible, text invisible)
 *   - A read-only mirror div positioned behind it renders colored token spans
 */

import { useRef, useCallback, useEffect, useState } from 'react'
import { parseQuickAddInput, productSuggestions, productToken, type TokenType } from '../lib/parseQuickAdd'
import { productLabel } from '../lib/products'
import { useQuickAddContext } from '../hooks/useQuickAddContext'
import { formatShortDate } from '../lib/dateUtils'
import type { ParsedQuickAdd } from '../lib/parseQuickAdd'
import { withAlpha } from '../lib/taskGrouping'

// ── Token color map ──────────────────────────────────────────

interface TokenStyle {
  color: string
  bg?: string
  fontWeight?: number
}

const TOKEN_STYLES: Record<TokenType, TokenStyle> = {
  assignee: { color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 8%, transparent)', fontWeight: 600 },
  project:  { color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 8%, transparent)', fontWeight: 600 },
  priority: { color: 'var(--job-stale)', bg: 'color-mix(in srgb, var(--job-stale) 12%, transparent)', fontWeight: 700 },
  date:     { color: 'var(--sk-t2)', bg: 'color-mix(in srgb, var(--sk-t1) 5%, transparent)', fontWeight: 600 },
  plain:    { color: 'inherit' },
}

const FONT_FAMILY = 'var(--font-sans)'
const FONT_SIZE   = '13px'
const LINE_HEIGHT = '22px'
const PADDING     = '8px 12px'

// ── Preview chips ────────────────────────────────────────────

interface ChipProps { label: string; value: string; color?: string }

function Chip({ label, value, color = 'var(--slate)' }: ChipProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 7px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--cream)',
        border: `1px solid ${withAlpha('var(--sk-t1)', 9)}`,
        fontFamily: FONT_FAMILY,
        fontSize: '10px',
        lineHeight: '16px',
      }}
    >
      <span style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </span>
  )
}

function ParsedPreview({ parsed }: { parsed: ParsedQuickAdd }) {
  const hasTokens = parsed.assigneeName || parsed.projectTitle || parsed.priority || parsed.dueDate
  if (!hasTokens) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
        marginTop: '8px',
        padding: '7px 10px',
        borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--sk-t1) 3%, transparent)',
        border: `1px solid ${withAlpha('var(--sk-t1)', 6)}`,
      }}
    >
      {parsed.title && (
        <Chip label="title" value={parsed.title} color="var(--ink)" />
      )}
      {parsed.assigneeName && (
        <Chip label="@" value={parsed.assigneeName} color="var(--sk-t2)" />
      )}
      {parsed.priority && (
        <Chip label="priority" value={`P${parsed.priority}`} color="var(--job-stale)" />
      )}
      {parsed.dueDate && (
        <Chip label="due" value={formatShortDate(parsed.dueDate)} color="var(--sk-t2)" />
      )}
      {parsed.projectTitle && (
        <Chip label="#" value={parsed.productName ? `${parsed.projectTitle} ~ ${parsed.productName}` : parsed.projectTitle} color="var(--sk-t2)" />
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  autoFocus?: boolean
  onFocusChange?: (focused: boolean) => void
}

export default function QuickAddTaskInput({
  value,
  onChange,
  onSubmit,
  placeholder = '@person p1 Apr 15 task description, or @hermes to ask',
  autoFocus,
  onFocusChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef   = useRef<HTMLDivElement>(null)

  // Imperative focus-on-mount. The `autoFocus` attribute is unreliable on
  // iOS/Android when the textarea mounts inside an AnimatePresence-wrapped
  // modal — the browser discards the focus request because it's outside
  // the original touch gesture. Running focus() on the next frame after
  // mount catches the element as soon as it's in the DOM.
  useEffect(() => {
    if (!autoFocus) return
    const id = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [autoFocus])

  const ctx = useQuickAddContext()
  const parsed = parseQuickAddInput(value, ctx)

  // "#project~par" with the caret at its end: offer that project's products.
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const pending = /#([\w-]+)~([\w-]*)$/.exec(value.slice(0, caret))
  const suggestions = focused && pending && ctx ? productSuggestions(pending[1], pending[2], ctx) : []
  const open = suggestions.length > 0
  const activeIdx = Math.min(active, Math.max(0, suggestions.length - 1))

  const pick = (i: number) => {
    const p = suggestions[i]
    if (!p || !pending) return
    // Write the whole token plus a space, so the list closes behind the pick.
    const head = value.slice(0, pending.index)
    const tail = value.slice(caret)
    const inserted = `#${pending[1]}~${productToken(p)} `
    onChange(head + inserted + tail)
    const next = head.length + inserted.length
    setCaret(next)
    setActive(0)
    window.requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next, next))
  }

  const syncScroll = useCallback(() => {
    if (textareaRef.current && mirrorRef.current) {
      mirrorRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  const sharedLayout: React.CSSProperties = {
    fontFamily: FONT_FAMILY,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    padding: PADDING,
    width: '100%',
    whiteSpace: 'pre',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    margin: 0,
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          background: 'var(--ice)',
          border: `1px solid ${withAlpha('var(--sk-t1)', 10)}`,
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          height: '38px',
        }}
        onClick={() => textareaRef.current?.focus()}
      >
        {/* Mirror layer: colored token spans */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          style={{
            ...sharedLayout,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            pointerEvents: 'none',
            zIndex: 'var(--z-base)',
            height: '38px',
          }}
        >
          {value ? (
            parsed.tokens.map((tok, i) => {
              const s = TOKEN_STYLES[tok.type]
              return (
                <span
                  key={i}
                  style={{
                    color: s.color,
                    fontWeight: s.fontWeight,
                    background: s.bg,
                    borderRadius: s.bg ? 'var(--radius-sm)' : undefined,
                    padding: s.bg ? '1px 3px' : undefined,
                    marginLeft: s.bg ? '-3px' : undefined,
                  }}
                >
                  {tok.text}
                </span>
              )
            })
          ) : (
            <span style={{ color: 'var(--slate)', opacity: 0.75, fontWeight: 400 }}>
              {placeholder}
            </span>
          )}
        </div>

        {/* Transparent textarea: captures input */}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          spellCheck={false}
          onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setActive(0) }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onScroll={syncScroll}
          role="combobox"
          aria-expanded={open}
          aria-controls="quick-add-products"
          aria-autocomplete="list"
          aria-activedescendant={open ? `quick-add-product-${activeIdx}` : undefined}
          onKeyDown={(e) => {
            if (open) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIdx + 1) % suggestions.length); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIdx - 1 + suggestions.length) % suggestions.length); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(activeIdx); return }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit?.()
            }
          }}
          onFocus={() => {
            if (textareaRef.current?.parentElement) {
              textareaRef.current.parentElement.style.borderColor = withAlpha('var(--job-accent)', 50)
            }
            setFocused(true)
            onFocusChange?.(true)
          }}
          onBlur={() => {
            if (textareaRef.current?.parentElement) {
              textareaRef.current.parentElement.style.borderColor = withAlpha('var(--sk-t1)', 10)
            }
            setFocused(false)
            onFocusChange?.(false)
          }}
          className="quick-add-textarea"
          style={{
            ...sharedLayout,
            position: 'relative',
            zIndex: 'var(--z-base)',
            display: 'block',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            height: '38px',
            textDecorationColor: 'transparent',
          }}
        />
      </div>

      {open && (
        <ul
          id="quick-add-products"
          role="listbox"
          aria-label={`Products of ${pending![1]}`}
          data-testid="quick-add-products"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '42px',
            zIndex: 'var(--z-dropdown)',
            margin: 0,
            padding: '4px',
            listStyle: 'none',
            background: 'var(--cream)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-menu)',
          }}
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`quick-add-product-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              data-testid="quick-add-product"
              // mousedown, not click: the textarea must not blur first.
              onMouseDown={(e) => { e.preventDefault(); pick(i) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '6px 10px',
                fontSize: FONT_SIZE,
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                color: 'var(--ink)',
                background: i === activeIdx ? withAlpha('var(--sk-t1)', 8) : 'transparent',
              }}
            >
              <span>{productLabel(p)}</span>
              <span style={{ color: 'var(--slate)', opacity: 0.75 }}>{p.kind_label}</span>
            </li>
          ))}
        </ul>
      )}

      <ParsedPreview parsed={parsed} />
    </div>
  )
}
