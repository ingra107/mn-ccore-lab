/**
 * TanStack Query hooks for D1 API data.
 *
 * Each hook tries the live API first. If the API is unavailable
 * (local dev without wrangler, network error), it falls back
 * to the static TypeScript data files. This means:
 *   - Production: always live D1 data
 *   - Local dev: static data unless wrangler dev is proxied
 *
 * The `select` option transforms D1 row types (snake_case, JSON strings)
 * into frontend types (camelCase, parsed arrays) so components don't change.
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchPublications,
  fetchTeam,
  fetchProjects,
  fetchGrants,
  fetchStats,
  fetchCitations,
  fetchTasks,
  fetchIdeas,
  fetchCalendarEvents,
  fetchDependencies,
  fetchProjectDependencies,
  fetchExpertise,
  fetchQuestions,
  fetchQuestionDetail,
  fetchRevisions,
  fetchRevisionComments,
  fetchActiveRevisions,
  fetchManuscriptsAttention,
  fetchMenteeMilestones,
  fetchMenteeOverview,
  fetchDeadlineImpact,
  fetchAllCascades,
  fetchSubmissionEvents,
  fetchActiveSubmissions,
  fetchExpiringRegulatory,
  fetchUpcomingGrantMilestones,
  fetchConferences,
  fetchUpcomingConferences,
  fetchPBSessions,
  fetchPBSessionStats,
} from '../lib/api'
import type {
  PublicationRow,
  TeamMemberRow,
  ProjectRow,
  GrantRow,
  TaskRow,
  IdeaRow,
  CalendarEvent,
  DependencyRow,
  ExpertiseTag,
  QuestionRow,
  QuestionDetail,
  RevisionRow,
  ReviewerCommentRow,
  MenteeMilestoneRow,
  MenteeOverviewRow,
  CascadeGraph,
  ImpactResult,
  PBSessionRow,
} from '../lib/api'
import { localDateKey } from '../lib/dateUtils'
import { normalizeStage } from '../lib/stageNormalize'

// Re-export lib/api row types that consumers import via this module.
// Narrow surface: only the types actually consumed by components. Other
// lib/api types are imported directly from lib/api where needed.
export type { DependencyRow, ExpertiseTag, MenteeMilestoneRow, PBSessionRow, RevisionRow, ReviewerCommentRow }

import type { Publication, TeamMember, Project, Grant } from '../data/types'

// Static data fallbacks — dev only.
// import.meta.env.DEV is replaced with a boolean constant at build time, so Vite/Rolldown
// dead-code-eliminates the false branch and tree-shakes these modules out of the production
// bundle entirely (publications ~43 KB, projects ~9 KB, team ~7 KB, grants ~1 KB = ~60 KB saved).
import { publications as _devPublications } from '../data/publications'
import { getAllMembers as _devGetAllMembers } from '../data/team'
import { projects as _devProjects } from '../data/projects'
import { grants as _devGrants } from '../data/grants'

// ── Transform D1 rows → frontend types ──────────────────────

function rowToPublication(row: PublicationRow): Publication {
  return {
    id: row.id,
    authors: row.authors,
    title: row.title,
    journal: row.journal || '',
    year: row.year,
    status: row.status as Publication['status'],
    doi: row.doi || undefined,
    pubmed: row.pubmed || undefined,
    abstract: row.abstract || undefined,
    topics: row.topics ? JSON.parse(row.topics) : [],
    featured: row.featured === 1,
    authorSlugs: row.author_slugs ? JSON.parse(row.author_slugs) : undefined,
  }
}

function rowToTeamMember(row: TeamMemberRow): TeamMember {
  return {
    name: row.name,
    initials: row.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase(),
    role: row.role || '',
    credentials: row.credentials || undefined,
    slug: row.slug || undefined,
    photoUrl: row.photo_url || undefined,
    bio: row.bio || undefined,
    scholarId: row.scholar_id || undefined,
    authorName: row.author_name || undefined,
    autoCreated: row.auto_created === 1,
  }
}

export function rowToProject(row: ProjectRow): Project {
  return {
    // Spread FIRST (Level-1 fix, 2026-07-21): any ProjectRow field that
    // shares its name+shape with `Project` (id, title, created_at,
    // key_link_1..3(+_desc), ...) flows through automatically — a future
    // passthrough column added to ProjectRow can never again be silently
    // dropped here the way short_name/pi_context/created_at were (declared
    // on ProjectRow, never copied) and key_link_1..3 were (not even
    // declared). Only fields needing a real transform (rename, null-coalesce,
    // enum normalize/cast) get an explicit override below — object-literal
    // semantics mean a later key always wins over the spread, at both the
    // type level and the runtime value.
    ...row,
    status: row.status as Project['status'],
    description: row.description || undefined,
    category: row.category || '',
    pi: row.pi || '',
    slug: row.slug || '',
    // Ingress chokepoint (Hub #361a): fold legacy Title-Case / granular API
    // sub-stages ("Idea", "data_analysis", "submitted") onto the UI's 7-stage
    // canonical ladder ONCE here, so every downstream component reads an
    // already-canonical value and never needs to call normalizeStage() itself.
    // Falls back to the raw value if unrecognized (same as stageLabel/stageColor).
    stage: (normalizeStage(row.stage) || row.stage) as Project['stage'],
    strategic_context: row.strategic_context || undefined,
    updated_at: row.updated_at || undefined,
    stage_entered_at: row.stage_entered_at || undefined,
    // short_name / pi_context are declared `string | null` on ProjectRow but
    // `string | undefined` (no null) on Project — need the coalesce even
    // though they're pure passthroughs otherwise.
    short_name: row.short_name || undefined,
    pi_context: row.pi_context || undefined,
    // INFRA-8 / P2-9: re-surface pipeline-movement metadata that rowToProject
    // previously dropped, so the unified staleness basis can read
    // days-since-meaningful-movement instead of falling back to updated_at.
    last_meaningful_movement: row.last_meaningful_movement || undefined,
    stale_active_since: row.stale_active_since || undefined,
    // #95: the API's derived `last_activity` rollup → the camelCase field 8 UI
    // sites already read (Projects sort + "Xd ago" chip, ProjectDetail, Today
    // relevance). It had NO producer before, so every one of them saw undefined.
    lastActivity: row.last_activity || undefined,
    // Local working-folder path — drives the mnccore:// "Open folder" /
    // "Work on this in Claude" affordances (ProjectDetail + TaskDetailPanel).
    primary_folder: row.primary_folder || undefined,
  }
}

function rowToGrant(row: GrantRow): Grant {
  return {
    mechanism: row.mechanism || '',
    title: row.title,
    agency: row.agency || '',
    pi: row.pi || '',
    proposed: row.proposed === 1,
    status: row.proposed ? 'Pending' : 'Active',
    end_date: row.end_date || undefined,
  }
}

// ── Query hooks ─────────────────────────────────────────────
//
// initialData: provides static data synchronously on first render (no flash).
// queryFn: fetches from D1 API. In production, succeeds and updates.
//          In dev, fails silently and initialData persists.
// This gives instant rendering in dev AND live D1 data in production.

const STALE_TIME = 5 * 60 * 1000 // 5 minutes

// ── Fetch primitive ─────────────────────────────────────────
//
// #507: ~40 hooks below used to `if (!res.ok) return []` (or null/{}), which
// renders identically to "genuinely no data" — a real backend failure
// produced zero signal. That exact class masked the 2026-07-06 calendar
// outage for a month in ONE hook (fixed loud in #495/31f75259). fetchJson
// throws by default so react-query surfaces `isError` instead of a swallow.
//
// Scoped to the ad hoc `fetch()` call sites in this file whose endpoints
// return heterogeneous raw shapes (`{data}`, `{events}`, `{items,count}`,
// bare arrays/objects) that callers destructure themselves. Endpoints going
// through the typed row-fetchers in lib/api.ts (fetchTasks, fetchProjects,
// etc.) already throw via `fetchApi`'s `ApiError` — no change needed there.
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  // init is only forwarded when the caller passes one — matches the exact
  // single-arg `fetch(url)` call shape every converted site used before,
  // so mocked-fetch call-arg assertions in existing tests keep matching.
  const res = init ? await fetch(url, init) : await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`)
  return res.json() as Promise<T>
}

export function usePublications(params?: {
  year?: number
  status?: string
  topic?: string
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['publications', params],
    queryFn: async () => {
      const res = await fetchPublications(params)
      return res.data.map(rowToPublication)
    },
    initialData: (import.meta.env.DEV && !params) ? () => _devPublications : undefined,
    staleTime: STALE_TIME,
    retry: false,
    enabled: options?.enabled ?? true,
  })
}

export function useTeam(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const res = await fetchTeam()
      return res.data.map(rowToTeamMember)
    },
    initialData: import.meta.env.DEV ? () => _devGetAllMembers() : undefined,
    staleTime: STALE_TIME,
    retry: false,
    enabled: options?.enabled ?? true,
  })
}

export function useProjects(params?: { status?: string; category?: string }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const res = await fetchProjects(params)
      return res.data.map(rowToProject)
    },
    initialData: (import.meta.env.DEV && !params) ? () => _devProjects : undefined,
    staleTime: STALE_TIME,
    retry: false,
    enabled: options?.enabled ?? true,
  })
}

export function useGrants() {
  return useQuery({
    queryKey: ['grants'],
    queryFn: async () => {
      const res = await fetchGrants()
      return res.data.map(rowToGrant)
    },
    initialData: import.meta.env.DEV ? () => _devGrants : undefined,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetchStats()
      return res.data
    },
    staleTime: STALE_TIME,
  })
}

// Lab-wide Google Scholar citations aggregate.
// Wired by Lab Overview StatsCard (LO-1). Backed by the per-author cache on
// team_members (citation_count + h_index + last_scholar_refresh) which a
// PB-side weekly cron refreshes via PUT /api/team/:slug. See
// scripts/citations-scholar-stub.md for the cron design.
//
// staleTime is 1h to match the server-side Cache-Control: max-age=3600 on
// /api/citations. refetchOnWindowFocus stays default (true) so users who
// idle on the page still get a fresh number when they come back.
export function useCitations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['citations'],
    queryFn: async () => {
      const res = await fetchCitations()
      return res.data
    },
    staleTime: 60 * 60 * 1000, // 1 hour — matches server edge-cache TTL.
    retry: false,
    enabled: options?.enabled ?? true,
  })
}

// ── Comments ────────────────────────────────────────────────

export interface Comment {
  id: string
  content: string
  author_name: string | null
  author_slug: string | null
  created_at: string
}

export function useComments(projectId: string) {
  return useQuery({
    queryKey: ['comments', projectId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: Comment[] }>(`/api/projects/${projectId}/comments`)
      return data.data || []
    },
    staleTime: 60 * 1000, // 1 minute for comments
    enabled: !!projectId,
  })
}

// ── Activity Feed ───────────────────────────────────────────

interface ActivityEntry {
  id: string
  type: string
  description: string
  actor: string | null
  related_id: string | null
  related_type: string | null
  timestamp: string
}

export function useActivity(limit: number = 20, actor?: string) {
  return useQuery({
    queryKey: ['activity', limit, actor],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (actor) params.set('actor', actor)
      const data = await fetchJson<{ data?: ActivityEntry[] }>(`/api/activity?${params}`)
      return data.data || []
    },
    staleTime: 60 * 1000,
  })
}

// ── Meetings & Team Portal ──────────────────────────────────

export interface MeetingRow {
  id: string
  date: string
  title: string
  type: string
  attendees: string | null
  agenda: string | null
  notes: string | null
  decisions: string | null
  // schema-v72: JSON array of the projects/topics this meeting discussed
  // (the PB push sends every discussed-project slug; null on legacy rows).
  tags: string | null
  status: string
  created_at: string
  updated_at: string
  /** v95: PB's calendar-match id, when this meeting was matched from a PB
   *  push. tasks.meeting_id may carry either this id space or `id` — the
   *  join in handleGetMeeting matches `IN (id, source_id)`; any client-side
   *  aggregation across meeting_id (T8 list-row counts) must do the same. */
  source_id?: string | null
}

