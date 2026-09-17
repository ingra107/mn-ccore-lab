// Shared task-grouping primitives used by both the Today landing surface
// (src/components/today/) and the MyTasks page (src/pages/MyTasks/).
//
// Extracted from both constants.ts files (Task 5.4, naming-convention refactor
// 2026-05-14). Only items that are byte-identical between the two surfaces
// live here. Surface-specific items (GROUP_META, GroupMeta interface,
// getGroupForTask, move options, view types, mentee slugs, localStorage
// helpers) remain in each surface's own constants.ts.

import type { TaskRow } from './api'
import { isMilestone } from '../../shared/taskKinds'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type GroupKey = 'deep' | 'priorities' | 'quick' | 'pb' | 'etl'

// ──────────────────────────────────────────────────────────────────────────
// Constants — group ordering
// ──────────────────────────────────────────────────────────────────────────

export const GROUP_ORDER: GroupKey[] = ['deep', 'priorities', 'quick', 'pb', 'etl']

// ──────────────────────────────────────────────────────────────────────────
// Constants — theme palette (CSS-var SSOT, Phase 7 2026-05-27)
// ──────────────────────────────────────────────────────────────────────────
//
// These are STRING references to CSS custom properties defined in
// src/index.css (the --task-* tokens). Used as CSS values (style={{
// color: ACCENT_GOLD }}) they resolve to the theme-aware token, so the
// task surfaces (Today + MyTasks) now adapt to both light + dark mode
// instead of being dark-locked. The previous hardcoded hex palette
// (#c9a84c / #0b1017 / etc.) lives only in :root/.dark in index.css.

export const ACCENT_GOLD   = 'var(--task-accent-gold)'
export const ACCENT_TEAL   = 'var(--task-accent-teal)'
export const ACCENT_CORAL  = 'var(--task-accent-coral)'
export const ACCENT_ORANGE = 'var(--task-accent-orange)'
export const ACCENT_GREEN  = 'var(--task-accent-green)'
// Two-date milestone rendering (Nick 2026-09-17) — the internal/slipped date
// reads blue, distinct from the hard (sponsor/journal) date, which stays gold.
export const ACCENT_BLUE   = 'var(--task-accent-blue)'
export const INK           = 'var(--task-ink)'
export const INK_MUTED     = 'var(--task-ink-muted)'
export const INK_DIM       = 'var(--task-ink-dim)'
export const PAGE_BG       = 'var(--task-page-bg)'
export const PANEL_BG      = 'var(--task-panel-bg)'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Alpha-blend a task-surface accent color over the page background.
 * Replaces the legacy `${color}NN` hex+alpha-suffix pattern which only
 * worked when `color` was a literal 6-digit hex; the Phase 7 CSS-var
 * migration broke that pattern (a CSS var with a hex-alpha suffix is not
 * valid CSS). Returns a CSS `color-mix()` expression supported in Chrome
 * 111+ / Safari 16.4+ / Firefox 113+.
 *
 *   withAlpha(ACCENT_GOLD, 13)  →  'color-mix(in srgb, var(--task-accent-gold) 13%, transparent)'
 *
 * Common hex-alpha → percent lookups (rounded):
 *   12=7%, 14=8%, 15=8%, 22=13%, 25=15%, 30=19%, 40=25%, 55=33%, 70=44%
 */
export function withAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/**
 * Canonical done-ness (handoff §4). `status` is the single source of truth —
 * derive done from `status === 'done'`, NOT the separate `completed` flag.
 * `completed`/`completed_at` are still WRITTEN through the mutations for API /
 * back-compat, but UI must not branch on both. One helper so every surface
 * agrees on what "done" means.
 */
export function isTaskDone(t: { status?: string | null }): boolean {
  return t.status === 'done'
}

