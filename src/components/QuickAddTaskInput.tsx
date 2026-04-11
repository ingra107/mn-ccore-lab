/**
 * Todoist-style quick-add input with real-time token highlighting.
 *
 * Uses the "textarea mirror" pattern:
 *   - A transparent textarea captures keystrokes (caret visible, text invisible)
 *   - A read-only mirror div positioned behind it renders colored token spans
 */

import { useRef, useCallback } from 'react'
import { parseQuickAddInput, type TokenType } from '../lib/parseQuickAdd'
import { formatShortDate } from '../lib/dateUtils'
import type { ParsedQuickAdd } from '../lib/parseQuickAdd'

// ── Token color map ──────────────────────────────────────────

interface TokenStyle {
  color: string
  bg?: string
  fontWeight?: number
}

const TOKEN_STYLES: Record<TokenType, TokenStyle> = {
  assignee: { color: 'var(--gold)', bg: 'var(--gold-emphasis)', fontWeight: 600 },
  project:  { color: 'var(--teal)', bg: 'var(--teal-emphasis)', fontWeight: 600 },
  priority: { color: 'var(--ink-bright, #fff)',        bg: 'var(--maroon)',         fontWeight: 700 },
  date:     { color: 'var(--teal)', bg: 'var(--teal-active)', fontWeight: 600 },
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
        border: '1px solid rgba(201,168,76,0.18)',
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
        background: 'var(--gold-hover)',
        border: '1px solid rgba(201,168,76,0.12)',
      }}
    >
      {parsed.title && (
        <Chip label="title" value={parsed.title} color="var(--ink)" />
      )}
      {parsed.assigneeName && (
        <Chip label="@" value={parsed.assigneeName} color="var(--gold)" />
      )}
      {parsed.priority && (
        <Chip label="priority" value={`P${parsed.priority}`} color="var(--maroon)" />
      )}
      {parsed.dueDate && (
        <Chip label="due" value={formatShortDate(parsed.dueDate)} color="var(--teal)" />
      )}
      {parsed.projectTitle && (
        <Chip label="#" value={parsed.projectTitle} color="var(--teal)" />
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
  placeholder = '@person p1 Apr 15 task description',
  autoFocus,
  onFocusChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef   = useRef<HTMLDivElement>(null)

  const parsed = parseQuickAddInput(value)

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
    <div>
      <div
        style={{
          position: 'relative',
          background: 'var(--ice)',
          border: '1px solid rgba(201,168,76,0.2)',
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
            <span style={{ color: 'var(--slate)', opacity: 0.4, fontWeight: 400 }}>
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
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit?.()
            }
          }}
          onFocus={() => {
            if (textareaRef.current?.parentElement) {
              textareaRef.current.parentElement.style.borderColor = 'rgba(201,168,76,0.5)'
            }
            onFocusChange?.(true)
          }}
          onBlur={() => {
            if (textareaRef.current?.parentElement) {
              textareaRef.current.parentElement.style.borderColor = 'rgba(201,168,76,0.2)'
            }
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

      <ParsedPreview parsed={parsed} />
    </div>
  )
}
