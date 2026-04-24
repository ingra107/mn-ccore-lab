import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { Env } from './types';
import { corsHeaders, json, error, getAuthUser, isPiRequest, getPiEmails } from './helpers';
import type { AuthUser } from './helpers';
import { validateApiKey } from './middleware/api-key-auth';
import { handleVersion, bumpVersion } from './lib/version';
import { notifyClients } from './lib/notify';
import { handleUploadUrl, handleUploadDone, handleListFiles, handleGetFile, handleDeleteFile } from './routes/uploads';

// ── Route modules ──────────────────────────────────────────
import { handleTasks, handleActionItems, handleOverdueCount, handleUpdateTaskStatus, handleToggleTask, handleUpdateTask, handleCreateTask, handleGetTaskComments, handleAddTaskComment, handleGetTaskActivity, handleGetTaskDetail, handleGetTaskUpdates, handleGetRecentTaskUpdates, handlePostTaskUpdate, handleBatchUpdateTasks, handleSyncBulkTasks, handleAcknowledgeTask, handleDeleteTask, handleMobileTasksToHub } from './routes/tasks';
import { handleProjects, handleCreateProject, handleGetComments, handleGetProjectUpdates, handleProjectHealth, handleRecentUpdates, handleUpdateProject, handleDeleteProject, handleGetDeletedProjectsSince, handleAddComment, handlePostProjectUpdate, handleGetMilestones, handleUpdateMilestoneNote, handleUpdateMilestoneCompletion } from './routes/projects';
import { handleMeetings, handleNextMeeting, handleGetMeeting, handleGetAgendaItems, handleAddAgendaItem, handleReorderAgenda, handleCreateMeeting, handleUpdateMeetingNotes, handleMeetingPrep, handleGenerateAgenda } from './routes/meetings';
import { handlePublications, handleGrants, handleCollaborationGraph, handleStats, handleGrantsTimeline, handleUpdateGrant } from './routes/publications';
import { handleTeam, handleTeamSlugs, handleCVData, handleUpdateTeamMember } from './routes/team';
import { handleDigest, handleDigestDates, handleUpdateDigestStatus, handleCreateDigestPaper, handleGetDigestComments, handleCreateDigestComment, handleDigestCommentCounts } from './routes/digest';
import { handleIdeas, handleCreateIdea, handleUpdateIdea, handleVoteIdea } from './routes/ideas';
import { handleBugReport } from './routes/bug-report';
import { handleNotifications, handleNotificationCount, handleMarkNotificationRead, handleMarkAllNotificationsRead, handleCommitments, handleCreateCommitment } from './routes/notifications';
import { handleSearch } from './routes/search';
import { handleGetSettings, handleUpdateSettings, handleGetWorkflowTemplates, handleCreateWorkflowTemplate } from './routes/settings';
import { handleGetReactions, handleToggleReaction } from './routes/reactions';
import { handleCalendarEvents } from './routes/calendar';
import { handleActivity, handleActivityHeatmap } from './routes/activity';
import { handleGetSubtasks, handleCreateSubtask, handleToggleSubtask, handleDeleteSubtask, handleReorderSubtasks } from './routes/subtasks';
import { handleTeamPulse } from './routes/team-pulse';
import { handleGetPaperLinks, handleLinkPaper, handleUnlinkPaper, handlePapersByProject, handlePapersByPublication } from './routes/paper-links';
import { handleInsightConnections, handleInsightSuggestions } from './routes/insights';
import { handleGetDependencies, handleGetProjectDependencies, handleCreateDependency, handleDeleteDependency } from './routes/dependencies';
import { handleTrajectory } from './routes/trajectory';
import { handleContributions } from './routes/contributions';
import { handleContributionsDecay } from './routes/contributions-decay';
import { handleSimilarGrants } from './routes/grant-intelligence';
import { handleGetDecisions, handleCreateDecision, handleUpdateDecisionOutcome, handleUpdateDecision, handleGetDecisionsNeedingReview, handleGetDecisionTags } from './routes/decisions';
import { handleSimilarDecisions, handleSimilarDecisionsById } from './routes/decision-replay';
import { handleNarratives } from './routes/narratives';
import { handleGetExpertise, handleAddExpertise, handleRemoveExpertise, handleSuggestExperts } from './routes/expertise';
import { handleGetQuestions, handleGetQuestionDetail, handleCreateQuestion, handleCreateAnswer, handleAcceptAnswer } from './routes/questions';
import { handleGetHandoffs, handleCreateHandoff, handleAcknowledgeHandoff } from './routes/handoffs';
import { handleCheckImpact } from './routes/impact-trace';
import { handlePIAnalytics } from './routes/pi-analytics';
import { handlePIDashboard, handleMenteeVelocity, handleResponseTime, handleTeamEngagement, handleTeamByExpertise } from './routes/pi-dashboard';
import { handleCadenceCheck } from './routes/meeting-cadence';
import { handleGetAIRequests, handleCreateAIRequest, handleUpdateAIResponse } from './routes/ai-requests';
import { handleCommandCenter, handlePBCapture, handlePBDefer, handleCreateOrUpdatePlan, handleReorderPlan, handlePromoteTask, handleStartPomodoro, handleCompletePomodoro, handleSaveReflection, handlePlanHistory, handleAddToDispatch, handleGetPendingDispatch, handleSendDispatch, handleCompleteDispatchItem } from './routes/pb-sector';
import { handlePBSessions, handlePBSessionStats, handleCreatePBSession, handleBulkCreatePBSessions } from './routes/pb-sessions';
import { handleGetTodayMd, handleUpsertTodayMd } from './routes/pb-today';
import { handlePBHealth } from './routes/pb-health';
import { handleGetRelay, handleCreateRelay, handleCompleteRelay } from './routes/pb-relay';
import { handleGetRevisions, handleCreateRevision, handleUpdateRevision, handleGetRevisionComments, handleCreateRevisionComment, handleUpdateRevisionComment, handleGetActiveRevisions, handleAttentionManuscripts } from './routes/revisions';
import { handleMenteeMilestones, handleMenteeMilestoneOverview, handleCreateMenteeMilestone, handleUpdateMenteeMilestone, handleCompleteMenteeMilestone } from './routes/mentee-milestones';
import { handleGetCascade, handleGetImpact, handleGetAllCascades, handleCreateDeadlineDependency, handleDeleteDeadlineDependency } from './routes/deadline-cascade';
import { handleGetSubmissions, handleCreateSubmission, handleUpdateSubmission, handleDeleteSubmission, handleGetActiveSubmissions } from './routes/submissions';
import { handleGetRegulatoryItems, handleGetExpiringItems, handleCreateRegulatoryItem, handleUpdateRegulatoryItem, handleRenewRegulatoryItem, handleRegulatoryIcs } from './routes/regulatory';
import { handleGrantMilestones, handleUpcomingGrantMilestones, handleCreateGrantMilestone, handleUpdateGrantMilestone, handleCompleteGrantMilestone } from './routes/grant-milestones';
import { handleGetConferences, handleGetUpcomingConferences, handleCreateConference, handleUpdateConference, handleDeleteConference } from './routes/conferences';
import { handleGetEmailDrafts, handleGetPendingDrafts, handleSyncEmailDrafts } from './routes/email-drafts';
import { handleGetProjectDocuments, handleCreateProjectDocument, handleDeleteProjectDocument } from './routes/project-documents';
import { handleProactiveBrief } from './routes/proactive-brief';
import { handleGetFileActivity, handleSyncFileActivity } from './routes/file-activity';
import { handleGenerateDigestEmail, handleDigestPreview, handleSendDigestEmail, handleSendDailyDigests } from './routes/digest-email';
import { handlePostInbox, handleGetInbox, handleMarkSynced } from './routes/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Hono app with typed bindings + per-request variables
//
// `Bindings` comes from the CF environment (D1, R2, service bindings, secrets).
// `Variables` hold values set by early middleware so route handlers can read
// them without re-doing auth / test-mode logic (apiKeyValid, user, db).
//
// The app is defined as Hono<{ Bindings; Variables }> so c.env and c.var are
// both typed. We deliberately do NOT subclass or wrap Hono — route functions
// from ./routes/* take a plain Env and Request, so the handlers here just
// unwrap c.req.raw + c.get('env') and forward.
// ─────────────────────────────────────────────────────────────────────────────

