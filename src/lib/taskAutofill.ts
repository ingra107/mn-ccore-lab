/**
 * Heuristic task autofill — suggests project, priority, and assignee
 * based on keyword matching against existing data.
 *
 * No LLM calls. Pure keyword/heuristic matching.
 */

import type { Project, TeamMember } from '../data/types'
import { directors } from '../data/team'

// ── Types ────────────────────────────────────────────────────

export interface FieldSuggestion<T = string> {
  field: 'project' | 'priority' | 'assignee'
  value: T
  label: string       // display text for the chip
  confidence: number  // 0-1, higher = better match
}

export interface AutofillSuggestions {
  project: FieldSuggestion | null
  priority: FieldSuggestion | null
  assignee: FieldSuggestion | null
}

// ── Priority keywords ────────────────────────────────────────

const PRIORITY_KEYWORDS: Record<string, { value: string; label: string; confidence: number }> = {
  // Urgent
  urgent: { value: 'urgent', label: 'Urgent', confidence: 0.95 },
  asap: { value: 'urgent', label: 'Urgent', confidence: 0.9 },
  'right now': { value: 'urgent', label: 'Urgent', confidence: 0.85 },
  immediately: { value: 'urgent', label: 'Urgent', confidence: 0.85 },
  emergency: { value: 'urgent', label: 'Urgent', confidence: 0.9 },
  today: { value: 'urgent', label: 'Urgent', confidence: 0.8 },
  critical: { value: 'urgent', label: 'Urgent', confidence: 0.85 },
  // High
  important: { value: 'high', label: 'High', confidence: 0.8 },
  deadline: { value: 'high', label: 'High', confidence: 0.75 },
  overdue: { value: 'high', label: 'High', confidence: 0.85 },
  revision: { value: 'high', label: 'High', confidence: 0.7 },
  resubmit: { value: 'high', label: 'High', confidence: 0.8 },
  submit: { value: 'high', label: 'High', confidence: 0.7 },
  // Medium
  review: { value: 'medium', label: 'Medium', confidence: 0.6 },
  draft: { value: 'medium', label: 'Medium', confidence: 0.6 },
  update: { value: 'medium', label: 'Medium', confidence: 0.5 },
  prepare: { value: 'medium', label: 'Medium', confidence: 0.5 },
  finalize: { value: 'medium', label: 'Medium', confidence: 0.6 },
  // Low
  idea: { value: 'low', label: 'Low', confidence: 0.7 },
  explore: { value: 'low', label: 'Low', confidence: 0.7 },
  brainstorm: { value: 'low', label: 'Low', confidence: 0.65 },
  someday: { value: 'low', label: 'Low', confidence: 0.8 },
  'nice to have': { value: 'low', label: 'Low', confidence: 0.75 },
  'look into': { value: 'low', label: 'Low', confidence: 0.65 },
  consider: { value: 'low', label: 'Low', confidence: 0.6 },
  maybe: { value: 'low', label: 'Low', confidence: 0.6 },
}

// ── Project matching ─────────────────────────────────────────

function matchProject(titleLower: string, projects: Project[]): FieldSuggestion | null {
  let best: { project: Project; confidence: number } | null = null

  for (const project of projects) {
    const slugLower = project.slug.toLowerCase()
    const titleWords = project.title.toLowerCase()

    // Exact slug mention (e.g., "cqode" in title)
    for (const segment of slugLower.split('-')) {
      if (segment.length >= 3 && titleLower.includes(segment)) {
        const confidence = segment.length >= 5 ? 0.9 : 0.75
        if (!best || confidence > best.confidence) {
          best = { project, confidence }
        }
      }
    }

    // Category keywords
    const category = project.category?.toLowerCase()
    if (category && category.length >= 3 && titleLower.includes(category)) {
      // Category matches are decent but not as specific as slug
      const confidence = 0.6
      if (!best || confidence > best.confidence) {
        best = { project, confidence }
      }
    }

    // Multi-word title matching: check if significant words from project title appear
    const projectTitleWords = titleWords
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 4) // skip short words
    const matchedWords = projectTitleWords.filter((w) => titleLower.includes(w))
    if (matchedWords.length >= 2) {
      const confidence = Math.min(0.85, 0.5 + matchedWords.length * 0.15)
      if (!best || confidence > best.confidence) {
        best = { project, confidence }
      }
    }
  }

  // Common domain-specific keyword overrides
  const domainPatterns: { pattern: RegExp; slugPart: string; confidence: number }[] = [
    { pattern: /\bclif\b/i, slugPart: 'clif', confidence: 0.7 },
    { pattern: /\bgdms\b/i, slugPart: 'gdms', confidence: 0.85 },
    { pattern: /\bsurvey\b/i, slugPart: 'survey', confidence: 0.5 },
    { pattern: /\br01\b/i, slugPart: 'r01', confidence: 0.8 },
    { pattern: /\bgrant\b/i, slugPart: 'r01', confidence: 0.5 },
    { pattern: /\bcqode\b/i, slugPart: 'cqode', confidence: 0.9 },
    { pattern: /\bventmode\b/i, slugPart: 'ventmode', confidence: 0.9 },
    { pattern: /\btidal volume\b/i, slugPart: 'tidal-volume', confidence: 0.85 },
    { pattern: /\blung cancer\b/i, slugPart: 'lung-cancer', confidence: 0.85 },
    { pattern: /\bcci\b/i, slugPart: 'cci', confidence: 0.8 },
    { pattern: /\bards\b/i, slugPart: 'ards', confidence: 0.8 },
    { pattern: /\biv fluid/i, slugPart: 'iv-fluid', confidence: 0.85 },
    { pattern: /\boxygenation\b/i, slugPart: 'oxygenation', confidence: 0.75 },
    { pattern: /\bquality metric/i, slugPart: 'quality-metric', confidence: 0.8 },
    { pattern: /\bmnccore\b/i, slugPart: 'mnccore', confidence: 0.7 },
    { pattern: /\bwebsite\b/i, slugPart: 'website', confidence: 0.6 },
    { pattern: /\bhub\b/i, slugPart: 'hub', confidence: 0.5 },
  ]

  for (const { pattern, slugPart, confidence } of domainPatterns) {
    if (pattern.test(titleLower)) {
      const match = projects.find((p) => p.slug.toLowerCase().includes(slugPart))
      if (match && (!best || confidence > best.confidence)) {
        best = { project: match, confidence }
      }
    }
  }

  if (!best || best.confidence < 0.4) return null

  return {
    field: 'project',
    value: best.project.slug,
    label: best.project.title,
    confidence: best.confidence,
  }
}

