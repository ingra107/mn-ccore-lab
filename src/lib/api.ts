/**
 * Typed API client for MN-CCORE D1 backend.
 *
 * In production (Cloudflare Pages), /api/* routes to the Worker.
 * In local dev (Vite), /api/* will 404 unless wrangler dev is running
 * on a proxy — hooks fall back to static data in that case.
 */

// D1 row types (mirror api/types.ts without importing — avoids D1Database type issue)
export interface PublicationRow {
  id: string
  title: string
  authors: string
  journal: string | null
  year: number
  status: string
  doi: string | null
  pubmed: string | null
  abstract: string | null
  topics: string | null
  featured: number
  author_slugs: string | null
  created_at: string
  updated_at: string
}

export interface TeamMemberRow {
  id: string
  name: string
  role: string | null
  credentials: string | null
  slug: string | null
  photo_url: string | null
  bio: string | null
  scholar_id: string | null
  author_name: string | null
  title: string | null
  department: string | null
  member_type: string | null
  created_at: string
}

export interface ProjectRow {
  id: string
  title: string
  status: string
  description: string | null
  category: string | null
  pi: string | null
  slug: string | null
  stage: string
  pi_context: string | null
  strategic_context: string | null
  created_at: string
  updated_at: string
}

export interface GrantRow {
  id: string
  mechanism: string | null
  title: string
  agency: string | null
  pi: string | null
  start_date: string | null
  end_date: string | null
  proposed: number
  total_funding: number | null
  created_at: string
}

export interface GraphNode {
  id: string
  name: string
  slug: string | null
  publicationCount: number
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  sharedPublications: string[]
}

export interface CollaborationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Stats {
  publicationCount: number
  teamSize: number
  grantCount: number
  projectCount: number
  activeProjectCount: number
  featuredPublicationCount: number
}

export interface TaskRow {
  id: string
  meeting_id: string | null
  project_id: string | null
  title: string
  description: string
  assignee: string
  assigned_by: string | null
  due_date: string | null
  priority: string // low, medium, high, urgent
  status: string // todo, in_progress, done, blocked
  source: string // manual, meeting, sync
  completed: number
  completed_at: string | null
  completed_by: string | null
  blocked_by: string | null
  created_at: string
  meeting_title?: string
  meeting_date?: string
}

export interface DailyPlanRow {
  id: string
  plan_date: string
  star_task_id: string | null
  focus_task_ids: string | null
  quick_win_ids: string | null
  intention: string | null
  gratitude: string | null
  status: 'planning' | 'executing' | 'reviewing' | 'closed'
  created_at: string
  updated_at: string
}

export interface PomodoroSessionRow {
  id: string
  task_id: string
  plan_date: string
  slot_type: 'star' | 'focus' | 'quick_win'
  started_at: string
  completed_at: string | null
  duration_minutes: number
  completed: number
  created_at: string
}

export interface DailyReflectionRow {
  id: string
  plan_date: string
  highlight: string | null
  learned: string | null
  energy_rating: number | null
  focus_rating: number | null
  notes: string | null
  created_at: string
}

interface ApiResponse<T> {
  data: T
  count?: number
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error || res.statusText)
  }

  return res.json()
}

// ── Read endpoints ──────────────────────────────────────────

export function fetchPublications(params?: {
  year?: number
  status?: string
  topic?: string
}) {
  const qs = new URLSearchParams()
  if (params?.year) qs.set('year', String(params.year))
  if (params?.status) qs.set('status', params.status)
  if (params?.topic) qs.set('topic', params.topic)
  const query = qs.toString()
  return fetchApi<PublicationRow[]>(`/api/publications${query ? `?${query}` : ''}`)
}

export function fetchTeam() {
  return fetchApi<TeamMemberRow[]>('/api/team')
}

export function fetchProjects(params?: { status?: string; category?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.category) qs.set('category', params.category)
  const query = qs.toString()
  return fetchApi<ProjectRow[]>(`/api/projects${query ? `?${query}` : ''}`)
}

export function fetchGrants() {
  return fetchApi<GrantRow[]>('/api/grants')
}

export function fetchCollaborationGraph() {
  return fetchApi<CollaborationGraph>('/api/graph/collaboration')
}

export function fetchStats() {
  return fetchApi<Stats>('/api/stats')
}

// ── Write endpoints (require auth) ──────────────────────────

export function createProject(input: {
  title: string
  category?: string
  stage?: string
  description?: string
  pi?: string
}) {
  return fetchApi<ProjectRow>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateProject(id: string, fields: Record<string, unknown>) {
  return fetchApi<ProjectRow>(`/api/projects/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function addProjectComment(id: string, comment: { content: string; author: string }) {
  return fetchApi<{ id: string }>(`/api/projects/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify(comment),
  })
}

// ── Tasks endpoints ──────────────────────────────────────────

