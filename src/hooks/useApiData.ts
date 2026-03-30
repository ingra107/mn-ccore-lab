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
  fetchCollaborationGraph,
  fetchStats,
  fetchTasks,
  fetchIdeas,
  fetchCalendarEvents,
  fetchDependencies,
  fetchProjectDependencies,
  fetchExpertise,
  fetchExpertSuggestions,
  fetchQuestions,
  fetchQuestionDetail,
} from '../lib/api'
import type {
  PublicationRow,
  TeamMemberRow,
  ProjectRow,
  GrantRow,
  CollaborationGraph,
  Stats,
  TaskRow,
  IdeaRow,
  CalendarEvent,
  DependencyRow,
  ExpertiseTag,
  ExpertSuggestion,
  QuestionRow,
  QuestionDetail,
} from '../lib/api'

// Re-export row types for components that need them
export type { PublicationRow, TeamMemberRow, ProjectRow, GrantRow, CollaborationGraph, Stats, TaskRow, IdeaRow, CalendarEvent, DependencyRow, ExpertiseTag, ExpertSuggestion, QuestionRow, QuestionDetail }

// Static data imports (fallback for local dev)
import { publications as staticPublications } from '../data/publications'
import { getAllMembers } from '../data/team'
import { projects as staticProjects } from '../data/projects'
import { grants as staticGrants } from '../data/grants'

import type { Publication, TeamMember, Project, Grant } from '../data/types'

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
  }
}

function rowToProject(row: ProjectRow): Project {
  return {
    title: row.title,
    status: row.status as Project['status'],
    description: row.description || undefined,
    category: row.category || '',
    pi: row.pi || '',
    slug: row.slug || '',
    stage: row.stage as Project['stage'],
    strategic_context: row.strategic_context || undefined,
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
  }
}

// ── Query hooks ─────────────────────────────────────────────
//
// initialData: provides static data synchronously on first render (no flash).
// queryFn: fetches from D1 API. In production, succeeds and updates.
//          In dev, fails silently and initialData persists.
// This gives instant rendering in dev AND live D1 data in production.

const STALE_TIME = 5 * 60 * 1000 // 5 minutes

