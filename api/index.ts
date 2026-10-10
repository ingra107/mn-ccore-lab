import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from './types';
import { slugClaimCheck } from './lib/project-slug';
import { corsHeaders, corsHeadersFor, json, error, getAuthUser, isPiRequest, getPiEmails, isTeamMember, actorSlugFromRequest, logActivity } from './helpers';
import { viewerDb, personViewer, serviceViewer, nobodyViewer, isSiteAdmin, ALL_PROJECTS_HEADER, type Viewer } from './lib/viewer-db';

// The PB service key IS Nick's automation (Brief-7, 2026-06-11).
const PB_SERVICE_EMAIL = 'ingra107@umn.edu';
const PB_SERVICE_SLUG = 'nick-ingraham';
// Z1.3 (2026-05-28): metadata-first route registration. Every defineRoute({...})
// below populates ROUTE_REGISTRY; bindRegistryToHono(app) wires them all into
// the Hono app at the end of the file (before app.notFound). Replaces the
// raw app.get/post calls.
import { defineRoute, bindRegistryToHono } from './lib/route-dsl';
import type { HttpMethod, CallerKind } from './lib/route-dsl';
import type { AnonRowFilter, AnonShape } from './lib/anon-shape';
import type { AuthUser } from './helpers';
import { validateApiKey } from './middleware/api-key-auth';
import { handleVersion, bumpVersion } from './lib/version';
import { ctToday } from './lib/ct-date';
import { nowInstant } from './lib/time';
import { notifyClients, realtimeHub } from './lib/notify';
import { REALTIME_TICKET_PATH } from '../shared/realtime';
import { handleUploadUrl, handleUploadDone, handleListFiles, handleGetFile, handleDeleteFile } from './routes/uploads';

// ── Route modules ──────────────────────────────────────────
import { handleGetTasks, handleGetTask, handleOverdueCount, handleUpdateTaskStatus, handleUpdateTask, handleCreateTask, handleGetTaskComments, handleAddTaskComment, handleGetTaskActivity, handleGetTaskDetail, handleGetRecentTaskUpdates, handleGetRecentTaskComments, handlePostTaskUpdate, handleBatchUpdateTasks, handleAcknowledgeTask, handleDeleteTask, handleRestoreTask, handleMobileTasksToHub } from './routes/tasks';
import { handleMarkSeen, handleGetUnseenActivity, handleGetThreadSeen, handleMarkThreadSeen } from './routes/seen';
import { handleInboxEvents, handleSyncBulkInboxEvents, handleDeleteInboxEvent, handleCreateInboxEvent } from './routes/inbox-events';
import { handleMutations } from './routes/mutations';
import { handleGetProjectMembers, handleAddProjectMember, handleRemoveProjectMember, handleGetMemberProjects } from './routes/project-members';
import { handleGetPins, handleCreatePin, handleDeletePin } from './routes/pins';
import { handleGetProjects, handleGetProject, handleCreateProject, handleGetComments, handleGetProjectUpdates, handleGetProjectActivity, handleProjectHealth, handleRecentUpdates, handleUpdateProject, handleDeleteProject, handleGetDeletedProjectsSince, handleAddComment, handlePostProjectUpdate, handleGetMilestones, handleUpdateMilestoneNote, handleUpdateMilestoneCompletion } from './routes/projects';
import { handleGetMeetings, handleNextMeeting, handleGetMeeting, handleGetAgendaItems, handleAddAgendaItem, handleReorderAgenda, handleCreateMeeting, handleUpdateMeetingNotes, handleUpdateMeetingMeta, handleMeetingPrep, handleGenerateAgenda, handlePrepMeetingFromEvent, handleGrantMeetingProject, handleRevokeMeetingProject, handleMeetingAccess } from './routes/meetings';
import { handleGetPublications, handleGetGrants, handleGetStats, handleGrantsTimeline, handleUpdateGrant } from './routes/publications';
import { handleGetCitations } from './routes/citations';
import { handleGetTeam, handleTeamSlugs, handleUpdateTeamMember, handleCreateTeamMember } from './routes/team';
import { handleGetMemberFeaturedPublications, handlePutMemberFeaturedPublications } from './routes/member-featured-publications';
import { handleGetDigest, handleDigestDates, handleUpdateDigestStatus, handleCreateDigestPaper, handleGetDigestComments, handleCreateDigestComment, handleDigestCommentCounts } from './routes/digest';
import { handleGetIdeas, handleCreateIdea, handleUpdateIdea, handleVoteIdea } from './routes/ideas';
import { handleBugReport, handleListBugReports, handleUpdateBugReportStatus } from './routes/bug-report';
import { handleNotifications, handleNotificationCount, handleMarkNotificationRead, handleMarkAllNotificationsRead, handleCommitments, handleCreateCommitment } from './routes/notifications';
import { handleGetSearch } from './routes/search';
import { handleGetSettings, handleUpdateSettings, handleGetWorkflowTemplates, handleCreateWorkflowTemplate } from './routes/settings';
import { handleGetReactions, handleToggleReaction } from './routes/reactions';
import { handleCalendarEvents } from './routes/calendar';
import { handleTodayMentees } from './routes/today-mentees';
import { handleListFeeds, handleAddFeed, handleDeleteFeed, handleListEvents, pollAllStaleFeeds } from './routes/calendar-feeds';
import { handleGetActivity, handleActivityHeatmap, handleDeleteActivityEntry, handleEditActivityEntry, handleSetActivityHidden, handleGetActivityReplies, handleCreateActivityReply } from './routes/activity';
import { handleGetDayActivity, handlePostDayActivity } from './routes/days';
import { handleGetMeetingActivity, handlePostMeetingActivity } from './routes/meeting-activity';
import { handleGetSubtasks, handleCreateSubtask, handleToggleSubtask, handleDeleteSubtask, handleReorderSubtasks } from './routes/subtasks';
import { handleTeamPulse } from './routes/team-pulse';
import { handleGetPaperLinks, handleLinkPaper, handleUnlinkPaper, handlePapersByPublication } from './routes/paper-links';
import { handleGetProjectPublications, handleLinkProjectPublication, handleUnlinkProjectPublication, handleGetAllProjectPublications } from './routes/project-publications';
import { handleInsightConnections, handleInsightSuggestions, handleInsightsDashboard } from './routes/insights';
import { handleGetDependencies, handleGetProjectDependencies, handleCreateDependency, handleDeleteDependency } from './routes/dependencies';
import { handleTrajectory } from './routes/trajectory';
import { handleGetContributions } from './routes/contributions';
import { handleContributionsDecay } from './routes/contributions-decay';
import { handleSimilarGrants } from './routes/grant-intelligence';
import { handleGetDecisions, handleCreateDecision, handleUpdateDecisionOutcome, handleGetDecisionsNeedingReview, handleGetDecisionTags } from './routes/decisions';
import { handleSimilarDecisions, handleSimilarDecisionsById } from './routes/decision-replay';
import { handleGetNarratives } from './routes/narratives';
import { handleGetExpertise, handleAddExpertise, handleRemoveExpertise } from './routes/expertise';
import { handleGetQuestions, handleGetQuestionDetail, handleCreateQuestion, handleCreateAnswer, handleAcceptAnswer } from './routes/questions';
import { handleGetHandoffs, handleCreateHandoff, handleAcknowledgeHandoff } from './routes/handoffs';
import { handleCheckImpact } from './routes/impact-trace';
// pi-analytics.ts retired 2026-05-05 (5.9) — 0 frontend callers; /api/analytics/pi-dashboard is canonical
import { handlePIDashboard, handleMenteeVelocity, handleResponseTime, handleTeamEngagement } from './routes/pi-dashboard';
import { handleCadenceCheck } from './routes/meeting-cadence';
import { handleGetAIRequests, handleCreateAIRequest, handleUpdateAIResponse } from './routes/ai-requests';
import { handleGetHermesDayIndex } from './routes/hermes';
import { handleCreateLaunch, handleListLaunches, handleSetLaunchStatus, handleRefireLaunch, handleClaimLaunch, handleListPendingLaunches } from './routes/launch-log';
import { handleGetArtifacts, handleGetArtifact, handleGetArtifactActivity, handleCreateArtifact, handleReviseArtifact, handleAddArtifactComment, handleGetArtifactGallery, handleSearchArtifacts, handleGetArtifactTags, handleAddArtifactTag, handleRemoveArtifactTag } from './routes/artifacts';
import { escapeHtml } from './lib/escapeHtml';
import { HUB_URL, isEmailRecipient, raw, sendEmail, warnIfRecipientsMatchNobody } from './lib/email';
import { handlePBCapture, handlePBDefer, handleAddToDispatch, handleGetPendingDispatch, handleSendDispatch, handleCompleteDispatchItem } from './routes/pb-sector';
import { handlePBSessions, handlePBSessionStats, handleCreatePBSession, handleBulkCreatePBSessions } from './routes/pb-sessions';
import { handleGetSessions } from './routes/sessions';
import { handleLane3List } from './routes/lane3';
import { handleGetTodayMd } from './routes/pb-today'; // POST /api/pb/today retired 2026-05-05 (5.9)
import { handlePBHealth } from './routes/pb-health';
import { handleGetRevisions, handleCreateRevision, handleUpdateRevision, handleGetRevisionComments, handleCreateRevisionComment, handleUpdateRevisionComment, handleAttentionManuscripts } from './routes/revisions';
import { handleGetMenteeMilestones, handleMenteeMilestoneOverview, handleCreateMenteeMilestone, handleUpdateMenteeMilestone } from './routes/mentee-milestones';
import { handleGetCascade, handleGetImpact, handleGetAllCascades } from './routes/deadline-cascade';
import { handleGetSubmissions, handleCreateSubmission, handleUpdateSubmission, handleDeleteSubmission, handleGetActiveSubmissions } from './routes/submissions';
import { handleGetRegulatoryItems, handleGetExpiringItems, handleCreateRegulatoryItem, handleUpdateRegulatoryItem, handleRegulatoryIcs } from './routes/regulatory';
import { handleGetGrantMilestones, handleUpcomingGrantMilestones, handleCreateGrantMilestone, handleUpdateGrantMilestone, handleCompleteGrantMilestone } from './routes/grant-milestones';
import { handleGetConferences, handleGetUpcomingConferences, handleCreateConference, handleUpdateConference, handleDeleteConference } from './routes/conferences';
import { handleGetProjectDocuments, handleCreateProjectDocument, handleDeleteProjectDocument } from './routes/project-documents';
import { handleProactiveBrief } from './routes/proactive-brief';
import { handleGetFileActivity, handleSyncFileActivity } from './routes/file-activity';
import { handleDigestPreview, handleSendDailyDigests } from './routes/digest-email';
import { pruneAllLedgers, monitorD1Health, compactProcessedMutationsJson } from './lib/ledger-retention';
import { projectResponseFor } from './lib/pi-only-project-fields';
import { handleGetLinks, handleGetTaskLinks, handleGetProjectLinks, handleGetAllProjectLinks, handleSetLinkRole } from './routes/links';
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
    /** T2.7: precomputed PI flag (set by the /api/* middleware): a PI
     *  email or a valid PB API key. A privilege flag, not a visibility rule:
     *  which rows a caller reads is `viewer` below. Read via PI(c). */
    isPi: boolean;
    /** #145: whose rows this request may read. Set with the isPi flag;
     *  env.DB is already bound to it (viewerDb). */
    viewer: Viewer;
    /** #145: the database BEFORE viewer binding. Read ONLY by GET /api/health
     *  (aggregate counts that must not depend on who is asking) and POST
     *  /api/digest-email/daily (it rebinds the database per recipient). Pinned
     *  to those two readers by api/health-unscoped.test.ts. */
    unscopedDb: D1Database;
    /** Who the route gate sees (member / non-member / anonymous), set by the
     *  auth middleware. Read only by bindRegistryToHono and /api/auth/me. */
    callerKind: CallerKind;
  };
};

