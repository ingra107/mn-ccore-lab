import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTeamSlugs } from '../hooks/useMentionAutocomplete'
import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'
// Known command @-tags — visually distinguished from person @-mentions and
// excluded from person-autocomplete when the filter exactly matches. Also
// carries the Hermes model-tag variants' gating logic (#891) — see
// mentionCommandTags.ts for why they're a separate map from the always-
// visible top-level tags.
import { KNOWN_COMMAND_TAGS, isExactCommandTag, filterCommandTags } from '../lib/mentionCommandTags'

// Detects a command @-tag at the START of the value — module-level so it isn't
// re-literal-ed on every keystroke (#252 finding 4). Stateless (no g/y flag),
// safe to share across calls unlike the highlight overlay's global-flag regex
// below (which is intentionally per-render — see its own comment).
const COMMAND_TAG_PREFIX_RE = /^@(\w[\w-]*)(?:\s|$)/i

// One row in the unified @-dropdown -- a recognized command or a team member.
// Commands render first (see filteredCommands); both share keyboard nav via
// selectedIndex over the combined mentionOptions list.
type MentionOption =
  | { kind: 'command'; key: string; label: string; color: string; bg: string }
  | { kind: 'person'; slug: string; name: string }

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  style?: React.CSSProperties
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>
  /** External handle on the underlying textarea (caret helpers like
   *  appendCharToInput need it). */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
  /** Where the suggestion menu opens relative to the input. 'above'
   *  (default) suits bottom-anchored composers; pass 'below' for
   *  composers near the top of a scroll container (OverviewQuickAdd)
   *  where an upward menu would clip. */
  dropdownPosition?: 'above' | 'below'
}