export interface AgendaItemRow {
  id: string
  meeting_id: string
  content: string
  added_by: string
  project_id: string | null
  type: string
  document_url: string | null
  sort_order: number
  created_at: string
}

export interface ProjectUpdateRow {
  id: string
  project_id: string
  author: string
  content: string
  update_type: string
  created_at: string
}

export interface TaskUpdateRow {
  id: string
  task_id: string
  author_slug: string
  content: string
  update_type: string
  created_at: string
}

export interface MeetingDetail extends MeetingRow {
  // T3/T7: action_items is real task rows (TASK_SELECT_COLS-shaped) —
  // `tasks WHERE meeting_id IN (id, source_id)`. The legacy action_items
  // table + its /api/action-items routes/hooks were retired in T19 (#547).
  action_items: TaskRow[]
  agenda_items: AgendaItemRow[]
}

// Static meeting data for dev fallback
import { meetings as staticMeetings } from '../data/meetings'

function staticToMeetingRows(): MeetingRow[] {
  return staticMeetings.map((m) => ({
    id: m.id,
    date: m.date,
    title: m.title,
    type: m.type,
    attendees: JSON.stringify(m.attendees || []),
    agenda: JSON.stringify(m.agenda || []),
    notes: m.notes || null,
    decisions: JSON.stringify(m.decisions || []),
    tags: null,
    status: m.date >= localDateKey() ? 'upcoming' : 'completed',
    created_at: m.date,
    updated_at: m.date,
  }))
}

