/**
 * Todoist-style token parser for quick task entry.
 *
 * Recognized tokens:
 *   @name     → assignee (fuzzy match against team slugs/names)
 *   #project  → project (match against project slugs/titles/categories)
 *   p1/p2/p3  → priority level
 *   date expr → due date ("Apr 15", "tomorrow", "next Friday", "in 3 days")
 *
 * Everything else becomes the task title.
 */

import { directors, getAllMembers } from '../data/team'
import { projects } from '../data/projects'
import { localDateKey } from './dateUtils'

// ── Types ────────────────────────────────────────────────────

export type TokenType = 'assignee' | 'project' | 'priority' | 'date' | 'plain'

export interface TokenSpan {
  text: string
  type: TokenType
  start: number
  end: number
}

export interface ParsedQuickAdd {
  title: string
  assigneeSlug: string | null
  assigneeName: string | null
  projectSlug: string | null
  projectTitle: string | null
  priority: 1 | 2 | 3 | null
  dueDate: string | null // ISO YYYY-MM-DD
  tokens: TokenSpan[]
}

// ── Name lookup ──────────────────────────────────────────────

type PersonEntry = { slug: string; name: string }

function buildNameIndex(): Map<string, PersonEntry> {
  const index = new Map<string, PersonEntry>()
  const all: PersonEntry[] = [
    ...directors.map((d) => ({ slug: d.slug, name: d.name })),
    ...getAllMembers().map((m) => ({ slug: m.slug ?? '', name: m.name })),
  ].filter((p) => p.slug)

  for (const person of all) {
    index.set(person.slug.toLowerCase(), person)
    const parts = person.name.toLowerCase().split(' ')
    if (parts[0]) index.set(parts[0], person)
    if (parts.length > 1) index.set(parts[parts.length - 1], person)
  }
  return index
}

const nameIndex = buildNameIndex()

function resolveAssignee(token: string): PersonEntry | null {
  return nameIndex.get(token.toLowerCase()) ?? null
}

// ── Project lookup ───────────────────────────────────────────

type ProjectEntry = { slug: string; title: string }

function buildProjectIndex(): Map<string, ProjectEntry> {
  const index = new Map<string, ProjectEntry>()
  for (const p of projects) {
    const entry: ProjectEntry = { slug: p.slug, title: p.title }
    index.set(p.slug.toLowerCase(), entry)
    index.set(p.title.toLowerCase(), entry)
    if (!index.has(p.category.toLowerCase())) {
      index.set(p.category.toLowerCase(), entry)
    }
    for (const seg of p.slug.split('-')) {
      if (seg.length >= 3 && !index.has(seg)) index.set(seg, entry)
    }
    const titleWord = p.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(' ')[0]
    if (titleWord && titleWord.length >= 3 && !index.has(titleWord)) {
      index.set(titleWord, entry)
    }
  }
  return index
}

const projectIndex = buildProjectIndex()

function resolveProject(token: string): ProjectEntry | null {
  const lower = token.toLowerCase()
  if (projectIndex.has(lower)) return projectIndex.get(lower)!
  for (const [key, val] of projectIndex) {
    if (key.startsWith(lower) && lower.length >= 3) return val
  }
  return null
}

// ── Date parsing ─────────────────────────────────────────────

function parseDate(text: string): string | null {
  const lower = text.toLowerCase().trim()
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  if (lower === 'today') return localDateKey(today)

  if (lower === 'tomorrow') {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return localDateKey(d)
  }

  const nextDay = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)
  if (nextDay) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const target = days.indexOf(nextDay[1])
    const diff = ((target - today.getDay() + 7) % 7) || 7
    const d = new Date(today)
    d.setDate(d.getDate() + diff)
    return localDateKey(d)
  }

  const inN = lower.match(/^in\s+(\d+)\s+days?$/)
  if (inN) {
    const d = new Date(today)
    d.setDate(d.getDate() + parseInt(inN[1]))
    return localDateKey(d)
  }

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const monthRe =
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?$/
  const mm = lower.match(monthRe)
  if (mm) {
    const monthIdx = MONTHS.findIndex((m) => mm[1].startsWith(m))
    if (monthIdx >= 0) {
      const day = parseInt(mm[2])
      const year = mm[3] ? parseInt(mm[3]) : today.getFullYear()
      const d = new Date(year, monthIdx, day, 12, 0, 0)
      if (!mm[3] && d < today) d.setFullYear(year + 1)
      return localDateKey(d)
    }
  }

  return null
}