/**
 * Meeting-approval triage state (#97).
 *
 * A `source='meeting_approval'` task is a TRIAGE ARTIFACT, not work: it exists
 * only to ask "did this captured meeting really happen?" `approval_status` is
 * the tri-state answer, and only these rows ever carry it (normal tasks leave
 * it NULL — schema v83, decision 2026-06-25).
 *
 * - pending  → belongs to PendingMeetingsCard, excluded from regular groups.
 * - accepted → answered; the digest is queued and the artifact's job is over.
 * - declined → answered "no"; there is nothing left to do.
 *
 * Both ANSWERED states must drop out of the regular task lists. Previously only
 * 'pending' was filtered, so the instant Nick hit Accept or Decline the row fell
 * straight back into Today / My Tasks rendered as an ordinary task with no
 * approve/decline affordance — exactly the "these approve tasks show up like the
 * normal asks" report.
 *
 * This read-side guard is load-bearing beyond the Hub's own buttons: the same
 * meetings are triaged from OUTSIDE this repo (Nick declines via Telegram; that
 * lane lives in Peripheral Brain and writes `approval_status` only, leaving
 * `status='todo'`). Filtering on the answer rather than on `status` is what
 * makes "if i decline on telegram i would hope this drops" hold no matter which
 * surface did the declining.
 */
export function isApprovalPending(t: { approval_status?: string | null }): boolean {
  return t.approval_status === 'pending'
}

export function isApprovalTriaged(t: { approval_status?: string | null }): boolean {
  return t.approval_status === 'accepted' || t.approval_status === 'declined'
}

/** Today's date as YYYY-MM-DD string in browser local time. */
export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A civil date (YYYY-MM-DD) offset by N days, still civil, still local.
 *
 * Parses from PARTS into a local-midnight Date — never `new Date('2026-08-03')`,
 * which parses as UTC midnight and lands on the previous day in every western
 * zone (the same defect `isToday()` documents). `setDate` handles month, year
 * and DST rollover for us.
 */