export function useMeetingsApi(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await fetch('/api/meetings')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      return data.data as MeetingRow[]
    },
    // #506: this used to seed initialData unconditionally, including in
    // production -- unlike every sibling hook's static fallback (see
    // usePublications/useTeam/useProjects/useGrants above, DEV-gated in
    // 315f9197 for bundle size + prod-data-integrity), so a prod page
    // reading ['meetings'] before the real fetch resolved briefly saw the
    // 6-row demo dataset as ground truth. Same rationale applies here.
    initialData: import.meta.env.DEV ? () => staticToMeetingRows() : undefined,
    staleTime: STALE_TIME,
    retry: false,
    enabled: options?.enabled ?? true,
  })
}

// ── Next Meeting (lightweight) ───────────────────────────────

export function useNextMeeting() {
  return useQuery({
    queryKey: ['meetings', 'next'],
    queryFn: async () => {
      const res = await fetch('/api/meetings/next')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json() as { data: { id: string; title: string; date: string } | null }
      return data.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}

// ── Meeting Cadence ──────────────────────────────────────────

interface CadenceData {
  nextMeeting?: { id: string; date: string; title: string }
  score: number
  recommendation: string
  emoji: string
  reasons: string[]
  metrics: { activity: number; pending: number; updates: number; agenda: number; blocked: number }
}

export function useMeetingCadence() {
  return useQuery({
    queryKey: ['meeting-cadence'],
    queryFn: async () => {
      const res = await fetch('/api/meetings/cadence-check')
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      return json.data as CadenceData
    },
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useMeetingDetail(id: string) {
  // Build dev fallback from static data — as factory to avoid re-computation
  function buildFallback(): MeetingDetail | undefined {
    const staticMeeting = staticMeetings.find((m) => m.id === id)
    if (!staticMeeting) return undefined
    return {
      id: staticMeeting.id,
      date: staticMeeting.date,
      title: staticMeeting.title,
      type: staticMeeting.type,
      attendees: JSON.stringify(staticMeeting.attendees || []),
      agenda: JSON.stringify(staticMeeting.agenda || []),
      notes: staticMeeting.notes || null,
      decisions: JSON.stringify(staticMeeting.decisions || []),
      tags: null,
      status: 'completed',
      created_at: staticMeeting.date,
      updated_at: staticMeeting.date,
      // T7: action_items is real task rows now (TaskRow-shaped) — fill the
      // required TaskRow fields with dev-fallback defaults; this static path
      // only feeds local dev without a live API.
      action_items: (staticMeeting.actionItems || []).map((a, i): TaskRow => ({
        id: `static-ai-${i}`,
        meeting_id: staticMeeting.id,
        project_id: a.projectSlug || null,
        title: a.description,
        description: a.description,
        assignee: a.assignee,
        assigned_by: null,
        due_date: a.dueDate || null,
        priority: 'medium',
        status: a.completed ? 'done' : 'todo',
        source: 'meeting',
        completed: a.completed ? 1 : 0,
        completed_at: null,
        completed_by: null,
        blocked_by: null,
        acknowledged_at: null,
        acknowledged_by: null,
        watchers: null,
        reminder_days: null,
        instructions: null,
        recurrence: null,
        recurrence_parent_id: null,
        description_json: null,
        key_link_1: null,
        key_link_1_desc: null,
        key_link_2: null,
        key_link_2_desc: null,
        key_link_3: null,
        key_link_3_desc: null,
        created_at: staticMeeting.date,
      })),
      agenda_items: [],
    }
  }

  return useQuery({
    queryKey: ['meeting', id],
    queryFn: async () => {
      const res = await fetch(`/api/meetings/${id}`)
      if (!res.ok) throw new Error('Not found')
      const data = await res.json()
      return data.data as MeetingDetail
    },
    // #506 (same class): buildFallback's own comment already says "dev
    // fallback," but nothing enforced it -- only DEV-gate it here. Lower
    // practical severity than useMeetingsApi above (buildFallback returns
    // undefined -- i.e. no-op -- unless a real meeting id happens to
    // collide with one of the 6 static demo ids), but still wrong in kind.
    initialData: import.meta.env.DEV ? buildFallback : undefined,
    staleTime: 60 * 1000,
    enabled: !!id,
    retry: false,
  })
}

// T19 (#547): meeting-linked tasks (tasks.meeting_id) — the replacement for
// the retired /api/action-items table + useActionItems/useToggleActionItem/
// useCreateActionItem hooks (see T9's meetingRowToMeeting comment in
// Meetings.tsx for the same rationale).
// Deliberately fetchTasks() directly, NOT useTasks() — useTasks() runs
// dedupTasks(), which collapses same title+assignee tasks GLOBALLY, including
// across meeting and non-meeting tasks. Filtering to meeting_id BEFORE any
// dedup (callers do their own, scoped dedup if they need one) avoids a
// meeting-linked item losing to an unrelated same-title task for the same
// cache slot. No-filter calls share ONE cache entry (['tasks',
// 'all-for-meeting-counts']) with Meetings.tsx's per-meeting count/list joins.
export function useMeetingLinkedTasks(filters?: { assignee?: string; project?: string }) {
  return useQuery({
    queryKey: ['tasks', 'all-for-meeting-counts', filters],
    queryFn: async () => {
      const rows = (await fetchTasks(filters)).data as TaskRow[]
      return rows.filter((t) => t.meeting_id)
    },
    staleTime: 60 * 1000,
  })
}

// ── Tasks (unified task system) ──────────────────────────────

// Dedup carried-forward items: normalize "[Carried forward]" prefix, keep most recent per description+assignee
function dedupTasks(tasks: TaskRow[]): TaskRow[] {
  const seen = new Map<string, TaskRow>()
  for (const task of tasks) {
    const normalized = (task.title || task.description).replace(/^\[Carried forward\]\s*/i, '').toLowerCase()
    const key = `${normalized}::${task.assignee}`
    const existing = seen.get(key)
    if (!existing || task.created_at > existing.created_at) {
      seen.set(key, task)
    }
  }
  return [...seen.values()]
}

export function useTasks(filters?: {
  assignee?: string
  status?: string
  priority?: string
  project?: string
  meeting?: string
  source?: string
  completed?: string
}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const res = await fetchTasks(filters)
      return dedupTasks(res.data as TaskRow[])
    },
    staleTime: 60 * 1000,
    enabled: options?.enabled ?? true,
  })
}

// ── Research Digest ──────────────────────────────────────────

export interface DigestPaper {
  id: string
  title: string
  authors: string | null
  journal: string | null
  pub_date: string | null
  abstract: string | null
  pmid: string | null
  doi: string | null
  relevance_score: number
  relevance_reason: string | null
  topics: string | null // JSON array
  status: string
  digest_date: string | null
  relevant_members?: string[] // slugs matched via expertise_tags
}

export function useDigest(params?: { date?: string; status?: string; topic?: string; limit?: number; with_relevance?: boolean }) {
  return useQuery({
    queryKey: ['digest', params],
    queryFn: async () => {
      const qs = new URLSearchParams()
      if (params?.date) qs.set('date', params.date)
      if (params?.status) qs.set('status', params.status)
      if (params?.topic) qs.set('topic', params.topic)
      if (params?.limit) qs.set('limit', String(params.limit))
      if (params?.with_relevance) qs.set('with_relevance', 'true')
      const data = await fetchJson<{ data?: DigestPaper[] }>(`/api/digest?${qs}`)
      return data.data || []
    },
    staleTime: STALE_TIME,
  })
}

export function useDigestDates() {
  return useQuery({
    queryKey: ['digest-dates'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: { date: string; count: number }[] }>('/api/digest/dates')
      return data.data || []
    },
    staleTime: STALE_TIME,
  })
}

export interface DigestComment {
  id: string
  paper_id: string
  author_slug: string
  content: string
  created_at: string
}

export function useDigestComments(paperId: string | null) {
  return useQuery({
    queryKey: ['digest-comments', paperId],
    queryFn: async () => {
      if (!paperId) return []
      const data = await fetchJson<{ data?: DigestComment[] }>(`/api/digest/${paperId}/comments`)
      return data.data || []
    },
    enabled: !!paperId,
    staleTime: STALE_TIME,
  })
}

export function useDigestCommentCounts(date?: string) {
  return useQuery({
    queryKey: ['digest-comment-counts', date],
    queryFn: async () => {
      const qs = date ? `?date=${date}` : ''
      const data = await fetchJson<{ data?: Record<string, number> }>(`/api/digest/comment-counts${qs}`)
      return data.data || {}
    },
    staleTime: STALE_TIME,
  })
}

// ── Project Health ───────────────────────────────────────────

export interface HealthFactors {
  activity: number
  velocity: number
  overdue: number
  milestones: number
}

export interface ProjectHealth {
  slug: string
  title: string
  stage: string
  score: number
  status: 'Healthy' | 'Needs Attention' | 'At Risk' | 'Critical'
  factors: HealthFactors
  last_activity: string | null
  overdue_count: number
  days_since_update: number | null
  pending_actions: number
}

interface HealthSummary {
  total: number
  healthy: number
  needs_attention: number
  at_risk: number
  critical: number
  avg_score: number
}

export function useProjectHealth() {
  return useQuery({
    queryKey: ['project-health'],
    queryFn: async () => {
      return await fetchJson<{ data: ProjectHealth[], summary: HealthSummary }>('/api/projects/health')
    },
    staleTime: STALE_TIME,
  })
}

// ── Ideas ────────────────────────────────────────────────────

export function useIdeas(filters?: { status?: string; submitted_by?: string }) {
  return useQuery({
    queryKey: ['ideas', filters],
    queryFn: async () => {
      const res = await fetchIdeas(filters)
      return res.data as IdeaRow[]
    },
    staleTime: 60 * 1000,
  })
}

// ── Calendar Events ──────────────────────────────────────────

export function useCalendarEvents(params?: { start?: string; end?: string }) {
  return useQuery({
    queryKey: ['calendar-events', params],
    queryFn: async () => {
      const res = await fetchCalendarEvents(params)
      return res.data as CalendarEvent[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Subtasks ────────────────────────────────────────────────

export interface SubtaskRow {
  id: string
  task_id: string
  title: string
  completed: number
  completed_at: string | null
  completed_by: string | null
  sort_order: number
  created_at: string
}

export function useSubtasks(taskId: string) {
  return useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: SubtaskRow[] }>(`/api/tasks/${taskId}/subtasks`)
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Task detail (drawer fan-out) ─────────────────────────────
// Backed by GET /api/tasks/:id/detail. Single round-trip for the
// TodayPage / UnifiedMyTasks task drawer (why / updates / subtasks /
// blocks). See api/routes/tasks.ts:handleGetTaskDetail.

export interface TaskDetailUpdate { id: string; when: string; who: string; text: string; kind: 'note' | 'event' }
export interface TaskDetailSubtask { id: string; title: string; completed: number }
export interface TaskDetailBlock { id: string; title: string }
export interface TaskDetailPayload {
  updates: TaskDetailUpdate[]
  subtasks: TaskDetailSubtask[]
  blocks: TaskDetailBlock[]
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: async (): Promise<TaskDetailPayload> => {
      if (!taskId) return { updates: [], subtasks: [], blocks: [] }
      const data = await fetchJson<{ data: TaskDetailPayload }>(`/api/tasks/${taskId}/detail`)
      return data.data
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Task Handoffs ──────────────────────────────────────────

interface HandoffRow {
  id: string
  task_id: string
  from_slug: string
  to_slug: string
  situation: string
  background: string | null
  assessment: string | null
  recommendation: string | null
  acknowledged: number
  acknowledged_at: string | null
  created_at: string
}

export function useHandoffs(taskId: string) {
  return useQuery({
    queryKey: ['handoffs', taskId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: HandoffRow[] }>(`/api/tasks/${taskId}/handoffs`)
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Paper-Project Links ────────────────────────────────────

interface PaperProjectLink {
  id: string
  paper_id: string
  project_slug: string
  linked_by: string | null
  note: string | null
  created_at: string
  title?: string
  journal?: string
  pub_date?: string
  doi?: string
  authors?: string
  relevance_score?: number
}

export function useProjectPapers(slug: string) {
  return useQuery({
    queryKey: ['project-papers', slug],
    queryFn: async () => {
      const data = await fetchJson<{ data?: PaperProjectLink[] }>(`/api/projects/${slug}/papers`)
      return data.data || []
    },
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

// ── Reactions ──────────────────────────────────────────────

export interface Reaction {
  id: string
  target_type: string
  target_id: string
  emoji: string
  user_slug: string
  created_at: string
}

export function useReactions(targetType: string, targetId: string) {
  return useQuery({
    queryKey: ['reactions', targetType, targetId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: Reaction[] }>(`/api/reactions?target_type=${targetType}&target_id=${targetId}`)
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!targetId,
  })
}

// ── Project Updates ─────────────────────────────────────────

export function useProjectUpdates(slug: string) {
  return useQuery({
    queryKey: ['project-updates', slug],
    queryFn: async () => {
      const data = await fetchJson<{ data?: ProjectUpdateRow[] }>(`/api/projects/${slug}/updates`)
      return data.data ?? []
    },
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

// ── Project Documents ───────────────────────────────────────

export interface ProjectDocumentRow {
  id: string
  project_id: string
  title: string
  url: string
  doc_type: 'folder' | 'draft' | 'data' | 'protocol' | 'submission' | 'link'
  created_at: string
  created_by: string | null
}

export function useProjectDocuments(slug: string) {
  return useQuery({
    queryKey: ['project-documents', slug],
    queryFn: async () => {
      const data = await fetchJson<{ data?: ProjectDocumentRow[] }>(`/api/projects/${slug}/documents`)
      return data.data ?? []
    },
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

export function useTaskUpdates(taskId: string) {
  return useQuery({
    queryKey: ['task-updates', taskId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: TaskUpdateRow[] }>(`/api/tasks/${taskId}/updates`)
      return data.data ?? []
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Team Pulse ──────────────────────────────────────────────

interface TeamPulseData {
  activity: { slug: string; updates: number; completions: number }[]
  active_this_week: number
  totals: { updates: number; completions: number }
}

export function useTeamPulse(hours: number = 48) {
  return useQuery({
    queryKey: ['team-pulse', hours],
    queryFn: async () => {
      const data = await fetchJson<{ data: TeamPulseData }>(`/api/team/pulse?hours=${hours}`)
      return data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Decisions ──────────────────────────────────────────────

export interface DecisionRow {
  id: string
  title: string
  rationale: string | null
  context: string | null
  project_slug: string | null
  meeting_id: string | null
  decided_by: string | null
  outcome: string | null
  outcome_date: string | null
  outcome_status: string
  outcome_sentiment: string | null
  tags: string | null
  linked_projects: string | null
  created_at: string
  // Added by similar-by-id endpoint
  relevance_score?: number
  shared_tags?: string[]
}

interface DecisionTagCount {
  tag: string
  count: number
}

export function useDecisions(projectSlug?: string, tag?: string) {
  return useQuery({
    queryKey: ['decisions', projectSlug || 'all', tag || ''],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (projectSlug) params.set('project_slug', projectSlug)
      if (tag) params.set('tag', tag)
      const qs = params.toString()
      const url = `/api/decisions${qs ? `?${qs}` : ''}`
      const data = await fetchJson<{ data?: DecisionRow[] }>(url)
      return data.data || []
    },
    staleTime: 60 * 1000,
  })
}

export function useDecisionsForReview() {
  return useQuery({
    queryKey: ['decisions', 'review'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: DecisionRow[] }>('/api/decisions/review')
      return data.data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSimilarDecisions(query: string) {
  return useQuery({
    queryKey: ['decisions', 'similar', query],
    queryFn: async () => {
      const data = await fetchJson<{ data?: DecisionRow[] }>(`/api/decisions/similar?q=${encodeURIComponent(query)}`)
      return data.data || []
    },
    staleTime: 30 * 1000,
    enabled: !!query && query.length >= 2,
  })
}

export function useSimilarDecisionsById(id: string) {
  return useQuery({
    queryKey: ['decisions', 'similar-by-id', id],
    queryFn: async () => {
      const data = await fetchJson<{ data?: DecisionRow[] }>(`/api/decisions/similar-by-id?id=${encodeURIComponent(id)}`)
      return data.data || []
    },
    staleTime: 60 * 1000,
    enabled: !!id,
  })
}

export function useDecisionTags() {
  return useQuery({
    queryKey: ['decisions', 'tags'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: DecisionTagCount[] }>('/api/decisions/tags')
      return data.data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Dependencies ───────────────────────────────────────────

export function useDependencies() {
  return useQuery({
    queryKey: ['dependencies'],
    queryFn: async () => {
      const res = await fetchDependencies()
      return res.data as DependencyRow[]
    },
    staleTime: STALE_TIME,
  })
}

export function useProjectDependencies(slug: string) {
  return useQuery({
    queryKey: ['dependencies', slug],
    queryFn: async () => {
      const res = await fetchProjectDependencies(slug)
      return res.data as DependencyRow[]
    },
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

// ── Trainee Trajectory ────────────────────────────────────

export interface TrajectoryData {
  publications: { id: string; title: string; journal: string; pub_date: string; doi: string }[]
  taskStats: { month: string; completed: number }[]
  projects: { id: string; title: string; slug: string; stage: string; status: string; category: string }[]
  milestones: { id: string; title: string; due_date: string; status: string; project_id: string; project_title: string }[]
  taskMetrics: { total: number; completed: number; overdue: number; avg_days: number | null }
  projectStages: { id: string; title: string; slug: string; stage: string; status: string; days_in_stage: number; total_days: number }[]
}

export function useTrajectory(slug: string) {
  return useQuery({
    queryKey: ['trajectory', slug],
    queryFn: async () => {
      const data = await fetchJson<{ data: TrajectoryData }>(`/api/team/${slug}/trajectory`)
      return data.data
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  })
}

// ── Contribution Portfolio ────────────────────────────────

export interface ContributionSummary {
  tasks_completed: number
  updates_posted: number
  comments_made: number
  decisions_made: number
  meetings_contributed: number
  publications: number
}

export interface ContributionTask {
  id: string
  title: string
  description: string | null
  project_id: string | null
  completed_at: string
  priority: string | null
}

export interface ContributionUpdate {
  id: string
  project_id: string
  content: string
  update_type: string | null
  created_at: string
}

export interface ContributionComment {
  id: string
  content: string
  created_at: string
}

export interface ContributionDecision {
  id: string
  title: string
  rationale: string | null
  outcome_status: string | null
  created_at: string
}

export interface ContributionMeeting {
  id: string
  title: string
  date: string
}

export interface ContributionPublication {
  id: string
  title: string
  journal: string | null
  pub_date: string | null
}

export interface ContributionsData {
  tasks: ContributionTask[]
  updates: ContributionUpdate[]
  comments: ContributionComment[]
  decisions: ContributionDecision[]
  meetings: ContributionMeeting[]
  publications: ContributionPublication[]
  summary: ContributionSummary
}

export function useContributions(slug: string, period: number) {
  return useQuery({
    queryKey: ['contributions', slug, period],
    queryFn: async () => {
      const data = await fetchJson<{ data: ContributionsData }>(`/api/team/${slug}/contributions?period=${period}`)
      return data.data
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  })
}

// ── Contribution Score with Decay ────────────────────────

interface ContributionScoreData {
  slug: string
  days: number
  total_score: number
  trend: 'increasing' | 'stable' | 'declining'
  breakdown: Record<string, { count: number; raw_score: number; decay_score: number }>
  sparkline: number[]
  decay_constant: number
  half_life_days: number
}

export function useContributionScore(slug: string | undefined, days = 90) {
  return useQuery({
    queryKey: ['contribution-score', slug, days],
    queryFn: async () => {
      const data = await fetchJson<{ data: ContributionScoreData }>(`/api/analytics/contributions?slug=${slug}&days=${days}`)
      return data.data
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  })
}

// ── Grant Intelligence (NIH RePORTER) ──────────────────────

interface SimilarGrant {
  project_num: string
  title: string
  pi: string
  organization: string
  fiscal_year: number
  award_amount: number
  start_date: string
  end_date: string
  abstract: string
}

export function useSimilarGrants(keywords: string, ic?: string) {
  return useQuery({
    queryKey: ['similar-grants', keywords, ic],
    queryFn: async () => {
      const params = new URLSearchParams({ keywords })
      if (ic) params.set('ic', ic)
      return await fetchJson<{ data: SimilarGrant[]; total: number }>(`/api/grants/similar?${params}`)
    },
    staleTime: 30 * 60 * 1000,
    enabled: !!keywords && keywords.length > 2,
  })
}

// ── Expertise Tags ───────────────────────────────────────────

export function useExpertise(slug?: string) {
  return useQuery({
    queryKey: ['expertise', slug || 'all'],
    queryFn: async () => {
      const res = await fetchExpertise(slug ? { slug } : undefined)
      return res.data as ExpertiseTag[]
    },
    staleTime: STALE_TIME,
    enabled: slug !== undefined ? !!slug : true,
  })
}

// ── Questions (Ask the Lab) ──────────────────────────────────

export function useQuestions(filters?: { status?: string; project_slug?: string }) {
  return useQuery({
    queryKey: ['questions', filters],
    queryFn: async () => {
      const res = await fetchQuestions(filters)
      return res.data as QuestionRow[]
    },
    staleTime: 60 * 1000,
  })
}

export function useQuestionDetail(id: string) {
  return useQuery({
    queryKey: ['question', id],
    queryFn: async () => {
      const res = await fetchQuestionDetail(id)
      return res.data as QuestionDetail
    },
    staleTime: 30 * 1000,
    enabled: !!id,
  })
}

// ── Narratives ──────────────────────────────────────────────

interface NarrativeArc {
  id: string
  title: string
  category: string
  projectCount: number
  projects: { slug: string; title: string; stage: string; pi: string; description?: string }[]
  connectedCount: number
  sharedTopics: { topic: string; count: number }[]
  stageDistribution: { stage: string; count: number }[]
  // API emits `year` (publications.year); not a full pub_date. See api/routes/narratives.ts.
  relatedPubs: { id: string; title: string; year: number | null }[]
}

export function useNarratives() {
  return useQuery({
    queryKey: ['narratives'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: NarrativeArc[] }>('/api/narratives')
      const arcs = data.data || []
      // Ingress chokepoint (Hub #361a): /api/narratives is a separate data
      // shape from rowToProject (aggregated distribution + project stubs),
      // so it needs its own normalization pass. stageOrder on the API side
      // is a fixed 7-value set (idea/data_collection/data_analysis/writing/
      // submitted/revisions/published) — normalizeStage() maps each 1:1 onto
      // the UI ladder with no collisions, so a plain re-key (no re-aggregation)
      // is safe here.
      return arcs.map((arc) => ({
        ...arc,
        stageDistribution: arc.stageDistribution.map((s) => ({ ...s, stage: normalizeStage(s.stage) || s.stage })),
        projects: arc.projects.map((p) => ({ ...p, stage: normalizeStage(p.stage) || p.stage })),
      }))
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ── PB Sector (dispatch queue — Hermes lane) ───────────────

export function useDispatchPending() {
  return useQuery({
    queryKey: ['dispatch-pending'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: unknown[]; count?: number }>('/api/pb/dispatch/pending')
      return { items: data.data || [], count: data.count || 0 }
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

// ── TODAY.md ────────────────────────────────────────────────

export function useTodayMd() {
  return useQuery({
    queryKey: ['today-md'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: { content?: string } }>('/api/pb/today')
      return data.data?.content || ''
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

// ── Revision tracker ────────────────────────────────────────

export function useRevisions(projectId: string) {
  return useQuery({
    queryKey: ['revisions', projectId],
    queryFn: () => fetchRevisions(projectId).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  })
}

export function useRevisionComments(revisionId: string) {
  return useQuery({
    queryKey: ['revision-comments', revisionId],
    queryFn: () => fetchRevisionComments(revisionId).then((r) => r.data),
    enabled: !!revisionId,
    staleTime: 30 * 1000,
  })
}

export function useActiveRevisions() {
  return useQuery({
    queryKey: ['revisions-active'],
    queryFn: () => fetchActiveRevisions().then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

export function useManuscriptsAttention(params?: { reviewDays?: number; staleDays?: number }) {
  return useQuery({
    queryKey: ['manuscripts-attention', params?.reviewDays ?? 7, params?.staleDays ?? 30],
    queryFn: () => fetchManuscriptsAttention(params),
    staleTime: 60 * 1000,
  })
}

// ── Mentee Milestones ─────────────────────────────────────

export function useMenteeMilestones(params?: { mentee?: string; status?: string; type?: string }) {
  return useQuery({
    queryKey: ['mentee-milestones', params],
    queryFn: async () => {
      const res = await fetchMenteeMilestones(params)
      return (res.data || []) as MenteeMilestoneRow[]
    },
    staleTime: 60 * 1000,
  })
}

export function useMenteeOverview() {
  return useQuery({
    queryKey: ['mentee-milestones-overview'],
    queryFn: async () => {
      const res = await fetchMenteeOverview()
      return (res.data || []) as MenteeOverviewRow[]
    },
    staleTime: 60 * 1000,
  })
}

// ── Stored Links (B3 Task 8, 2026-06-21) ─────────────────────
// Read-only hooks for the stored links table, backed by:
//   GET /api/tasks/:id/links   → { links: StoredLink[], projectLinks: StoredLink[] }
//   GET /api/projects/:slug/links → { links: StoredLink[] }
// Both endpoints are authed (CF Access JWT, no PI/API-key required).
// Write path stays on the 3-slot key_link_* mutation until P3/P4.

export interface StoredLink {
  id: string
  role: string
  type: string
  canonical_url: string
  short_title: string | null
  sort_order: number
}

export interface TaskLinksPayload {
  links: StoredLink[]
  projectLinks: StoredLink[]
}

// Named module-scope queryFns so tests exercise the REAL fetch+parse path
// (not an inline mirror that can silently drift). Backlog #144, 2026-06-22.
export async function fetchTaskLinks(taskId: string | null): Promise<TaskLinksPayload> {
  if (!taskId) return { links: [], projectLinks: [] }
  return fetchJson<TaskLinksPayload>(`/api/tasks/${taskId}/links`)
}

export async function fetchProjectLinks(slug: string | null): Promise<StoredLink[]> {
  if (!slug) return []
  const data = await fetchJson<{ links: StoredLink[] }>(`/api/projects/${slug}/links`)
  return data.links ?? []
}

export function useTaskLinks(taskId: string | null) {
  return useQuery({
    queryKey: ['task-links', taskId],
    queryFn: () => fetchTaskLinks(taskId),
    staleTime: 60 * 1000,
    enabled: !!taskId,
  })
}

export function useProjectLinks(slug: string | null) {
  return useQuery({
    queryKey: ['project-links', slug],
    queryFn: () => fetchProjectLinks(slug),
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

// Bulk project links — one call covers all projects (no N+1).
// Endpoint: GET /api/projects/links → { projects: { "<proj_id>": StoredLink[] } }
// Returns a map keyed by project id (proj_* PK). Projects with no links are
// absent from the map (callers use `?? []`). staleTime matches per-project hook.
export function useAllProjectLinks() {
  return useQuery({
    queryKey: ['all-project-links'],
    queryFn: async (): Promise<Record<string, StoredLink[]>> => {
      const data = await fetchJson<{ projects: Record<string, StoredLink[]> }>('/api/projects/links')
      return data.projects ?? {}
    },
    staleTime: 60 * 1000,
  })
}

// ── Deadline Cascade ────────────────────────────────────────

export function useDeadlineImpact(id: string | null, type: string | null, newDate: string | null) {
  return useQuery({
    queryKey: ['deadline-impact', id, type, newDate],
    queryFn: async () => {
      const res = await fetchDeadlineImpact(id!, type!, newDate!)
      return res.data as ImpactResult[]
    },
    enabled: !!id && !!type && !!newDate,
    staleTime: 30 * 1000,
  })
}

export function useAllCascades() {
  return useQuery({
    queryKey: ['deadline-cascade-all'],
    queryFn: async () => {
      const res = await fetchAllCascades()
      return res.data as CascadeGraph
    },
    staleTime: 60 * 1000,
  })
}

// ── Submission lifecycle ────────────────────────────────────

export function useSubmissionEvents(projectId: string) {
  return useQuery({
    queryKey: ['submission-events', projectId],
    queryFn: () => fetchSubmissionEvents(projectId).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  })
}

// M-12: lab-wide active submissions list. Drives the Manuscripts page
// "Active submissions" widget — one row per project whose latest event
// is not accepted/rejected/withdrawn.
export function useActiveSubmissions() {
  return useQuery({
    queryKey: ['submissions-active'],
    queryFn: () => fetchActiveSubmissions().then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

// ── Regulatory & Compliance ────────────────────────────────

export function useExpiringRegulatory(days: number = 60) {
  return useQuery({
    queryKey: ['regulatory-expiring', days],
    queryFn: () => fetchExpiringRegulatory(days).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
}

// ── Grant Post-Award Milestones ───────────────────────────────

export function useUpcomingGrantMilestones(days: number = 90) {
  return useQuery({
    queryKey: ['grant-milestones-upcoming', days],
    queryFn: () => fetchUpcomingGrantMilestones(days).then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

// ── Personal calendar feed (issue #45) ────────────────────────────────
// Reads the current user's iCal feed events (today + next 7 days). Hub
// poller refreshes feeds lazily on the same endpoint when last_polled_at
// is >15min stale; first-load latency on cold cache is ~500ms-1s.

export interface UserCalendarEvent {
  id: string
  title: string
  location: string | null
  startAt: string
  endAt: string | null
  isAllDay: boolean
}

export function useUserCalendarEvents() {
  return useQuery({
    queryKey: ['user-calendar-events'],
    queryFn: async (): Promise<UserCalendarEvent[]> => {
      const res = await fetch('/api/integrations/calendar/events')
      // #495: this used to swallow failures as `return []`, which renders
      // identically to "no events today" — a real backend outage produced
      // zero signal (masked the 2026-07-06 calendar outage post-mortem).
      // Throw so react-query surfaces isError and TodayPage can show it.
      if (!res.ok) throw new Error(`calendar events fetch failed: ${res.status}`)
      const j = await res.json() as { events: UserCalendarEvent[] }
      return j.events
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

// ── Conference submissions ────────────────────────────────

export function useConferences(projectId: string) {
  return useQuery({
    queryKey: ['conferences', projectId],
    queryFn: () => fetchConferences({ project_id: projectId }).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  })
}

export function useUpcomingConferences() {
  return useQuery({
    queryKey: ['conferences-upcoming'],
    queryFn: () => fetchUpcomingConferences().then((r) => r.data),
    staleTime: 60 * 1000,
  })
}

// ── PB System Health ───────────────────────────────────────

export interface PBHealthData {
  tasks: { total: number; active: number; completed: number }
  projects: { active: number }
  recentActivityCount: number
  d1TableCount: number
  lastTaskSync: string | null
  lastActivityTimestamp: string | null
}

export function usePBHealth() {
  return useQuery({
    queryKey: ['pb-health'],
    queryFn: async () => {
      const data = await fetchJson<{ data: PBHealthData }>('/api/pb/health')
      return data.data
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

// ── PB Sessions hooks ────────────────────────────────────────

export function usePBSessions(params?: { limit?: number; project?: string; since?: string }) {
  return useQuery({
    queryKey: ['pb-sessions', params],
    queryFn: async () => {
      const res = await fetchPBSessions(params)
      return res.data
    },
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function usePBSessionStats() {
  return useQuery({
    queryKey: ['pb-session-stats'],
    queryFn: async () => {
      const res = await fetchPBSessionStats()
      return res.data
    },
    staleTime: STALE_TIME,
    retry: false,
  })
}

// ── Cross-Project Insights ──────────────────────────────────

interface InsightEdge {
  from: string
  to: string
  fromTitle: string
  toTitle: string
  reason: string
  strength: number
}

export function useInsightConnections() {
  return useQuery({
    queryKey: ['insight-connections'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: InsightEdge[] }>('/api/insights/connections')
      return data.data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

interface InsightSuggestion {
  slug: string
  title: string
  reason: string
  strength: number
}

export function useInsightSuggestions(projectId: string) {
  return useQuery({
    queryKey: ['insight-suggestions', projectId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: InsightSuggestion[] }>(`/api/insights/suggestions?project_id=${encodeURIComponent(projectId)}`)
      return data.data || []
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  })
}

// ── Paper-to-Project linking (enriched) ─────────────────────

interface LinkedProject {
  link_id: string
  link_type: string | null
  note: string | null
  linked_at: string
  slug: string
  title: string
  status: string
  category: string | null
  stage: string | null
  pi: string | null
}

// ── Email Drafts Pending ────────────────────────────────────

export function useEmailDraftsPending() {
  return useQuery({
    queryKey: ['email-drafts-pending'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: unknown[] }>('/api/email-drafts/pending')
      return data.data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

// ── Proactive Brief ─────────────────────────────────────────

export function useProactiveBrief() {
  return useQuery({
    queryKey: ['proactive-brief'],
    queryFn: async () => {
      const data = await fetchJson<{ data?: unknown }>('/api/proactive-brief')
      return data.data ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── File Activity Heatmap ───────────────────────────────────

export function useFileActivityHeatmap(days = 90) {
  return useQuery({
    queryKey: ['file-activity-heatmap', days],
    queryFn: async () => {
      const data = await fetchJson<{ data?: unknown[] }>(`/api/file-activity/heatmap?days=${days}`)
      return data.data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ── Paper-to-Project linking (enriched) cont'd ──────────────

export function useLinkedProjects(publicationId: string) {
  return useQuery({
    queryKey: ['linked-projects', publicationId],
    queryFn: async () => {
      const data = await fetchJson<{ data?: LinkedProject[] }>(`/api/papers/by-publication?publication_id=${encodeURIComponent(publicationId)}`)
      return data.data || []
    },
    staleTime: 60 * 1000,
    enabled: !!publicationId,
  })
}