type AppEnv = {
  Bindings: Env;
  Variables: {
    /** Swapped env (potentially with DB=DB_TEST). Always use this, not c.env. */
    env: Env;
    /** null = no key header, true = key valid, false = key invalid (rejected earlier). */
    apiKeyValid: boolean | null;
    /** Authed CF Access user, or null. */
    authedUser: AuthUser | null;
    /** Effective user for handler calls. On writes this falls back to the
     *  anonymous shim unless REQUIRE_AUTH is set + auth is missing. */
    user: AuthUser;
  };
};

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler — matches old top-level try/catch behavior.
// Any thrown error from a handler becomes a 500 JSON response with corsHeaders.
// ─────────────────────────────────────────────────────────────────────────────
app.onError((err, _c) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  return error(message, 500);
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS + preflight.
// OPTIONS → 204 with corsHeaders. For all other methods, we don't need to add
// corsHeaders via middleware because every json()/error() helper from
// ./helpers already includes them.
// ─────────────────────────────────────────────────────────────────────────────
app.options('*', () => new Response(null, { status: 204, headers: corsHeaders }));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Test-mode DB swap.
// When X-Test-Mode: true header + DB_TEST binding + TEST_MODE_KEY env +
// matching X-Test-Mode-Key header, swap DB to DB_TEST for this request.
// Stored on c.var.env so downstream middleware/routes see the swap.
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  let env: Env = c.env;
  const testModeKey = (env as unknown as { TEST_MODE_KEY?: string }).TEST_MODE_KEY;
  if (
    c.req.header('X-Test-Mode') === 'true'
    && env.DB_TEST
    && testModeKey
    && c.req.header('X-Test-Mode-Key') === testModeKey
  ) {
    env = { ...env, DB: env.DB_TEST };
  }
  c.set('env', env);
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. API key auth (programmatic access — AI Co-Scientist listener, Hermes).
// validateApiKey:
//   - returns false → Authorization header present but invalid → 401
//   - returns true  → API key valid → skip browser auth downstream
//   - returns null  → no Authorization header → use browser auth
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const env = c.get('env');
  const result = validateApiKey(c.req.raw, env);
  if (result === false) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  c.set('apiKeyValid', result);
  // Default "user" — overridden in the POST/PUT gate below once we know
  // whether REQUIRE_AUTH is set. Kept here so GETs don't NPE if they ever
  // read c.var.user. Resolve authed user ONCE — JWT verify is async + fetches
  // JWKS so we cache the result on the context instead of re-verifying.
  const authed = await getAuthUser(c.req.raw, env);
  c.set('authedUser', authed);
  c.set('user', authed || { email: 'anonymous', name: 'Team Member' });
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PI gate for /api/pb/* GETs.
// Private brain.db data (pomodoro, TODAY.md, relay, plan history) — PI only.
// Writes to /api/pb/* flow through the auth gate below; this middleware
// scopes the hard 403 to reads (matches original behavior at line 188).
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/pb/*', async (c, next) => {
  const env = c.get('env');
  if (c.req.method === 'GET' && !(await isPiRequest(c.req.raw, env))) {
    return error('Forbidden — PI access only', 403);
  }
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST/PUT auth gate + user resolution.
// If REQUIRE_AUTH=1 and neither a CF Access JWT nor a valid API key is
// present, return 401. Otherwise fall back to the anonymous "Team Member"
// identity (preserves pre-launch PI-only behavior).
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  if (c.req.method !== 'POST' && c.req.method !== 'PUT') {
    await next();
    return;
  }
  const env = c.get('env');
  const authedUser = c.get('authedUser');
  const hasApiKey = c.get('apiKeyValid') === true;
  const requireAuth = (env as unknown as { REQUIRE_AUTH?: string }).REQUIRE_AUTH === '1';
  if (requireAuth && !authedUser && !hasApiKey) {
    return error('Authentication required', 401);
  }
  c.set('user', authedUser || { email: 'anonymous', name: 'Team Member' });
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Version bump + realtime notify (runs AFTER handler).
// Any successful non-GET response triggers a fire-and-forget version bump
// (React Query uses /api/version to invalidate) and a DO broadcast to
// PartySocket clients. Matches the original withVersionBump wrapper.
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  await next();
  const method = c.req.method;
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return;
  const res = c.res;
  if (!res || res.status < 200 || res.status >= 300) return;
  const env = c.get('env');
  await Promise.all([
    bumpVersion(env.DB).catch(() => {}),
    notifyClients(env, 'data').catch(() => {}),
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: tiny shim to call route handlers that expect (env) or (url, env).
// We pull the swapped env off the context consistently. Every handler here
// is imported from ./routes/* and unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const E = (c: Context<AppEnv>) => c.get('env');
const U = (c: Context<AppEnv>) => new URL(c.req.url);
const R = (c: Context<AppEnv>) => c.req.raw;
const USER = (c: Context<AppEnv>) => c.get('user');

// ─────────────────────────────────────────────────────────────────────────────
// Meta + auth endpoints
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/auth/me', async (c) => {
  const env = E(c);
  const user = c.get('authedUser') || (await getAuthUser(c.req.raw, env));
  if (!user) return json({ authenticated: false }, 200);
  const piEmails = await getPiEmails(env);
  const isPi = piEmails.has(user.email.toLowerCase());
  return json({ authenticated: true, isPi, ...user });
});

app.get('/api/version', (c) => handleVersion(E(c)));

app.get('/api/health', async (c) => {
  const env = E(c);
  const failures: string[] = [];
  const checks: Record<string, unknown> = {};
  const t0 = Date.now();

  try {
    const r = await env.DB.prepare("SELECT COUNT(*) as n FROM tasks WHERE deleted_at IS NULL").first<{ n: number }>();
    checks.tasks = r?.n ?? 0;
    if ((r?.n ?? 0) === 0) failures.push('tasks table empty');
  } catch (e) { failures.push(`tasks query: ${(e as Error).message.slice(0, 80)}`); }

  try {
    const r = await env.DB.prepare("SELECT COUNT(*) as n FROM projects").first<{ n: number }>();
    checks.projects = r?.n ?? 0;
    if ((r?.n ?? 0) === 0) failures.push('projects table empty');
  } catch (e) { failures.push(`projects query: ${(e as Error).message.slice(0, 80)}`); }

  try {
    const r = await env.DB.prepare("SELECT COUNT(*) as n FROM team_members WHERE slug IS NOT NULL").first<{ n: number }>();
    checks.team = r?.n ?? 0;
    if ((r?.n ?? 0) < 5) failures.push(`team_members has only ${r?.n ?? 0} rows (<5 suspicious)`);
  } catch (e) { failures.push(`team_members query: ${(e as Error).message.slice(0, 80)}`); }

  try {
    const r = await env.DB.prepare(
      "SELECT MAX(timestamp) as t FROM activity_log WHERE timestamp > datetime('now', '-14 days')"
    ).first<{ t: string | null }>();
    checks.last_activity = r?.t ?? null;
    if (!r?.t) failures.push('no activity in last 14 days — pipeline may be stalled');
  } catch (e) { failures.push(`activity query: ${(e as Error).message.slice(0, 80)}`); }

  const hub = (env as unknown as { NOTIFICATION_HUB?: { fetch?: (u: string) => Promise<Response> } }).NOTIFICATION_HUB;
  if (hub && typeof hub.fetch === 'function') {
    try {
      const r = await hub.fetch('https://hub-realtime.local/health');
      checks.realtime = r.status;
      if (r.status >= 500) failures.push(`realtime ${r.status}`);
    } catch (e) { checks.realtime = `probe_error: ${(e as Error).message.slice(0, 40)}`; }
  } else {
    checks.realtime = 'not_bound';
  }

  checks.duration_ms = Date.now() - t0;
  const ok = failures.length === 0;
  return new Response(JSON.stringify({ ok, checks, failures, timestamp: new Date().toISOString() }, null, 2), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PB sector GETs (PI-gated by middleware above)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pb/command-center', (c) => handleCommandCenter(E(c), U(c).searchParams.get('date') || undefined));
app.get('/api/pb/plan/history', (c) => handlePlanHistory(R(c), E(c)));
app.get('/api/pb/dispatch/pending', (c) => handleGetPendingDispatch(E(c)));
app.get('/api/pb/today', (c) => handleGetTodayMd(E(c)));
app.get('/api/pb/sessions', (c) => handlePBSessions(R(c), E(c)));
app.get('/api/pb/sessions/stats', (c) => handlePBSessionStats(E(c)));
app.get('/api/pb/health', (c) => handlePBHealth(E(c)));
app.get('/api/pb/relay', (c) => handleGetRelay(E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// PI Analytics
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/pi/analytics', (c) => handlePIAnalytics(E(c)));
app.get('/api/analytics/pi-dashboard', (c) => handlePIDashboard(E(c)));
app.get('/api/analytics/mentee-velocity', (c) => handleMenteeVelocity(E(c)));
app.get('/api/analytics/response-time', (c) => handleResponseTime(E(c)));
app.get('/api/analytics/team-engagement', (c) => handleTeamEngagement(E(c)));
app.get('/api/analytics/contributions', (c) => handleContributionsDecay(U(c), E(c)));
app.get('/api/team/by-expertise', (c) => handleTeamByExpertise(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Digest (specific first, catch-all last)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/digest/dates', (c) => handleDigestDates(E(c)));
app.get('/api/digest/comment-counts', (c) => handleDigestCommentCounts(U(c), E(c)));
app.get('/api/digest', (c) => handleDigest(U(c), E(c)));
app.get('/api/digest/:id/comments', (c) => handleGetDigestComments(c.req.param('id'), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Project Insight Engine
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/insights/connections', (c) => handleInsightConnections(E(c)));
app.get('/api/insights/suggestions', (c) => handleInsightSuggestions(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Papers
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/papers/by-project', (c) => handlePapersByProject(U(c), E(c)));
app.get('/api/papers/by-publication', (c) => handlePapersByPublication(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Projects (ordering matters: revisions > papers > dependencies > :slug etc.)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/projects/health', (c) => handleProjectHealth(E(c)));
// Tombstone endpoint — consumed by sync_d1_pull.pull_hub_projects to mirror
// Hub project deletes into brain.db. Airtable cascade comment: handleDeleteProject
// writes deleted_at and (when secrets present) DELETEs the matching Airtable rec.
app.get('/api/projects/deleted-since', (c) => handleGetDeletedProjectsSince(U(c), E(c)));
app.get('/api/projects/:slug/comments', (c) => handleGetComments(c.req.param('slug'), E(c)));
app.get('/api/projects/:slug/updates', (c) => handleGetProjectUpdates(c.req.param('slug'), E(c)));
app.get('/api/projects/:slug/documents', (c) => handleGetProjectDocuments(c.req.param('slug'), E(c)));
app.get('/api/projects/:slug/papers', (c) => handleGetPaperLinks(c.req.param('slug'), E(c)));
app.get('/api/projects/:slug/dependencies', (c) => handleGetProjectDependencies(c.req.param('slug'), E(c)));
app.get('/api/projects/:slug/revisions', async (c) => {
  const ref = c.req.param('slug');
  const env = E(c);
  const proj = await env.DB.prepare(
    'SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1'
  ).bind(ref, ref).first<{ id: string; slug: string | null }>();
  if (!proj) return json({ data: [] });
  const projectId = proj.slug || proj.id;
  const rewrittenUrl = new URL(c.req.url);
  rewrittenUrl.searchParams.set('project_id', projectId);
  return handleGetRevisions(rewrittenUrl, env);
});
app.get('/api/projects', (c) => handleProjects(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Meetings (specific first, parameterized last)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/meetings/cadence-check', (c) => handleCadenceCheck(E(c)));
app.get('/api/meetings/next', (c) => handleNextMeeting(E(c)));
app.get('/api/meetings/:id/agenda', (c) => handleGetAgendaItems(c.req.param('id'), E(c)));
app.get('/api/meetings/:id/generate-agenda', (c) => handleGenerateAgenda(c.req.param('id'), E(c)));
app.get('/api/meetings/:id/prep', (c) => handleMeetingPrep(c.req.param('id'), E(c)));
app.get('/api/meetings/:id', (c) => handleGetMeeting(c.req.param('id'), E(c)));
app.get('/api/meetings', (c) => handleMeetings(E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/dependencies', (c) => handleGetDependencies(E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Revisions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/revisions/active', (c) => handleGetActiveRevisions(E(c)));
app.get('/api/revisions/:id/comments', (c) => handleGetRevisionComments(c.req.param('id'), E(c)));
app.get('/api/revisions', (c) => handleGetRevisions(U(c), E(c)));
app.get('/api/manuscripts/attention', async (c) => {
  const env = E(c);
  const user = c.get('authedUser') || (await getAuthUser(c.req.raw, env));
  if (!user) return c.json({ error: 'auth required' }, 401);
  return handleAttentionManuscripts(U(c), user, env);
});

// ─────────────────────────────────────────────────────────────────────────────
// Submissions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/submissions/active', (c) => handleGetActiveSubmissions(E(c)));
app.get('/api/submissions', (c) => handleGetSubmissions(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Grants
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/grants/similar', (c) => handleSimilarGrants(U(c), E(c)));
app.get('/api/grants/timeline', (c) => handleGrantsTimeline(E(c)));
app.get('/api/grants', (c) => handleGrants(E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Narratives
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/narratives', (c) => handleNarratives(E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/decisions/similar', (c) => handleSimilarDecisions(U(c), E(c)));
app.get('/api/decisions/similar-by-id', (c) => handleSimilarDecisionsById(U(c), E(c)));
app.get('/api/decisions/review', (c) => handleGetDecisionsNeedingReview(E(c)));
app.get('/api/decisions/tags', (c) => handleGetDecisionTags(E(c)));
app.get('/api/decisions', (c) => handleGetDecisions(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Expertise
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/expertise/suggest', (c) => handleSuggestExperts(U(c), E(c)));
app.get('/api/expertise', (c) => handleGetExpertise(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// AI requests
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/ai-requests', (c) => handleGetAIRequests(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Questions (specific /:id/answers BEFORE catch-all /:id)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/questions', (c) => handleGetQuestions(U(c), E(c)));
app.get('/api/questions/:id/answers', async (c) => {
  const env = E(c);
  const rows = await env.DB.prepare(
    'SELECT * FROM lab_answers WHERE question_id = ? ORDER BY is_accepted DESC, created_at ASC'
  ).bind(c.req.param('id')).all();
  return json({ data: rows.results || [] });
});
app.get('/api/questions/:id', (c) => handleGetQuestionDetail(c.req.param('id'), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Simple exact-match GETs
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/publications', (c) => handlePublications(U(c), E(c)));
app.get('/api/team', (c) => handleTeam(E(c)));
app.get('/api/team/slugs', (c) => handleTeamSlugs(E(c)));
app.get('/api/team/pulse', (c) => handleTeamPulse(U(c), E(c)));
app.get('/api/graph/collaboration', (c) => handleCollaborationGraph(E(c)));
app.get('/api/stats', (c) => handleStats(E(c)));
app.get('/api/activity', (c) => handleActivity(U(c), E(c)));
app.get('/api/activity/heatmap', (c) => handleActivityHeatmap(U(c), E(c)));
app.get('/api/tasks/overdue-count', (c) => handleOverdueCount(U(c), E(c)));
app.get('/api/tasks', (c) => handleTasks(U(c), E(c)));
app.get('/api/action-items', (c) => handleActionItems(U(c), E(c)));
app.get('/api/updates/recent', (c) => handleRecentUpdates(U(c), E(c)));
app.get('/api/task-updates/recent', (c) => handleGetRecentTaskUpdates(U(c), E(c)));
app.get('/api/task-comments/recent', async (c) => {
  const url = U(c);
  const env = E(c);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);
  const since = url.searchParams.get('since');
  const q = since
    ? 'SELECT * FROM task_comments WHERE created_at > ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM task_comments ORDER BY created_at DESC LIMIT ?';
  const result = since
    ? await env.DB.prepare(q).bind(since, limit).all()
    : await env.DB.prepare(q).bind(limit).all();
  return json({ data: result.results || [] });
});
app.get('/api/notifications', (c) => handleNotifications(U(c), R(c), E(c)));
app.get('/api/notifications/count', (c) => handleNotificationCount(U(c), R(c), E(c)));
app.get('/api/commitments', (c) => handleCommitments(U(c), E(c)));
app.get('/api/ideas', (c) => handleIdeas(U(c), E(c)));
app.get('/api/inbox', (c) => handleGetInbox(U(c), E(c)));
app.get('/api/search', (c) => handleSearch(U(c), E(c)));
app.get('/api/settings', (c) => handleGetSettings(E(c)));
app.get('/api/workflow-templates', (c) => handleGetWorkflowTemplates(E(c)));
app.get('/api/calendar/events', (c) => handleCalendarEvents(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Files (presigned URLs etc.)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/files', (c) => handleListFiles(U(c), E(c)));
// GET /api/files/:key+ — presigned download URL. Key can contain slashes
// (R2 key paths). Hono's wildcard match in the URL `:*` isn't used because
// we need the full rest-of-path as a single string — match regex-style.
app.get('/api/files/:rest{.+}', (c) => {
  const key = c.req.param('rest');
  return handleGetFile(key, E(c));
});

// ─────────────────────────────────────────────────────────────────────────────
// Team subroutes
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/team/:slug/cv-data', (c) => handleCVData(c.req.param('slug'), E(c)));
app.get('/api/team/:slug/trajectory', (c) => handleTrajectory(c.req.param('slug'), E(c)));
app.get('/api/team/:slug/contributions', (c) => handleContributions(c.req.param('slug'), U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Deadline cascade
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/deadline-cascade/all', (c) => handleGetAllCascades(E(c)));
app.get('/api/deadline-cascade/impact', (c) => handleGetImpact(U(c), E(c)));
app.get('/api/deadline-cascade', (c) => handleGetCascade(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Mentee milestones
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/mentee-milestones/overview', (c) => handleMenteeMilestoneOverview(E(c)));
app.get('/api/mentee-milestones', (c) => handleMenteeMilestones(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Milestones (project + grant share a handler for listing)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/milestones', (c) => handleGetMilestones(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Grant post-award milestones
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/grant-milestones/upcoming', (c) => handleUpcomingGrantMilestones(U(c), E(c)));
app.get('/api/grant-milestones', (c) => handleGrantMilestones(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/regulatory/expiring', (c) => handleGetExpiringItems(U(c), E(c)));
app.get('/api/regulatory/:id/ics', (c) => handleRegulatoryIcs(c.req.param('id'), E(c)));
app.get('/api/regulatory', (c) => handleGetRegulatoryItems(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Conferences
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/conferences/upcoming', (c) => handleGetUpcomingConferences(E(c)));
app.get('/api/conferences', (c) => handleGetConferences(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Email drafts (reads)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/email-drafts', (c) => handleGetEmailDrafts(R(c), E(c), U(c)));
app.get('/api/email-drafts/pending', (c) => handleGetPendingDrafts(R(c), E(c), U(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Proactive brief / digest preview / file activity
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/proactive-brief', (c) => handleProactiveBrief(R(c), E(c)));
app.get('/api/digest-preview', (c) => handleDigestPreview(U(c), E(c)));
// /api/file-activity/heatmap (and potentially future subpaths) — the original
// used pathname.match(/^\/api\/file-activity\/heatmap/), so we preserve the
// prefix behavior with an explicit route on the exact path. No other
// subpaths existed, so a wildcard match isn't necessary.
app.get('/api/file-activity/heatmap', (c) => handleGetFileActivity(R(c), E(c), U(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Reactions (read)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/reactions', (c) => handleGetReactions(U(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Task sub-resource GETs
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tasks/:id/comments', (c) => handleGetTaskComments(c.req.param('id'), E(c)));
app.get('/api/tasks/:id/files', async (c) => {
  const env = E(c);
  const { results } = await env.DB.prepare(
    'SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(c.req.param('id')).all();
  return json({ data: results });
});
app.get('/api/tasks/:id/updates', (c) => handleGetTaskUpdates(c.req.param('id'), E(c)));
app.get('/api/tasks/:id/activity', (c) => handleGetTaskActivity(c.req.param('id'), E(c)));
app.get('/api/tasks/:id/detail', (c) => handleGetTaskDetail(c.req.param('id'), E(c)));
app.get('/api/tasks/:id/subtasks', (c) => handleGetSubtasks(c.req.param('id'), E(c)));
app.get('/api/tasks/:id/handoffs', (c) => handleGetHandoffs(c.req.param('id'), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// ── Writes (POST / PUT / PATCH) ──────────────────────────────────────────────
// Ordering still matters — specific paths BEFORE catch-alls. See comments in
// original index.ts for rationale (e.g. /api/tasks/batch before /api/tasks/:id).
// ─────────────────────────────────────────────────────────────────────────────

// Uploads
app.post('/api/upload/url', (c) => handleUploadUrl(R(c), USER(c), E(c)));
app.post('/api/upload/done', (c) => handleUploadDone(R(c), USER(c), E(c)));
app.post('/api/files/:id/delete', (c) => handleDeleteFile(c.req.param('id'), E(c)));

// Projects (specific first)
app.post('/api/projects', (c) => handleCreateProject(R(c), USER(c), E(c)));
app.post('/api/projects/:slug/delete', (c) => handleDeleteProject(c.req.param('slug'), USER(c), E(c), U(c)));
app.post('/api/projects/:slug/comments', (c) => handleAddComment(c.req.param('slug'), R(c), USER(c), E(c)));
app.post('/api/projects/:slug/updates', (c) => handlePostProjectUpdate(c.req.param('slug'), R(c), USER(c), E(c)));
app.post('/api/projects/:slug/documents', (c) => handleCreateProjectDocument(c.req.param('slug'), R(c), USER(c), E(c)));
app.post('/api/projects/:slug/documents/:docId/delete', (c) => handleDeleteProjectDocument(c.req.param('docId'), E(c)));
app.post('/api/projects/:slug', (c) => handleUpdateProject(c.req.param('slug'), R(c), USER(c), E(c)));

// Team
app.put('/api/team/:slug', (c) => handleUpdateTeamMember(c.req.param('slug'), R(c), USER(c), E(c)));

// Tasks — specific-before-generic
app.post('/api/tasks/sync-bulk', (c) => handleSyncBulkTasks(R(c), USER(c), E(c)));
app.post('/api/tasks/batch', (c) => handleBatchUpdateTasks(R(c), USER(c), E(c)));
app.post('/api/tasks/:id/delete', (c) => handleDeleteTask(c.req.param('id'), USER(c), E(c)));
app.post('/api/tasks/:id/acknowledge', (c) => handleAcknowledgeTask(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/status', (c) => handleUpdateTaskStatus(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/comments', (c) => handleAddTaskComment(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/updates', (c) => handlePostTaskUpdate(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/subtasks/reorder', (c) => handleReorderSubtasks(c.req.param('id'), R(c), E(c)));
app.post('/api/tasks/:id/subtasks', (c) => handleCreateSubtask(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/handoffs', (c) => handleCreateHandoff(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks/:id/files', async (c) => {
  const env = E(c);
  const user = USER(c);
  const id = c.req.param('id');
  const body = await c.req.json() as { filename: string; url: string; file_type?: string };
  const newId = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    'INSERT INTO task_files (id, task_id, filename, url, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newId, id, body.filename, body.url, body.file_type || 'link', user.email).run();
  return json({ data: { id: newId, task_id: id, filename: body.filename, url: body.url } });
});
app.post('/api/tasks/:id', (c) => handleUpdateTask(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/tasks', (c) => handleCreateTask(R(c), USER(c), E(c)));
app.post('/api/sync/mobile-tasks-to-hub', (c) => handleMobileTasksToHub(R(c), USER(c), E(c)));

// Task-files (deletion uses the legacy /api/task-files/:id/delete path)
app.post('/api/task-files/:id/delete', async (c) => {
  const env = E(c);
  await env.DB.prepare('DELETE FROM task_files WHERE id = ?').bind(c.req.param('id')).run();
  return json({ data: { deleted: c.req.param('id') } });
});

// Subtasks
app.post('/api/subtasks/:id/toggle', (c) => handleToggleSubtask(c.req.param('id'), USER(c), E(c)));
app.post('/api/subtasks/:id/delete', (c) => handleDeleteSubtask(c.req.param('id'), E(c)));

// Action items (backward compat)
app.post('/api/action-items/:id/toggle', (c) => handleToggleTask(c.req.param('id'), USER(c), E(c)));
app.post('/api/action-items', (c) => handleCreateTask(R(c), USER(c), E(c)));

// Meetings
app.post('/api/meetings', (c) => handleCreateMeeting(R(c), USER(c), E(c)));
app.post('/api/meetings/:id/notes', (c) => handleUpdateMeetingNotes(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/meetings/:id/agenda/reorder', (c) => handleReorderAgenda(c.req.param('id'), R(c), E(c)));
app.post('/api/meetings/:id/agenda', (c) => handleAddAgendaItem(c.req.param('id'), R(c), USER(c), E(c)));

// Milestones
app.post('/api/milestones/:id/note', (c) => handleUpdateMilestoneNote(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/milestones/:id/complete', (c) => handleUpdateMilestoneCompletion(c.req.param('id'), R(c), USER(c), E(c)));

// Commitments
app.post('/api/commitments', (c) => handleCreateCommitment(R(c), E(c)));

// Notifications
app.post('/api/notifications/read-all', async (c) => {
  const env = E(c);
  const user = USER(c);
  let recipient = user.email.split('@')[0];
  try {
    const body = await c.req.json() as Record<string, string>;
    if (body.recipient) recipient = body.recipient;
  } catch {}
  return handleMarkAllNotificationsRead(recipient, env);
});
app.post('/api/notifications/:id/read', (c) => handleMarkNotificationRead(c.req.param('id'), E(c)));

// Reactions
app.post('/api/reactions', (c) => handleToggleReaction(R(c), USER(c), E(c)));

// Publications
app.post('/api/publications', async (c) => {
  const env = E(c);
  const body = await c.req.json() as { title: string; authors: string; journal?: string; year?: number; doi?: string; pubmed?: string; abstract?: string; topics?: string[]; status?: string };
  const id = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    `INSERT INTO publications (id, title, authors, journal, year, doi, pubmed, abstract, topics, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, body.title, body.authors, body.journal || null, body.year || null, body.doi || null, body.pubmed || null, body.abstract || null, JSON.stringify(body.topics || []), body.status || 'Published').run();
  return json({ data: { id, title: body.title } });
});

// Handoffs
app.post('/api/handoffs/:id/acknowledge', (c) => handleAcknowledgeHandoff(c.req.param('id'), USER(c), E(c)));

// Settings
app.post('/api/settings', (c) => handleUpdateSettings(R(c), E(c)));
app.post('/api/workflow-templates', (c) => handleCreateWorkflowTemplate(R(c), E(c)));

// Ideas
app.post('/api/ideas', (c) => handleCreateIdea(R(c), USER(c), E(c)));
app.post('/api/ideas/:id/vote', (c) => handleVoteIdea(c.req.param('id'), E(c)));
app.post('/api/ideas/:id', (c) => handleUpdateIdea(c.req.param('id'), R(c), USER(c), E(c)));

// Inbox
app.post('/api/inbox', (c) => handlePostInbox(R(c), USER(c), E(c)));
app.post('/api/inbox/sync', (c) => handleMarkSynced(R(c), E(c)));

// Bug report. Once REQUIRE_AUTH is flipped on (team launch), require an
// authed user OR API key — bug reports create real GitHub Issues and a
// stranger could otherwise spam the repo. Until then, accept anonymous
// reports so Nick (sole pre-launch user, can't yet sign in via CF Access)
// can submit. Pattern mirrors the rest of /api: writes are anonymous-OK
// pre-launch, gated post-launch via REQUIRE_AUTH=1.
app.post('/api/bug-report', async (c) => {
  const env = E(c);
  const requireAuth = (env as unknown as { REQUIRE_AUTH?: string }).REQUIRE_AUTH === '1';
  if (requireAuth) {
    const authed = c.get('authedUser');
    const hasApiKey = Boolean(c.req.header('X-API-Key'));
    if (!authed && !hasApiKey) return error('Authentication required to file a bug', 401);
  }
  return handleBugReport(c.req.raw, env);
});

// Digest
app.post('/api/digest', (c) => handleCreateDigestPaper(R(c), E(c)));
app.post('/api/digest/:id/comments', (c) => handleCreateDigestComment(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/digest/:id/status', (c) => handleUpdateDigestStatus(c.req.param('id'), R(c), USER(c), E(c)));

// Paper links
app.post('/api/paper-links', (c) => handleLinkPaper(R(c), USER(c), E(c)));
app.post('/api/paper-links/:id/delete', (c) => handleUnlinkPaper(c.req.param('id'), E(c)));

// Dependencies
app.post('/api/dependencies', (c) => handleCreateDependency(R(c), USER(c), E(c)));
app.post('/api/dependencies/:id/delete', (c) => handleDeleteDependency(c.req.param('id'), E(c)));

// Decisions
app.post('/api/decisions', (c) => handleCreateDecision(R(c), USER(c), E(c)));
app.post('/api/decisions/:id/outcome', (c) => handleUpdateDecisionOutcome(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/decisions/:id/update', (c) => handleUpdateDecision(c.req.param('id'), R(c), USER(c), E(c)));

// Expertise
app.post('/api/expertise', (c) => handleAddExpertise(R(c), USER(c), E(c)));
app.post('/api/expertise/:id/delete', (c) => handleRemoveExpertise(c.req.param('id'), E(c)));

// Questions / Answers
app.post('/api/questions', (c) => handleCreateQuestion(R(c), USER(c), E(c)));
app.post('/api/questions/:id/answers', (c) => handleCreateAnswer(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/answers/:id/accept', (c) => handleAcceptAnswer(c.req.param('id'), USER(c), E(c)));

// AI requests
app.post('/api/ai-requests', (c) => handleCreateAIRequest(R(c), USER(c), E(c)));
app.post('/api/ai-requests/:id/response', (c) => handleUpdateAIResponse(c.req.param('id'), R(c), E(c)));

// PB sector writes
app.post('/api/pb/capture', (c) => handlePBCapture(R(c), USER(c), E(c)));
app.post('/api/pb/defer', (c) => handlePBDefer(R(c), E(c)));
app.post('/api/pb/plan', (c) => handleCreateOrUpdatePlan(R(c), USER(c), E(c)));
app.post('/api/pb/plan/reorder', (c) => handleReorderPlan(R(c), E(c)));
app.post('/api/pb/plan/promote', (c) => handlePromoteTask(R(c), E(c)));
app.post('/api/pb/pomodoro/start', (c) => handleStartPomodoro(R(c), USER(c), E(c)));
app.post('/api/pb/pomodoro/complete', (c) => handleCompletePomodoro(R(c), USER(c), E(c)));
app.post('/api/pb/reflection', (c) => handleSaveReflection(R(c), USER(c), E(c)));
app.post('/api/pb/dispatch/add', (c) => handleAddToDispatch(R(c), USER(c), E(c)));
app.post('/api/pb/dispatch/send', (c) => handleSendDispatch(R(c), USER(c), E(c)));
app.post('/api/pb/dispatch/complete', (c) => handleCompleteDispatchItem(R(c), E(c)));
app.post('/api/pb/sessions', (c) => handleCreatePBSession(R(c), USER(c), E(c)));
app.post('/api/pb/sessions/bulk', (c) => handleBulkCreatePBSessions(R(c), USER(c), E(c)));
app.post('/api/pb/today', (c) => handleUpsertTodayMd(R(c), E(c)));
app.post('/api/pb/relay', (c) => handleCreateRelay(R(c), USER(c), E(c)));
// Relay completion uses a numeric index in the path — Hono matches :index
// against one URL segment. Original regex was /^\/api\/pb\/relay\/\d+\/complete$/;
// we rely on `parseInt` + NaN guard since a non-digit segment would have fallen
// through to 404 in the original anyway.
app.post('/api/pb/relay/:index/complete', (c) => {
  const index = parseInt(c.req.param('index'), 10);
  if (Number.isNaN(index)) return error('Not found', 404);
  return handleCompleteRelay(R(c), E(c), index);
});

// Impact check
app.post('/api/impact/check', (c) => handleCheckImpact(E(c)));

// Revisions (specific /:id/comments BEFORE /:id)
app.post('/api/revisions', (c) => handleCreateRevision(R(c), USER(c), E(c)));
app.post('/api/revisions/comments/:id', (c) => handleUpdateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/revisions/:id/comments', (c) => handleCreateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/revisions/:id', (c) => handleUpdateRevision(c.req.param('id'), R(c), USER(c), E(c)));

// Submissions
app.post('/api/submissions', (c) => handleCreateSubmission(R(c), USER(c), E(c)));
app.post('/api/submissions/:id/delete', (c) => handleDeleteSubmission(c.req.param('id'), USER(c), E(c)));
app.post('/api/submissions/:id', (c) => handleUpdateSubmission(c.req.param('id'), R(c), USER(c), E(c)));

// Mentee milestones
app.post('/api/mentee-milestones', (c) => handleCreateMenteeMilestone(R(c), USER(c), E(c)));
app.post('/api/mentee-milestones/:id/complete', (c) => handleCompleteMenteeMilestone(c.req.param('id'), USER(c), E(c)));
app.post('/api/mentee-milestones/:id', (c) => handleUpdateMenteeMilestone(c.req.param('id'), R(c), USER(c), E(c)));

// Grant post-award milestones
app.post('/api/grant-milestones', (c) => handleCreateGrantMilestone(R(c), USER(c), E(c)));
app.post('/api/grant-milestones/:id/complete', (c) => handleCompleteGrantMilestone(c.req.param('id'), USER(c), E(c)));
app.post('/api/grant-milestones/:id', (c) => handleUpdateGrantMilestone(c.req.param('id'), R(c), USER(c), E(c)));

// Grants (PATCH only — R10 inline editing)
app.patch('/api/grants/:id', (c) => handleUpdateGrant(c.req.param('id'), R(c), E(c)));

// Regulatory
app.post('/api/regulatory', (c) => handleCreateRegulatoryItem(R(c), USER(c), E(c)));
app.post('/api/regulatory/:id/renew', (c) => handleRenewRegulatoryItem(c.req.param('id'), R(c), USER(c), E(c)));
app.post('/api/regulatory/:id', (c) => handleUpdateRegulatoryItem(c.req.param('id'), R(c), USER(c), E(c)));

// Conferences
app.post('/api/conferences', (c) => handleCreateConference(R(c), USER(c), E(c)));
app.post('/api/conferences/:id/delete', (c) => handleDeleteConference(c.req.param('id'), USER(c), E(c)));
app.post('/api/conferences/:id', (c) => handleUpdateConference(c.req.param('id'), R(c), USER(c), E(c)));

// Deadline dependencies
app.post('/api/deadline-dependencies', (c) => handleCreateDeadlineDependency(R(c), USER(c), E(c)));
app.post('/api/deadline-dependencies/:id/delete', (c) => handleDeleteDeadlineDependency(c.req.param('id'), E(c)));

// Digest email
app.post('/api/digest-email', (c) => handleGenerateDigestEmail(R(c), E(c)));
app.post('/api/digest-email/send', (c) => handleSendDigestEmail(R(c), E(c)));
app.post('/api/digest-email/daily', (c) => handleSendDailyDigests(E(c)));

// Email drafts sync
app.post('/api/email-drafts/sync-bulk', (c) => handleSyncEmailDrafts(R(c), E(c)));

// File activity sync
app.post('/api/file-activity/sync', (c) => handleSyncFileActivity(R(c), E(c)));

// ─────────────────────────────────────────────────────────────────────────────
// Admin / test-cleanup — verbatim port of the original inline handlers.
// Kept inline because each version branch issues specific ALTER / CREATE
// statements — extracting into a route module would mean duplicating the
// giant body with no readability win.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/admin/migrate', async (c) => {
  const env = E(c);
  const body = await c.req.json() as { version: number };
  if (body.version === 22) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN updated_at TEXT').run(); results.push('added updated_at'); } catch { results.push('updated_at already exists'); }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN deleted_at TEXT').run(); results.push('added deleted_at'); } catch { results.push('deleted_at already exists'); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)').run(); results.push('created index'); } catch (e) { results.push(`index error: ${e}`); }
    await env.DB.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE updated_at IS NULL").run();
    results.push('backfilled updated_at');
    return json({ data: { version: 22, results } });
  }
  if (body.version === 23) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS manuscript_revisions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          round INTEGER NOT NULL DEFAULT 1,
          submitted_at TEXT,
          response_due TEXT,
          status TEXT DEFAULT 'in_progress',
          journal TEXT,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created manuscript_revisions');
    } catch (e) { results.push(`manuscript_revisions: ${e}`); }
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS reviewer_comments (
          id TEXT PRIMARY KEY,
          revision_id TEXT NOT NULL,
          reviewer_number INTEGER DEFAULT 1,
          comment_text TEXT NOT NULL,
          assigned_to TEXT DEFAULT 'nick-ingraham',
          status TEXT DEFAULT 'pending',
          response_text TEXT,
          resolved_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (revision_id) REFERENCES manuscript_revisions(id) ON DELETE CASCADE
        )
      `).run();
      results.push('created reviewer_comments');
    } catch (e) { results.push(`reviewer_comments: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_revisions_project ON manuscript_revisions(project_id)').run(); results.push('created idx_revisions_project'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_comments_revision ON reviewer_comments(revision_id)').run(); results.push('created idx_comments_revision'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 23, results } });
  }
  if (body.version === 24) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS mentee_milestones (
          id TEXT PRIMARY KEY,
          mentee_slug TEXT NOT NULL,
          milestone_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          due_date TEXT,
          completed_at TEXT,
          status TEXT DEFAULT 'upcoming',
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created mentee_milestones');
    } catch (e) { results.push(`mentee_milestones: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mentee_milestones_mentee ON mentee_milestones(mentee_slug)').run(); results.push('created idx_mentee_milestones_mentee'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mentee_milestones_due ON mentee_milestones(due_date)').run(); results.push('created idx_mentee_milestones_due'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mentee_milestones_status ON mentee_milestones(status)').run(); results.push('created idx_mentee_milestones_status'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 24, results } });
  }
  if (body.version === 25) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS deadline_dependencies (
          id TEXT PRIMARY KEY,
          upstream_id TEXT NOT NULL,
          upstream_type TEXT NOT NULL,
          downstream_id TEXT NOT NULL,
          downstream_type TEXT NOT NULL,
          lag_days INTEGER DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created deadline_dependencies');
    } catch (e) { results.push(`deadline_dependencies: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deadline_deps_upstream ON deadline_dependencies(upstream_id)').run(); results.push('created idx_deadline_deps_upstream'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_deadline_deps_downstream ON deadline_dependencies(downstream_id)').run(); results.push('created idx_deadline_deps_downstream'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 25, results } });
  }
  if (body.version === 26) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS submission_events (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_date TEXT NOT NULL,
          journal TEXT,
          notes TEXT,
          deleted_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created submission_events');
    } catch (e) { results.push(`submission_events: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_submission_events_project ON submission_events(project_id)').run(); results.push('created idx_submission_events_project'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_submission_events_date ON submission_events(event_date)').run(); results.push('created idx_submission_events_date'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_submission_events_type ON submission_events(event_type)').run(); results.push('created idx_submission_events_type'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 26, results } });
  }
  if (body.version === 27) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS regulatory_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          item_type TEXT NOT NULL,
          title TEXT NOT NULL,
          protocol_number TEXT,
          approved_date TEXT,
          expiration_date TEXT,
          renewal_due TEXT,
          status TEXT DEFAULT 'active',
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created regulatory_items');
    } catch (e) { results.push(`regulatory_items: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_regulatory_project ON regulatory_items(project_id)').run(); results.push('created idx_regulatory_project'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_regulatory_expiration ON regulatory_items(expiration_date)').run(); results.push('created idx_regulatory_expiration'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_regulatory_status ON regulatory_items(status)').run(); results.push('created idx_regulatory_status'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 27, results } });
  }
  if (body.version === 28) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS conference_submissions (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          conference TEXT NOT NULL,
          conference_date TEXT,
          submission_type TEXT NOT NULL,
          title TEXT NOT NULL,
          authors TEXT,
          abstract_due TEXT,
          abstract_submitted_at TEXT,
          accepted_at TEXT,
          presentation_type TEXT,
          materials_status TEXT DEFAULT 'not_started',
          travel_booked INTEGER DEFAULT 0,
          notes TEXT,
          status TEXT DEFAULT 'planning',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created conference_submissions');
    } catch (e) { results.push(`conference_submissions: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conf_sub_project ON conference_submissions(project_id)').run(); results.push('created idx_conf_sub_project'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conf_sub_conference ON conference_submissions(conference)').run(); results.push('created idx_conf_sub_conference'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_conf_sub_status ON conference_submissions(status)').run(); results.push('created idx_conf_sub_status'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 28, results } });
  }
  if (body.version === 29) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS grant_milestones (
          id TEXT PRIMARY KEY,
          grant_id TEXT NOT NULL,
          milestone_type TEXT NOT NULL,
          title TEXT NOT NULL,
          due_date TEXT,
          completed_at TEXT,
          status TEXT DEFAULT 'upcoming',
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created grant_milestones');
    } catch (e) { results.push(`grant_milestones: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_grant_milestones_grant ON grant_milestones(grant_id)').run(); results.push('created idx_grant_milestones_grant'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_grant_milestones_due ON grant_milestones(due_date)').run(); results.push('created idx_grant_milestones_due'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_grant_milestones_status ON grant_milestones(status)').run(); results.push('created idx_grant_milestones_status'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 29, results } });
  }
  if (body.version === 30) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS pb_sessions (
          id TEXT PRIMARY KEY,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          machine TEXT,
          project_name TEXT,
          summary TEXT,
          actions_count INTEGER DEFAULT 0,
          commits_count INTEGER DEFAULT 0,
          duration_minutes INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      results.push('created pb_sessions');
    } catch (e) { results.push(`pb_sessions: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pb_sessions_started ON pb_sessions(started_at)').run(); results.push('created idx_pb_sessions_started'); } catch (e) { results.push(`index error: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pb_sessions_project ON pb_sessions(project_name)').run(); results.push('created idx_pb_sessions_project'); } catch (e) { results.push(`index error: ${e}`); }
    return json({ data: { version: 30, results } });
  }
  if (body.version === 31) {
    const results: string[] = [];
    try { await env.DB.prepare("ALTER TABLE daily_plans ADD COLUMN evening_task_ids TEXT").run(); results.push('added evening_task_ids'); } catch { results.push('evening_task_ids already exists'); }
    return json({ data: { version: 31, results } });
  }
  if (body.version === 32) {
    const results: string[] = [];
    try { await env.DB.prepare("ALTER TABLE paper_project_links ADD COLUMN link_type TEXT DEFAULT 'output'").run(); results.push('added link_type'); } catch { results.push('link_type already exists'); }
    return json({ data: { version: 32, results } });
  }
  if (body.version === 33) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN acknowledged_at TEXT').run(); results.push('added acknowledged_at'); } catch { results.push('acknowledged_at already exists'); }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN acknowledged_by TEXT').run(); results.push('added acknowledged_by'); } catch { results.push('acknowledged_by already exists'); }
    return json({ data: { version: 33, results } });
  }
  if (body.version === 34) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN watchers TEXT').run(); results.push('added watchers'); } catch { results.push('watchers already exists'); }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN reminder_days INTEGER').run(); results.push('added reminder_days'); } catch { results.push('reminder_days already exists'); }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN instructions TEXT').run(); results.push('added instructions'); } catch { results.push('instructions already exists'); }
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS task_files (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          url TEXT NOT NULL,
          file_type TEXT DEFAULT 'link',
          uploaded_by TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `).run();
      results.push('created task_files');
    } catch (e) { results.push(`task_files: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id)').run(); results.push('created index'); } catch (e) { results.push(`index: ${e}`); }
    return json({ data: { version: 34, results } });
  }
  if (body.version === 35) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN recurrence TEXT').run(); results.push('added recurrence'); } catch { results.push('recurrence already exists'); }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT').run(); results.push('added recurrence_parent_id'); } catch { results.push('recurrence_parent_id already exists'); }
    return json({ data: { version: 35, results } });
  }
  if (body.version === 36) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS task_updates (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          author_slug TEXT NOT NULL,
          content TEXT NOT NULL,
          update_type TEXT DEFAULT 'progress',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `).run();
      results.push('created task_updates');
    } catch (e) { results.push(`task_updates: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id)').run(); results.push('created task index'); } catch (e) { results.push(`task index: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_task_updates_created ON task_updates(created_at)').run(); results.push('created created_at index'); } catch (e) { results.push(`created_at index: ${e}`); }
    return json({ data: { version: 36, results } });
  }
  if (body.version === 38) {
    const results: string[] = [];
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS project_documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          doc_type TEXT DEFAULT 'link',
          created_at TEXT DEFAULT (datetime('now')),
          created_by TEXT,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        )
      `).run();
      results.push('created project_documents');
    } catch (e) { results.push(`project_documents: ${e}`); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id)').run(); results.push('created project index'); } catch (e) { results.push(`project index: ${e}`); }
    return json({ data: { version: 38, results } });
  }
  if (body.version === 41) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE team_members ADD COLUMN full_name TEXT').run(); results.push('added full_name'); } catch { results.push('full_name already exists'); }
    try { await env.DB.prepare('ALTER TABLE team_members ADD COLUMN preferred_name TEXT').run(); results.push('added preferred_name'); } catch { results.push('preferred_name already exists'); }
    return json({ data: { version: 41, results } });
  }
  if (body.version === 42) {
    const results: string[] = [];
    for (const col of ['key_link_1', 'key_link_1_desc', 'key_link_2', 'key_link_2_desc', 'key_link_3', 'key_link_3_desc']) {
      try { await env.DB.prepare(`ALTER TABLE projects ADD COLUMN ${col} TEXT`).run(); results.push(`added ${col}`); } catch { results.push(`${col} already exists`); }
    }
    return json({ data: { version: 42, results } });
  }
  if (body.version === 43) {
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE team_members ADD COLUMN email TEXT').run(); results.push('added email'); } catch { results.push('email already exists'); }
    try {
      const r = await env.DB.prepare("UPDATE team_members SET email = slug || '@umn.edu' WHERE email IS NULL AND slug IS NOT NULL").run();
      results.push(`backfilled ${r.meta?.changes ?? 0} rows`);
    } catch (e) { results.push(`backfill: ${e}`); }
    return json({ data: { version: 43, results } });
  }
  if (body.version === 44) {
    const results: string[] = [];
    try {
      const r = await env.DB.prepare(
        "INSERT OR IGNORE INTO lab_settings (key, value, updated_at) VALUES ('pi_emails', ?, datetime('now'))"
      ).bind('["ningraha@umn.edu","sandb029@umn.edu","nicholas.ingraham@gmail.com"]').run();
      results.push(`pi_emails seeded (changes=${r.meta?.changes ?? 0})`);
    } catch (e) { results.push(`pi_emails: ${e}`); }
    return json({ data: { version: 44, results } });
  }
  if (body.version === 45) {
    // v45 (2026-04-19): projects.deleted_at for soft-delete parity with tasks.
    // Enables Hub project delete -> brain.db mirror via /api/projects/deleted-since.
    const results: string[] = [];
    try { await env.DB.prepare('ALTER TABLE projects ADD COLUMN deleted_at TEXT').run(); results.push('added projects.deleted_at'); } catch { results.push('projects.deleted_at already exists'); }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL').run(); results.push('created idx_projects_deleted_at'); } catch (e) { results.push(`idx_projects_deleted_at: ${e}`); }
    return json({ data: { version: 45, results } });
  }
  return error(`Unknown migration version: ${body.version}`, 400);
});

app.post('/api/test-cleanup', async (c) => {
  const env = E(c);
  const prefixes = ['INSPECTION', 'DAILYTEST', 'EDGE', 'SYNC-', 'SYNCTEST', 'JOURNEY', 'KEYLINK TEST', 'AUDIT TEST', 'AUDIT-TEST', 'TIMEZONE-PROBE', 'DUE-DATE-PROBE', 'WORKFLOW-TEST', 'QA ', 'TEST-'];
  const likeClause = prefixes.map(() => 'content LIKE ?').join(' OR ');
  const titleLikeClause = prefixes.map(() => 'title LIKE ?').join(' OR ');
  const questionLikeClause = prefixes.map(() => 'question LIKE ?').join(' OR ');
  const bodyLikeClause = prefixes.map(() => 'body LIKE ?').join(' OR ');
  const topicLikeClause = prefixes.map(() => 'topic LIKE ?').join(' OR ');
  const wildcardPrefixes = prefixes.map(p => `${p}%`);
  const results: Record<string, number> = {};
  const tables = [
    { name: 'project_updates', col: 'content', clause: likeClause },
    { name: 'ideas', col: 'title', clause: titleLikeClause },
    { name: 'lab_questions', col: 'question', clause: questionLikeClause },
    { name: 'decision_log', col: 'title', clause: titleLikeClause },
    { name: 'notifications', col: 'body', clause: bodyLikeClause },
    { name: 'expertise_tags', col: 'topic', clause: topicLikeClause },
  ];
  for (const { name, clause } of tables) {
    try {
      const r = await env.DB.prepare(`DELETE FROM ${name} WHERE ${clause}`).bind(...wildcardPrefixes).run();
      results[name] = r.meta.changes ?? 0;
    } catch { results[name] = -1; }
  }
  return json({ data: results });
});

// ─────────────────────────────────────────────────────────────────────────────
// 404 fallback.
// Hono's default 404 returns a text "404 Not Found" response — override so
// clients get the same { error: "Not found" } JSON shape they got before.
// Method-not-allowed (405) on known paths with wrong verbs is already handled
// by Hono returning 404 for unmatched method+path; the original file was
// inconsistent here (returned 405 only for POST/PUT fallthrough), so we
// consolidate on 404 for every unmatched combo. If a caller depended on 405,
// they still get a 4xx — no silent 200.
// ─────────────────────────────────────────────────────────────────────────────
app.notFound(() => error('Not found', 404));

// ─────────────────────────────────────────────────────────────────────────────
// Default export: { fetch, scheduled } — matches Cloudflare Worker module shape.
// - fetch: Hono app, invoked by functions/api/[[route]].ts for all /api/* requests.
// - scheduled: verbatim copy of the original cron handler. Do NOT refactor —
//   it sends morning pulse emails via SendGrid + triggers the coordinator
//   daily digest. Breaking it breaks production email.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch.bind(app),

  // ── Scheduled: Morning Pulse Email ─────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.SENDGRID_API_KEY) {
      console.log('[Pulse] No SENDGRID_API_KEY configured — skipping email send');
      return;
    }

    console.log('[Pulse] Starting morning pulse email...');

    // Check for impact events first — creates notifications before we count unread
    try {
      const impactResult = await handleCheckImpact(env);
      const impactData = await impactResult.json() as { data: { notifications_created: number } };
      if (impactData.data.notifications_created > 0) {
        console.log(`[Pulse] Impact check created ${impactData.data.notifications_created} notifications`);
      }
    } catch (e) {
      console.log(`[Pulse] Impact check failed (non-fatal): ${e}`);
    }

    const members = await env.DB.prepare(
      'SELECT slug, name, email FROM team_members WHERE slug IS NOT NULL'
    ).all<{ slug: string; name: string; email: string | null }>();

    if (!members.results?.length) {
      console.log('[Pulse] No team members found');
      return;
    }

    let sent = 0;
    for (const member of members.results) {
      const email = member.email || `${member.slug}@umn.edu`;
      const firstName = member.name.split(' ')[0];

      // Get their pending action items
      const actions = await env.DB.prepare(
        'SELECT title, description, due_date, priority, status FROM tasks WHERE assignee = ? AND completed = 0 ORDER BY due_date ASC'
      ).bind(member.slug).all<{ description: string; due_date: string | null }>();

      // Get unread notifications
      const notifCount = await env.DB.prepare(
        'SELECT COUNT(*) as c FROM notifications WHERE recipient_slug = ? AND read = 0'
      ).bind(member.slug).first<{ c: number }>();

      // Get recent team activity (last 24 hours)
      const recentUpdates = await env.DB.prepare(
        "SELECT author, content, project_id FROM project_updates WHERE created_at > datetime('now', '-1 day') AND author != ? ORDER BY created_at DESC LIMIT 5"
      ).bind(member.slug).all<{ author: string; content: string; project_id: string }>();

      // Get milestones with Future Me notes due within 3 days
      const futureNotes = await env.DB.prepare(
        `SELECT m.title, m.target_date, m.future_note, m.future_note_author, g.mechanism
         FROM milestones m
         LEFT JOIN grants g ON m.grant_id = g.id
         WHERE m.future_note IS NOT NULL
           AND m.status != 'completed'
           AND m.target_date BETWEEN date('now') AND date('now', '+3 days')
         ORDER BY m.target_date ASC`
      ).all<{ title: string; target_date: string; future_note: string; future_note_author: string; mechanism: string | null }>();
      const futureNoteItems = futureNotes.results || [];

      // Only send if there's something to report
      const pendingItems = actions.results || [];
      const unread = notifCount?.c ?? 0;
      const updates = recentUpdates.results || [];

      if (pendingItems.length === 0 && unread === 0 && updates.length === 0 && futureNoteItems.length === 0) {
        continue; // Nothing to report for this person
      }

      // Build email body
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      let itemsHtml = '';

      if (pendingItems.length > 0) {
        itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Your Action Items</h3><ul style="padding-left:20px;">';
        for (const item of pendingItems) {
          const overdue = item.due_date && item.due_date < new Date().toISOString().slice(0, 10);
          const dueLabel = item.due_date
            ? `<span style="color:${overdue ? '#7a0019' : '#64748b'};font-size:12px;"> — ${overdue ? 'overdue' : 'due'} ${item.due_date}</span>`
            : '';
          itemsHtml += `<li style="margin-bottom:8px;font-size:14px;color:#0f1923;">${item.description.replace(/^\[Carried forward\]\s*/i, '')}${dueLabel}</li>`;
        }
        itemsHtml += '</ul>';
      }

      if (futureNoteItems.length > 0) {
        itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;border-left:3px solid #c9a84c;padding-left:8px;">Notes From Past You</h3>';
        for (const fn of futureNoteItems) {
          const label = fn.mechanism ? `${fn.mechanism}: ${fn.title}` : fn.title;
          itemsHtml += `<div style="margin:12px 0;padding:12px 14px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.15);border-left:3px solid #c9a84c;border-radius:8px;">`;
          itemsHtml += `<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0f1923;">${label} <span style="font-size:11px;font-weight:400;color:#64748b;">— due ${fn.target_date}</span></p>`;
          itemsHtml += `<p style="margin:0;font-size:13px;color:#0f1923;font-style:italic;line-height:1.5;">${fn.future_note}</p>`;
          itemsHtml += `</div>`;
        }
      }

      if (unread > 0) {
        itemsHtml += `<p style="font-size:14px;color:#0f1923;margin-top:16px;">You have <strong style="color:#c9a84c;">${unread}</strong> unread notification${unread > 1 ? 's' : ''} on the Hub.</p>`;
      }

      if (updates.length > 0) {
        itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Team Activity</h3><ul style="padding-left:20px;">';
        for (const u of updates) {
          itemsHtml += `<li style="margin-bottom:6px;font-size:13px;color:#2c3e50;">${u.author}: ${u.content.slice(0, 100)}${u.content.length > 100 ? '...' : ''}</li>`;
        }
        itemsHtml += '</ul>';
      }

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#faf8f3;">
  <div style="border-bottom:2px solid #c9a84c;padding-bottom:12px;margin-bottom:20px;">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#0f1923;margin:0;">Good morning, ${firstName}</h1>
    <p style="font-size:13px;color:#64748b;margin:4px 0 0;">${today}</p>
  </div>
  ${itemsHtml}
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e8eff5;">
    <a href="https://mn-ccore-lab.pages.dev/my-items" style="display:inline-block;padding:10px 20px;background:#c9a84c;color:#0f1923;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View All Items</a>
  </div>
  <p style="font-size:11px;color:#64748b;margin-top:24px;">MN-CCORE Lab Hub — <a href="https://mn-ccore-lab.pages.dev" style="color:#c9a84c;">mn-ccore-lab.pages.dev</a></p>
</body>
</html>`;

      // Send via SendGrid
      try {
        const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email, name: member.name }] }],
            from: { email: 'hub@mnccore.org', name: 'MN-CCORE Lab Hub' },
            subject: `${firstName}, you have ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} today`,
            content: [{ type: 'text/html', value: html }],
          }),
        });
        if (sgResp.ok || sgResp.status === 202) {
          sent++;
          console.log(`[Pulse] Sent to ${email}`);
        } else {
          console.log(`[Pulse] Failed for ${email}: ${sgResp.status}`);
        }
      } catch (e) {
        console.log(`[Pulse] Error sending to ${email}: ${e}`);
      }
    }

    console.log(`[Pulse] Done — sent ${sent} emails`);

    // ── Daily Coordinator Digest (6 AM CT = 11:00 UTC during DST) ──
    console.log('[DailyDigest] Triggering coordinator daily brief...');
    try {
      await handleSendDailyDigests(env);
    } catch (e) {
      console.log(`[DailyDigest] Failed (non-fatal): ${e}`);
    }
  },
};
