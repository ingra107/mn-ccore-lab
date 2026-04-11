import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { useTodayMd } from '../../hooks/useApiData'
import { CardSkeleton } from '../LoadingSkeleton'
import EmptyState from '../EmptyState'

// ── Markdown line types ──────────────────────────────────────

type LineType = 'section' | 'task-open' | 'task-done' | 'callout' | 'wikilink-line' | 'text' | 'blank'

interface ParsedLine {
  type: LineType
  raw: string
  indent: number
  // Section
  sectionTitle?: string
  // Task
  taskText?: string
  checked?: boolean
  dueDate?: string
  projectSlug?: string
  wikilinks?: { full: string; path: string; display: string }[]
  // Callout
  calloutType?: string
  calloutText?: string
}

interface Section {
  title: string
  lines: ParsedLine[]
}

// ── Parsing ──────────────────────────────────────────────────

const SECTION_RE = /^##\s+(.+)/
const TASK_OPEN_RE = /^(\s*)- \[ \]\s+(.*)/
const TASK_DONE_RE = /^(\s*)- \[x\]\s+(.*)/i
const CALLOUT_RE = /^>\s*\[!(\w+)\]\s*(.*)/
const WIKILINK_RE = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g
const DUE_DATE_RE = /(?:due|by|deadline)[:\s]*(\d{4}-\d{2}-\d{2})/i
const INLINE_DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/

function extractWikilinks(text: string): { full: string; path: string; display: string }[] {
  const results: { full: string; path: string; display: string }[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(WIKILINK_RE.source, 'g')
  while ((match = re.exec(text)) !== null) {
    results.push({
      full: match[0],
      path: match[1],
      display: match[2] || match[1].split('/').pop() || match[1],
    })
  }
  return results
}

function extractDueDate(text: string): string | undefined {
  const m1 = DUE_DATE_RE.exec(text)
  if (m1) return m1[1]
  const m2 = INLINE_DUE_RE.exec(text)
  if (m2) return m2[1]
  return undefined
}

function extractProjectSlug(wikilinks: { path: string }[]): string | undefined {
  for (const wl of wikilinks) {
    const parts = wl.path.split('/')
    const proj = parts.find(p => p.startsWith('Projects/'))
    if (proj) return proj.replace('Projects/', '')
    // Direct slug reference
    if (parts.length === 1 && !parts[0].includes('.')) return parts[0]
  }
  return undefined
}

function parseLine(raw: string): ParsedLine {
  // Blank
  if (!raw.trim()) return { type: 'blank', raw, indent: 0 }

  // Section header
  const sectionMatch = SECTION_RE.exec(raw)
  if (sectionMatch) {
    return { type: 'section', raw, indent: 0, sectionTitle: sectionMatch[1].trim() }
  }

  // Completed task
  const doneMatch = TASK_DONE_RE.exec(raw)
  if (doneMatch) {
    const indent = doneMatch[1].length
    let text = doneMatch[2]
    // Strip strikethrough markers
    text = text.replace(/~~(.+?)~~/g, '$1')
    const wikilinks = extractWikilinks(text)
    return {
      type: 'task-done', raw, indent,
      taskText: text, checked: true,
      dueDate: extractDueDate(text),
      projectSlug: extractProjectSlug(wikilinks),
      wikilinks,
    }
  }

  // Open task
  const openMatch = TASK_OPEN_RE.exec(raw)
  if (openMatch) {
    const indent = openMatch[1].length
    const text = openMatch[2]
    const wikilinks = extractWikilinks(text)
    return {
      type: 'task-open', raw, indent,
      taskText: text, checked: false,
      dueDate: extractDueDate(text),
      projectSlug: extractProjectSlug(wikilinks),
      wikilinks,
    }
  }

  // Callout
  const calloutMatch = CALLOUT_RE.exec(raw)
  if (calloutMatch) {
    return {
      type: 'callout', raw, indent: 0,
      calloutType: calloutMatch[1].toLowerCase(),
      calloutText: calloutMatch[2],
    }
  }

  // Regular text
  return { type: 'text', raw, indent: 0, wikilinks: extractWikilinks(raw) }
}

function parseMarkdown(content: string): Section[] {
  const lines = content.split('\n')
  const sections: Section[] = []
  let currentSection: Section = { title: 'Preamble', lines: [] }

  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed.type === 'section') {
      // Push previous section if it has content
      if (currentSection.lines.length > 0 || currentSection.title !== 'Preamble') {
        sections.push(currentSection)
      }
      currentSection = { title: parsed.sectionTitle!, lines: [] }
    } else {
      currentSection.lines.push(parsed)
    }
  }
  // Push final section
  if (currentSection.lines.length > 0 || currentSection.title !== 'Preamble') {
    sections.push(currentSection)
  }

  return sections
}