// ── Priority matching ────────────────────────────────────────

function matchPriority(titleLower: string): FieldSuggestion | null {
  let best: { value: string; label: string; confidence: number } | null = null

  for (const [keyword, info] of Object.entries(PRIORITY_KEYWORDS)) {
    if (titleLower.includes(keyword)) {
      if (!best || info.confidence > best.confidence) {
        best = info
      }
    }
  }

  if (!best) return null

  return {
    field: 'priority',
    value: best.value,
    label: `Priority: ${best.label}`,
    confidence: best.confidence,
  }
}

// ── Assignee matching ────────────────────────────────────────

function matchAssignee(titleLower: string, team: TeamMember[]): FieldSuggestion | null {
  // All people: directors + team members
  const allPeople = [
    ...directors.map((d) => ({ slug: d.slug, name: d.name })),
    ...team.filter((m) => m.slug).map((m) => ({ slug: m.slug!, name: m.name })),
  ]

  // Check @mentions first (highest confidence)
  const atMention = titleLower.match(/@(\w+)/)
  if (atMention) {
    const mention = atMention[1]
    const person = allPeople.find(
      (p) =>
        p.slug === mention ||
        p.name.toLowerCase().split(' ')[0] === mention ||
        p.name.toLowerCase().split(' ').pop() === mention,
    )
    if (person) {
      return {
        field: 'assignee',
        value: person.slug,
        label: person.name,
        confidence: 0.95,
      }
    }
  }

  // Check for last names or first names in title
  for (const person of allPeople) {
    const nameParts = person.name.toLowerCase().split(' ')
    const lastName = nameParts[nameParts.length - 1]
    const firstName = nameParts[0]

    // Last name match (more specific, higher confidence)
    if (lastName.length >= 4 && titleLower.includes(lastName)) {
      return {
        field: 'assignee',
        value: person.slug,
        label: person.name,
        confidence: 0.85,
      }
    }

    // First name match (less specific)
    if (firstName.length >= 4 && titleLower.includes(firstName)) {
      return {
        field: 'assignee',
        value: person.slug,
        label: person.name,
        confidence: 0.7,
      }
    }
  }

  // Role-based heuristics
  if (/\bfellow\b/.test(titleLower)) {
    const fellows = team.filter((m) => m.role?.toLowerCase().includes('fellow'))
    if (fellows.length > 0) {
      const fellow = fellows[0] // most active fellow (sorted by activity in team.ts)
      return {
        field: 'assignee',
        value: fellow.slug!,
        label: fellow.name,
        confidence: 0.5,
      }
    }
  }

  if (/\bcoordinator\b/.test(titleLower)) {
    const coordinators = team.filter((m) => m.role?.toLowerCase().includes('coordinator'))
    if (coordinators.length > 0) {
      return {
        field: 'assignee',
        value: coordinators[0].slug!,
        label: coordinators[0].name,
        confidence: 0.5,
      }
    }
  }

  if (/\banalyst\b/.test(titleLower) || /\banalysis\b/.test(titleLower)) {
    const analysts = team.filter((m) => m.role?.toLowerCase().includes('analyst'))
    if (analysts.length > 0) {
      return {
        field: 'assignee',
        value: analysts[0].slug!,
        label: analysts[0].name,
        confidence: 0.5,
      }
    }
  }

  return null
}

// ── Main export ──────────────────────────────────────────────

export function suggestTaskFields(
  title: string,
  projects: Project[],
  team: TeamMember[],
): AutofillSuggestions {
  const titleLower = title.toLowerCase().trim()

  if (titleLower.length < 3) {
    return { project: null, priority: null, assignee: null }
  }

  return {
    project: matchProject(titleLower, projects),
    priority: matchPriority(titleLower),
    assignee: matchAssignee(titleLower, team),
  }
}