export function fetchTasks(params?: {
  assignee?: string
  status?: string
  priority?: string
  project?: string
  meeting?: string
  source?: string
  completed?: string
}) {
  const qs = new URLSearchParams()
  if (params?.assignee) qs.set('assignee', params.assignee)
  if (params?.status) qs.set('status', params.status)
  if (params?.priority) qs.set('priority', params.priority)
  if (params?.project) qs.set('project', params.project)
  if (params?.meeting) qs.set('meeting', params.meeting)
  if (params?.source) qs.set('source', params.source)
  if (params?.completed) qs.set('completed', params.completed)
  const query = qs.toString()
  return fetchApi<TaskRow[]>(`/api/tasks${query ? `?${query}` : ''}`)
}

export function createTask(input: {
  title?: string
  description: string
  assignee: string
  meeting_id?: string
  project_id?: string
  due_date?: string
  priority?: string
  source?: string
}) {
  return fetchApi<TaskRow>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTaskStatus(id: string, status: string) {
  return fetchApi<TaskRow>(`/api/tasks/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function updateTask(id: string, fields: Record<string, unknown>) {
  return fetchApi<TaskRow>(`/api/tasks/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function fetchTeamSlugs() {
  return fetchApi<{ slug: string; name: string }[]>('/api/team/slugs')
}

// ── Ideas endpoints ──────────────────────────────────────────

export interface IdeaRow {
  id: string
  title: string
  description: string | null
  submitted_by: string
  research_area: string | null
  status: string // new, under_review, approved, parked, archived
  votes: number
  project_id: string | null
  created_at: string
  updated_at: string
}

export function fetchIdeas(params?: { status?: string; submitted_by?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.submitted_by) qs.set('submitted_by', params.submitted_by)
  const query = qs.toString()
  return fetchApi<IdeaRow[]>(`/api/ideas${query ? `?${query}` : ''}`)
}

export function createIdea(input: { title: string; description?: string; research_area?: string }) {
  return fetchApi<IdeaRow>('/api/ideas', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateIdea(id: string, fields: Record<string, unknown>) {
  return fetchApi<IdeaRow>(`/api/ideas/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function voteIdea(id: string) {
  return fetchApi<IdeaRow>(`/api/ideas/${id}/vote`, { method: 'POST' })
}

// ── Calendar events ──────────────────────────────────────────

export interface CalendarEvent {
  id: string
  date: string
  title: string
  type: string // meeting, task, milestone
  category: string
  meta?: Record<string, unknown>
}

export function fetchCalendarEvents(params?: { start?: string; end?: string }) {
  const qs = new URLSearchParams()
  if (params?.start) qs.set('start', params.start)
  if (params?.end) qs.set('end', params.end)
  const query = qs.toString()
  return fetchApi<CalendarEvent[]>(`/api/calendar/events${query ? `?${query}` : ''}`)
}

// ── Dependencies endpoints ──────────────────────────────────

export interface DependencyRow {
  id: string
  from_slug: string
  to_slug: string
  relationship_type: string
  note: string | null
  created_by: string | null
  created_at: string
}

export function fetchDependencies() {
  return fetchApi<DependencyRow[]>('/api/dependencies')
}

export function fetchProjectDependencies(slug: string) {
  return fetchApi<DependencyRow[]>(`/api/projects/${slug}/dependencies`)
}

export function createDependency(input: {
  from_slug: string
  to_slug: string
  relationship_type?: string
  note?: string
}) {
  return fetchApi<DependencyRow>('/api/dependencies', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteDependency(id: string) {
  return fetchApi<{ deleted: boolean; id: string }>(`/api/dependencies/${id}/delete`, {
    method: 'POST',
  })
}

// ── Expertise endpoints ─────────────────────────────────────

export interface ExpertiseTag {
  id: string
  member_slug: string
  tag: string
  source: string
  confidence: number
  created_at: string
}

export interface ExpertSuggestion {
  slug: string
  sources: string[]
  confidence: number
}

export function fetchExpertise(params?: { slug?: string; tag?: string }) {
  const qs = new URLSearchParams()
  if (params?.slug) qs.set('slug', params.slug)
  if (params?.tag) qs.set('tag', params.tag)
  const query = qs.toString()
  return fetchApi<ExpertiseTag[]>(`/api/expertise${query ? `?${query}` : ''}`)
}

export function addExpertise(input: { member_slug: string; tag: string; source?: string; confidence?: number }) {
  return fetchApi<ExpertiseTag>('/api/expertise', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function removeExpertise(id: string) {
  return fetchApi<{ deleted: boolean; id: string }>(`/api/expertise/${id}/delete`, {
    method: 'POST',
  })
}

export function fetchExpertSuggestions(topic: string) {
  return fetchApi<ExpertSuggestion[]>(`/api/expertise/suggest?topic=${encodeURIComponent(topic)}`)
}

// ── Questions (Ask the Lab) ─────────────────────────────────

export interface QuestionRow {
  id: string
  question: string
  context: string | null
  asked_by: string
  project_slug: string | null
  status: string
  created_at: string
  answer_count?: number
}

export interface AnswerRow {
  id: string
  question_id: string
  content: string
  author_slug: string
  is_accepted: number
  created_at: string
}

export interface QuestionDetail extends QuestionRow {
  answers: AnswerRow[]
}

export function fetchQuestions(params?: { status?: string; project_slug?: string }) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.project_slug) qs.set('project_slug', params.project_slug)
  const query = qs.toString()
  return fetchApi<QuestionRow[]>(`/api/questions${query ? `?${query}` : ''}`)
}

export function fetchQuestionDetail(id: string) {
  return fetchApi<QuestionDetail>(`/api/questions/${id}`)
}

export function createQuestion(input: { question: string; context?: string; project_slug?: string }) {
  return fetchApi<QuestionRow>('/api/questions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createAnswer(questionId: string, content: string) {
  return fetchApi<AnswerRow>(`/api/questions/${questionId}/answers`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function acceptAnswer(answerId: string) {
  return fetchApi<{ accepted: boolean; answer_id: string; question_id: string }>(
    `/api/answers/${answerId}/accept`,
    { method: 'POST' },
  )
}

// ── Revision tracker ────────────────────────────────────────

export interface RevisionRow {
  id: string
  project_id: string
  round: number
  submitted_at: string | null
  response_due: string | null
  status: string
  journal: string | null
  notes: string | null
  created_at: string
  // Aggregated from JOIN
  comment_count?: number
  resolved_count?: number
  project_title?: string
  project_slug?: string
}

export interface ReviewerCommentRow {
  id: string
  revision_id: string
  reviewer_number: number
  comment_text: string
  assigned_to: string
  status: string
  response_text: string | null
  resolved_at: string | null
  created_at: string
}

export function fetchRevisions(projectId: string) {
  return fetchApi<RevisionRow[]>(`/api/revisions?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchRevisionComments(revisionId: string) {
  return fetchApi<ReviewerCommentRow[]>(`/api/revisions/${revisionId}/comments`)
}

export function fetchActiveRevisions() {
  return fetchApi<RevisionRow[]>('/api/revisions/active')
}

export function createRevision(input: {
  project_id: string
  round?: number
  submitted_at?: string
  response_due?: string
  status?: string
  journal?: string
  notes?: string
}) {
  return fetchApi<RevisionRow>('/api/revisions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRevision(id: string, fields: Partial<{
  submitted_at: string
  response_due: string
  status: string
  journal: string
  notes: string
}>) {
  return fetchApi<RevisionRow>(`/api/revisions/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function createRevisionComment(revisionId: string, input: {
  reviewer_number?: number
  comment_text: string
  assigned_to?: string
  status?: string
  response_text?: string
}) {
  return fetchApi<ReviewerCommentRow>(`/api/revisions/${revisionId}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRevisionComment(commentId: string, fields: Partial<{
  status: string
  response_text: string
  assigned_to: string
  comment_text: string
}>) {
  return fetchApi<ReviewerCommentRow>(`/api/revisions/comments/${commentId}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

// ── Mentee milestones ──────────────────────────────────────

export interface MenteeMilestoneRow {
  id: string
  mentee_slug: string
  milestone_type: string
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface MenteeOverviewRow {
  mentee_slug: string
  upcoming_count: number
  overdue_count: number
  completed_count: number
  total_count: number
  next_due_date: string | null
}

export function fetchMenteeMilestones(params?: { mentee?: string; status?: string; type?: string }) {
  const qs = new URLSearchParams()
  if (params?.mentee) qs.set('mentee', params.mentee)
  if (params?.status) qs.set('status', params.status)
  if (params?.type) qs.set('type', params.type)
  const query = qs.toString()
  return fetchApi<MenteeMilestoneRow[]>(`/api/mentee-milestones${query ? `?${query}` : ''}`)
}

export function fetchMenteeOverview() {
  return fetchApi<MenteeOverviewRow[]>('/api/mentee-milestones/overview')
}

export function createMenteeMilestone(input: {
  mentee_slug: string
  milestone_type: string
  title: string
  description?: string
  due_date?: string
  notes?: string
  status?: string
}) {
  return fetchApi<MenteeMilestoneRow>('/api/mentee-milestones', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMenteeMilestone(id: string, fields: Partial<{
  title: string
  description: string
  due_date: string
  notes: string
  status: string
  milestone_type: string
  mentee_slug: string
}>) {
  return fetchApi<MenteeMilestoneRow>(`/api/mentee-milestones/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function completeMenteeMilestone(id: string) {
  return fetchApi<MenteeMilestoneRow>(`/api/mentee-milestones/${id}/complete`, {
    method: 'POST',
  })
}

export { ApiError }
