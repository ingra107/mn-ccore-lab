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
  acknowledged_at: string | null
  acknowledged_by: string | null
  watchers: string | null
  reminder_days: number | null
  instructions: string | null
  recurrence: string | null
  recurrence_parent_id: string | null
  description_json: string | null
  key_link_1: string | null
  key_link_1_desc: string | null
  key_link_2: string | null
  key_link_2_desc: string | null
  key_link_3: string | null
  key_link_3_desc: string | null
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
  evening_task_ids: string | null
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

export interface PBSessionRow {
  id: string
  started_at: string
  ended_at: string | null
  machine: string | null
  project_name: string | null
  summary: string | null
  actions_count: number
  commits_count: number
  duration_minutes: number | null
  created_at: string
}

export interface PBSessionStats {
  total_sessions: number
  total_hours: number
  avg_minutes: number
  sessions_this_week: number
  total_actions: number
  total_commits: number
  per_project: { project_name: string; count: number; total_minutes: number }[]
  per_day: { day: string; count: number; total_minutes: number }[]
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

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
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

export function acknowledgeTask(id: string) {
  return fetchApi<TaskRow>(`/api/tasks/${id}/acknowledge`, {
    method: 'POST',
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

// ── Deadline cascade ──────────────────────────────────────

export interface DeadlineDepRow {
  id: string
  upstream_id: string
  upstream_type: string
  downstream_id: string
  downstream_type: string
  lag_days: number
  notes: string | null
  created_at: string
}

export interface DeadlineNode {
  id: string
  type: 'milestone' | 'task' | 'deadline'
  title: string
  due_date: string | null
  status: string
  project_id: string | null
  project_title: string | null
}

export interface CascadeGraph {
  nodes: DeadlineNode[]
  dependencies: DeadlineDepRow[]
}

export interface ImpactResult {
  id: string
  type: string
  title: string
  original_date: string | null
  projected_date: string
  shift_days: number
}

export function fetchDeadlineCascade(projectId: string) {
  return fetchApi<CascadeGraph>(`/api/deadline-cascade?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchDeadlineImpact(id: string, type: string, newDate: string) {
  return fetchApi<ImpactResult[]>(`/api/deadline-cascade/impact?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&new_date=${encodeURIComponent(newDate)}`)
}

export function fetchAllCascades() {
  return fetchApi<CascadeGraph>('/api/deadline-cascade/all')
}

export function createDeadlineDependency(input: {
  upstream_id: string
  upstream_type: string
  downstream_id: string
  downstream_type: string
  lag_days?: number
  notes?: string
}) {
  return fetchApi<DeadlineDepRow>('/api/deadline-dependencies', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteDeadlineDependency(id: string) {
  return fetchApi<{ deleted: boolean; id: string }>(`/api/deadline-dependencies/${id}/delete`, {
    method: 'POST',
  })
}

// ── Submission lifecycle ──────────────────────────────────

export type SubmissionEventType =
  | 'submitted'
  | 'reviews_received'
  | 'revision_due'
  | 'resubmitted'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'

export interface SubmissionEventRow {
  id: string
  project_id: string
  event_type: SubmissionEventType
  event_date: string
  journal: string | null
  notes: string | null
  deleted_at: string | null
  created_at: string
}

export interface ActiveSubmissionRow {
  id: string
  project_id: string
  latest_event_type: SubmissionEventType
  latest_event_date: string
  journal: string | null
  notes: string | null
  project_title: string | null
  project_slug: string | null
  first_submitted_date: string | null
  days_since_submission: number
  revision_due_date: string | null
  days_until_revision_due: number | null
}

export function fetchSubmissionEvents(projectId: string) {
  return fetchApi<SubmissionEventRow[]>(`/api/submissions?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchActiveSubmissions() {
  return fetchApi<ActiveSubmissionRow[]>('/api/submissions/active')
}

export function createSubmissionEvent(input: {
  project_id: string
  event_type: SubmissionEventType
  event_date: string
  journal?: string
  notes?: string
}) {
  return fetchApi<SubmissionEventRow>('/api/submissions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateSubmissionEvent(id: string, fields: Partial<{
  event_type: SubmissionEventType
  event_date: string
  journal: string
  notes: string
}>) {
  return fetchApi<SubmissionEventRow>(`/api/submissions/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function deleteSubmissionEvent(id: string) {
  return fetchApi<{ id: string; deleted: boolean }>(`/api/submissions/${id}/delete`, {
    method: 'POST',
  })
}

// ── Regulatory & Compliance ──────────────────────────────────

export interface RegulatoryItemRow {
  id: string
  project_id: string
  item_type: string
  title: string
  protocol_number: string | null
  approved_date: string | null
  expiration_date: string | null
  renewal_due: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface ExpiringRegulatoryRow extends RegulatoryItemRow {
  project_title: string | null
  project_slug: string | null
  days_remaining: number
}

export function fetchRegulatoryItems(projectId: string) {
  return fetchApi<RegulatoryItemRow[]>(`/api/regulatory?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchExpiringRegulatory(days: number = 60) {
  return fetchApi<ExpiringRegulatoryRow[]>(`/api/regulatory/expiring?days=${days}`)
}

export function createRegulatoryItem(input: {
  project_id: string
  item_type: string
  title: string
  protocol_number?: string
  approved_date?: string
  expiration_date?: string
  renewal_due?: string
  status?: string
  notes?: string
}) {
  return fetchApi<RegulatoryItemRow>('/api/regulatory', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRegulatoryItem(id: string, fields: Partial<{
  title: string
  item_type: string
  protocol_number: string
  approved_date: string
  expiration_date: string
  renewal_due: string
  status: string
  notes: string
}>) {
  return fetchApi<RegulatoryItemRow>(`/api/regulatory/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function renewRegulatoryItem(id: string, input: {
  approved_date?: string
  expiration_date?: string
  renewal_due?: string
  notes?: string
}) {
  return fetchApi<RegulatoryItemRow>(`/api/regulatory/${id}/renew`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ── Grant Post-Award Milestones ──────────────────────────────

export interface GrantMilestoneRow {
  id: string
  grant_id: string
  milestone_type: string
  title: string
  due_date: string | null
  completed_at: string | null
  status: string
  notes: string | null
  created_at: string
}

export interface UpcomingGrantMilestoneRow extends GrantMilestoneRow {
  grant_title: string | null
  grant_mechanism: string | null
}

export function fetchGrantMilestones(grantId: string) {
  return fetchApi<GrantMilestoneRow[]>(`/api/grant-milestones?grant_id=${encodeURIComponent(grantId)}`)
}

export function fetchUpcomingGrantMilestones(days: number = 90) {
  return fetchApi<UpcomingGrantMilestoneRow[]>(`/api/grant-milestones/upcoming?days=${days}`)
}

export function createGrantMilestone(input: {
  grant_id: string
  milestone_type: string
  title: string
  due_date?: string
  notes?: string
  status?: string
}) {
  return fetchApi<GrantMilestoneRow>('/api/grant-milestones', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateGrantMilestone(id: string, fields: Partial<{
  title: string
  due_date: string
  notes: string
  status: string
  milestone_type: string
  grant_id: string
}>) {
  return fetchApi<GrantMilestoneRow>(`/api/grant-milestones/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function completeGrantMilestone(id: string) {
  return fetchApi<GrantMilestoneRow>(`/api/grant-milestones/${id}/complete`, {
    method: 'POST',
  })
}

// ── Conference Submissions ──────────────────────────────────

export type ConferenceSubmissionType = 'abstract' | 'oral' | 'poster' | 'workshop' | 'invited'
export type ConferenceStatus = 'planning' | 'submitted' | 'accepted' | 'preparing' | 'presented' | 'rejected'
export type MaterialsStatus = 'not_started' | 'drafting' | 'review' | 'final'
export type PresentationType = 'poster' | 'oral' | 'rapid' | 'workshop'

export interface ConferenceSubmissionRow {
  id: string
  project_id: string | null
  conference: string
  conference_date: string | null
  submission_type: ConferenceSubmissionType
  title: string
  authors: string | null
  abstract_due: string | null
  abstract_submitted_at: string | null
  accepted_at: string | null
  presentation_type: PresentationType | null
  materials_status: MaterialsStatus
  travel_booked: number
  notes: string | null
  status: ConferenceStatus
  created_at: string
}

export interface UpcomingConferenceRow extends ConferenceSubmissionRow {
  project_title: string | null
  project_slug: string | null
  days_until: number | null
}

export function fetchConferences(params?: { project_id?: string; status?: string }) {
  const qs = new URLSearchParams()
  if (params?.project_id) qs.set('project_id', params.project_id)
  if (params?.status) qs.set('status', params.status)
  const query = qs.toString()
  return fetchApi<ConferenceSubmissionRow[]>(`/api/conferences${query ? `?${query}` : ''}`)
}

export function fetchUpcomingConferences() {
  return fetchApi<UpcomingConferenceRow[]>('/api/conferences/upcoming')
}

export function createConference(input: {
  project_id?: string
  conference: string
  conference_date?: string
  submission_type: ConferenceSubmissionType
  title: string
  authors?: string
  abstract_due?: string
  status?: ConferenceStatus
  notes?: string
}) {
  return fetchApi<ConferenceSubmissionRow>('/api/conferences', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateConference(id: string, fields: Partial<{
  project_id: string
  conference: string
  conference_date: string
  submission_type: ConferenceSubmissionType
  title: string
  authors: string
  abstract_due: string
  abstract_submitted_at: string
  accepted_at: string
  presentation_type: PresentationType
  materials_status: MaterialsStatus
  travel_booked: number
  notes: string
  status: ConferenceStatus
}>) {
  return fetchApi<ConferenceSubmissionRow>(`/api/conferences/${id}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  })
}

export function deleteConference(id: string) {
  return fetchApi<{ id: string; deleted: boolean }>(`/api/conferences/${id}/delete`, {
    method: 'POST',
  })
}

// ── PB Sessions endpoints ────────────────────────────────���───

export function fetchPBSessions(params?: { limit?: number; project?: string; since?: string }) {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.project) qs.set('project', params.project)
  if (params?.since) qs.set('since', params.since)
  const query = qs.toString()
  return fetchApi<PBSessionRow[]>(`/api/pb/sessions${query ? `?${query}` : ''}`)
}

export function fetchPBSessionStats() {
  return fetchApi<PBSessionStats>('/api/pb/sessions/stats')
}

export function createPBSession(input: {
  id?: string
  started_at: string
  ended_at?: string
  machine?: string
  project_name?: string
  summary?: string
  actions_count?: number
  commits_count?: number
  duration_minutes?: number
}) {
  return fetchApi<PBSessionRow>('/api/pb/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function bulkCreatePBSessions(sessions: Array<{
  id?: string
  started_at: string
  ended_at?: string
  machine?: string
  project_name?: string
  summary?: string
  actions_count?: number
  commits_count?: number
  duration_minutes?: number
}>) {
  return fetchApi<{ created: number; updated: number; errors: string[] }>('/api/pb/sessions/bulk', {
    method: 'POST',
    body: JSON.stringify({ sessions }),
  })
}

export { ApiError }
