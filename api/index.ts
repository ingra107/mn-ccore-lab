import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './types';
import { corsHeaders, corsHeadersFor, json, error, getAuthUser, isPiRequest, getPiEmails, ensureTeamMember, actorSlugFromRequest, logActivity, assertProjectVisible } from './helpers';
// Z1.3 (2026-05-28): metadata-first route registration. Every defineRoute({...})
// below populates ROUTE_REGISTRY; bindRegistryToHono(app) wires them all into
// the Hono app at the end of the file (before app.notFound). Replaces the
// raw app.get/post calls.
import { defineRoute, bindRegistryToHono } from './lib/route-dsl';
import type { AuthUser } from './helpers';
import { validateApiKey } from './middleware/api-key-auth';
import { handleVersion, bumpVersion } from './lib/version';
import { ctToday } from './lib/ct-date';
import { nowInstant } from './lib/time';
import { notifyClients } from './lib/notify';
import { handleUploadUrl, handleUploadDone, handleListFiles, handleGetFile, handleDeleteFile } from './routes/uploads';

// ── Route modules ──────────────────────────────────────────
import { handleGetTasks, handleGetTask, handleOverdueCount, handleUpdateTaskStatus, handleUpdateTask, handleCreateTask, handleGetTaskComments, handleAddTaskComment, handleGetTaskActivity, handleGetTaskDetail, handleGetTaskUpdates, handleGetRecentTaskUpdates, handleGetRecentTaskComments, handlePostTaskUpdate, handleBatchUpdateTasks, handleAcknowledgeTask, handleDeleteTask, handleRestoreTask, handleMobileTasksToHub } from './routes/tasks';
import { handleMarkSeen, handleGetUnseenActivity } from './routes/seen';
import { handleInboxEvents, handleSyncBulkInboxEvents, handleDeleteInboxEvent, handleCreateInboxEvent } from './routes/inbox-events';
import { handleMutations } from './routes/mutations';
import { handleGetProjects, handleGetProject, handleCreateProject, handleGetComments, handleGetProjectUpdates, handleGetProjectActivity, handleProjectHealth, handleRecentUpdates, handleUpdateProject, handleDeleteProject, handleGetDeletedProjectsSince, handleAddComment, handlePostProjectUpdate, handleGetMilestones, handleUpdateMilestoneNote, handleUpdateMilestoneCompletion } from './routes/projects';
import { handleGetMeetings, handleNextMeeting, handleGetMeeting, handleGetAgendaItems, handleAddAgendaItem, handleReorderAgenda, handleCreateMeeting, handleUpdateMeetingNotes, handleUpdateMeetingMeta, handleMeetingPrep, handleGenerateAgenda } from './routes/meetings';
import { handleGetPublications, handleGetGrants, handleCollaborationGraph, handleGetStats, handleGrantsTimeline, handleUpdateGrant } from './routes/publications';
import { handleGetCitations } from './routes/citations';
import { handleGetTeam, handleTeamSlugs, handleCVData, handleUpdateTeamMember } from './routes/team';
import { handleGetDigest, handleDigestDates, handleUpdateDigestStatus, handleCreateDigestPaper, handleGetDigestComments, handleCreateDigestComment, handleDigestCommentCounts } from './routes/digest';
import { handleGetIdeas, handleCreateIdea, handleUpdateIdea, handleVoteIdea } from './routes/ideas';
import { handleBugReport, handleListBugReports, handleUpdateBugReportStatus } from './routes/bug-report';
import { handleNotifications, handleNotificationCount, handleMarkNotificationRead, handleMarkAllNotificationsRead, handleCommitments, handleCreateCommitment } from './routes/notifications';
import { handleGetSearch } from './routes/search';
import { handleGetSettings, handleUpdateSettings, handleGetWorkflowTemplates, handleCreateWorkflowTemplate } from './routes/settings';
import { handleGetReactions, handleToggleReaction } from './routes/reactions';
import { handleCalendarEvents } from './routes/calendar';
import { handleListFeeds, handleAddFeed, handleDeleteFeed, handleListEvents, pollAllStaleFeeds } from './routes/calendar-feeds';
import { handleGetActivity, handleActivityHeatmap, handleDeleteActivityEntry, handleEditActivityEntry, handleGetActivityReplies, handleCreateActivityReply } from './routes/activity';
import { handleGetSubtasks, handleCreateSubtask, handleToggleSubtask, handleDeleteSubtask, handleReorderSubtasks } from './routes/subtasks';
import { handleTeamPulse } from './routes/team-pulse';
import { handleGetPaperLinks, handleLinkPaper, handleUnlinkPaper, handlePapersByProject, handlePapersByPublication } from './routes/paper-links';
import { handleInsightConnections, handleInsightSuggestions, handleInsightsDashboard } from './routes/insights';
import { handleGetDependencies, handleGetProjectDependencies, handleCreateDependency, handleDeleteDependency } from './routes/dependencies';
import { handleTrajectory } from './routes/trajectory';
import { handleGetContributions } from './routes/contributions';
import { handleContributionsDecay } from './routes/contributions-decay';
import { handleSimilarGrants } from './routes/grant-intelligence';
import { handleGetDecisions, handleCreateDecision, handleUpdateDecisionOutcome, handleUpdateDecision, handleGetDecisionsNeedingReview, handleGetDecisionTags } from './routes/decisions';
import { handleSimilarDecisions, handleSimilarDecisionsById } from './routes/decision-replay';
import { handleGetNarratives } from './routes/narratives';
import { handleGetExpertise, handleAddExpertise, handleRemoveExpertise, handleSuggestExperts } from './routes/expertise';
import { handleGetQuestions, handleGetQuestionDetail, handleCreateQuestion, handleCreateAnswer, handleAcceptAnswer } from './routes/questions';
import { handleGetHandoffs, handleCreateHandoff, handleAcknowledgeHandoff } from './routes/handoffs';
import { handleCheckImpact } from './routes/impact-trace';
// pi-analytics.ts retired 2026-05-05 (5.9) — 0 frontend callers; /api/analytics/pi-dashboard is canonical
import { handlePIDashboard, handleMenteeVelocity, handleResponseTime, handleTeamEngagement, handleTeamByExpertise } from './routes/pi-dashboard';
import { handleCadenceCheck } from './routes/meeting-cadence';
import { handleGetAIRequests, handleCreateAIRequest, handleUpdateAIResponse } from './routes/ai-requests';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus, handleRefireLaunch, handleClaimLaunch, handleListPendingLaunches } from './routes/launch-log';
import { handleGetArtifacts, handleGetArtifact, handleGetArtifactActivity, handleCreateArtifact, handleReviseArtifact, handleDeleteArtifact, handleAddArtifactComment } from './routes/artifacts';
import { escapeHtml } from './lib/escapeHtml';
import { handlePBCapture, handlePBDefer, handleAddToDispatch, handleGetPendingDispatch, handleSendDispatch, handleCompleteDispatchItem } from './routes/pb-sector';
import { handlePBSessions, handlePBSessionStats, handleCreatePBSession, handleBulkCreatePBSessions } from './routes/pb-sessions';
import { handleGetSessions } from './routes/sessions';
import { handleLane3List } from './routes/lane3';
import { handleGetTodayMd } from './routes/pb-today'; // POST /api/pb/today retired 2026-05-05 (5.9)
import { handlePBHealth } from './routes/pb-health';
import { handleGetRelay, handleCreateRelay, handleCompleteRelay } from './routes/pb-relay';
import { handleGetRevisions, handleCreateRevision, handleUpdateRevision, handleGetRevisionComments, handleCreateRevisionComment, handleUpdateRevisionComment, handleGetActiveRevisions, handleAttentionManuscripts } from './routes/revisions';
import { handleGetMenteeMilestones, handleMenteeMilestoneOverview, handleCreateMenteeMilestone, handleUpdateMenteeMilestone, handleCompleteMenteeMilestone } from './routes/mentee-milestones';
import { handleGetCascade, handleGetImpact, handleGetAllCascades, handleCreateDeadlineDependency, handleDeleteDeadlineDependency } from './routes/deadline-cascade';
import { handleGetSubmissions, handleCreateSubmission, handleUpdateSubmission, handleDeleteSubmission, handleGetActiveSubmissions } from './routes/submissions';
import { handleGetRegulatoryItems, handleGetExpiringItems, handleCreateRegulatoryItem, handleUpdateRegulatoryItem, handleRenewRegulatoryItem, handleRegulatoryIcs } from './routes/regulatory';
import { handleGetGrantMilestones, handleUpcomingGrantMilestones, handleCreateGrantMilestone, handleUpdateGrantMilestone, handleCompleteGrantMilestone } from './routes/grant-milestones';
import { handleGetConferences, handleGetUpcomingConferences, handleCreateConference, handleUpdateConference, handleDeleteConference } from './routes/conferences';
import { handleGetEmailDrafts, handleGetPendingDrafts, handleSyncEmailDrafts } from './routes/email-drafts';
import { handleGetProjectDocuments, handleCreateProjectDocument, handleDeleteProjectDocument } from './routes/project-documents';
import { handleProactiveBrief } from './routes/proactive-brief';
import { handleGetFileActivity, handleSyncFileActivity } from './routes/file-activity';
import { handleGenerateDigestEmail, handleDigestPreview, handleSendDigestEmail, handleSendDailyDigests } from './routes/digest-email';
import { pruneAllLedgers, monitorD1Health, compactProcessedMutationsJson } from './lib/ledger-retention';
import { handleGetLinks, handleGetTaskLinks, handleGetProjectLinks, handleGetAllProjectLinks } from './routes/links';
// inbox.ts retired 2026-05-05 (5.3a) — migrated to /api/inbox-events/sync-bulk

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
    /** T2.7: precomputed PB visibility flag (set by the /api/* middleware).
     *  True iff the caller can see Peripheral Brain content (PI email or
     *  valid API key). Read via the CSP helper at handler registrations. */
    canSeePb: boolean;
  };
};