export function civilDatePlusDays(civil: string, days: number): string {
  const [y, m, d] = civil.split('-').map(Number)
  if (!y || !m || !d) return civil
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Days elapsed since an ISO date string. Returns Infinity for null/invalid. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/**
 * Tag glyph for a task — left-of-title category cue per CD spec.
 * Used identically on Today landing and MyTasks page.
 */
export function tagForTask(
  t: TaskRow,
  projectsByPid: Map<string, { category?: string | null; slug: string }>,
): string | null {
  // A milestone renders its own ◆ glyph (TaskRow variant="milestone") — no
  // category tag (GH #131/#132).
  if (isMilestone(t)) return null
  if (t.source === 'pb') return '🧠'
  const proj = t.project_id ? projectsByPid.get(t.project_id) : null
  const cat  = proj?.category || ''
  const slug = proj?.slug || ''
  if (/cqode|clif-etl|etl/i.test(slug) || /CQODE|ETL/.test(t.title)) return '🔧'
  if (cat === 'clif') return '🔬'
  if (cat === 'mentee') return '🎓'
  if (cat === 'nate') return '🫁'
  if (/grant|R01|R03|K23|aim/i.test(t.title)) return '💰'
  if (/manuscript|paper|draft|revise/i.test(t.title)) return '📄'
  if (/meeting|agenda|review/i.test(t.title)) return '📅'
  return '📝'
}

// ──────────────────────────────────────────────────────────────────────────
// Two-date milestone rendering (Nick 2026-09-17, GH #131/#132 follow-on)
// ──────────────────────────────────────────────────────────────────────────
//
// A milestone can carry a second date: `due_date` is the INTERNAL date (our
// own target), `deadline` is the HARD date (sponsor/journal). Storage is
// settled — no schema work here. `role` names which of a milestone's 1-2
// rule-entries a given rendered row represents:
//   - 'hard'     — the single date (no separate hard date, or hard ==
//                  internal): renders exactly as the pre-2026-09-17 row.
//   - 'internal' — the internal date, while it's still ahead of today. The
//                  hard date stays hidden on the row (visible in the drawer)
//                  — Nick's explicit call: don't show the hard date while
//                  there's still runway to hit the internal one.
//   - 'slipped'  — the internal date, once it's in the past. Paired with a
//                  'hard' entry for the same milestone so the miss surfaces
//                  instead of quietly dropping the internal marker.
export type MilestoneRole = 'internal' | 'slipped' | 'hard'

/**
 * A TaskRow once it has passed through interleaveMilestones — the two extra
 * fields the interleaver stamps onto each rule-entry it emits. Every other
 * consumer of TaskRow ignores them (both optional); this alias exists so a
 * caller that DOES read `.milestoneRole`/`.milestoneDate` (TaskGroup, the
 * Today TaskRow adapter) has a name for the shape instead of casting inline.
 */
export type MilestoneEntry = TaskRow & { milestoneRole?: MilestoneRole; milestoneDate?: string | null }

/**
 * Decide how many rows a milestone renders as, and which date each carries.
 * Pure — no `today` global reference, so it's deterministic in tests. Dates
 * in, dates out are civil (YYYY-MM-DD); comparison is string comparison,
 * which is safe for civil dates.
 */
export function milestoneRules<T extends { due_date?: string | null; deadline?: string | null }>(
  t: T,
  todayKeyStr: string,
): Array<{ role: MilestoneRole; date: string | null }> {
  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
  const due = civil(t.due_date)
  const hard = civil(t.deadline)

  if (!hard || hard === due) return [{ role: 'hard', date: due }]
  // Hard date only (no internal): one hard rule, never an undated internal one.
  if (due === null) return [{ role: 'hard', date: hard }]
  if (due >= todayKeyStr) return [{ role: 'internal', date: due }]
  return [
    { role: 'slipped', date: due },
    { role: 'hard', date: hard },
  ]
}

// Captured before interleaveMilestones declares its own `todayKey` parameter
// (same name, different scope) — the parameter would otherwise shadow this
// module's `todayKey()` function inside its own default-value expression.
const defaultTodayKey = todayKey

/**
 * Interleave milestones into an active-bucket task list by due date, WITHOUT
 * re-sorting the tasks themselves (CLAUDE.md Rule 62 — never re-sort a group
 * by date; a milestone earns its position by stable insertion, not by making
 * the whole bucket date-ordered). GH #131/#132.
 *
 * Every non-milestone item keeps its existing relative order. Each milestone
 * expands into 1-2 rule-entries (milestoneRules, above), each positioned by
 * ITS OWN date — a slipped milestone's internal-date row and hard-date row
 * can land on either side of the tasks between them. A rule-entry with no
 * date goes to the very end of the list; a task with no due_date counts as
 * later than every dated entry (so a dated entry always lands before it).
 */
export function interleaveMilestones<
  T extends {
    kind?: string | null
    due_date?: string | null
    deadline?: string | null
    milestoneRole?: MilestoneRole
    milestoneDate?: string | null
  },
>(active: T[], todayKey: string = defaultTodayKey()): T[] {
  const milestonesRaw = active.filter((t) => isMilestone(t))
  const rest = active.filter((t) => !isMilestone(t))
  if (milestonesRaw.length === 0) return rest

  const civil = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)

  const entries: T[] = milestonesRaw.flatMap((t) =>
    milestoneRules(t, todayKey).map(
      (rule) => ({ ...t, milestoneRole: rule.role, milestoneDate: rule.date }) as T,
    ),
  )

  const sortedEntries = [...entries].sort((a, b) => {
    const ad = civil(a.milestoneDate)
    const bd = civil(b.milestoneDate)
    if (ad === bd) return 0
    if (ad === null) return 1   // no-date entry sorts last
    if (bd === null) return -1
    return ad < bd ? -1 : 1
  })

  const result: T[] = []
  let mi = 0
  for (const task of rest) {
    const taskDue = civil(task.due_date)
    while (mi < sortedEntries.length) {
      const mDue = civil(sortedEntries[mi].milestoneDate)
      if (mDue === null) break // no-date entries wait for the final flush
      if (taskDue === null || mDue < taskDue) {
        result.push(sortedEntries[mi])
        mi++
      } else {
        break
      }
    }
    result.push(task)
  }
  while (mi < sortedEntries.length) {
    result.push(sortedEntries[mi])
    mi++
  }
  return result
}