// ── Due date coloring ────────────────────────────────────────

function getDueDateStyle(dateStr: string): { color: string; label: string } {
  const today = new Date().toISOString().split('T')[0]
  if (dateStr < today) return { color: 'var(--maroon)', label: 'overdue' }
  if (dateStr === today) return { color: 'var(--gold)', label: 'today' }
  return { color: 'var(--slate)', label: dateStr }
}

// ── Render wikilink-rich text ────────────────────────────────

function RichText({ text, wikilinks }: { text: string; wikilinks?: { full: string; path: string; display: string }[] }) {
  if (!wikilinks || wikilinks.length === 0) {
    // Strip markdown bold/italic
    const cleaned = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
    return <span>{cleaned}</span>
  }

  const parts: (string | React.JSX.Element)[] = []
  let remaining = text
  let keyIdx = 0

  for (const wl of wikilinks) {
    const idx = remaining.indexOf(wl.full)
    if (idx === -1) continue
    if (idx > 0) parts.push(remaining.slice(0, idx))
    parts.push(
      <a
        key={keyIdx++}
        href={`/portal/projects`}
        onClick={(e) => e.stopPropagation()}
        style={{
          color: 'var(--teal)',
          textDecoration: 'none',
          borderBottom: '1px solid transparent',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.borderBottomColor = 'var(--teal)' }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.borderBottomColor = 'transparent' }}
      >
        {wl.display}
      </a>
    )
    remaining = remaining.slice(idx + wl.full.length)
  }
  if (remaining) parts.push(remaining)

  return <span>{parts}</span>
}

// ── Task checkbox ────────────────────────────────────────────

function TaskCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="flex-shrink-0 transition-all"
      style={{
        width: 18,
        height: 18,
        borderRadius: 'var(--radius-sm)',
        border: checked ? '2px solid var(--teal)' : '2px solid var(--slate)',
        background: checked ? 'var(--teal)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: checked ? 0.6 : 1,
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="var(--cream)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

// ── Task item ────────────────────────────────────────────────

function TaskItem({ line, onToggle }: { line: ParsedLine; onToggle: () => void }) {
  const dueDateStyle = line.dueDate ? getDueDateStyle(line.dueDate) : null

  return (
    <div
      className="flex items-start gap-2.5 py-1.5 group"
      style={{
        paddingLeft: line.indent > 0 ? `${line.indent * 8 + 4}px` : '4px',
        opacity: line.checked ? 0.4 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div className="mt-0.5">
        <TaskCheckbox checked={!!line.checked} onChange={onToggle} />
      </div>
      <div className="flex-1 min-w-0">
        <span
          style={{
            fontSize: '14px',
            lineHeight: '1.6',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            color: 'var(--ink)',
            textDecoration: line.checked ? 'line-through' : 'none',
          }}
        >
          <RichText text={line.taskText || ''} wikilinks={line.wikilinks} />
        </span>
        {dueDateStyle && (
          <span
            className="ml-2 inline-block"
            style={{
              fontSize: 'var(--label-size)',
              color: dueDateStyle.color,
              fontWeight: 'var(--label-weight)',
              opacity: 0.85,
            }}
          >
            {dueDateStyle.label}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Callout block ────────────────────────────────────────────

function CalloutBlock({ line }: { line: ParsedLine }) {
  return (
    <div
      className="my-2 px-3 py-2 rounded-lg"
      style={{
        borderLeft: '3px solid var(--teal)',
        background: 'var(--teal-hover)',
        fontSize: 'var(--value-size)',
        lineHeight: '1.5',
        color: 'var(--ink)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {line.calloutType && (
        <span
          className="inline-block mr-2"
          style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--teal)', opacity: 0.8 }}
        >
          {line.calloutType}
        </span>
      )}
      <RichText text={line.calloutText || ''} wikilinks={line.wikilinks} />
    </div>
  )
}

// ── Section block ────────────────────────────────────────────

function SectionBlock({ section, onToggleTask }: { section: Section; onToggleTask: (lineIdx: number) => void }) {
  const [collapsed, setCollapsed] = useState(false)

  // Count tasks
  const taskCount = section.lines.filter(l => l.type === 'task-open' || l.type === 'task-done').length
  const doneCount = section.lines.filter(l => l.type === 'task-done').length

  // Filter out blank lines from end
  const visibleLines = section.lines.filter((l, i, arr) => {
    if (l.type === 'blank') {
      // Keep blank lines between non-blank lines, skip trailing blanks
      const nextNonBlank = arr.slice(i + 1).find(ll => ll.type !== 'blank')
      return !!nextNonBlank
    }
    return true
  })

  return (
    <div className="mb-5">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full group mb-2"
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
      >
        <span style={{ color: 'var(--gold)', opacity: 0.6, transition: 'transform 0.15s' }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </span>
        <span
          style={{
            fontSize: '15px',
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '0.01em',
          }}
        >
          {section.title}
        </span>
        {taskCount > 0 && (
          <span
            style={{
              fontSize: 'var(--label-size)',
              color: 'var(--slate)',
              fontWeight: 400,
              marginLeft: '4px',
            }}
          >
            {doneCount}/{taskCount}
          </span>
        )}
        {/* Gold underline */}
        <div
          className="flex-1 ml-2"
          style={{
            height: '1px',
            background: 'linear-gradient(to right, var(--gold), transparent)',
            opacity: 0.35,
          }}
        />
      </button>

      {/* Section content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pl-1">
              {visibleLines.map((line, idx) => {
                const realIdx = section.lines.indexOf(line)
                if (line.type === 'task-open' || line.type === 'task-done') {
                  return <TaskItem key={idx} line={line} onToggle={() => onToggleTask(realIdx)} />
                }
                if (line.type === 'callout') {
                  return <CalloutBlock key={idx} line={line} />
                }
                if (line.type === 'text') {
                  return (
                    <p
                      key={idx}
                      className="py-0.5"
                      style={{
                        fontSize: '14px',
                        lineHeight: '1.6',
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 400,
                        color: 'var(--ink)',
                        opacity: 0.85,
                        paddingLeft: '4px',
                      }}
                    >
                      <RichText text={line.raw} wikilinks={line.wikilinks} />
                    </p>
                  )
                }
                if (line.type === 'blank') {
                  return <div key={idx} style={{ height: '8px' }} />
                }
                return null
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main TodayView ───────────────────────────────────────────

export default function TodayView() {
  const { data: content, isLoading } = useTodayMd()
  const [localToggles, setLocalToggles] = useState<Record<string, boolean>>({})

  const sections = useMemo(() => {
    if (!content) return []
    return parseMarkdown(content)
  }, [content])

  // Toggle a task checkbox (local-only, optimistic)
  const handleToggleTask = useCallback((sectionIdx: number, lineIdx: number) => {
    const key = `${sectionIdx}:${lineIdx}`
    setLocalToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Apply local toggles to sections
  const displaySections = useMemo(() => {
    return sections.map((section, sIdx) => ({
      ...section,
      lines: section.lines.map((line, lIdx) => {
        const key = `${sIdx}:${lIdx}`
        if ((line.type === 'task-open' || line.type === 'task-done') && key in localToggles) {
          const toggled = localToggles[key]
          const wasChecked = line.type === 'task-done'
          const nowChecked = toggled ? !wasChecked : wasChecked
          return {
            ...line,
            type: (nowChecked ? 'task-done' : 'task-open') as LineType,
            checked: nowChecked,
          }
        }
        return line
      }),
    }))
  }, [sections, localToggles])

  if (isLoading) return <CardSkeleton count={3} />

  if (!content?.trim()) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <EmptyState
          icon={<FileText size={32} />}
          title="No TODAY.md loaded"
          subtitle="Sync your TODAY.md from the Peripheral Brain to see your daily plan rendered here."
        />
      </div>
    )
  }

  // Skip the Preamble section if it only has blanks/text (the title line)
  const visibleSections = displaySections.filter(s => {
    if (s.title === 'Preamble') {
      const hasContent = s.lines.some(l => l.type !== 'blank' && l.type !== 'text')
      return hasContent || s.lines.some(l => l.type === 'text' && l.raw.trim().length > 0)
    }
    return true
  })

  return (
    <div
      className="rounded-xl px-5 py-4"
      style={{
        background: 'var(--gold-light)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Last synced hint */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: 'var(--gold)', opacity: 0.7 }} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--gold)',
            }}
          >
            TODAY.md
          </span>
        </div>
        <span style={{ fontSize: 'var(--label-size)', color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          read-only view
        </span>
      </div>

      {/* Sections */}
      {visibleSections.map((section, sIdx) => {
        const realIdx = displaySections.indexOf(section)
        return (
          <SectionBlock
            key={`${section.title}-${sIdx}`}
            section={section}
            onToggleTask={(lineIdx) => handleToggleTask(realIdx, lineIdx)}
          />
        )
      })}
    </div>
  )
}