const app = new Hono<AppEnv>();

// ─────────────────────────────────────────────────────────────────────────────
// isPublicGet — allowlist of GET paths that don't require authentication even
// when REQUIRE_AUTH=1. Everything else (GET /api/*) requires a valid CF Access
// JWT or API key. This mirrors the approach used for POST/PUT but applies to
// reads so that team portals behind CF Access don't need additional per-route
// auth checks for sensitive data endpoints.
//
// Parameterized rules use prefix-match because Hono exposes the resolved
// pathname string, not a parsed params object, at middleware level.
// ─────────────────────────────────────────────────────────────────────────────
function isPublicGet(path: string): boolean {
  // Exact-match public routes
  const exactPublic = new Set([
    '/api/health',
    '/api/version',
    '/api/auth/me',
    '/api/team',
    '/api/team/slugs',
    '/api/team/pulse',
    '/api/publications',
    '/api/grants',
    '/api/grants/timeline',
    '/api/stats',
    '/api/citations',
    '/api/graph/collaboration',
    '/api/projects',
    '/api/projects/health',
    '/api/activity',
    '/api/expertise',
    '/api/meetings',
    '/api/meetings/next',
    '/api/digest',
    '/api/digest/dates',
  ]);
  if (exactPublic.has(path)) return true;

  // /api/team/:slug — single-segment profile (exclude analytics sub-routes)
  // Matches /api/team/nick-ingraham but NOT /api/team/by-expertise
  if (/^\/api\/team\/[^/]+$/.test(path) && path !== '/api/team/by-expertise') return true;

  // /api/projects/:slug — single project view (NOT sub-resources like /api/projects/:slug/comments)
  if (/^\/api\/projects\/[^/]+$/.test(path)) return true;

  // /api/digest/* — digest comments and other digest sub-resources
  if (path.startsWith('/api/digest/')) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler — matches old top-level try/catch behavior.
// Any thrown error from a handler becomes a 500 JSON response with corsHeaders.
//
// SEC-10.1: In production, suppress raw error messages (SQL/D1/stack details
// that could leak internal schema). Return a sanitized envelope with a
// correlation request_id so support can cross-reference console.error logs.
// In dev / test (TEST_MODE_KEY present or ENVIRONMENT=development) the full
// message is included for debuggability.
// ─────────────────────────────────────────────────────────────────────────────
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  // Generate a short correlation ID (first 12 chars of a random hex string).
  const requestId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);

  // Determine if we're in a dev/test context where detailed errors are safe.
  const env = c.get('env') as unknown as { ENVIRONMENT?: string; TEST_MODE_KEY?: string } | undefined;
  const isDev = env?.ENVIRONMENT === 'development' || Boolean(env?.TEST_MODE_KEY);

  // Always log full details server-side for correlation.
  const url = new URL(c.req.url);
  console.error(`[error] request_id=${requestId} method=${c.req.method} path=${url.pathname} message=${message}`, err instanceof Error ? err.stack : err);

  if (isDev) {
    // Dev/test: include message for debuggability.
    return error(message, 500);
  }
  // Prod: sanitized envelope only — never expose raw error messages to clients.
  return new Response(JSON.stringify({ error: 'Internal error', request_id: requestId }), {
    status: 500,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CORS + preflight.
// OPTIONS → 204 with corsHeaders. For all other methods, we don't need to add
// corsHeaders via middleware because every json()/error() helper from
// ./helpers already includes them.
// ─────────────────────────────────────────────────────────────────────────────
// HUB-4: reflect the exact request Origin for allowed browser origins so
// credentials can be supported if ever needed; unknown origins fall through to
// '*'. Server-side callers (PB Python, Hermes) send no Origin → '*' is fine.
app.options('*', (c) => new Response(null, {
  status: 204,
  headers: corsHeadersFor(c.req.header('origin')),
}));

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
  // Brief-7 (2026-06-11): PB API-key callers land as 'anonymous' because they
  // carry no CF Access JWT — actorSlug('anonymous') returns the literal string
  // 'anonymous', which renders as a person named "anonymous" on all feeds.
  // Fix: when a valid API key is present and no browser session is resolved,
  // use Nick's canonical identity (the service key IS Nick's automation; PB is
  // his personal system). actorSlug('ingra107@umn.edu') → 'nick-ingraham' via LUT.
  const pbServiceUser = { email: 'ingra107@umn.edu', name: 'Nick' };
  c.set('user', authed || (result === true ? pbServiceUser : { email: 'anonymous', name: 'Team Member' }));
  // Auto-provision a team_members row on first sight. Cheap (1 indexed
  // SELECT for known users; INSERT only for new). Failure is non-fatal —
  // we don't want auth to break because the directory write hiccupped.
  if (authed) {
    try { await ensureTeamMember(env, authed) }
    catch (e) { console.warn('[ensureTeamMember]', (e as Error).message) }
  }
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. PI gate for ALL /api/pb/* methods (GET + POST + PUT).
// Private brain.db data (pomodoro, TODAY.md, relay, plan history, sessions) —
// PI-only for ALL verbs. isPiRequest returns true for: (a) valid Bearer API key
// (server-side automation / PB sync), or (b) CF Access JWT matching a PI email.
// Any other caller (team member browser session) gets 403 on any /api/pb/* path.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/pb/*', async (c, next) => {
  const env = c.get('env');
  if (!(await isPiRequest(c.req.raw, env))) {
    return error('Forbidden — PI access only', 403);
  }
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET auth lockdown — require auth for non-public GET endpoints.
// When REQUIRE_AUTH=1, any GET that isn't in isPublicGet() needs a CF Access
// JWT or a valid API key. This closes the read-path hole where team members
// could fetch /api/tasks, /api/pb/*, /api/analytics/*, etc. without signing in.
// Public routes (marketing pages, /api/health, /api/version, team profiles, etc.)
// pass through unchanged. The PI-gate middleware above already handles /api/pb/*
// before this runs, so /api/pb/* GETs from non-PI callers are 403'd first.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') { await next(); return; }
  const env = c.get('env') as unknown as { REQUIRE_AUTH?: string };
  if (env.REQUIRE_AUTH !== '1') { await next(); return; }
  const path = new URL(c.req.url).pathname;
  if (isPublicGet(path)) { await next(); return; }
  const authedUser = c.get('authedUser');
  const hasApiKey = c.get('apiKeyValid') === true;
  if (!authedUser && !hasApiKey) {
    return c.json({ error: 'Authentication required' }, 401, corsHeaders);
  }
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST/PUT auth gate + user resolution.
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
  // Brief-7: same identity resolution as the GET middleware above —
  // valid API key without a browser session → Nick's canonical identity.
  const pbServiceUser2 = { email: 'ingra107@umn.edu', name: 'Nick' };
  c.set('user', authedUser || (hasApiKey ? pbServiceUser2 : { email: 'anonymous', name: 'Team Member' }));
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b. T2.7 (2026-05-28): canSeePb middleware — resolve PB visibility ONCE.
// 12+ list-route registrations were doing `await isPiRequest(R(c), E(c))`
// inline at the handler invocation site. Each call re-parses the JWT or
// re-validates the API key. Compute once per request, stash on context,
// and let handlers read it via c.get('canSeePb').
//
// Polarity: canSeePb = true when the caller is permitted to see PB content
// (PI email OR valid API key). Matches the handler signature shape
// (handler(url, env, canSeePb = false)). The 'false' default in handlers
// means "fail-closed" (no PB) on any path that forgets to forward the flag.
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api/*', async (c, next) => {
  const env = c.get('env');
  c.set('canSeePb', await isPiRequest(c.req.raw, env));
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-10.4: Rate limiting — ABSENT from this middleware stack (2026-05-27).
// Investigation: no rate-limit layer exists anywhere in api/index.ts or
// api/middleware/. The full middleware chain is:
//   (1) test-mode DB swap, (2) API-key auth, (3) PI gate /api/pb/*,
//   (4) GET auth lockdown, (5) POST/PUT auth gate, (6) version bump.
// The app is gated behind Cloudflare Access (JWT) on /portal/* so raw
// unauthenticated abuse is already blocked at the edge for the portal paths.
// API endpoints at /api/* rely on the X-API-Key / JWT auth gate as the
// primary protection; a KV-backed per-IP token bucket would be the right
// next step for further hardening but is deferred — the risk profile is
// acceptable given CF Access + auth gates on all write paths.
// Follow-up: add RATE_LIMIT_ENABLED flag + KV token bucket when a Durable
// Object or KV namespace is provisioned for this purpose.
// ─────────────────────────────────────────────────────────────────────────────

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
// T2.7: precomputed canSeePb (set by the /api/* middleware above). True iff
// the caller can see Peripheral Brain content (PI email or valid API key).
// Replaces `await isPiRequest(R(c), E(c))` at handler-invocation sites that
// were re-doing JWT parsing / API-key validation on every route call.
const CSP = (c: Context<AppEnv>) => c.get('canSeePb') === true;

// ─────────────────────────────────────────────────────────────────────────────
// Meta + auth endpoints
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/auth/me',
  auth: 'public',
  handler: async (c) => {
  const env = E(c);
  const user = c.get('authedUser') || (await getAuthUser(c.req.raw, env));
  if (!user) return json({ authenticated: false }, 200);
  const piEmails = await getPiEmails(env);
  const isPi = piEmails.has(user.email.toLowerCase());
  return json({ authenticated: true, isPi, ...user });
},
});

defineRoute({
  method: 'GET',
  path: '/api/version',
  auth: 'public',
  handler: (c) => handleVersion(E(c)),
});

defineRoute({
  method: 'GET',
  path: '/api/health',
  auth: 'public',
  handler: async (c) => {
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
  return new Response(JSON.stringify({ ok, checks, failures, timestamp: nowInstant() }, null, 2), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
},
});

// ─────────────────────────────────────────────────────────────────────────────
// PB sector GETs (PI-gated by middleware above)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/pb/dispatch/pending',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleGetPendingDispatch(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/today',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleGetTodayMd(E(c)),
});
// PI-gated: sessions + lane3 contain private brain.db data. R(c) carries JWT/API-key
// so isPiRequest inside the handler can distinguish PI/service from team callers.
defineRoute({
  method: 'GET',
  path: '/api/sessions',
  auth: 'authed',
  entity: 'sessions',
  visibility: 'na',
  handler: (c) => handleGetSessions(U(c), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/lane3/:table',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handleLane3List(c.req.param('table'), U(c), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/sessions',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handlePBSessions(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/sessions/stats',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handlePBSessionStats(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/health',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handlePBHealth(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/relay',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleGetRelay(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// PI Analytics
// ─────────────────────────────────────────────────────────────────────────────
// /api/pi/analytics retired 2026-05-05 (5.9): 0 callers, overlapped /api/analytics/pi-dashboard
defineRoute({
  method: 'GET',
  path: '/api/analytics/pi-dashboard',
  auth: 'authed',
  entity: 'analytics',
  visibility: 'na',
  handler: (c) => handlePIDashboard(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/mentee-velocity',
  auth: 'authed',
  entity: 'analytics',
  visibility: 'na',
  handler: (c) => handleMenteeVelocity(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/response-time',
  auth: 'authed',
  entity: 'analytics',
  visibility: 'na',
  handler: (c) => handleResponseTime(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/team-engagement',
  auth: 'authed',
  entity: 'analytics',
  visibility: 'na',
  handler: (c) => handleTeamEngagement(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/contributions',
  auth: 'authed',
  entity: 'analytics',
  visibility: 'na',
  handler: (c) => handleContributionsDecay(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/by-expertise',
  auth: 'authed',
  entity: 'team',
  visibility: 'na',
  handler: (c) => handleTeamByExpertise(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Digest (specific first, catch-all last)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/digest/dates',
  auth: 'public',
  handler: (c) => handleDigestDates(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest/comment-counts',
  auth: 'public',
  handler: (c) => handleDigestCommentCounts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest',
  auth: 'public',
  handler: (c) => handleGetDigest(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest/:id/comments',
  auth: 'public',
  handler: (c) => handleGetDigestComments(c.req.param('id'), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Project Insight Engine
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/insights/connections',
  auth: 'authed',
  entity: 'insights',
  visibility: 'na',
  handler: (c) => handleInsightConnections(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/insights/suggestions',
  auth: 'authed',
  entity: 'insights',
  visibility: 'na',
  handler: (c) => handleInsightSuggestions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/insights/dashboard',
  auth: 'authed',
  entity: 'insights',
  visibility: 'pb-aware',
  handler: async (c) => {
  if (!(await isPiRequest(c.req.raw, E(c)))) return error('Forbidden — PI access only', 403);
  const week = c.req.query('week') || undefined;
  return handleInsightsDashboard(E(c), week);
},
});

// ─────────────────────────────────────────────────────────────────────────────
// Papers
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/papers/by-project',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handlePapersByProject(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/papers/by-publication',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handlePapersByPublication(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects (ordering matters: revisions > papers > dependencies > :slug etc.)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/projects/health',
  auth: 'public',
  handler: (c) => handleProjectHealth(E(c), CSP(c)),
});
// Tombstone endpoint — consumed by sync_d1_pull.pull_hub_projects to mirror
// Hub project deletes into brain.db. Airtable cascade comment: handleDeleteProject
// writes deleted_at and (when secrets present) DELETEs the matching Airtable rec.
defineRoute({
  method: 'GET',
  path: '/api/projects/deleted-since',
  auth: 'public',
  handler: (c) => handleGetDeletedProjectsSince(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/comments',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetComments(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/updates',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetProjectUpdates(c.req.param('slug'), R(c), E(c)),
});
// Design C (v77): whole-picture project activity feed (project rows + task
// rollup by project_id). Visibility-gated inside the handler.
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/activity',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetProjectActivity(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/documents',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetProjectDocuments(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/papers',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetPaperLinks(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/dependencies',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetProjectDependencies(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/revisions',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: async (c) => {
  const ref = c.req.param('slug');
  const env = E(c);
  const proj = await env.DB.prepare(
    'SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1'
  ).bind(ref, ref).first<{ id: string }>();
  if (!proj) return json({ data: [] });
  // Post-P2: use proj.id (typed proj_ PK) so the filter matches rewritten rows.
  // Pre-P2 this was `proj.slug || proj.id`; manuscript_revisions.project_id is
  // a FK that will hold typed PKs after the P2 data migration.
  const rewrittenUrl = new URL(c.req.url);
  rewrittenUrl.searchParams.set('project_id', proj.id);
  return handleGetRevisions(rewrittenUrl, R(c), env);
},
});
defineRoute({
  method: 'GET',
  path: '/api/projects',
  auth: 'public',
  handler: (c) => handleGetProjects(U(c), E(c), c.get('user'), c.get('apiKeyValid') === true),
});
// GET /api/projects/:id — single-record fetch by id or slug (codex Q4 2026-05-12).
// Must be registered AFTER static paths (/health, /deleted-since) and before POST routes
// so Hono resolves statics first. Mirrors handleGetTask pattern (tasks.ts:133).
defineRoute({
  method: 'GET',
  path: '/api/projects/:id',
  auth: 'public',
  handler: (c) => handleGetProject(c.req.param('id'), E(c), c.get('user'), c.get('apiKeyValid') === true),
});

// ─────────────────────────────────────────────────────────────────────────────
// Meetings (specific first, parameterized last)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/meetings/cadence-check',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleCadenceCheck(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/next',
  auth: 'public',
  handler: (c) => handleNextMeeting(E(c)),
});
// Agenda/prep/generate-agenda are auth-gated (isAuthed flag mirrors handleGetMeeting pattern).
// Unauth callers get 401; authed team members get the full internal content.
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/agenda',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleGetAgendaItems(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/generate-agenda',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'pb-aware',
  handler: (c) => handleGenerateAgenda(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true, CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/prep',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'pb-aware',
  handler: (c) => handleMeetingPrep(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true, CSP(c)),
});
// Meeting detail — authed callers get full row; unauth get public-safe cols only.
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleGetMeeting(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings',
  auth: 'public',
  handler: (c) => handleGetMeetings(E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/dependencies',
  auth: 'authed',
  entity: 'dependencies',
  visibility: 'na',
  handler: (c) => handleGetDependencies(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Revisions
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/revisions/active',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'pb-aware',
  handler: (c) => handleGetActiveRevisions(E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/revisions/:id/comments',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleGetRevisionComments(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/revisions',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleGetRevisions(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/manuscripts/attention',
  auth: 'authed',
  entity: 'manuscripts',
  visibility: 'na',
  handler: async (c) => {
  const env = E(c);
  const user = c.get('authedUser') || (await getAuthUser(c.req.raw, env));
  if (!user) return c.json({ error: 'auth required' }, 401);
  return handleAttentionManuscripts(U(c), user, env);
},
});

// ─────────────────────────────────────────────────────────────────────────────
// Submissions
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/submissions/active',
  auth: 'authed',
  entity: 'submissions',
  visibility: 'na',
  handler: (c) => handleGetActiveSubmissions(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/submissions',
  auth: 'authed',
  entity: 'submissions',
  visibility: 'na',
  handler: (c) => handleGetSubmissions(U(c), R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Grants
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/grants/similar',
  auth: 'authed',
  entity: 'grants',
  visibility: 'na',
  handler: (c) => handleSimilarGrants(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grants/timeline',
  auth: 'public',
  handler: (c) => handleGrantsTimeline(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grants',
  auth: 'public',
  handler: (c) => handleGetGrants(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Narratives
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/narratives',
  auth: 'authed',
  entity: 'narratives',
  visibility: 'na',
  handler: (c) => handleGetNarratives(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/decisions/similar',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleSimilarDecisions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/similar-by-id',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleSimilarDecisionsById(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/review',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleGetDecisionsNeedingReview(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/tags',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleGetDecisionTags(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleGetDecisions(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Expertise
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/expertise/suggest',
  auth: 'authed',
  entity: 'expertise',
  visibility: 'na',
  handler: (c) => handleSuggestExperts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/expertise',
  auth: 'public',
  handler: (c) => handleGetExpertise(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// AI requests
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/ai-requests',
  auth: 'authed',
  entity: 'ai-requests',
  visibility: 'na',
  handler: (c) => handleGetAIRequests(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Launch log (@-tag delegation) — Nick-private reads, authed writes
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/launch-log',
  auth: 'authed',
  entity: 'launch-log',
  visibility: 'na',
  handler: (c) => handleListLaunches(U(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/launch-log/pending',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  // PI-gate enforced by app.use('/api/pb/*') middleware (index.ts:282). UNSCOPED — returns
  // all mobile pending rows regardless of requested_by (browser's email-equality filter stays
  // on handleListLaunches; that filter is the recovery-view privacy scope, not the queue gate).
  handler: (c) => handleListPendingLaunches(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Artifacts (Hermes Artifacts v1) — specific /:id/activity BEFORE catch-all /:id.
// /api/artifacts list is authed (team-visible; CF Access gates /portal). The
// :id/activity feed is visibility-gated in-handler (author-only @me rows).
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/artifacts',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleGetArtifacts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifacts/:id/activity',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleGetArtifactActivity(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifacts/:id',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleGetArtifact(c.req.param('id'), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Questions (specific /:id/answers BEFORE catch-all /:id)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/questions',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: (c) => handleGetQuestions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/questions/:id/answers',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: async (c) => {
  const env = E(c);
  const rows = await env.DB.prepare(
    'SELECT * FROM lab_answers WHERE question_id = ? ORDER BY is_accepted DESC, created_at ASC'
  ).bind(c.req.param('id')).all();
  return json({ data: rows.results || [] });
},
});
defineRoute({
  method: 'GET',
  path: '/api/questions/:id',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: (c) => handleGetQuestionDetail(c.req.param('id'), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Simple exact-match GETs
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/publications',
  auth: 'public',
  handler: (c) => handleGetPublications(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team',
  auth: 'public',
  handler: (c) => handleGetTeam(E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
defineRoute({
  method: 'GET',
  path: '/api/team/slugs',
  auth: 'public',
  handler: (c) => handleTeamSlugs(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/pulse',
  auth: 'public',
  handler: (c) => handleTeamPulse(U(c), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
defineRoute({
  method: 'GET',
  path: '/api/graph/collaboration',
  auth: 'public',
  handler: (c) => handleCollaborationGraph(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/stats',
  auth: 'public',
  handler: (c) => handleGetStats(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/citations',
  auth: 'public',
  handler: (c) => handleGetCitations(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/activity',
  auth: 'public',
  handler: (c) => handleGetActivity(U(c), E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/activity/heatmap',
  auth: 'authed',
  entity: 'activity',
  visibility: 'na',
  handler: (c) => handleActivityHeatmap(U(c), E(c)),
});
// Manual activity deletion (author or PI) — house delete shape (POST :id/delete,
// same as /api/conferences/:id/delete).
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/delete',
  auth: 'authed',
  entity: 'activity',
  visibility: 'na',
  handler: (c) => handleDeleteActivityEntry(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/edit',
  auth: 'authed',
  entity: 'activity',
  visibility: 'na',
  handler: (c) => handleEditActivityEntry(c.req.param('id'), R(c), USER(c), E(c)),
});
// #98 threaded replies. GET is 'public' like the other activity reads — the
// author-only rows are gated in SQL inside the handler, not by the route auth.
defineRoute({
  method: 'GET',
  path: '/api/activity/:id/replies',
  auth: 'public',
  entity: 'activity',
  visibility: 'na',
  handler: (c) => handleGetActivityReplies(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/replies',
  auth: 'authed',
  entity: 'activity',
  visibility: 'na',
  handler: (c) => handleCreateActivityReply(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/overdue-count',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleOverdueCount(U(c), E(c)),
});
// Per-viewer seen tracking (schema v81) — the new-activity signal, distinct
// from NEW-assignment (acknowledged_at). See api/routes/seen.ts header.
defineRoute({
  method: 'POST',
  path: '/api/seen',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleMarkSeen(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/seen/unseen',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetUnseenActivity(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: (c) => handleGetTasks(U(c), E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/updates/recent',
  auth: 'authed',
  entity: 'projects',
  visibility: 'pb-aware',
  handler: (c) => handleRecentUpdates(U(c), E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/task-updates/recent',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: (c) => handleGetRecentTaskUpdates(U(c), E(c), CSP(c)),
});
// T2.8 (2026-05-28): extracted to api/routes/tasks.ts::handleGetRecentTaskComments
// — one-liner alongside /api/task-updates/recent. Single place to maintain.
defineRoute({
  method: 'GET',
  path: '/api/task-comments/recent',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: (c) => handleGetRecentTaskComments(U(c), E(c), CSP(c)),
});
// Notifications: recipient derived from auth (R(c) carries the JWT/test headers)
defineRoute({
  method: 'GET',
  path: '/api/notifications',
  auth: 'authed',
  entity: 'notifications',
  visibility: 'na',
  handler: (c) => handleNotifications(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/notifications/count',
  auth: 'authed',
  entity: 'notifications',
  visibility: 'na',
  handler: (c) => handleNotificationCount(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/commitments',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleCommitments(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/ideas',
  auth: 'authed',
  entity: 'ideas',
  visibility: 'na',
  handler: (c) => handleGetIdeas(U(c), E(c)),
});
// GET /api/inbox retired 2026-05-05 (5.3a) — use /api/inbox-events
defineRoute({
  method: 'GET',
  path: '/api/search',
  auth: 'authed',
  entity: 'search',
  visibility: 'pb-aware',
  handler: (c) => handleGetSearch(U(c), E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/settings',
  auth: 'authed',
  entity: 'settings',
  visibility: 'na',
  handler: (c) => handleGetSettings(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/workflow-templates',
  auth: 'authed',
  entity: 'settings',
  visibility: 'na',
  handler: (c) => handleGetWorkflowTemplates(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/calendar/events',
  auth: 'authed',
  entity: 'calendar',
  visibility: 'na',
  handler: (c) => handleCalendarEvents(U(c), E(c)),
});

// Personal iCal calendar feeds (issue #45). Per-user, secret URL stays in D1.
// These use `authedUser` (real JWT identity) not `user` (anonymous fallback)
// because the feed_url is a secret — no anonymous access path.
defineRoute({
  method: 'GET',
  path: '/api/integrations/calendar/feeds',
  auth: 'authed',
  entity: 'calendar-feeds',
  visibility: 'na',
  handler: (c) => handleListFeeds(E(c), c.get('authedUser')),
});
defineRoute({
  method: 'POST',
  path: '/api/integrations/calendar/feeds',
  auth: 'authed',
  entity: 'calendar-feeds',
  visibility: 'na',
  handler: (c) => handleAddFeed(R(c), E(c), c.get('authedUser'), (p) => c.executionCtx.waitUntil(p)),
});
defineRoute({
  method: 'POST',
  path: '/api/integrations/calendar/feeds/:id/delete',
  auth: 'authed',
  entity: 'calendar-feeds',
  visibility: 'na',
  handler: (c) => handleDeleteFeed(R(c), E(c), c.get('authedUser'), c.req.param('id')),
});
defineRoute({
  method: 'GET',
  path: '/api/integrations/calendar/events',
  auth: 'authed',
  entity: 'calendar-feeds',
  visibility: 'na',
  handler: (c) => handleListEvents(U(c), E(c), c.get('authedUser'), (p) => c.executionCtx.waitUntil(p)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Files (presigned URLs etc.)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/files',
  auth: 'authed',
  entity: 'files',
  visibility: 'pb-aware',
  handler: (c) => handleListFiles(U(c), E(c), CSP(c)),
});
// GET /api/files/:key+ — presigned download URL (JSON envelope).
// GET /api/files/:key+/raw — the actual bytes (see handleGetFile).
// Key can contain slashes (R2 key paths), so this is ONE route matching the
// full rest-of-path as a single string (Hono wildcard-regex, not `:*`). A
// separate `defineRoute` for a literal `/raw` suffix does NOT work here —
// verified empirically: Hono's router still resolves it to THIS wildcard
// (`:rest{.+}` greedily captures ".../raw" too) regardless of registration
// order, so `/raw` is parsed out of `rest` inside this one handler instead.
defineRoute({
  method: 'GET',
  path: '/api/files/:rest{.+}',
  auth: 'authed',
  entity: 'files',
  visibility: 'pb-aware',
  handler: (c) => {
  let key = c.req.param('rest');
  // Raw bytes are requested either as a `/raw` path suffix or `?raw=1` —
  // upload/done emits the query form (uploads.ts), so BOTH must resolve here;
  // the halves shipped on different conventions once (2026-07-07) and every
  // inline <img> silently got the JSON envelope instead of bytes.
  let raw = c.req.query('raw') === '1';
  if (key.endsWith('/raw')) {
    raw = true;
    key = key.slice(0, -'/raw'.length);
  }
  return handleGetFile(key, E(c), CSP(c), raw);
},
});

// ─────────────────────────────────────────────────────────────────────────────
// Team subroutes
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/cv-data',
  auth: 'authed',
  entity: 'team',
  visibility: 'na',
  handler: (c) => handleCVData(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/trajectory',
  auth: 'authed',
  entity: 'team',
  visibility: 'na',
  handler: (c) => handleTrajectory(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/contributions',
  auth: 'authed',
  entity: 'team',
  visibility: 'na',
  handler: (c) => handleGetContributions(c.req.param('slug'), U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Deadline cascade
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade/all',
  auth: 'authed',
  entity: 'deadline-cascade',
  visibility: 'pb-aware',
  handler: (c) => handleGetAllCascades(E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade/impact',
  auth: 'authed',
  entity: 'deadline-cascade',
  visibility: 'na',
  handler: (c) => handleGetImpact(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade',
  auth: 'authed',
  entity: 'deadline-cascade',
  visibility: 'na',
  handler: (c) => handleGetCascade(U(c), R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Mentee milestones
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/mentee-milestones/overview',
  auth: 'authed',
  entity: 'mentee-milestones',
  visibility: 'na',
  handler: (c) => handleMenteeMilestoneOverview(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/mentee-milestones',
  auth: 'authed',
  entity: 'mentee-milestones',
  visibility: 'na',
  handler: (c) => handleGetMenteeMilestones(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Milestones (project + grant share a handler for listing)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/milestones',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleGetMilestones(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Grant post-award milestones
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/grant-milestones/upcoming',
  auth: 'authed',
  entity: 'grant-milestones',
  visibility: 'na',
  handler: (c) => handleUpcomingGrantMilestones(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grant-milestones',
  auth: 'authed',
  entity: 'grant-milestones',
  visibility: 'na',
  handler: (c) => handleGetGrantMilestones(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/regulatory/expiring',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'pb-aware',
  handler: (c) => handleGetExpiringItems(U(c), E(c), CSP(c)),
});
// Auth-only (not PI) — team members need iCal access to renewal reminders.
defineRoute({
  method: 'GET',
  path: '/api/regulatory/:id/ics',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'na',
  handler: (c) => handleRegulatoryIcs(c.req.param('id'), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/regulatory',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'pb-aware',
  handler: (c) => handleGetRegulatoryItems(U(c), R(c), E(c), CSP(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Conferences
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/conferences/upcoming',
  auth: 'authed',
  entity: 'conferences',
  visibility: 'pb-aware',
  handler: (c) => handleGetUpcomingConferences(E(c), CSP(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/conferences',
  auth: 'authed',
  entity: 'conferences',
  visibility: 'pb-aware',
  handler: (c) => handleGetConferences(U(c), R(c), E(c), CSP(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Email drafts (reads)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/email-drafts',
  auth: 'authed',
  entity: 'email-drafts',
  visibility: 'na',
  handler: (c) => handleGetEmailDrafts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/email-drafts/pending',
  auth: 'authed',
  entity: 'email-drafts',
  visibility: 'na',
  handler: (c) => handleGetPendingDrafts(R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Proactive brief / digest preview / file activity
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/proactive-brief',
  auth: 'authed',
  entity: 'proactive-brief',
  visibility: 'na',
  handler: (c) => handleProactiveBrief(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest-preview',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleDigestPreview(U(c), E(c)),
});
// /api/file-activity/heatmap (and potentially future subpaths) — the original
// used pathname.match(/^\/api\/file-activity\/heatmap/), so we preserve the
// prefix behavior with an explicit route on the exact path. No other
// subpaths existed, so a wildcard match isn't necessary.
defineRoute({
  method: 'GET',
  path: '/api/file-activity/heatmap',
  auth: 'authed',
  entity: 'file-activity',
  visibility: 'na',
  handler: (c) => handleGetFileActivity(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Reactions (read)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/reactions',
  auth: 'authed',
  entity: 'reactions',
  visibility: 'na',
  handler: (c) => handleGetReactions(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Task sub-resource GETs
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/comments',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetTaskComments(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/files',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: async (c) => {
  const env = E(c);
  // Auth required — task files are team-internal content.
  const authedUser = c.get('authedUser');
  if (!authedUser && c.get('apiKeyValid') !== true) return error('Authentication required', 401);
  // Phase 1b-extended: if the task belongs to a PB-category project, block non-PI
  // callers from listing the file metadata. Mirrors the read-side gates on
  // task comments/updates/activity (api/routes/tasks.ts).
  const taskId = c.req.param('id');
  const taskRowForGate = await env.DB.prepare(
    'SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL'
  ).bind(taskId).first<{ project_id: string | null }>();
  if (taskRowForGate?.project_id) {
    const block = await assertProjectVisible(R(c), env, taskRowForGate.project_id);
    if (block) return block;
  }
  const { results } = await env.DB.prepare(
    'SELECT id, task_id, filename, url, file_type, uploaded_by, created_at FROM task_files WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all();
  return json({ data: results });
},
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/updates',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetTaskUpdates(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/activity',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetTaskActivity(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/detail',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetTaskDetail(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/subtasks',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetSubtasks(c.req.param('id'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/handoffs',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetHandoffs(c.req.param('id'), E(c)),
});
// GET /api/tasks/:id — fetch single task by PK (mechanic I5: was missing, always 404)
// Must come AFTER all /api/tasks/:id/<sub-path> routes so hono routes specifics first.
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleGetTask(c.req.param('id'), E(c), R(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Writes (POST / PUT / PATCH) ──────────────────────────────────────────────
// Ordering still matters — specific paths BEFORE catch-alls. See comments in
// original index.ts for rationale (e.g. /api/tasks/batch before /api/tasks/:id).
// ─────────────────────────────────────────────────────────────────────────────

// Uploads
defineRoute({
  method: 'POST',
  path: '/api/upload/url',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handleUploadUrl(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/upload/done',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handleUploadDone(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/files/:id/delete',
  auth: 'authed',
  entity: 'files',
  visibility: 'pb-aware',
  handler: (c) => handleDeleteFile(c.req.param('id'), E(c), CSP(c)),
});

// Projects (specific first)
defineRoute({
  method: 'POST',
  path: '/api/projects',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleCreateProject(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/delete',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleDeleteProject(c.req.param('slug'), USER(c), E(c), R(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/comments',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleAddComment(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/updates',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handlePostProjectUpdate(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/documents',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleCreateProjectDocument(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/documents/:docId/delete',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleDeleteProjectDocument(c.req.param('docId'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleUpdateProject(c.req.param('slug'), R(c), USER(c), E(c)),
});

// Team
defineRoute({
  method: 'POST',
  path: '/api/team/:slug',
  auth: 'authed',
  entity: 'team',
  visibility: 'na',
  handler: (c) => handleUpdateTeamMember(c.req.param('slug'), R(c), USER(c), E(c), c.get('apiKeyValid') === true),
});

// Inbox events (W2a) — specific-before-generic
defineRoute({
  method: 'POST',
  path: '/api/inbox-events/sync-bulk',
  auth: 'authed',
  entity: 'inbox-events',
  visibility: 'na',
  handler: (c) => handleSyncBulkInboxEvents(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/inbox-events/:id/delete',
  auth: 'authed',
  entity: 'inbox-events',
  visibility: 'na',
  handler: (c) => handleDeleteInboxEvent(c.req.param('id'), R(c), USER(c), E(c)),
});
// Browser single-capture — 'authed' (CF-Access OR Bearer), NOT PI-gated.
// Registered after /sync-bulk and /:id/delete so static segments match first.
defineRoute({
  method: 'POST',
  path: '/api/inbox-events',
  auth: 'authed',
  entity: 'inbox-events',
  visibility: 'na',
  handler: (c) => handleCreateInboxEvent(R(c), USER(c), E(c)),
});
// PI-or-API-key gate: raw_payload_json/notes are private to Nick's capture pipeline.
defineRoute({
  method: 'GET',
  path: '/api/inbox-events',
  auth: 'authed',
  entity: 'inbox-events',
  visibility: 'na',
  handler: (c) => handleInboxEvents(U(c), E(c), R(c)),
});

// Mutations (A3) — single endpoint for every brain.db -> Hub write.
// Ships AFTER pre-A3 snapshot manifest verifier exits 0 on both PB
// machines + schema-v58 (processed_mutations) + v59 (last_mutation_id)
// applied to D1 prod.
defineRoute({
  method: 'POST',
  path: '/api/mutations',
  auth: 'authed',
  entity: 'mutations',
  visibility: 'na',
  handler: (c) => handleMutations(R(c), USER(c), E(c)),
});

// Typed-links pull (Phase 2, 2026-06-20) — PI/API-key gated (PB sync lane only).
// PB hub.py calls GET /links?seq_after=N&include_deleted=1&limit=K.
defineRoute({
  method: 'GET',
  path: '/api/links',
  auth: 'authed',
  entity: 'links',
  visibility: 'na',
  handler: (c) => handleGetLinks(new URL(R(c).url), R(c), E(c)),
});

// Frontend-accessible stored-links sub-resources (B3 Task 8, 2026-06-21).
// Returns { id, role, type, canonical_url, short_title, sort_order } rows;
// no PI gate -- authenticated team members can read links on tasks/projects
// they already have access to (gated via assertProjectVisible internally).
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/links',
  auth: 'authed',
  entity: 'links',
  visibility: 'na',
  handler: (c) => handleGetTaskLinks(c.req.param('id'), R(c), E(c)),
});
// Bulk project-links (backlog #147) — specific literal path registered BEFORE
// the parameterized /:slug/links so hono matches it without ambiguity.
defineRoute({
  method: 'GET',
  path: '/api/projects/links',
  auth: 'authed',
  entity: 'links',
  visibility: 'na',
  handler: (c) => handleGetAllProjectLinks(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/links',
  auth: 'authed',
  entity: 'links',
  visibility: 'na',
  handler: (c) => handleGetProjectLinks(c.req.param('slug'), R(c), E(c)),
});

// Tasks — specific-before-generic
defineRoute({
  method: 'POST',
  path: '/api/tasks/batch',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleBatchUpdateTasks(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/delete',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleDeleteTask(c.req.param('id'), R(c), USER(c), E(c)),
});
// Symmetric counterpart to :id/delete — un-sets the tombstone so a delete can
// be a real, undoable operation instead of a one-way write (see handleRestoreTask).
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/restore',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleRestoreTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/acknowledge',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleAcknowledgeTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/status',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleUpdateTaskStatus(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/comments',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleAddTaskComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/updates',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handlePostTaskUpdate(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/subtasks/reorder',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleReorderSubtasks(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/subtasks',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleCreateSubtask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/handoffs',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleCreateHandoff(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/files',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: async (c) => {
  const env = E(c);
  const id = c.req.param('id');
  // Owner-or-PI gate: only the task owner/assignee or a PI may attach files.
  const callerSlug = await actorSlugFromRequest(R(c), env);
  if (!callerSlug) return error('Authentication required', 401);
  // Phase 1b-extended: also gate on PB-project visibility. Pull project_id in
  // the same row read so we don't pay a second round-trip.
  const task = await env.DB.prepare(
    'SELECT assignee, project_id FROM tasks WHERE id = ? LIMIT 1'
  ).bind(id).first<{ assignee: string | null; project_id: string | null }>();
  if (!task) return error('Task not found', 404);
  if (task.project_id) {
    const block = await assertProjectVisible(R(c), env, task.project_id);
    if (block) return block;
  }
  // Null-assignee guard: unassigned tasks are NOT locked to any owner.
  // Only block when assignee is non-null AND differs AND caller is not PI.
  if (task.assignee != null && task.assignee !== callerSlug && !(await isPiRequest(R(c), env))) {
    return error('Forbidden', 403);
  }
  const body = await c.req.json() as { filename: string; url: string; file_type?: string };
  const newId = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    'INSERT INTO task_files (id, task_id, filename, url, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(newId, id, body.filename, body.url, body.file_type || 'link', callerSlug).run();
  await logActivity(env, 'task_file_attach', `Attached file "${body.filename}" to task ${id}`, callerSlug, id, 'task');
  return json({ data: { id: newId, task_id: id, filename: body.filename, url: body.url } });
},
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleUpdateTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleCreateTask(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/sync/mobile-tasks-to-hub',
  auth: 'authed',
  entity: 'misc',
  visibility: 'na',
  handler: (c) => handleMobileTasksToHub(R(c), USER(c), E(c)),
});

// Task-files (deletion uses the legacy /api/task-files/:id/delete path).
// Owner-or-PI gate: look up the file's task assignee; only they or a PI may delete.
// Hard-delete is intentional (task_files has no deleted_at column — schema-v34).
// logActivity provides the audit trail in lieu of a soft-delete tombstone.
defineRoute({
  method: 'POST',
  path: '/api/task-files/:id/delete',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'pb-aware',
  handler: async (c) => {
  const env = E(c);
  const fileId = c.req.param('id');
  const callerSlug = await actorSlugFromRequest(R(c), env);
  if (!callerSlug) return error('Authentication required', 401);
  // Look up the file to get the parent task, its assignee, and project_id.
  const fileRow = await env.DB.prepare(
    'SELECT tf.id, tf.task_id, tf.filename, t.assignee, t.project_id FROM task_files tf LEFT JOIN tasks t ON tf.task_id = t.id WHERE tf.id = ? LIMIT 1'
  ).bind(fileId).first<{ id: string; task_id: string; filename: string; assignee: string | null; project_id: string | null }>();
  // SEC-10.3 + Phase 1b-extended: idempotent — repeat delete (row already gone)
  // returns 200 with idempotent:true. Codex flagged that the prior 404 leaked
  // existence of file IDs to non-owners.
  if (!fileRow) return json({ data: { deleted: fileId, idempotent: true } });
  // Phase 1b-extended: gate on PB-project visibility before the assignee check.
  // A non-PI knowing a PB task-file id must not be able to delete (or learn
  // about its existence via a different error code).
  if (fileRow.project_id) {
    const block = await assertProjectVisible(R(c), env, fileRow.project_id);
    if (block) return block;
  }
  // Null-assignee guard: unassigned tasks are NOT locked to any owner.
  // Only block when assignee is non-null AND differs AND caller is not PI.
  if (fileRow.assignee != null && fileRow.assignee !== callerSlug && !(await isPiRequest(R(c), env))) {
    return error('Forbidden', 403);
  }
  await env.DB.prepare('DELETE FROM task_files WHERE id = ?').bind(fileId).run();
  await logActivity(env, 'task_file_delete', `Deleted file "${fileRow.filename}" from task ${fileRow.task_id}`, callerSlug, fileRow.task_id, 'task');
  return json({ data: { deleted: fileId, idempotent: false } });
},
});

// Subtasks
defineRoute({
  method: 'POST',
  path: '/api/subtasks/:id/toggle',
  auth: 'authed',
  entity: 'subtasks',
  visibility: 'na',
  handler: (c) => handleToggleSubtask(c.req.param('id'), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/subtasks/:id/delete',
  auth: 'authed',
  entity: 'subtasks',
  visibility: 'na',
  handler: (c) => handleDeleteSubtask(c.req.param('id'), R(c), E(c)),
});

// Action items (GET /api/action-items, POST /api/action-items[/:id/toggle])
// retired in T19 (#547) — all six live readers converted to the tasks model.

// Meetings
defineRoute({
  method: 'POST',
  path: '/api/meetings',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleCreateMeeting(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/notes',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleUpdateMeetingNotes(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/meta',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleUpdateMeetingMeta(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/agenda/reorder',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleReorderAgenda(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/agenda',
  auth: 'authed',
  entity: 'meetings',
  visibility: 'na',
  handler: (c) => handleAddAgendaItem(c.req.param('id'), R(c), USER(c), E(c)),
});

// Milestones
defineRoute({
  method: 'POST',
  path: '/api/milestones/:id/note',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleUpdateMilestoneNote(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/milestones/:id/complete',
  auth: 'authed',
  entity: 'projects',
  visibility: 'na',
  handler: (c) => handleUpdateMilestoneCompletion(c.req.param('id'), R(c), USER(c), E(c)),
});

// Commitments
defineRoute({
  method: 'POST',
  path: '/api/commitments',
  auth: 'authed',
  entity: 'tasks',
  visibility: 'na',
  handler: (c) => handleCreateCommitment(R(c), E(c)),
});

// Notifications — read-all derives recipient from the authenticated caller slug,
// not from a user-supplied ?recipient= or body field (prevents cross-user spoofing).
defineRoute({
  method: 'POST',
  path: '/api/notifications/read-all',
  auth: 'authed',
  entity: 'notifications',
  visibility: 'na',
  handler: async (c) => {
  const env = E(c);
  const callerSlug = await actorSlugFromRequest(R(c), env);
  if (!callerSlug) return error('Authentication required', 401);
  return handleMarkAllNotificationsRead(callerSlug, env);
},
});
defineRoute({
  method: 'POST',
  path: '/api/notifications/:id/read',
  auth: 'authed',
  entity: 'notifications',
  visibility: 'na',
  handler: (c) => handleMarkNotificationRead(c.req.param('id'), R(c), E(c)),
});

// Reactions
defineRoute({
  method: 'POST',
  path: '/api/reactions',
  auth: 'authed',
  entity: 'reactions',
  visibility: 'na',
  handler: (c) => handleToggleReaction(R(c), USER(c), E(c)),
});

// Publications
defineRoute({
  method: 'POST',
  path: '/api/publications',
  auth: 'authed',
  entity: 'publications',
  visibility: 'na',
  handler: async (c) => {
  const env = E(c);
  const body = await c.req.json() as { title: string; authors: string; journal?: string; year?: number; doi?: string; pubmed?: string; abstract?: string; topics?: string[]; status?: string };
  const id = crypto.randomUUID().slice(0, 8);
  await env.DB.prepare(
    `INSERT INTO publications (id, title, authors, journal, year, doi, pubmed, abstract, topics, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, body.title, body.authors, body.journal || null, body.year || null, body.doi || null, body.pubmed || null, body.abstract || null, JSON.stringify(body.topics || []), body.status || 'Published').run();
  return json({ data: { id, title: body.title } });
},
});

// Handoffs
defineRoute({
  method: 'POST',
  path: '/api/handoffs/:id/acknowledge',
  auth: 'authed',
  entity: 'handoffs',
  visibility: 'na',
  handler: (c) => handleAcknowledgeHandoff(c.req.param('id'), USER(c), E(c)),
});

// Settings
defineRoute({
  method: 'POST',
  path: '/api/settings',
  auth: 'authed',
  entity: 'settings',
  visibility: 'na',
  handler: (c) => handleUpdateSettings(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/workflow-templates',
  auth: 'authed',
  entity: 'settings',
  visibility: 'na',
  handler: (c) => handleCreateWorkflowTemplate(R(c), E(c)),
});

// Ideas
defineRoute({
  method: 'POST',
  path: '/api/ideas',
  auth: 'authed',
  entity: 'ideas',
  visibility: 'na',
  handler: (c) => handleCreateIdea(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ideas/:id/vote',
  auth: 'authed',
  entity: 'ideas',
  visibility: 'na',
  handler: (c) => handleVoteIdea(c.req.param('id'), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ideas/:id',
  auth: 'authed',
  entity: 'ideas',
  visibility: 'na',
  handler: (c) => handleUpdateIdea(c.req.param('id'), R(c), USER(c), E(c)),
});

// Inbox — POST /api/inbox + /api/inbox/sync retired 2026-05-05 (5.3a); use /api/inbox-events/sync-bulk

// Bug report. Once REQUIRE_AUTH is flipped on (team launch), require an
// authed user OR API key — bug reports create real GitHub Issues and a
// stranger could otherwise spam the repo. Until then, accept anonymous
// reports so Nick (sole pre-launch user, can't yet sign in via CF Access)
// can submit. Pattern mirrors the rest of /api: writes are anonymous-OK
// pre-launch, gated post-launch via REQUIRE_AUTH=1.
defineRoute({
  method: 'POST',
  path: '/api/bug-report',
  auth: 'authed',
  entity: 'bug-report',
  visibility: 'na',
  handler: async (c) => {
  const env = E(c);
  const requireAuth = (env as unknown as { REQUIRE_AUTH?: string }).REQUIRE_AUTH === '1';
  if (requireAuth) {
    const authed = c.get('authedUser');
    // CX-A3 fix (2026-04-28): use validated apiKeyValid flag from
    // middleware (line 148), not raw header presence. Pre-fix accepted
    // X-API-Key: junk as authentication.
    const apiKeyValid = c.var.apiKeyValid === true;
    if (!authed && !apiKeyValid) return error('Authentication required to file a bug', 401);
  }
  return handleBugReport(c.req.raw, env, c.get('authedUser'));
},
});

// Bug Squasher queue — PI/API-key gated (in-handler isPiRequest, same idiom
// as the PB-sync reads). The squasher (scripts/bug-squasher.bat) lists open
// bugs then marks each resolved/dismissed as it works through them.
defineRoute({
  method: 'GET',
  path: '/api/bug-reports',
  auth: 'pi',
  entity: 'bug-report',
  visibility: 'na',
  handler: (c) => handleListBugReports(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/bug-reports/:id/status',
  auth: 'pi',
  entity: 'bug-report',
  visibility: 'na',
  handler: (c) => handleUpdateBugReportStatus(c.req.param('id'), R(c), E(c)),
});

// Digest
defineRoute({
  method: 'POST',
  path: '/api/digest',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleCreateDigestPaper(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest/:id/comments',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleCreateDigestComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest/:id/status',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleUpdateDigestStatus(c.req.param('id'), R(c), USER(c), E(c)),
});

// Paper links
defineRoute({
  method: 'POST',
  path: '/api/paper-links',
  auth: 'authed',
  entity: 'paper-links',
  visibility: 'na',
  handler: (c) => handleLinkPaper(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/paper-links/:id/delete',
  auth: 'authed',
  entity: 'paper-links',
  visibility: 'na',
  handler: (c) => handleUnlinkPaper(c.req.param('id'), R(c), E(c)),
});

// Dependencies
defineRoute({
  method: 'POST',
  path: '/api/dependencies',
  auth: 'authed',
  entity: 'dependencies',
  visibility: 'na',
  handler: (c) => handleCreateDependency(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/dependencies/:id/delete',
  auth: 'authed',
  entity: 'dependencies',
  visibility: 'na',
  handler: (c) => handleDeleteDependency(c.req.param('id'), R(c), E(c)),
});

// Decisions
defineRoute({
  method: 'POST',
  path: '/api/decisions',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleCreateDecision(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/decisions/:id/outcome',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleUpdateDecisionOutcome(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/decisions/:id/update',
  auth: 'authed',
  entity: 'decisions',
  visibility: 'na',
  handler: (c) => handleUpdateDecision(c.req.param('id'), R(c), USER(c), E(c)),
});

// Expertise
defineRoute({
  method: 'POST',
  path: '/api/expertise',
  auth: 'authed',
  entity: 'expertise',
  visibility: 'na',
  handler: (c) => handleAddExpertise(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/expertise/:id/delete',
  auth: 'authed',
  entity: 'expertise',
  visibility: 'na',
  handler: (c) => handleRemoveExpertise(c.req.param('id'), R(c), E(c)),
});

// Questions / Answers
defineRoute({
  method: 'POST',
  path: '/api/questions',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: (c) => handleCreateQuestion(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/questions/:id/answers',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: (c) => handleCreateAnswer(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/answers/:id/accept',
  auth: 'authed',
  entity: 'questions',
  visibility: 'na',
  handler: (c) => handleAcceptAnswer(c.req.param('id'), R(c), USER(c), E(c)),
});

// AI requests
defineRoute({
  method: 'POST',
  path: '/api/ai-requests',
  auth: 'authed',
  entity: 'ai-requests',
  visibility: 'na',
  handler: (c) => handleCreateAIRequest(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ai-requests/:id/response',
  auth: 'authed',
  entity: 'ai-requests',
  visibility: 'na',
  handler: (c) => handleUpdateAIResponse(c.req.param('id'), R(c), E(c)),
});

// Launch log writes
defineRoute({ method: 'POST', path: '/api/launch-log',            auth: 'authed', entity: 'launch-log', visibility: 'na', handler: (c) => handleCreateLaunch(R(c), USER(c), E(c)) });
defineRoute({ method: 'POST', path: '/api/launch-log/:id/status', auth: 'authed', entity: 'launch-log', visibility: 'na', handler: (c) => handleSetLaunchStatus(c.req.param('id'), R(c), USER(c), E(c)) });
defineRoute({ method: 'POST', path: '/api/launch-log/:id/refire', auth: 'authed', entity: 'launch-log', visibility: 'na', handler: (c) => handleRefireLaunch(c.req.param('id'), USER(c), E(c)) });
defineRoute({ method: 'POST', path: '/api/launch-log/:id/claim',  auth: 'authed', entity: 'launch-log', visibility: 'na', handler: (c) => handleClaimLaunch(c.req.param('id'), R(c), USER(c), E(c)) });

// Artifacts writes — specific-before-generic. Create is authed (Hermes via API
// key, or a team member). Revise/comments authed; delete PI-gated in-handler.
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/revise',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleReviseArtifact(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/comments',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleAddArtifactComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/delete',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleDeleteArtifact(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/artifacts',
  auth: 'authed',
  entity: 'artifacts',
  visibility: 'na',
  handler: (c) => handleCreateArtifact(R(c), USER(c), E(c)),
});

// PB sector writes
defineRoute({
  method: 'POST',
  path: '/api/pb/capture',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handlePBCapture(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/defer',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handlePBDefer(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/add',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleAddToDispatch(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/send',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleSendDispatch(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/complete',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleCompleteDispatchItem(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/sessions',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleCreatePBSession(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/sessions/bulk',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleBulkCreatePBSessions(R(c), USER(c), E(c)),
});
// POST /api/pb/today retired 2026-05-05 (5.9): 0 callers; GET preserved for frontend use
defineRoute({
  method: 'POST',
  path: '/api/pb/relay',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => handleCreateRelay(R(c), USER(c), E(c)),
});
// Relay completion uses a numeric index in the path — Hono matches :index
// against one URL segment. Original regex was /^\/api\/pb\/relay\/\d+\/complete$/;
// we rely on `parseInt` + NaN guard since a non-digit segment would have fallen
// through to 404 in the original anyway.
defineRoute({
  method: 'POST',
  path: '/api/pb/relay/:index/complete',
  auth: 'pi',
  entity: 'pb',
  visibility: 'na',
  handler: (c) => {
  const index = parseInt(c.req.param('index'), 10);
  if (Number.isNaN(index)) return error('Not found', 404);
  return handleCompleteRelay(R(c), E(c), index);
},
});

// Impact check — route removed 2026-05-05 (5.3b); handleCheckImpact used internally by cron at line 1269

// Revisions (specific /:id/comments BEFORE /:id)
defineRoute({
  method: 'POST',
  path: '/api/revisions',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleCreateRevision(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/comments/:id',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleUpdateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/:id/comments',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleCreateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/:id',
  auth: 'authed',
  entity: 'revisions',
  visibility: 'na',
  handler: (c) => handleUpdateRevision(c.req.param('id'), R(c), USER(c), E(c)),
});

// Submissions
defineRoute({
  method: 'POST',
  path: '/api/submissions',
  auth: 'authed',
  entity: 'submissions',
  visibility: 'na',
  handler: (c) => handleCreateSubmission(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/submissions/:id/delete',
  auth: 'authed',
  entity: 'submissions',
  visibility: 'na',
  handler: (c) => handleDeleteSubmission(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/submissions/:id',
  auth: 'authed',
  entity: 'submissions',
  visibility: 'na',
  handler: (c) => handleUpdateSubmission(c.req.param('id'), R(c), USER(c), E(c)),
});

// Mentee milestones
defineRoute({
  method: 'POST',
  path: '/api/mentee-milestones',
  auth: 'authed',
  entity: 'mentee-milestones',
  visibility: 'na',
  handler: (c) => handleCreateMenteeMilestone(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/mentee-milestones/:id/complete',
  auth: 'authed',
  entity: 'mentee-milestones',
  visibility: 'na',
  handler: (c) => handleCompleteMenteeMilestone(c.req.param('id'), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/mentee-milestones/:id',
  auth: 'authed',
  entity: 'mentee-milestones',
  visibility: 'na',
  handler: (c) => handleUpdateMenteeMilestone(c.req.param('id'), R(c), USER(c), E(c)),
});

// Grant post-award milestones
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones',
  auth: 'authed',
  entity: 'grant-milestones',
  visibility: 'na',
  handler: (c) => handleCreateGrantMilestone(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones/:id/complete',
  auth: 'authed',
  entity: 'grant-milestones',
  visibility: 'na',
  handler: (c) => handleCompleteGrantMilestone(c.req.param('id'), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones/:id',
  auth: 'authed',
  entity: 'grant-milestones',
  visibility: 'na',
  handler: (c) => handleUpdateGrantMilestone(c.req.param('id'), R(c), USER(c), E(c)),
});

// Grants (PATCH only — R10 inline editing)
defineRoute({
  method: 'POST',
  path: '/api/grants/:id',
  auth: 'authed',
  entity: 'grants',
  visibility: 'na',
  handler: (c) => handleUpdateGrant(c.req.param('id'), R(c), E(c)),
});

// Regulatory
defineRoute({
  method: 'POST',
  path: '/api/regulatory',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'na',
  handler: (c) => handleCreateRegulatoryItem(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/regulatory/:id/renew',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'na',
  handler: (c) => handleRenewRegulatoryItem(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/regulatory/:id',
  auth: 'authed',
  entity: 'regulatory',
  visibility: 'na',
  handler: (c) => handleUpdateRegulatoryItem(c.req.param('id'), R(c), USER(c), E(c)),
});

// Conferences
defineRoute({
  method: 'POST',
  path: '/api/conferences',
  auth: 'authed',
  entity: 'conferences',
  visibility: 'na',
  handler: (c) => handleCreateConference(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/conferences/:id/delete',
  auth: 'authed',
  entity: 'conferences',
  visibility: 'na',
  handler: (c) => handleDeleteConference(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/conferences/:id',
  auth: 'authed',
  entity: 'conferences',
  visibility: 'na',
  handler: (c) => handleUpdateConference(c.req.param('id'), R(c), USER(c), E(c)),
});

// Deadline dependencies
defineRoute({
  method: 'POST',
  path: '/api/deadline-dependencies',
  auth: 'authed',
  entity: 'deadline-cascade',
  visibility: 'na',
  handler: (c) => handleCreateDeadlineDependency(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/deadline-dependencies/:id/delete',
  auth: 'authed',
  entity: 'deadline-cascade',
  visibility: 'na',
  handler: (c) => handleDeleteDeadlineDependency(c.req.param('id'), R(c), E(c)),
});

// Digest email
defineRoute({
  method: 'POST',
  path: '/api/digest-email',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleGenerateDigestEmail(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest-email/send',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleSendDigestEmail(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest-email/daily',
  auth: 'authed',
  entity: 'digest',
  visibility: 'na',
  handler: (c) => handleSendDailyDigests(E(c), { kind: 'http', request: R(c) }),
});

// Email drafts sync
defineRoute({
  method: 'POST',
  path: '/api/email-drafts/sync-bulk',
  auth: 'authed',
  entity: 'email-drafts',
  visibility: 'na',
  handler: (c) => handleSyncEmailDrafts(R(c), E(c)),
});

// File activity sync
defineRoute({
  method: 'POST',
  path: '/api/file-activity/sync',
  auth: 'authed',
  entity: 'file-activity',
  visibility: 'na',
  handler: (c) => handleSyncFileActivity(R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/migrate and /api/test-cleanup removed 2026-05-15.
// Security: any authenticated user could run DB migrations or delete data.
// Schema changes go through wrangler d1 execute + migration files in migrations/. // wrangler-d1-allowed
// Test cleanup uses /api/tasks/batch (action='delete').
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

// Z1.3 (2026-05-28): wire every defineRoute({...}) above into the Hono app.
// Single registration site — replaces the per-line app.get/post calls that
// the migration deleted. ROUTE_REGISTRY is populated by side-effect as each
// defineRoute({...}) above evaluates at module-load.
bindRegistryToHono(app);

app.notFound(() => error('Not found', 404));

// ─────────────────────────────────────────────────────────────────────────────
// Default export: { fetch, scheduled } — matches Cloudflare Worker module shape.
// - fetch: Hono app, invoked by functions/api/[[route]].ts for all /api/* requests.
// - scheduled: dispatches by event.cron (explicit switch — each cron fires exactly
//   one handler):
//     "0 * * * *"      → ledger prune (all LEDGER_REGISTRY tables) + D1 health monitor
//                         + calendar feed poller (iCal hourly, 24/day)
//     "0 13 * * 1-5"   → morning pulse email (weekday 7 AM CT)
//     "0 11 * * *"     → coordinator daily digest (6 AM CT every day)
//   NOTE: cron "*/15 * * * *" was removed in commit 441ec212 (2026-05-05);
//   the guard here was not updated at the time — fixed in this commit.
// ─────────────────────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch.bind(app),

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    switch (event.cron) {
      // ── DB maintenance prune + D1 health monitor + iCal feed poller ─────
      case '0 * * * *': {
        // Prune ALL registered ledger tables (bounded-ledger primitive, 2026-06-18).
        // pruneAllLedgers() replaces the previous single-DELETE for processed_mutations
        // (e3027fc6). It handles every table in LEDGER_REGISTRY with chunked DELETEs
        // (5k rows/chunk, max 20 chunks/table/run) so it can dig out a backlog without
        // timing out. Runs BEFORE the calendar poll so the DB is lighter before
        // the iCal batch writes.
        const pruneResults = await pruneAllLedgers(env.DB)

        // Compact processed_mutations JSON: null out original_response_json on
        // 'accepted' rows older than 48h. Cuts per-row size ~10x for the bulk
        // of the ledger while preserving exact-replay within the practical retry
        // window. Non-fatal: a compaction failure never blocks the calendar poll.
        // See: backlog #36, ledger-retention.ts compactProcessedMutationsJson().
        try {
          await compactProcessedMutationsJson(env.DB)
        } catch (e) {
          console.error('[LedgerCompact] JSON compaction failed (non-fatal):', (e as Error).message)
        }

        // D1 health monitor: row counts + oldest rows for all ledger tables.
        // Inserts a notification for nick-ingraham if any table exceeds its budget.
        // Non-fatal: errors are logged but never block the calendar poll.
        try {
          await monitorD1Health(env.DB, pruneResults)
        } catch (e) {
          console.error('[D1Health] monitor failed (non-fatal):', (e as Error).message)
        }

        console.log('[CalendarCron] Starting iCal feed poll...')
        try {
          await pollAllStaleFeeds(env)
        } catch (e) {
          console.error('[CalendarCron] Unhandled error:', (e as Error).message)
        }
        return
      }

      // ── Morning Pulse Email (weekdays 7 AM CT = 13:00 UTC) ───────────────
      case '0 13 * * 1-5': {
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

          // Get recent team activity (last 24 hours) — activity_entries kind='update'
          const recentUpdates = await env.DB.prepare(
            "SELECT actor_slug AS author, body AS content, project_id FROM activity_entries WHERE entity_type='project' AND kind='update' AND created_at > datetime('now', '-1 day') AND actor_slug != ? ORDER BY created_at DESC LIMIT 5"
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
              const overdue = item.due_date && item.due_date < ctToday();
              const dueLabel = item.due_date
                ? `<span style="color:${overdue ? '#7a0019' : '#64748b'};font-size:12px;"> — ${overdue ? 'overdue' : 'due'} ${escapeHtml(item.due_date)}</span>`
                : '';
              itemsHtml += `<li style="margin-bottom:8px;font-size:14px;color:#0f1923;">${escapeHtml(item.description.replace(/^\[Carried forward\]\s*/i, ''))}${dueLabel}</li>`;
            }
            itemsHtml += '</ul>';
          }

          if (futureNoteItems.length > 0) {
            itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;border-left:3px solid #c9a84c;padding-left:8px;">Notes From Past You</h3>';
            for (const fn of futureNoteItems) {
              const label = fn.mechanism ? `${escapeHtml(fn.mechanism)}: ${escapeHtml(fn.title)}` : escapeHtml(fn.title);
              itemsHtml += `<div style="margin:12px 0;padding:12px 14px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.15);border-left:3px solid #c9a84c;border-radius:8px;">`;
              itemsHtml += `<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0f1923;">${label} <span style="font-size:11px;font-weight:400;color:#64748b;">— due ${escapeHtml(fn.target_date)}</span></p>`;
              itemsHtml += `<p style="margin:0;font-size:13px;color:#0f1923;font-style:italic;line-height:1.5;">${escapeHtml(fn.future_note)}</p>`;
              itemsHtml += `</div>`;
            }
          }

          if (unread > 0) {
            itemsHtml += `<p style="font-size:14px;color:#0f1923;margin-top:16px;">You have <strong style="color:#c9a84c;">${unread}</strong> unread notification${unread > 1 ? 's' : ''} on the Hub.</p>`;
          }

          if (updates.length > 0) {
            itemsHtml += '<h3 style="color:#c9a84c;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-top:20px;">Team Activity</h3><ul style="padding-left:20px;">';
            for (const u of updates) {
              itemsHtml += `<li style="margin-bottom:6px;font-size:13px;color:#2c3e50;">${escapeHtml(u.author)}: ${escapeHtml(u.content.slice(0, 100))}${u.content.length > 100 ? '...' : ''}</li>`;
            }
            itemsHtml += '</ul>';
          }

          const html = `
<!DOCTYPE html>
<html>
<body style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#faf8f3;">
  <div style="border-bottom:2px solid #c9a84c;padding-bottom:12px;margin-bottom:20px;">
    <h1 style="font-family:Georgia,serif;font-size:22px;color:#0f1923;margin:0;">Good morning, ${escapeHtml(firstName)}</h1>
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
        return;
      }

      // ── Daily Coordinator Digest (every day 6 AM CT = 11:00 UTC) ─────────
      case '0 11 * * *': {
        console.log('[DailyDigest] Triggering coordinator daily brief...');
        try {
          await handleSendDailyDigests(env, { kind: 'cron' });
        } catch (e) {
          console.log(`[DailyDigest] Failed (non-fatal): ${e}`);
        }
        return;
      }

      default:
        console.warn(`[scheduled] Unknown cron expression: ${event.cron} — no handler registered`);
        return;
    }
  },
};