export default function MentionInput({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 2,
  style,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  onPaste,
  inputRef,
  dropdownPosition = 'above',
}: MentionInputProps) {
  const { data: teamSlugs = [] } = useTeamSlugs()
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredSlugs = useMemo(() => {
    const lower = mentionFilter.toLowerCase()
    // Exact match on a known command @-tag (base OR a Hermes model variant,
    // #891): suppress person autocomplete so the dropdown doesn't compete
    // with the command-routing UI signal.
    if (isExactCommandTag(lower)) return []
    if (!lower) return teamSlugs
    return teamSlugs.filter(
      (t) =>
        t.slug.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower)
    )
  }, [teamSlugs, mentionFilter])

  // Command @-tags whose key starts with the current filter -- shown above the
  // person suggestions so @hermes/@quickchat/@workon/@backlog are discoverable
  // from the dropdown instead of requiring exact blind typing. Same exact-match
  // suppression as filteredSlugs: once a tag is fully typed, the dropdown closes
  // and Enter falls through to the command-routing handler (#221) rather than
  // re-inserting what's already there. Hermes model-tag variants (#891) are
  // gated inside filterCommandTags on the filter string itself containing
  // '-' -- see mentionCommandTags.ts for why that keeps them invisible while
  // typing "@herm"/"@hermes".
  const filteredCommands = useMemo(() => filterCommandTags(mentionFilter), [mentionFilter])

  // Commands first, people after -- the single list keyboard nav + render walk.
  const mentionOptions: MentionOption[] = useMemo(
    () => [
      ...filteredCommands.map(([key, cmd]) => ({ kind: 'command' as const, key, ...cmd })),
      ...filteredSlugs.map((p) => ({ kind: 'person' as const, slug: p.slug, name: p.name })),
    ],
    [filteredCommands, filteredSlugs]
  )

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [mentionFilter])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setMentionOpen(false)
      }
    }
    if (mentionOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mentionOpen])

  const insertMention = useCallback(
    (slug: string) => {
      if (mentionStartPos === null) return
      const before = value.slice(0, mentionStartPos)
      const afterCursor = textareaRef.current
        ? value.slice(textareaRef.current.selectionStart)
        : value.slice(mentionStartPos + 1 + mentionFilter.length)
      const newValue = `${before}@${slug} ${afterCursor}`
      onChange(newValue)
      setMentionOpen(false)
      setMentionFilter('')
      setMentionStartPos(null)

      // Restore cursor position after the inserted mention
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const cursorPos = before.length + slug.length + 2 // @slug + space
          textareaRef.current.selectionStart = cursorPos
          textareaRef.current.selectionEnd = cursorPos
          textareaRef.current.focus()
        }
      })
    },
    [value, onChange, mentionStartPos, mentionFilter]
  )

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart

    onChange(newValue)

    // Detect @ trigger
    if (cursorPos > 0) {
      // Look backwards from cursor for an @ that starts a mention
      const textBeforeCursor = newValue.slice(0, cursorPos)
      const lastAtPos = textBeforeCursor.lastIndexOf('@')

      if (lastAtPos >= 0) {
        // The @ must be at start or preceded by whitespace
        const charBefore = lastAtPos > 0 ? textBeforeCursor[lastAtPos - 1] : ' '
        if (charBefore === ' ' || charBefore === '\n' || lastAtPos === 0) {
          const textAfterAt = textBeforeCursor.slice(lastAtPos + 1)
          // Only trigger if the text after @ has no spaces (still typing the mention)
          if (!textAfterAt.includes(' ')) {
            setMentionOpen(true)
            setMentionFilter(textAfterAt)
            setMentionStartPos(lastAtPos)
            return
          }
        }
      }
    }

    setMentionOpen(false)
    setMentionFilter('')
    setMentionStartPos(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOpen && mentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, mentionOptions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const opt = mentionOptions[selectedIndex]
        insertMention(opt.kind === 'command' ? opt.key : opt.slug)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
        return
      }
    }
    // Pass through to parent handler
    onKeyDown?.(e)
  }

  // Render value with @mention highlighting.
  // We use an overlay approach: the textarea holds the plain text (in the
  // caller's normal ink color — the ONLY visible copy of the glyphs), and a
  // mirrored div sits behind it drawing a colored BACKGROUND PILL under each
  // @mention. The overlay's own text is always transparent (inherited from
  // the parent's `color: transparent`) — a native <textarea> can't recolor a
  // substring of its value, so duplicating the mention text here in an
  // opaque gold/teal color (the pre-#89 code) just double-prints a second,
  // slightly misaligned copy underneath the real one, reading as smeared/
  // ghosted text. Background-only avoids that structurally: there is only
  // ever one visible text layer.
  // bg: per-command tint from KNOWN_COMMAND_TAGS (gold for @hermes, teal for
  // @quickchat/@workon, slate for @backlog) to match the command badge below
  // the textarea and the dropdown row styling; person @-mentions get gold.
  const highlightedParts = useMemo(() => {
    const parts: { text: string; isMention: boolean; bg?: string }[] = []
    // Global-flag regex used with .exec() in a loop below — its `lastIndex`
    // is mutated as stateful scan progress, so this one MUST stay a fresh
    // per-call instance (a module-level shared instance would carry stale
    // lastIndex across renders). Not the same case as COMMAND_TAG_PREFIX_RE.
    const regex = /@(\w[\w-]*)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: value.slice(lastIndex, match.index), isMention: false })
      }
      const cmd = KNOWN_COMMAND_TAGS[match[1].toLowerCase()]
      parts.push({ text: match[0], isMention: true, bg: cmd ? cmd.bg : 'var(--gold-active)' })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < value.length) {
      parts.push({ text: value.slice(lastIndex), isMention: false })
    }
    return parts
  }, [value])

  // Show the overlay whenever there are any @-mentions (person or command).
  const hasMentions = highlightedParts.some((p) => p.isMention)

  // Detect a known command @-tag at the START of the value (token complete =
  // followed by whitespace or end-of-string). Drives the command-badge below
  // the textarea — visible in both light and dark mode regardless of overlay.
  const detectedCommand = useMemo(() => {
    const m = value.match(COMMAND_TAG_PREFIX_RE)
    if (!m) return null
    return KNOWN_COMMAND_TAGS[m[1].toLowerCase()] ?? null
  }, [value])

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {/* Highlight overlay (behind the textarea) */}
      {hasMentions && (
        <div
          aria-hidden
          style={{
            ...style,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            pointerEvents: 'none',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflow: 'hidden',
            color: 'transparent',
            // Match textarea dimensions
            padding: style?.padding || '10px 12px',
            fontSize: style?.fontSize || '13px',
            fontFamily: style?.fontFamily || 'var(--font-body)',
            lineHeight: style?.lineHeight || 1.5,
            border: '1px solid transparent',
          }}
        >
          {highlightedParts.map((part, i) =>
            part.isMention ? (
              // No `color`/`padding` here on purpose: color inherits the
              // parent's `transparent` (see comment above `highlightedParts`)
              // and padding would widen this span's flow width vs. the real
              // textarea's unpadded characters, drifting everything after it
              // out of alignment.
              <span
                key={i}
                style={{ background: part.bg, borderRadius: 'var(--radius-sm)' }}
              >
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </div>
      )}

      <textarea
        ref={(el) => {
          textareaRef.current = el
          // Manual ref-forwarding: `inputRef` is a caller-owned ref object
          // passed in as a prop so the parent can reach the underlying
          // textarea (this component doesn't use forwardRef). Writing
          // `.current` on a caller-owned ref is the standard forwarding
          // mechanism; the compiler's immutability check can't distinguish
          // it from mutating an arbitrary prop.
          // eslint-disable-next-line react-hooks/immutability -- see comment above
          if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
        }}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onPaste={onPaste}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={className}
        style={{
          ...style,
          width: '100%',
          position: 'relative',
          // Textarea text is the ONLY visible glyph layer (normal ink color,
          // unchanged) — the overlay behind it draws background pills only.
          // Explicit caret color keeps the cursor visible against those pills.
          caretColor: hasMentions ? 'var(--ink)' : undefined,
        }}
      />

      {/* Command @-tag badge — bottom-right corner of the textarea (absolute,
          no layout shift). Visible in both light and dark mode because it
          carries its own background — supplements the overlay which only
          shows through transparent/near-transparent textarea bgs. */}
      {detectedCommand && (
        <div
          aria-live="polite"
          aria-label={`Command recognized: ${detectedCommand.label}`}
          style={{
            position: 'absolute',
            bottom: 4,
            right: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 6px',
            borderRadius: 'var(--radius-sm)',
            background: detectedCommand.bg,
            color: detectedCommand.color,
            fontSize: 9,
            fontWeight: 600,
            fontFamily: 'var(--font-body, inherit)',
            userSelect: 'none',
            lineHeight: 1.6,
            pointerEvents: 'none',
          }}
        >
          {detectedCommand.label}
        </div>
      )}

      {/* Mention autocomplete dropdown */}
      <AnimatePresence>
        {mentionOpen && mentionOptions.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: dropdownPosition === 'below' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dropdownPosition === 'below' ? 4 : -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              ...(dropdownPosition === 'below'
                ? { top: '100%', marginTop: '4px' }
                : { bottom: '100%', marginBottom: '4px' }),
              left: 0,
              width: '240px',
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'var(--cream)',
              border: `1px solid ${withAlpha(ACCENT_GOLD, 20)}`,
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-menu)',
              zIndex: 'var(--z-dropdown)',
              padding: 'var(--sp-xs) 0',
            }}
          >
            {mentionOptions.map((opt, index) =>
              opt.kind === 'command' ? (
                <button
                  key={`cmd-${opt.key}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault() // prevent blur
                    insertMention(opt.key)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className="cursor-pointer w-full text-left"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: 'var(--sp-sm) var(--sp-md)',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: opt.color,
                    background: index === selectedIndex ? opt.bg : 'transparent',
                    border: 'none',
                    borderBottom:
                      index === filteredCommands.length - 1 && filteredSlugs.length > 0
                        ? `1px solid ${withAlpha(ACCENT_GOLD, 10)}`
                        : 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  <span style={{ fontSize: '11px', opacity: 0.85 }}>@{opt.key}</span>
                </button>
              ) : (
                <button
                  key={opt.slug}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault() // prevent blur
                    insertMention(opt.slug)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className="cursor-pointer w-full text-left"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: 'var(--sp-sm) var(--sp-md)',
                    fontSize: '13px',
                    color: 'var(--ink)',
                    background: index === selectedIndex ? 'var(--gold-active)' : 'transparent',
                    border: 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 500,
                      flex: 1,
                    }}
                  >
                    {opt.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--gold)',
                      opacity: 0.85,
                    }}
                  >
                    @{opt.slug}
                  </span>
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
