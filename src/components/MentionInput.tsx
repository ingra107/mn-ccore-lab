import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTeamSlugs } from '../hooks/useMentionAutocomplete'

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  style?: React.CSSProperties
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
}

export default function MentionInput({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 2,
  style,
  onKeyDown,
  onFocus,
  onBlur,
}: MentionInputProps) {
  const { data: teamSlugs = [] } = useTeamSlugs()
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const filteredSlugs = useMemo(() => {
    if (!mentionFilter) return teamSlugs
    const lower = mentionFilter.toLowerCase()
    return teamSlugs.filter(
      (t) =>
        t.slug.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower)
    )
  }, [teamSlugs, mentionFilter])

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
    if (mentionOpen && filteredSlugs.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filteredSlugs.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredSlugs[selectedIndex].slug)
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

  // Render value with @mention highlighting
  // We use an overlay approach: the textarea holds the plain text,
  // and we show a mirrored div behind it with highlighted mentions
  const highlightedParts = useMemo(() => {
    const parts: { text: string; isMention: boolean }[] = []
    const regex = /@(\w[\w-]*)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: value.slice(lastIndex, match.index), isMention: false })
      }
      parts.push({ text: match[0], isMention: true })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < value.length) {
      parts.push({ text: value.slice(lastIndex), isMention: false })
    }
    return parts
  }, [value])

  // We need to know if there are any mentions to decide if we show the highlight overlay
  const hasMentions = highlightedParts.some((p) => p.isMention)

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
              <span
                key={i}
                style={{
                  color: 'var(--gold)',
                  fontWeight: 600,
                  background: 'var(--gold-active)',
                  borderRadius: 'var(--radius-sm)',
                }}
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
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        style={{
          ...style,
          width: '100%',
          position: 'relative',
          // When mentions are present, make textarea text use a special caret-color approach
          // The highlight overlay handles the visual. Textarea text stays normal for editing.
          caretColor: hasMentions ? 'var(--ink)' : undefined,
        }}
      />

      {/* Mention autocomplete dropdown */}
      <AnimatePresence>
        {mentionOpen && filteredSlugs.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '4px',
              width: '240px',
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'var(--cream)',
              border: '1px solid rgba(201, 168, 76, 0.2)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-menu)',
              zIndex: 'var(--z-dropdown)',
              padding: 'var(--sp-xs) 0',
            }}
          >
            {filteredSlugs.map((person, index) => (
              <button
                key={person.slug}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault() // prevent blur
                  insertMention(person.slug)
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
                  {person.name}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--gold)',
                    opacity: 0.85,
                  }}
                >
                  @{person.slug}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