// The Hono instance. Routes are attached to it in exactly one place,
// bindRegistryToHono at the end of this file, which wraps every handler in the
// member gate. `app` below is the same object with its route-binding methods
// removed from the type, so a raw app.get/post/put/delete here (a route the
// member gate never sees) does not compile. Middleware (use), preflight
// (options), errors and not-found stay.
const hono = new Hono<AppEnv>();
const app: Omit<Hono<AppEnv>, 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all' | 'on' | 'route' | 'mount' | 'basePath'> = hono;

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous reads. There is no list of public paths here any more: a GET route
// is readable without sign-in only when its own defineRoute() says
// auth: 'public', and then the caller sees only the fields its `anonShape`
// names (api/lib/anon-shape.ts, applied by bindRegistryToHono). The old
// path allowlist (isPublicGet) drifted from the route metadata in both
// directions: /api/projects/deleted-since and /api/digest/:id/comments were
// readable, /api/activity/:id/replies (declared public) was not.
//
// Publication rows are public record; the same shape serves the full list
// and a member's featured list.
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_PUBLICATION: AnonShape = {
  id: true, title: true, authors: true, journal: true, year: true, status: true,
  doi: true, pubmed: true, abstract: true, topics: true, featured: true, author_slugs: true,
};
// Logged-out visitors see published work only; 'In Preparation' and
// 'In Review' rows (title, authors, abstract) stay with signed-in members.
// 'Published' is the only finished value in prod and the POST default.
const PUBLISHED_ONLY: AnonRowFilter = (row) => row.status === 'Published';

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
  // carry no CF Access JWT — the slug was the literal string
  // 'anonymous', which renders as a person named "anonymous" on all feeds.
  // Fix: when a valid API key is present and no browser session is resolved,
  // use Nick's canonical identity (the service key IS Nick's automation; PB is
  // his personal system). Its slug is a constant, not a team_members lookup:
  // an editable email row must not decide who PB automation writes as, and
  // sync requests skip a query.
  const user: AuthUser = authed
    ?? (result === true
      ? { email: PB_SERVICE_EMAIL, name: 'Nick', slug: PB_SERVICE_SLUG }
      : { email: 'anonymous', name: 'Team Member', slug: 'anonymous' });
  c.set('user', user);
  // Membership (2026-10-08). Cloudflare Access admits any @umn.edu account and
  // the CF_Authorization cookie identifies it on /api/* too, so a signed-in
  // identity is a member only when a team_members row carries its email (or it
  // is a PI email). Nothing is written here: the old ensureTeamMember created
  // a row for every unknown email and claimed rows by email prefix. A lookup
  // failure throws (500), it never admits.
  const requireAuth = (env as unknown as { REQUIRE_AUTH?: string }).REQUIRE_AUTH === '1';
  let kind: CallerKind;
  if (result === true) kind = 'member';
  else if (authed) kind = (await isTeamMember(env, authed.email)) ? 'member' : 'non-member';
  else kind = requireAuth ? 'anonymous' : 'member';
  c.set('callerKind', kind);
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
// 4. Read + member lockdown lives in bindRegistryToHono (api/lib/route-dsl.ts),
// at the end of this file, keyed on c.var.callerKind (set above). With
// REQUIRE_AUTH=1 an anonymous caller of a route that is not a public GET gets
// 401 before its handler runs; a signed-in non-member gets 403 on every route
// except a public GET, which it reads through the route's anonShape like an
// anonymous caller (GET /api/auth/me alone answers it in full). The decision
// rides on the route Hono actually matched, so it cannot disagree with the
// route metadata. A path with no route gets Hono's 404.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 5. Write-method auth gate + user resolution.
//
// backlog #909 (2026-07-25): this gate used to test
// `method !== 'POST' && method !== 'PUT'`, so DELETE (and any future write
// method) skipped it entirely — a request could only be 401'd here if it
// happened to be POST or PUT. The one live DELETE route
// (DELETE /api/artifacts/:id/tags/:tag) survived only because its handler
// remembers to check `isAnonymous(user)` itself — a Level-3 scattered guard,
// not a chokepoint.
//
// Fix: gate every method EXCEPT GET (GET is gated per route in
// bindRegistryToHono). WRITE_AUTH_METHODS is typed as
// `Record<Exclude<HttpMethod, 'GET'>, true>` — a mapped type over the SAME
// HttpMethod union route-dsl.ts uses to constrain defineRoute(). Every route
// in this file is registered exclusively through defineRoute +
// bindRegistryToHono (no raw app.get/post/put/delete calls exist), so
// HttpMethod is the complete set of methods any handler can ever be bound
// to. If a 5th value is ever added to HttpMethod, TypeScript refuses to
// compile this file until WRITE_AUTH_METHODS is updated to cover it —
// the missing-gate class this bug belongs to becomes a compile error
// instead of a silent hole (ethos #15, Level 1: the wrong state — a
// write method with no auth gate — is unrepresentable, not merely guarded).
//
// If REQUIRE_AUTH=1 and neither a CF Access JWT nor a valid API key is
// present, return 401. Otherwise fall back to the anonymous "Team Member"
// identity (preserves pre-launch PI-only behavior).
// ─────────────────────────────────────────────────────────────────────────────
const WRITE_AUTH_METHODS: Record<Exclude<HttpMethod, 'GET'>, true> = {
  POST: true,
  PUT: true,
  DELETE: true,
};
app.use('*', async (c, next) => {
  if (!(c.req.method in WRITE_AUTH_METHODS)) {
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
  // `user` was set by the first middleware (authed / PB service / anonymous,
  // slug resolved from team_members); it is not re-derived here (#8945).
  await next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 5b. T2.7 (2026-05-28): resolve the PI flag ONCE per request (a PI email
// or a valid API key; each isPiRequest call re-parses the JWT or re-validates
// the key) and stash it as c.get('isPi'). It grants PI privileges (typed wire
// rows, author-only notes, adding members); it never decides which projects
// a caller sees. Since 2026-10-09 (Nick) project membership is the only
// visibility rule, applied by the viewer-bound handle set here.
// ─────────────────────────────────────────────────────────────────────────────
//
// #145: the same middleware binds the request's database to its viewer. Every
// handler reads `E(c).DB`, so from here on a member's reads (and UPDATE/DELETE
// targets) are limited to the rows the table rules in api/lib/table-scope.ts
// admit; see api/lib/viewer-db.ts. The middleware above this one (auth, the
// /api/pb/* gate, the write gate) decides WHO is calling on the raw handle.
//   - valid PB Bearer key           -> service (never scoped)
//   - signed-in member              -> person (scoped per table: projects,
//                                      tasks and their rows by membership for
//                                      everyone, a PI included; meetings by
//                                      owner / attendee / lab / granted
//                                      project for everyone, with no PI or
//                                      admin exemption; PB-session rows
//                                      exempt a PI)
//   - the site admin (Nick) sending X-Hub-All-Projects: 1 -> person with
//     allProjects: the project rules lift for that request only (never
//     the meeting rule). Anyone else
//     sending the header gets the ordinary scoped viewer (personViewer
//     ignores it), so it is a server capability, not a client filter.
//   - anyone else (anonymous, a non-member reading a public GET, a
//     credential-less local-dev caller) -> nobody
app.use('/api/*', async (c, next) => {
  const env = c.get('env');
  const pi = await isPiRequest(c.req.raw, env);
  c.set('isPi', pi);
  const authed = c.get('authedUser');
  const viewer: Viewer = c.get('apiKeyValid') === true
    ? serviceViewer()
    : authed && c.get('callerKind') === 'member'
      ? personViewer({ slug: authed.slug, email: authed.email, pi, allProjects: c.req.header(ALL_PROJECTS_HEADER) === '1' })
      : nobodyViewer();
  c.set('viewer', viewer);
  c.set('unscopedDb', env.DB);
  c.set('env', { ...env, DB: viewerDb(env.DB, viewer) });
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
// T2.7: the precomputed PI flag (a PI email or a valid API key).
const PI = (c: Context<AppEnv>) => c.get('isPi') === true;
// The PB service key: its handle is unscoped, and the file routes let it read
// a file by key alone.
const SERVICE = (c: Context<AppEnv>) => c.get('apiKeyValid') === true;

// ─────────────────────────────────────────────────────────────────────────────
// Meta + auth endpoints
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/auth/me',
  auth: 'public',
  anonShape: { authenticated: true },
  // A signed-in non-member reads this in full: it is how the SPA knows to
  // show the members-only page. It gets its own identity and nothing else.
  servesNonMembers: true,
  handler: async (c) => {
  const env = E(c);
  const user = c.get('authedUser') || (await getAuthUser(c.req.raw, env));
  if (!user) return json({ authenticated: false }, 200);
  if (c.get('callerKind') === 'non-member') {
    return json({ authenticated: true, isMember: false, isPi: false, email: user.email, name: user.name ?? '' });
  }
  const piEmails = await getPiEmails(env);
  const isPi = piEmails.has(user.email.toLowerCase());
  // #8945: `slug` (on `user`) is the caller's identity, resolved from
  // team_members.email — the UI reads it instead of deriving one from the
  // email string. `directory` lets the UI render OTHER people's stored emails
  // (tasks.assigned_by holds an email) with the same resolution, pre-
  // provisioned rows first, as resolveSlug. Authed callers already see every
  // team_members email on GET /api/team.
  const dir = await env.DB.prepare(
    `SELECT email, slug FROM team_members
     WHERE email IS NOT NULL AND email != '' AND slug IS NOT NULL AND slug != ''
     ORDER BY auto_created ASC, created_at ASC`
  ).all<{ email: string; slug: string }>();
  // #145 Lane B: the Projects page shows its "show all projects" switch only
  // when this is true; the server ignores the switch's header for anyone else.
  const canShowAllProjects = isSiteAdmin({ slug: user.slug, pi: isPi });
  return json({ authenticated: true, isMember: true, isPi, canShowAllProjects, ...user, directory: dir.results ?? [] });
},
});

defineRoute({
  method: 'GET',
  path: '/api/version',
  auth: 'public',
  anonShape: { version: true, env: true },
  handler: (c) => handleVersion(E(c)),
});

defineRoute({
  method: 'GET',
  path: '/api/health',
  auth: 'public',
  anonShape: { ok: true, failures: [true], timestamp: true },
  handler: async (c) => {
  // #145 Lane B: the health counts are about the DATABASE, not the caller. On
  // the viewer-bound handle an anonymous caller (the post-deploy probe) reads
  // zero tasks and the check answered 503 'tasks table empty'. The counts run
  // on the unscoped handle; only ok/failures/timestamp reach an anonymous
  // caller (anonShape), never a row.
  const unscoped: D1Database = c.get('unscopedDb') ?? E(c).DB;
  const env: Env = { ...E(c), DB: unscoped };
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

  const hub = realtimeHub(env);
  if (hub) {
    try {
      checks.realtime = await hub.ping();
    } catch (e) {
      checks.realtime = `probe_error: ${(e as Error).message.slice(0, 40)}`;
      failures.push('realtime unreachable');
    }
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
  handler: (c) => handleGetPendingDispatch(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/today',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleGetTodayMd(E(c)),
});
// PI-gated: sessions + lane3 contain private brain.db data. R(c) carries JWT/API-key
// so isPiRequest inside the handler can distinguish PI/service from team callers.
// Realtime connect ticket (2026-10-08). The hub-realtime worker refuses a
// WebSocket upgrade without a live single-use ticket, and only this route mints
// one. auth: 'authed' puts it behind the route gate (members only once the
// member gate is on), so the worker never decides who is a member.
defineRoute({
  method: 'GET',
  path: REALTIME_TICKET_PATH,
  auth: 'authed',
  entity: 'misc',
  handler: async (c) => {
    const hub = realtimeHub(E(c));
    if (!hub) return error('Realtime is not available on this deployment', 503);
    // The slug the auth middleware resolved from team_members; the DO stamps
    // it on everything this connection relays.
    const slug = USER(c)?.slug;
    if (!slug || slug === 'anonymous') return error('No member identity for a realtime ticket', 403);
    const ticket = await hub.issueTicket(slug);
    return new Response(JSON.stringify({ ticket }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders },
    });
  },
});
defineRoute({
  method: 'GET',
  path: '/api/sessions',
  auth: 'authed',
  entity: 'sessions',
  handler: (c) => handleGetSessions(U(c), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/lane3/:table',
  auth: 'authed',
  entity: 'misc',
  handler: (c) => handleLane3List(c.req.param('table'), U(c), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/sessions',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handlePBSessions(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/sessions/stats',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handlePBSessionStats(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/health',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handlePBHealth(E(c)),
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
  handler: (c) => handlePIDashboard(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/mentee-velocity',
  auth: 'authed',
  entity: 'analytics',
  handler: (c) => handleMenteeVelocity(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/response-time',
  auth: 'authed',
  entity: 'analytics',
  handler: (c) => handleResponseTime(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/team-engagement',
  auth: 'authed',
  entity: 'analytics',
  handler: (c) => handleTeamEngagement(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/analytics/contributions',
  auth: 'authed',
  entity: 'analytics',
  handler: (c) => handleContributionsDecay(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Digest (specific first, catch-all last)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/digest/dates',
  auth: 'authed',
  entity: 'digest',
  handler: (c) => handleDigestDates(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest/comment-counts',
  auth: 'authed',
  entity: 'digest',
  handler: (c) => handleDigestCommentCounts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest',
  auth: 'public',
  anonShape: {
    // The Home page's LatestDigest card: title, journal, topic chips, score.
    data: [{ id: true, title: true, journal: true, topics: true, relevance_score: true }],
    count: true,
  },
  handler: (c) => handleGetDigest(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest/:id/comments',
  auth: 'authed',
  entity: 'digest',
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
  handler: (c) => handleInsightConnections(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/insights/suggestions',
  auth: 'authed',
  entity: 'insights',
  handler: (c) => handleInsightSuggestions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/insights/dashboard',
  auth: 'authed',
  entity: 'insights',
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
  path: '/api/papers/by-publication',
  auth: 'authed',
  entity: 'misc',
  handler: (c) => handlePapersByPublication(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects (ordering matters: revisions > papers > dependencies > :slug etc.)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/projects/health',
  auth: 'public',
  anonShape: {
    // The /pulse kiosk's health scene reads only the summary counts.
    summary: { total: true, healthy: true, needs_attention: true, at_risk: true, critical: true, avg_score: true },
  },
  handler: (c) => handleProjectHealth(E(c)),
});
// Tombstone endpoint — consumed by sync_d1_pull.pull_hub_projects to mirror
// Hub project deletes into brain.db. Airtable cascade comment: handleDeleteProject
// writes deleted_at and (when secrets present) DELETEs the matching Airtable rec.
defineRoute({
  method: 'GET',
  path: '/api/projects/deleted-since',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetDeletedProjectsSince(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/comments',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetComments(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/updates',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectUpdates(c.req.param('slug'), R(c), E(c)),
});
// Design C (v77): whole-picture project activity feed (project rows + task
// rollup by project_id). Visibility-gated inside the handler.
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/activity',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectActivity(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/documents',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectDocuments(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/papers',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetPaperLinks(c.req.param('slug'), E(c)),
});
// #129 (2026-09-16): a project's PUBLISHED OUTPUT — the project_publications
// junction (role primary/secondary/preprint). Distinct from /papers, which is
// the reading list. GET /api/project-publications feeds the list-page chips.
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/publications',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectPublications(c.req.param('slug'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/publications',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleLinkProjectPublication(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/publications/:pubId/delete',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleUnlinkProjectPublication(c.req.param('slug'), c.req.param('pubId'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/project-publications',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetAllProjectPublications(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/dependencies',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectDependencies(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/revisions',
  auth: 'authed',
  entity: 'projects',
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
  anonShape: {
    // Home and /pulse count active projects from `status`; nothing public
    // renders a project's title, notes, links or folders.
    data: [{ status: true }],
    count: true,
  },
  // P7: a non-PI never receives the PI's local-path fields (api/lib/pi-only-project-fields.ts).
  handler: async (c) => projectResponseFor(c.get('isPi') === true, await handleGetProjects(U(c), E(c))),
});
// GET /api/projects/:id — single-record fetch by id or slug (codex Q4 2026-05-12).
// Must be registered AFTER static paths (/health, /deleted-since) and before POST routes
// so Hono resolves statics first. Mirrors handleGetTask pattern (tasks.ts:133).
defineRoute({
  method: 'GET',
  path: '/api/projects/:id',
  auth: 'authed',
  entity: 'projects',
  handler: async (c) => projectResponseFor(c.get('isPi') === true, await handleGetProject(c.req.param('id'), E(c))),
});
// #145 Lane B: project membership. Each reads and writes through the caller's
// handle, so a project the caller cannot see is a 404 here too.
defineRoute({
  method: 'GET',
  path: '/api/projects/:id/members',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetProjectMembers(c.req.param('id'), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:id/members',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleAddProjectMember(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'DELETE',
  path: '/api/projects/:id/members/:slug',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleRemoveProjectMember(c.req.param('id'), c.req.param('slug'), USER(c), c.get('viewer'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/projects',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleGetMemberProjects(c.req.param('slug'), E(c)),
});

// A person's pinned projects (the sidebar "My projects" list, the Projects page
// star). Stored in the existing watchlist table, one row per person per
// project; every statement names the caller's own slug. api/routes/pins.ts.
defineRoute({
  method: 'GET',
  path: '/api/pins',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleGetPins(USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pins',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleCreatePin(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'DELETE',
  path: '/api/pins/:project',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleDeletePin(c.req.param('project'), USER(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Meetings (specific first, parameterized last)
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/meetings/cadence-check',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleCadenceCheck(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/next',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleNextMeeting(E(c)),
});
// Agenda/prep/generate-agenda are auth-gated (isAuthed flag mirrors handleGetMeeting pattern).
// Unauth callers get 401; authed team members get the full internal content.
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/agenda',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleGetAgendaItems(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/generate-agenda',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleGenerateAgenda(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
// schema-v122: whether a member may see a meeting, by the Hub's own rule.
// PB key only (Hermes stages a transcript only when this says visible);
// `auth: 'pi'` documents the server-to-server class, validateApiKey() in the
// handler is the gate (same as /api/hermes/day-index).
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/access',
  auth: 'pi',
  entity: 'meetings',
  handler: (c) => handleMeetingAccess(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/prep',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleMeetingPrep(c.req.param('id'), E(c), c.get('authedUser') !== null || c.get('apiKeyValid') === true),
});
// Meeting detail — authed callers get full row; unauth get public-safe cols only.
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id',
  auth: 'authed',
  entity: 'meetings',
  // #8842 R6: action items are task rows; non-PI callers get the PB filter.
  handler: (c) => handleGetMeeting(c.req.param('id'), E(c), c.get('viewer')),
});
defineRoute({
  method: 'GET',
  path: '/api/meetings',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleGetMeetings(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Dependencies
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/dependencies',
  auth: 'authed',
  entity: 'dependencies',
  handler: (c) => handleGetDependencies(E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Revisions
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/revisions/:id/comments',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleGetRevisionComments(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/revisions',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleGetRevisions(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/manuscripts/attention',
  auth: 'authed',
  entity: 'manuscripts',
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
  handler: (c) => handleGetActiveSubmissions(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/submissions',
  auth: 'authed',
  entity: 'submissions',
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
  handler: (c) => handleSimilarGrants(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grants/timeline',
  auth: 'public',
  anonShape: {
    // /pulse grant scene. Titles stay private: proposals in preparation are listed here too.
    // `status` is the lifecycle label the public bucket is derived from (grantBucket).
    data: [{ id: true, mechanism: true, agency: true, proposed: true, status: true }],
  },
  handler: (c) => handleGrantsTimeline(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grants',
  auth: 'public',
  anonShape: {
    // Home counts active grants from status (`proposed` is only the unset-status fallback).
    data: [{ id: true, mechanism: true, agency: true, proposed: true, status: true }],
    count: true,
  },
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
  handler: (c) => handleSimilarDecisions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/similar-by-id',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleSimilarDecisionsById(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/review',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleGetDecisionsNeedingReview(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions/tags',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleGetDecisionTags(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/decisions',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleGetDecisions(U(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Expertise
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/expertise',
  auth: 'public',
  anonShape: {
    // /team filter chips and the /team/:slug expertise list.
    data: [{ id: true, member_slug: true, tag: true, source: true, confidence: true }],
  },
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
  // The REQUEST is passed so the handler can scope results to the requester.
  // Previously only (url, env) went through, which is precisely why this read
  // had no way to tell whose Hermes exchanges it was returning.
  handler: (c) => handleGetAIRequests(U(c), E(c), R(c)),
});
// Hermes wave Phase 10 (2026-07-23) — the PB listener's older-day retrieval.
// API-key-only in-handler (NOT the broader isPiRequest PI-or-key class — see
// api/routes/hermes.ts header). `auth: 'pi'` here is documentation of the
// server-to-server class, same as GET /api/bug-reports; the real gate is
// `validateApiKey()` inside the handler.
defineRoute({
  method: 'GET',
  path: '/api/hermes/day-index',
  auth: 'pi',
  entity: 'ai-requests',
  handler: (c) => handleGetHermesDayIndex(R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Launch log (@-tag delegation) — Nick-private reads, authed writes
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/launch-log',
  auth: 'authed',
  entity: 'launch-log',
  handler: (c) => handleListLaunches(U(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/pb/launch-log/pending',
  auth: 'pi',
  entity: 'pb',
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
  handler: (c) => handleGetArtifacts(U(c), E(c)),
});
// Reference Gallery (schema-v104) — curated, tagged artifacts. `gallery` and
// `artifact-tags` MUST precede the /api/artifacts/:id catch-all below so Hono
// resolves them before treating "gallery" as an :id.
defineRoute({
  method: 'GET',
  path: '/api/artifacts/gallery',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleGetArtifactGallery(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifacts/search',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleSearchArtifacts(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifact-tags',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleGetArtifactTags(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifacts/:id/activity',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleGetArtifactActivity(c.req.param('id'), R(c), E(c)),
});
// The `day` entity feed (Hermes wave Phase 3) — Today-bar conversations, keyed by
// a YYYY-MM-DD civil date. Shape-identical to the task/artifact activity feeds.
// Day threads default PRIVATE, so both routes gate on the caller (visibility in SQL).
defineRoute({
  method: 'GET',
  path: '/api/days/:date/activity',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleGetDayActivity(c.req.param('date'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/days/:date/activity',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handlePostDayActivity(c.req.param('date'), R(c), USER(c), E(c)),
});
// The `meeting` entity feed (#124) — conversations on a meeting page, so the
// debrief can be asked about instead of only read. Same shape as the day feed;
// meeting threads default TEAM-visible (a meeting page is a shared surface).
defineRoute({
  method: 'GET',
  path: '/api/meetings/:id/activity',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleGetMeetingActivity(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/activity',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handlePostMeetingActivity(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/artifacts/:id',
  auth: 'authed',
  entity: 'artifacts',
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
  handler: (c) => handleGetQuestions(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/questions/:id/answers',
  auth: 'authed',
  entity: 'questions',
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
  handler: (c) => handleGetQuestionDetail(c.req.param('id'), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Simple exact-match GETs
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/publications',
  auth: 'public',
  anonShape: { data: [PUBLIC_PUBLICATION], count: true },
  anonRows: PUBLISHED_ONLY,
  handler: (c) => handleGetPublications(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team',
  auth: 'public',
  anonShape: {
    // Home and /pulse read only the head count; profiles come from src/data/team.
    data: [{ slug: true, name: true }],
    count: true,
  },
  handler: (c) => handleGetTeam(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/slugs',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleTeamSlugs(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/pulse',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleTeamPulse(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/stats',
  auth: 'public',
  anonShape: {
    data: {
      publicationCount: true, teamSize: true, grantCount: true,
      projectCount: true, activeProjectCount: true, featuredPublicationCount: true,
    },
  },
  handler: (c) => handleGetStats(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/citations',
  auth: 'authed',
  entity: 'citations',
  handler: (c) => handleGetCitations(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/activity',
  auth: 'public',
  anonShape: {
    // /team marks members active this week from actor + timestamp. The
    // free-text description (internal progress notes) stays private.
    data: [{ id: true, type: true, actor: true, timestamp: true }],
    count: true,
  },
  handler: (c) => handleGetActivity(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/activity/heatmap',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleActivityHeatmap(U(c), E(c)),
});
// Manual activity deletion (author or PI) — house delete shape (POST :id/delete,
// same as /api/conferences/:id/delete).
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/delete',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleDeleteActivityEntry(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/edit',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleEditActivityEntry(c.req.param('id'), R(c), USER(c), E(c)),
});
// Dismiss / restore a thread root (+ its replies). Body { hidden: boolean }.
// "Dismiss" hides from feeds but RETAINS the rows (owner decision 9.1.5) — one
// symmetric route, author-or-PI, same shape as :id/edit.
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/hide',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleSetActivityHidden(c.req.param('id'), R(c), USER(c), E(c)),
});
// #98 threaded replies. GET is 'public' like the other activity reads — the
// author-only rows are gated in SQL inside the handler, not by the route auth.
defineRoute({
  method: 'GET',
  path: '/api/activity/:id/replies',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleGetActivityReplies(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/activity/:id/replies',
  auth: 'authed',
  entity: 'activity',
  handler: (c) => handleCreateActivityReply(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/overdue-count',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleOverdueCount(U(c), E(c)),
});
// Per-viewer seen tracking (schema v81) — the new-activity signal, distinct
// from NEW-assignment (acknowledged_at). See api/routes/seen.ts header.
defineRoute({
  method: 'POST',
  path: '/api/seen',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleMarkSeen(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/seen/unseen',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetUnseenActivity(R(c), E(c)),
});
// schema-v122: how far the caller has read each thread (the cross-device "New").
defineRoute({
  method: 'GET',
  path: '/api/thread-seen',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetThreadSeen(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/thread-seen',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleMarkThreadSeen(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetTasks(U(c), E(c), PI(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/updates/recent',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleRecentUpdates(U(c), E(c), PI(c), USER(c).slug),
});
defineRoute({
  method: 'GET',
  path: '/api/task-updates/recent',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetRecentTaskUpdates(U(c), E(c), PI(c)),
});
// T2.8 (2026-05-28): extracted to api/routes/tasks.ts::handleGetRecentTaskComments
// — one-liner alongside /api/task-updates/recent. Single place to maintain.
defineRoute({
  method: 'GET',
  path: '/api/task-comments/recent',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetRecentTaskComments(U(c), E(c), PI(c)),
});
// Notifications: recipient derived from auth (R(c) carries the JWT/test headers)
defineRoute({
  method: 'GET',
  path: '/api/notifications',
  auth: 'authed',
  entity: 'notifications',
  handler: (c) => handleNotifications(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/notifications/count',
  auth: 'authed',
  entity: 'notifications',
  handler: (c) => handleNotificationCount(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/commitments',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleCommitments(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/ideas',
  auth: 'authed',
  entity: 'ideas',
  handler: (c) => handleGetIdeas(U(c), E(c)),
});
// GET /api/inbox retired 2026-05-05 (5.3a) — use /api/inbox-events
defineRoute({
  method: 'GET',
  path: '/api/search',
  auth: 'authed',
  entity: 'search',
  // R(c) is passed so search can apply the @me visibility gate — without the
  // request it had no requester to gate on and leaked author-only bodies.
  handler: (c) => handleGetSearch(U(c), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/settings',
  auth: 'authed',
  entity: 'settings',
  handler: (c) => handleGetSettings(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/workflow-templates',
  auth: 'authed',
  entity: 'settings',
  handler: (c) => handleGetWorkflowTemplates(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/calendar/events',
  auth: 'authed',
  entity: 'calendar',
  // #8842 R6: task deadlines are task rows; non-PI callers get the PB filter.
  // 2026-10-08: and only the caller's own tasks (viewer = resolved user slug).
  handler: (c) => handleCalendarEvents(U(c), E(c), USER(c).slug),
});
defineRoute({
  method: 'GET',
  path: '/api/today/mentees',
  auth: 'authed',
  entity: 'tasks',
  // 2026-10-08: Today's MENTEES row. The viewer's mentees (a director's
  // research team) with each one's next open due date; [] for anyone else.
  // Viewer = resolved user slug, never a query param. Non-PI: PB filter.
  handler: (c) => handleTodayMentees(E(c), USER(c).slug),
});

// Personal iCal calendar feeds (issue #45). Per-user, secret URL stays in D1.
// These use `authedUser` (real JWT identity) not `user` (anonymous fallback)
// because the feed_url is a secret — no anonymous access path.
defineRoute({
  method: 'GET',
  path: '/api/integrations/calendar/feeds',
  auth: 'authed',
  entity: 'calendar-feeds',
  handler: (c) => handleListFeeds(E(c), c.get('authedUser')),
});
defineRoute({
  method: 'POST',
  path: '/api/integrations/calendar/feeds',
  auth: 'authed',
  entity: 'calendar-feeds',
  handler: (c) => handleAddFeed(R(c), E(c), c.get('authedUser'), (p) => c.executionCtx.waitUntil(p)),
});
defineRoute({
  method: 'POST',
  path: '/api/integrations/calendar/feeds/:id/delete',
  auth: 'authed',
  entity: 'calendar-feeds',
  handler: (c) => handleDeleteFeed(R(c), E(c), c.get('authedUser'), c.req.param('id')),
});
defineRoute({
  method: 'GET',
  path: '/api/integrations/calendar/events',
  auth: 'authed',
  entity: 'calendar-feeds',
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
  handler: (c) => handleListFiles(U(c), E(c), SERVICE(c)),
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
  return handleGetFile(key, E(c), SERVICE(c), raw);
},
});

// ─────────────────────────────────────────────────────────────────────────────
// Team subroutes
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/trajectory',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleTrajectory(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/contributions',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleGetContributions(c.req.param('slug'), U(c), E(c)),
});
// #906 — the member's own curated Top-10. GET is public because it renders on
// the public /team/:slug page (auth: 'public' + anonShape below). PUT is the
// replace-set write; the handler enforces "the member themselves, a PI, or the
// service key" itself, because auth: 'authed' only proves SOMEONE is signed in,
// not that they are the member whose list this is.
defineRoute({
  method: 'GET',
  path: '/api/team/:slug/featured-publications',
  auth: 'public',
  anonShape: { data: [PUBLIC_PUBLICATION], count: true },
  anonRows: PUBLISHED_ONLY,
  handler: (c) => handleGetMemberFeaturedPublications(c.req.param('slug'), E(c)),
});
defineRoute({
  method: 'PUT',
  path: '/api/team/:slug/featured-publications',
  auth: 'authed',
  entity: 'publications',
  handler: (c) => handlePutMemberFeaturedPublications(c.req.param('slug'), R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Deadline cascade
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade/all',
  auth: 'authed',
  entity: 'deadline-cascade',
  handler: (c) => handleGetAllCascades(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade/impact',
  auth: 'authed',
  entity: 'deadline-cascade',
  handler: (c) => handleGetImpact(U(c), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/deadline-cascade',
  auth: 'authed',
  entity: 'deadline-cascade',
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
  handler: (c) => handleMenteeMilestoneOverview(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/mentee-milestones',
  auth: 'authed',
  entity: 'mentee-milestones',
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
  handler: (c) => handleUpcomingGrantMilestones(U(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/grant-milestones',
  auth: 'authed',
  entity: 'grant-milestones',
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
  handler: (c) => handleGetExpiringItems(U(c), E(c)),
});
// Auth-only (not PI) — team members need iCal access to renewal reminders.
defineRoute({
  method: 'GET',
  path: '/api/regulatory/:id/ics',
  auth: 'authed',
  entity: 'regulatory',
  handler: (c) => handleRegulatoryIcs(c.req.param('id'), E(c), R(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/regulatory',
  auth: 'authed',
  entity: 'regulatory',
  handler: (c) => handleGetRegulatoryItems(U(c), R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Conferences
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/conferences/upcoming',
  auth: 'authed',
  entity: 'conferences',
  handler: (c) => handleGetUpcomingConferences(E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/conferences',
  auth: 'authed',
  entity: 'conferences',
  handler: (c) => handleGetConferences(U(c), R(c), E(c)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Proactive brief / digest preview / file activity
// ─────────────────────────────────────────────────────────────────────────────
defineRoute({
  method: 'GET',
  path: '/api/proactive-brief',
  auth: 'authed',
  entity: 'proactive-brief',
  handler: (c) => handleProactiveBrief(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/digest-preview',
  auth: 'authed',
  entity: 'digest',
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
  handler: (c) => handleGetTaskComments(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/files',
  auth: 'authed',
  entity: 'tasks',
  handler: async (c) => {
  const env = E(c);
  // Auth required — task files are team-internal content.
  const authedUser = c.get('authedUser');
  if (!authedUser && c.get('apiKeyValid') !== true) return error('Authentication required', 401);
  // task_files follows its task through the caller's handle, so a task the
  // caller may not read lists no files.
  const taskId = c.req.param('id');
  const { results } = await env.DB.prepare(
    'SELECT id, task_id, filename, url, file_type, uploaded_by, created_at FROM task_files WHERE task_id = ? ORDER BY created_at DESC'
  ).bind(taskId).all();
  return json({ data: results });
},
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/activity',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetTaskActivity(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/detail',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetTaskDetail(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/subtasks',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetSubtasks(c.req.param('id'), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id/handoffs',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetHandoffs(c.req.param('id'), E(c)),
});
// GET /api/tasks/:id — fetch single task by PK (mechanic I5: was missing, always 404)
// Must come AFTER all /api/tasks/:id/<sub-path> routes so hono routes specifics first.
defineRoute({
  method: 'GET',
  path: '/api/tasks/:id',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleGetTask(c.req.param('id'), E(c)),
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
  handler: (c) => handleUploadUrl(R(c), USER(c), E(c), SERVICE(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/upload/done',
  auth: 'authed',
  entity: 'misc',
  handler: (c) => handleUploadDone(R(c), USER(c), E(c), SERVICE(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/files/:id/delete',
  auth: 'authed',
  entity: 'files',
  handler: (c) => handleDeleteFile(c.req.param('id'), E(c), SERVICE(c)),
});

// Projects (specific first)
defineRoute({
  method: 'POST',
  path: '/api/projects',
  auth: 'authed',
  entity: 'projects',
  handler: async (c) => projectResponseFor(c.get('isPi') === true, await handleCreateProject(R(c), USER(c), E(c), slugClaimCheck(c.get('unscopedDb')))),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/delete',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleDeleteProject(c.req.param('slug'), USER(c), E(c), R(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/comments',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleAddComment(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/updates',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handlePostProjectUpdate(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/documents',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleCreateProjectDocument(c.req.param('slug'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug/documents/:docId/delete',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleDeleteProjectDocument(c.req.param('docId'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/projects/:slug',
  auth: 'authed',
  entity: 'projects',
  handler: async (c) => projectResponseFor(c.get('isPi') === true, await handleUpdateProject(c.req.param('slug'), R(c), USER(c), E(c), slugClaimCheck(c.get('unscopedDb')))),
});

// Team
// A PI adds a member (2026-10-08): the only way, with a PI setting the email
// on an existing row, that an email becomes a member.
defineRoute({
  method: 'POST',
  path: '/api/team',
  auth: 'pi',
  entity: 'team',
  handler: (c) => handleCreateTeamMember(R(c), USER(c), E(c), PI(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/team/:slug',
  auth: 'authed',
  entity: 'team',
  handler: (c) => handleUpdateTeamMember(c.req.param('slug'), R(c), USER(c), E(c), c.get('apiKeyValid') === true),
});

// Inbox events (W2a) — specific-before-generic
defineRoute({
  method: 'POST',
  path: '/api/inbox-events/sync-bulk',
  auth: 'authed',
  entity: 'inbox-events',
  handler: (c) => handleSyncBulkInboxEvents(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/inbox-events/:id/delete',
  auth: 'authed',
  entity: 'inbox-events',
  handler: (c) => handleDeleteInboxEvent(c.req.param('id'), R(c), USER(c), E(c)),
});
// Browser single-capture — 'authed' (CF-Access OR Bearer), NOT PI-gated.
// Registered after /sync-bulk and /:id/delete so static segments match first.
defineRoute({
  method: 'POST',
  path: '/api/inbox-events',
  auth: 'authed',
  entity: 'inbox-events',
  handler: (c) => handleCreateInboxEvent(R(c), USER(c), E(c)),
});
// PI-or-API-key gate: raw_payload_json/notes are private to Nick's capture pipeline.
defineRoute({
  method: 'GET',
  path: '/api/inbox-events',
  auth: 'authed',
  entity: 'inbox-events',
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
  handler: (c) => handleMutations(R(c), USER(c), E(c)),
});

// Typed-links pull (Phase 2, 2026-06-20) — PI/API-key gated (PB sync lane only).
// PB hub.py calls GET /links?seq_after=N&include_deleted=1&limit=K.
defineRoute({
  method: 'GET',
  path: '/api/links',
  auth: 'authed',
  entity: 'links',
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
  handler: (c) => handleGetTaskLinks(c.req.param('id'), R(c), E(c), c.get('isPi') === true),
});
// Bulk project-links (backlog #147). Defined after GET /api/projects/:id,
// which matched it with id='links' until bindRegistryToHono started binding
// literal paths ahead of param routes (route-dsl.ts bindOrder).
defineRoute({
  method: 'GET',
  path: '/api/projects/links',
  auth: 'authed',
  entity: 'links',
  handler: (c) => handleGetAllProjectLinks(R(c), E(c)),
});
defineRoute({
  method: 'GET',
  path: '/api/projects/:slug/links',
  auth: 'authed',
  entity: 'links',
  handler: (c) => handleGetProjectLinks(c.req.param('slug'), R(c), E(c), c.get('isPi') === true),
});
// Archive / restore one project link from the project page (#2089).
// Body { role }; project-owned links only; gated by assertProjectVisible.
defineRoute({
  method: 'POST',
  path: '/api/links/:id/role',
  auth: 'authed',
  entity: 'links',
  handler: (c) => handleSetLinkRole(c.req.param('id'), R(c), USER(c), E(c)),
});

// Tasks — specific-before-generic
defineRoute({
  method: 'POST',
  path: '/api/tasks/batch',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleBatchUpdateTasks(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/delete',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleDeleteTask(c.req.param('id'), R(c), USER(c), E(c)),
});
// Symmetric counterpart to :id/delete — un-sets the tombstone so a delete can
// be a real, undoable operation instead of a one-way write (see handleRestoreTask).
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/restore',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleRestoreTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/acknowledge',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleAcknowledgeTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/status',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleUpdateTaskStatus(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/comments',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleAddTaskComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/updates',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handlePostTaskUpdate(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/subtasks/reorder',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleReorderSubtasks(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/subtasks',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleCreateSubtask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/handoffs',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleCreateHandoff(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks/:id/files',
  auth: 'authed',
  entity: 'tasks',
  handler: async (c) => {
  const env = E(c);
  const id = c.req.param('id');
  // Owner-or-PI gate: only the task owner/assignee or a PI may attach files.
  const callerSlug = await actorSlugFromRequest(R(c), env);
  if (!callerSlug) return error('Authentication required', 401);
  // Read through the caller's handle: a task the caller may not read is a 404.
  const task = await env.DB.prepare(
    'SELECT assignee FROM tasks WHERE id = ? LIMIT 1'
  ).bind(id).first<{ assignee: string | null }>();
  if (!task) return error('Task not found', 404);
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
  handler: (c) => handleUpdateTask(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/tasks',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => {
    // c.executionCtx throws when the caller supplies none (a test). Then pass
    // no waitUntil and the task route awaits the email job itself.
    let ctx: ExecutionContext | undefined;
    try { ctx = c.executionCtx; } catch { ctx = undefined; }
    return handleCreateTask(R(c), USER(c), E(c), ctx ? (p) => ctx.waitUntil(p) : undefined);
  },
});
defineRoute({
  method: 'POST',
  path: '/api/sync/mobile-tasks-to-hub',
  auth: 'authed',
  entity: 'misc',
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
  handler: async (c) => {
  const env = E(c);
  const fileId = c.req.param('id');
  const callerSlug = await actorSlugFromRequest(R(c), env);
  if (!callerSlug) return error('Authentication required', 401);
  // Look up the file and its task's assignee. task_files follows its task
  // through the caller's handle, so a file on a task the caller may not read
  // is absent and takes the idempotent path below.
  const fileRow = await env.DB.prepare(
    'SELECT tf.id, tf.task_id, tf.filename, t.assignee FROM task_files tf LEFT JOIN tasks t ON tf.task_id = t.id WHERE tf.id = ? LIMIT 1'
  ).bind(fileId).first<{ id: string; task_id: string; filename: string; assignee: string | null }>();
  // SEC-10.3 + Phase 1b-extended: idempotent — repeat delete (row already gone)
  // returns 200 with idempotent:true. Codex flagged that the prior 404 leaked
  // existence of file IDs to non-owners.
  if (!fileRow) return json({ data: { deleted: fileId, idempotent: true } });
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
  handler: (c) => handleToggleSubtask(c.req.param('id'), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/subtasks/:id/delete',
  auth: 'authed',
  entity: 'subtasks',
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
  handler: (c) => handleCreateMeeting(R(c), USER(c), E(c)),
});
// #2225: the Today Prep pill. Title + attendees come from the caller's own
// calendar cache row, server-side (handlePrepMeetingFromEvent).
defineRoute({
  method: 'POST',
  path: '/api/meetings/prep-from-event',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handlePrepMeetingFromEvent(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/notes',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleUpdateMeetingNotes(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/meta',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleUpdateMeetingMeta(c.req.param('id'), R(c), USER(c), E(c), c.get('viewer')),
});
// schema-v122 "belongs to" grants: the owner or Nick gives a project's members
// access to a meeting (api/routes/meetings.ts handleGrantMeetingProject).
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/projects',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleGrantMeetingProject(c.req.param('id'), R(c), USER(c), c.get('viewer'), E(c)),
});
defineRoute({
  method: 'DELETE',
  path: '/api/meetings/:id/projects/:projectId',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleRevokeMeetingProject(c.req.param('id'), c.req.param('projectId'), USER(c), c.get('viewer'), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/agenda/reorder',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleReorderAgenda(c.req.param('id'), R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/meetings/:id/agenda',
  auth: 'authed',
  entity: 'meetings',
  handler: (c) => handleAddAgendaItem(c.req.param('id'), R(c), USER(c), E(c)),
});

// Milestones
defineRoute({
  method: 'POST',
  path: '/api/milestones/:id/note',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleUpdateMilestoneNote(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/milestones/:id/complete',
  auth: 'authed',
  entity: 'projects',
  handler: (c) => handleUpdateMilestoneCompletion(c.req.param('id'), R(c), USER(c), E(c)),
});

// Commitments
defineRoute({
  method: 'POST',
  path: '/api/commitments',
  auth: 'authed',
  entity: 'tasks',
  handler: (c) => handleCreateCommitment(R(c), E(c)),
});

// Notifications — read-all derives recipient from the authenticated caller slug,
// not from a user-supplied ?recipient= or body field (prevents cross-user spoofing).
defineRoute({
  method: 'POST',
  path: '/api/notifications/read-all',
  auth: 'authed',
  entity: 'notifications',
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
  handler: (c) => handleMarkNotificationRead(c.req.param('id'), R(c), E(c)),
});

// Reactions
defineRoute({
  method: 'POST',
  path: '/api/reactions',
  auth: 'authed',
  entity: 'reactions',
  handler: (c) => handleToggleReaction(R(c), USER(c), E(c)),
});

// Publications
defineRoute({
  method: 'POST',
  path: '/api/publications',
  auth: 'authed',
  entity: 'publications',
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
  handler: (c) => handleAcknowledgeHandoff(c.req.param('id'), USER(c), E(c)),
});

// Settings
defineRoute({
  method: 'POST',
  path: '/api/settings',
  auth: 'authed',
  entity: 'settings',
  handler: (c) => handleUpdateSettings(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/workflow-templates',
  auth: 'authed',
  entity: 'settings',
  handler: (c) => handleCreateWorkflowTemplate(R(c), E(c)),
});

// Ideas
defineRoute({
  method: 'POST',
  path: '/api/ideas',
  auth: 'authed',
  entity: 'ideas',
  handler: (c) => handleCreateIdea(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ideas/:id/vote',
  auth: 'authed',
  entity: 'ideas',
  handler: (c) => handleVoteIdea(c.req.param('id'), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ideas/:id',
  auth: 'authed',
  entity: 'ideas',
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
  handler: (c) => handleListBugReports(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/bug-reports/:id/status',
  auth: 'pi',
  entity: 'bug-report',
  handler: (c) => handleUpdateBugReportStatus(c.req.param('id'), R(c), E(c)),
});

// Digest
defineRoute({
  method: 'POST',
  path: '/api/digest',
  auth: 'authed',
  entity: 'digest',
  handler: (c) => handleCreateDigestPaper(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest/:id/comments',
  auth: 'authed',
  entity: 'digest',
  handler: (c) => handleCreateDigestComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/digest/:id/status',
  auth: 'authed',
  entity: 'digest',
  handler: (c) => handleUpdateDigestStatus(c.req.param('id'), R(c), USER(c), E(c)),
});

// Paper links
defineRoute({
  method: 'POST',
  path: '/api/paper-links',
  auth: 'authed',
  entity: 'paper-links',
  handler: (c) => handleLinkPaper(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/paper-links/:id/delete',
  auth: 'authed',
  entity: 'paper-links',
  handler: (c) => handleUnlinkPaper(c.req.param('id'), R(c), E(c)),
});

// Dependencies
defineRoute({
  method: 'POST',
  path: '/api/dependencies',
  auth: 'authed',
  entity: 'dependencies',
  handler: (c) => handleCreateDependency(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/dependencies/:id/delete',
  auth: 'authed',
  entity: 'dependencies',
  handler: (c) => handleDeleteDependency(c.req.param('id'), R(c), E(c)),
});

// Decisions
defineRoute({
  method: 'POST',
  path: '/api/decisions',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleCreateDecision(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/decisions/:id/outcome',
  auth: 'authed',
  entity: 'decisions',
  handler: (c) => handleUpdateDecisionOutcome(c.req.param('id'), R(c), USER(c), E(c)),
});

// Expertise
defineRoute({
  method: 'POST',
  path: '/api/expertise',
  auth: 'authed',
  entity: 'expertise',
  handler: (c) => handleAddExpertise(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/expertise/:id/delete',
  auth: 'authed',
  entity: 'expertise',
  handler: (c) => handleRemoveExpertise(c.req.param('id'), R(c), E(c)),
});

// Questions / Answers
defineRoute({
  method: 'POST',
  path: '/api/questions',
  auth: 'authed',
  entity: 'questions',
  handler: (c) => handleCreateQuestion(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/questions/:id/answers',
  auth: 'authed',
  entity: 'questions',
  handler: (c) => handleCreateAnswer(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/answers/:id/accept',
  auth: 'authed',
  entity: 'questions',
  handler: (c) => handleAcceptAnswer(c.req.param('id'), R(c), USER(c), E(c)),
});

// AI requests
defineRoute({
  method: 'POST',
  path: '/api/ai-requests',
  auth: 'authed',
  entity: 'ai-requests',
  handler: (c) => handleCreateAIRequest(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/ai-requests/:id/response',
  auth: 'authed',
  entity: 'ai-requests',
  handler: (c) => handleUpdateAIResponse(c.req.param('id'), R(c), E(c)),
});

// Launch log writes
defineRoute({ method: 'POST', path: '/api/launch-log',            auth: 'authed', entity: 'launch-log', handler: (c) => handleCreateLaunch(R(c), USER(c), E(c), c.get('isPi') === true) });
defineRoute({ method: 'POST', path: '/api/launch-log/:id/status', auth: 'authed', entity: 'launch-log', handler: (c) => handleSetLaunchStatus(c.req.param('id'), R(c), USER(c), E(c)) });
defineRoute({ method: 'POST', path: '/api/launch-log/:id/refire', auth: 'authed', entity: 'launch-log', handler: (c) => handleRefireLaunch(c.req.param('id'), USER(c), E(c), c.get('isPi') === true) });
// PI/API-key gated in-handler (isPiRequest — same idiom as /api/bug-reports
// above, not the /api/pb/* path middleware). Backlog #250: closes the gap
// where any team member holding (or guessing) the opaque lnch_ id could
// consume a pending mobile launch and read its seed. Both live claimants
// (resolve_launch.py, hub_ai_listener.py) already send Bearer PB_API_KEY and
// pass unchanged — see api/routes/launch-log.ts:handleClaimLaunch for detail.
defineRoute({ method: 'POST', path: '/api/launch-log/:id/claim',  auth: 'pi',     entity: 'launch-log', handler: (c) => handleClaimLaunch(c.req.param('id'), R(c), USER(c), E(c)) });

// Artifacts writes — specific-before-generic. Create is authed (Hermes via API
// key, or a team member). Revise/comments authed; delete PI-gated in-handler.
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/revise',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleReviseArtifact(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/comments',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleAddArtifactComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/artifacts',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleCreateArtifact(R(c), USER(c), E(c)),
});
// Collection-tag writes (schema-v104). Authed-team — the handlers gate on the
// resolved user (the anonymous shim = no auth) as defense in depth. Until
// backlog #909 (2026-07-25), DELETE-method routes skipped the write-auth
// middleware entirely and this in-handler check was the ONLY thing that
// failed the DELETE closed; the middleware now gates DELETE too (step 5,
// `WRITE_AUTH_METHODS`), so this is a second, redundant layer.
defineRoute({
  method: 'POST',
  path: '/api/artifacts/:id/tags',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleAddArtifactTag(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'DELETE',
  path: '/api/artifacts/:id/tags/:tag',
  auth: 'authed',
  entity: 'artifacts',
  handler: (c) => handleRemoveArtifactTag(c.req.param('id'), c.req.param('tag'), R(c), USER(c), E(c)),
});

// PB sector writes
defineRoute({
  method: 'POST',
  path: '/api/pb/capture',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handlePBCapture(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/defer',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handlePBDefer(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/add',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleAddToDispatch(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/send',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleSendDispatch(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/dispatch/complete',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleCompleteDispatchItem(R(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/sessions',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleCreatePBSession(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/pb/sessions/bulk',
  auth: 'pi',
  entity: 'pb',
  handler: (c) => handleBulkCreatePBSessions(R(c), USER(c), E(c)),
});
// POST /api/pb/today retired 2026-05-05 (5.9): 0 callers; GET preserved for frontend use

// Impact check — route removed 2026-05-05 (5.3b); handleCheckImpact used internally by cron at line 1269

// Revisions (specific /:id/comments BEFORE /:id)
defineRoute({
  method: 'POST',
  path: '/api/revisions',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleCreateRevision(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/comments/:id',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleUpdateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/:id/comments',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleCreateRevisionComment(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/revisions/:id',
  auth: 'authed',
  entity: 'revisions',
  handler: (c) => handleUpdateRevision(c.req.param('id'), R(c), USER(c), E(c)),
});

// Submissions
defineRoute({
  method: 'POST',
  path: '/api/submissions',
  auth: 'authed',
  entity: 'submissions',
  handler: (c) => handleCreateSubmission(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/submissions/:id/delete',
  auth: 'authed',
  entity: 'submissions',
  handler: (c) => handleDeleteSubmission(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/submissions/:id',
  auth: 'authed',
  entity: 'submissions',
  handler: (c) => handleUpdateSubmission(c.req.param('id'), R(c), USER(c), E(c)),
});

// Mentee milestones
defineRoute({
  method: 'POST',
  path: '/api/mentee-milestones',
  auth: 'authed',
  entity: 'mentee-milestones',
  handler: (c) => handleCreateMenteeMilestone(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/mentee-milestones/:id',
  auth: 'authed',
  entity: 'mentee-milestones',
  handler: (c) => handleUpdateMenteeMilestone(c.req.param('id'), R(c), USER(c), E(c)),
});

// Grant post-award milestones
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones',
  auth: 'authed',
  entity: 'grant-milestones',
  handler: (c) => handleCreateGrantMilestone(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones/:id/complete',
  auth: 'authed',
  entity: 'grant-milestones',
  handler: (c) => handleCompleteGrantMilestone(c.req.param('id'), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/grant-milestones/:id',
  auth: 'authed',
  entity: 'grant-milestones',
  handler: (c) => handleUpdateGrantMilestone(c.req.param('id'), R(c), USER(c), E(c)),
});

// Grants (PATCH only — R10 inline editing)
defineRoute({
  method: 'POST',
  path: '/api/grants/:id',
  auth: 'authed',
  entity: 'grants',
  handler: (c) => handleUpdateGrant(c.req.param('id'), R(c), E(c)),
});

// Regulatory
defineRoute({
  method: 'POST',
  path: '/api/regulatory',
  auth: 'authed',
  entity: 'regulatory',
  handler: (c) => handleCreateRegulatoryItem(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/regulatory/:id',
  auth: 'authed',
  entity: 'regulatory',
  handler: (c) => handleUpdateRegulatoryItem(c.req.param('id'), R(c), USER(c), E(c)),
});

// Conferences
defineRoute({
  method: 'POST',
  path: '/api/conferences',
  auth: 'authed',
  entity: 'conferences',
  handler: (c) => handleCreateConference(R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/conferences/:id/delete',
  auth: 'authed',
  entity: 'conferences',
  handler: (c) => handleDeleteConference(c.req.param('id'), R(c), USER(c), E(c)),
});
defineRoute({
  method: 'POST',
  path: '/api/conferences/:id',
  auth: 'authed',
  entity: 'conferences',
  handler: (c) => handleUpdateConference(c.req.param('id'), R(c), USER(c), E(c)),
});

// Deadline dependencies

// Digest email
defineRoute({
  method: 'POST',
  path: '/api/digest-email/daily',
  auth: 'authed',
  entity: 'digest',
  // The fan-out builds each email on its recipient's handle, from the pre-binding database.
  handler: (c) => handleSendDailyDigests(E(c), { kind: 'http', request: R(c), unscopedDb: c.get('unscopedDb') }),
});

// File activity sync
defineRoute({
  method: 'POST',
  path: '/api/file-activity/sync',
  auth: 'authed',
  entity: 'file-activity',
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
bindRegistryToHono(hono, {
  callerKind: (c: Context<AppEnv>) => c.get('callerKind'),
  deny: (c) => c.json({ error: 'Authentication required' }, 401, corsHeaders),
  denyNonMember: (c) => c.json({
    error: 'This is a place for MN-CCORE members only. If you have questions, contact Nick Ingraham at ingra107@umn.edu.',
    code: 'not_a_member',
  }, 403, corsHeaders),
});

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
        if (!env.RESEND_API_KEY) {
          console.log('[Pulse] No RESEND_API_KEY configured — skipping email send');
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

        // #145: each email is built on a handle bound to its recipient, the
        // same rule the request path uses, so a member is never mailed rows
        // they could not open in the Hub. The cron runs on the raw binding.
        const piEmails = await getPiEmails(env);
        let sent = 0;
        let skippedByPolicy = 0;
        for (const member of members.results) {
          // Recipient switch: Nick only until widened. sendEmail enforces it too;
          // this skips the queries for members who would be blocked.
          const email = member.email || `${member.slug}@umn.edu`;
          if (!isEmailRecipient(email, env)) { skippedByPolicy++; continue; }
          const firstName = member.name.split(' ')[0];
          const recipientIsPi = !!member.email && piEmails.has(member.email.toLowerCase());
          let recipientDb: D1Database;
          try {
            recipientDb = viewerDb(env.DB, personViewer({ slug: member.slug, email: member.email, pi: recipientIsPi }));
          } catch (e) {
            console.log(`[Pulse] Skipping ${member.slug}: ${(e as Error).message}`);
            continue;
          }

          // Get their pending action items
          const actions = await recipientDb.prepare(
            'SELECT title, description, due_date, priority, status FROM tasks WHERE assignee = ? AND completed = 0 ORDER BY due_date ASC'
          ).bind(member.slug).all<{ title: string | null; description: string | null; due_date: string | null }>();

          // Get unread notifications
          const notifCount = await recipientDb.prepare(
            'SELECT COUNT(*) as c FROM notifications WHERE recipient_slug = ? AND read = 0'
          ).bind(member.slug).first<{ c: number }>();

          // Get recent team activity (last 24 hours) — activity_entries kind='update'
          const recentUpdates = await recipientDb.prepare(
            // recipientDb is bound to this member, so only updates on
            // projects they are on reach their email; an author-only (@me)
            // update is someone else's (actor_slug != recipient), so never.
            "SELECT actor_slug AS author, body AS content, project_id FROM activity_entries WHERE entity_type='project' AND kind='update' AND hidden_at IS NULL AND visibility = 'team' AND created_at > datetime('now', '-1 day') AND actor_slug != ?"
            + ' ORDER BY created_at DESC LIMIT 5'
          ).bind(member.slug).all<{ author: string; content: string; project_id: string }>();

          // Get milestones with Future Me notes due within 3 days
          const futureNotes = await recipientDb.prepare(
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
              itemsHtml += `<li style="margin-bottom:8px;font-size:14px;color:#0f1923;">${escapeHtml((item.description || item.title || '').replace(/^\[Carried forward\]\s*/i, ''))}${dueLabel}</li>`;
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
    <a href="${HUB_URL}/portal/my-tasks" style="display:inline-block;padding:10px 20px;background:#c9a84c;color:#0f1923;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View All Items</a>
  </div>
  <p style="font-size:11px;color:#64748b;margin-top:24px;">MN-CCORE Lab Hub — <a href="${HUB_URL}" style="color:#c9a84c;">mnccore.org</a></p>
</body>
</html>`;

          // Send via Resend (the same path as every other Hub email). The body
          // above escapes each database value with escapeHtml.
          const ok = await sendEmail(env, {
            to: email,
            subject: `${firstName}, you have ${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} today`.replace(/[\r\n]+/g, ' '),
            html: raw(html),
          });
          if (ok) {
            sent++;
            console.log(`[Pulse] Sent to ${email}`);
          } else {
            console.log(`[Pulse] Failed for ${email}`);
          }
        }

        if (skippedByPolicy === members.results.length) warnIfRecipientsMatchNobody(env);
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