export function usePublications(params?: {
  year?: number
  status?: string
  topic?: string
}) {
  return useQuery({
    queryKey: ['publications', params],
    queryFn: async () => {
      const res = await fetchPublications(params)
      return res.data.map(rowToPublication)
    },
    initialData: params ? undefined : () => staticPublications,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useTeam() {
  return useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const res = await fetchTeam()
      return res.data.map(rowToTeamMember)
    },
    initialData: () => getAllMembers(),
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useProjects(params?: { status?: string; category?: string }) {
  return useQuery({
    queryKey: ['projects', params],
    queryFn: async () => {
      const res = await fetchProjects(params)
      return res.data.map(rowToProject)
    },
    initialData: params ? undefined : () => staticProjects,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useGrants() {
  return useQuery({
    queryKey: ['grants'],
    queryFn: async () => {
      const res = await fetchGrants()
      return res.data.map(rowToGrant)
    },
    initialData: () => staticGrants,
    staleTime: STALE_TIME,
    retry: false,
  })
}

export function useCollaborationGraph() {
  return useQuery({
    queryKey: ['graph', 'collaboration'],
    queryFn: async () => {
      try {
        const res = await fetchCollaborationGraph()
        return res.data
      } catch {
        return null
      }
    },
    staleTime: STALE_TIME,
  })
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      try {
        const res = await fetchStats()
        return res.data
      } catch {
        return null
      }
    },
    staleTime: STALE_TIME,
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
      try {
        const res = await fetch(`/api/projects/${projectId}/comments`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as Comment[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000, // 1 minute for comments
    enabled: !!projectId,
  })
}

// ── Activity Feed ───────────────────────────────────────────

export interface ActivityEntry {
  id: string
  type: string
  description: string
  actor: string | null
  related_id: string | null
  related_type: string | null
  timestamp: string
}

export function useActivity(limit: number = 20) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/activity?limit=${limit}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as ActivityEntry[]
      } catch {
        return []
      }
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
  status: string
  created_at: string
  updated_at: string
}

export interface ActionItemRow {
  id: string
  meeting_id: string | null
  project_id: string | null
  description: string
  assignee: string
  due_date: string | null
  completed: number
  completed_at: string | null
  completed_by: string | null
  created_at: string
  meeting_title?: string
  meeting_date?: string
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

export interface MeetingDetail extends MeetingRow {
  action_items: ActionItemRow[]
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
    status: m.date >= new Date().toISOString().split('T')[0] ? 'upcoming' : 'completed',
    created_at: m.date,
    updated_at: m.date,
  }))
}

export function useMeetingsApi() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await fetch('/api/meetings')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      return data.data as MeetingRow[]
    },
    initialData: () => staticToMeetingRows(),
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
      status: 'completed',
      created_at: staticMeeting.date,
      updated_at: staticMeeting.date,
      action_items: (staticMeeting.actionItems || []).map((a, i) => ({
        id: `static-ai-${i}`,
        meeting_id: staticMeeting.id,
        project_id: a.projectSlug || null,
        description: a.description,
        assignee: a.assignee,
        due_date: a.dueDate || null,
        completed: a.completed ? 1 : 0,
        completed_at: null,
        completed_by: null,
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
    initialData: buildFallback,
    staleTime: 60 * 1000,
    enabled: !!id,
    retry: false,
  })
}

export function useActionItems(filters?: { assignee?: string; completed?: string }) {
  return useQuery({
    queryKey: ['action-items', filters],
    queryFn: async () => {
      try {
        const qs = new URLSearchParams()
        if (filters?.assignee) qs.set('assignee', filters.assignee)
        if (filters?.completed) qs.set('completed', filters.completed)
        const res = await fetch(`/api/action-items?${qs}`)
        if (!res.ok) return []
        const data = await res.json()
        return data.data as ActionItemRow[]
      } catch {
        return []
      }
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
}) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      const res = await fetchTasks(filters)
      return dedupTasks(res.data as TaskRow[])
    },
    staleTime: 60 * 1000,
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
      try {
        const qs = new URLSearchParams()
        if (params?.date) qs.set('date', params.date)
        if (params?.status) qs.set('status', params.status)
        if (params?.topic) qs.set('topic', params.topic)
        if (params?.limit) qs.set('limit', String(params.limit))
        if (params?.with_relevance) qs.set('with_relevance', 'true')
        const res = await fetch(`/api/digest?${qs}`)
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as DigestPaper[]
      } catch {
        return []
      }
    },
    staleTime: STALE_TIME,
  })
}

export function useDigestDates() {
  return useQuery({
    queryKey: ['digest-dates'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/digest/dates')
        if (!res.ok) return []
        const data = await res.json()
        return (data.data || []) as { date: string; count: number }[]
      } catch {
        return []
      }
    },
    staleTime: STALE_TIME,
  })
}

// ── Project Health ───────────────────────────────────────────

export interface ProjectHealth {
  slug: string
  title: string
  stage: string
  status: string
  days_since_update: number | null
  health: 'green' | 'yellow' | 'red'
  pending_actions: number
  recent_updates: number
  last_update_date: string | null
}

export interface HealthSummary {
  total: number
  green: number
  yellow: number
  red: number
  avg_days_since_update: number
}