// ── Main parser ──────────────────────────────────────────────

export function parseQuickAddInput(input: string): ParsedQuickAdd {
  const empty: ParsedQuickAdd = {
    title: '',
    assigneeSlug: null,
    assigneeName: null,
    projectSlug: null,
    projectTitle: null,
    priority: null,
    dueDate: null,
    tokens: [],
  }
  if (!input.trim()) return empty

  interface RawMatch {
    start: number
    end: number
    text: string
    type: TokenType
  }

  const raw: RawMatch[] = []

  function scan(re: RegExp, type: TokenType) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(input)) !== null) {
      raw.push({ start: m.index, end: m.index + m[0].length, text: m[0], type })
    }
  }

  scan(/@([\w]+)/g, 'assignee')
  scan(/#([\w-]+)/g, 'project')
  scan(/\bp([123])\b/g, 'priority')
  scan(/\bnext\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, 'date')
  scan(/\bin\s+\d+\s+days?\b/gi, 'date')
  scan(
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{4})?\b/gi,
    'date',
  )
  scan(/\b(?:today|tomorrow)\b/gi, 'date')

  // Sort by position; resolve ties by preferring longer matches
  raw.sort((a, b) => a.start - b.start || b.end - a.end)

  // Remove overlapping (first/longest wins)
  const kept: RawMatch[] = []
  let cursor = 0
  for (const match of raw) {
    if (match.start >= cursor) {
      kept.push(match)
      cursor = match.end
    }
  }

  // Build TokenSpan array (including plain segments between tokens)
  const spans: TokenSpan[] = []
  let pos = 0
  for (const match of kept) {
    if (match.start > pos) {
      spans.push({ text: input.slice(pos, match.start), type: 'plain', start: pos, end: match.start })
    }
    spans.push({ text: match.text, type: match.type, start: match.start, end: match.end })
    pos = match.end
  }
  if (pos < input.length) {
    spans.push({ text: input.slice(pos), type: 'plain', start: pos, end: input.length })
  }

  // Resolve token values; downgrade unrecognized tokens to 'plain'
  let assigneeSlug: string | null = null
  let assigneeName: string | null = null
  let projectSlug: string | null = null
  let projectTitle: string | null = null
  let priority: 1 | 2 | 3 | null = null
  let dueDate: string | null = null

  for (const span of spans) {
    if (span.type === 'assignee') {
      const r = resolveAssignee(span.text.slice(1))
      if (r) {
        assigneeSlug = r.slug
        assigneeName = r.name
      } else {
        span.type = 'plain'
      }
    } else if (span.type === 'project') {
      const r = resolveProject(span.text.slice(1))
      if (r) {
        projectSlug = r.slug
        projectTitle = r.title
      } else {
        span.type = 'plain'
      }
    } else if (span.type === 'priority') {
      priority = parseInt(span.text.slice(1)) as 1 | 2 | 3
    } else if (span.type === 'date') {
      const d = parseDate(span.text)
      if (d) {
        dueDate = d
      } else {
        span.type = 'plain'
      }
    }
  }

  const title = spans
    .filter((s) => s.type === 'plain')
    .map((s) => s.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return { title, assigneeSlug, assigneeName, projectSlug, projectTitle, priority, dueDate, tokens: spans }
}