export function useProjectHealth() {
  return useQuery({
    queryKey: ['project-health'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/projects/health')
        if (!res.ok) return { data: [] as ProjectHealth[], summary: { total: 0, green: 0, yellow: 0, red: 0, avg_days_since_update: 0 } }
        return await res.json() as { data: ProjectHealth[], summary: HealthSummary }
      } catch {
        return { data: [] as ProjectHealth[], summary: { total: 0, green: 0, yellow: 0, red: 0, avg_days_since_update: 0 } }
      }
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
      const res = await fetch(`/api/tasks/${taskId}/subtasks`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as SubtaskRow[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Task Handoffs ──────────────────────────────────────────

export interface HandoffRow {
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
      const res = await fetch(`/api/tasks/${taskId}/handoffs`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as HandoffRow[]
    },
    staleTime: 30 * 1000,
    enabled: !!taskId,
  })
}

// ── Paper-Project Links ────────────────────────────────────

export interface PaperProjectLink {
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
      const res = await fetch(`/api/projects/${slug}/papers`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as PaperProjectLink[]
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
      const res = await fetch(`/api/reactions?target_type=${targetType}&target_id=${targetId}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as Reaction[]
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
      try {
        const res = await fetch(`/api/projects/${slug}/updates`)
        if (!res.ok) return []
        const data = await res.json()
        return data.data as ProjectUpdateRow[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000,
    enabled: !!slug,
  })
}

// ── Team Pulse ──────────────────────────────────────────────

export interface TeamPulseData {
  activity: { slug: string; updates: number; completions: number }[]
  active_this_week: number
  totals: { updates: number; completions: number }
}

export function useTeamPulse(hours: number = 48) {
  return useQuery({
    queryKey: ['team-pulse', hours],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/team/pulse?hours=${hours}`)
        if (!res.ok) return null
        const data = await res.json()
        return data.data as TeamPulseData
      } catch {
        return null
      }
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
  tags: string | null
  created_at: string
}

export function useDecisions(projectSlug?: string) {
  return useQuery({
    queryKey: ['decisions', projectSlug || 'all'],
    queryFn: async () => {
      const url = projectSlug ? `/api/decisions?project_slug=${projectSlug}` : '/api/decisions'
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as DecisionRow[]
    },
    staleTime: 60 * 1000,
  })
}

export function useDecisionsForReview() {
  return useQuery({
    queryKey: ['decisions', 'review'],
    queryFn: async () => {
      const res = await fetch('/api/decisions/review')
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as DecisionRow[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSimilarDecisions(query: string) {
  return useQuery({
    queryKey: ['decisions', 'similar', query],
    queryFn: async () => {
      const res = await fetch(`/api/decisions/similar?q=${encodeURIComponent(query)}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []) as DecisionRow[]
    },
    staleTime: 30 * 1000,
    enabled: !!query && query.length >= 2,
  })
}

// ── Dependencies ───────────────────────────────────────────

export function useDependencies() {
  return useQuery({
    queryKey: ['dependencies'],
    queryFn: async () => {
      try {
        const res = await fetchDependencies()
        return res.data as DependencyRow[]
      } catch {
        return []
      }
    },
    staleTime: STALE_TIME,
  })
}

export function useProjectDependencies(slug: string) {
  return useQuery({
    queryKey: ['dependencies', slug],
    queryFn: async () => {
      try {
        const res = await fetchProjectDependencies(slug)
        return res.data as DependencyRow[]
      } catch {
        return []
      }
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
}

export function useTrajectory(slug: string) {
  return useQuery({
    queryKey: ['trajectory', slug],
    queryFn: async () => {
      const res = await fetch(`/api/team/${slug}/trajectory`)
      if (!res.ok) return null
      const data = await res.json()
      return data.data as TrajectoryData
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
      const res = await fetch(`/api/team/${slug}/contributions?period=${period}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.data as ContributionsData
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  })
}

// ── Grant Intelligence (NIH RePORTER) ──────────────────────

export interface SimilarGrant {
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
      const res = await fetch(`/api/grants/similar?${params}`)
      if (!res.ok) return { data: [] as SimilarGrant[], total: 0 }
      return await res.json() as { data: SimilarGrant[]; total: number }
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
      try {
        const res = await fetchExpertise(slug ? { slug } : undefined)
        return res.data as ExpertiseTag[]
      } catch {
        return []
      }
    },
    staleTime: STALE_TIME,
    enabled: slug !== undefined ? !!slug : true,
  })
}

export function useExpertSuggestions(topic: string) {
  return useQuery({
    queryKey: ['expertise', 'suggest', topic],
    queryFn: async () => {
      try {
        const res = await fetchExpertSuggestions(topic)
        return res.data as ExpertSuggestion[]
      } catch {
        return []
      }
    },
    staleTime: 60 * 1000,
    enabled: !!topic && topic.length >= 2,
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
