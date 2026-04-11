import type { Env } from './types';
import { corsHeaders, json, error, getAuthUser } from './helpers';
import { validateApiKey } from './middleware/api-key-auth';
import { handleVersion, bumpVersion } from './lib/version';
import { notifyClients } from './lib/notify';
import { handleUploadUrl, handleUploadDone, handleListFiles, handleGetFile, handleDeleteFile } from './routes/uploads';

// ── Route modules ──────────────────────────────────────────
import { handleTasks, handleActionItems, handleOverdueCount, handleUpdateTaskStatus, handleToggleTask, handleUpdateTask, handleCreateTask, handleGetTaskComments, handleAddTaskComment, handleGetTaskActivity, handleGetTaskUpdates, handleGetRecentTaskUpdates, handlePostTaskUpdate, handleBatchUpdateTasks, handleSyncBulkTasks, handleAcknowledgeTask } from './routes/tasks';
import { handleProjects, handleCreateProject, handleGetComments, handleGetProjectUpdates, handleProjectHealth, handleRecentUpdates, handleUpdateProject, handleAddComment, handlePostProjectUpdate, handleGetMilestones, handleUpdateMilestoneNote } from './routes/projects';
import { handleMeetings, handleGetMeeting, handleGetAgendaItems, handleAddAgendaItem, handleReorderAgenda, handleCreateMeeting, handleUpdateMeetingNotes, handleMeetingPrep } from './routes/meetings';
import { handlePublications, handleGrants, handleCollaborationGraph, handleStats, handleGrantsTimeline } from './routes/publications';
import { handleTeam, handleTeamSlugs, handleCVData, handleUpdateTeamMember } from './routes/team';
import { handleDigest, handleDigestDates, handleUpdateDigestStatus, handleCreateDigestPaper } from './routes/digest';
import { handleIdeas, handleCreateIdea, handleUpdateIdea, handleVoteIdea } from './routes/ideas';
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
import { handleCommandCenter, handlePBCapture, handlePBDefer, handleCreateOrUpdatePlan, handleReorderPlan, handlePromoteTask, handleStartPomodoro, handleCompletePomodoro, handleSaveReflection, handlePlanHistory, handleAddToDispatch, handleGetPendingDispatch, handleSendDispatch, handleCompleteDispatchItem } from './routes/pb-sector'
import { handlePBSessions, handlePBSessionStats, handleCreatePBSession, handleBulkCreatePBSessions } from './routes/pb-sessions'
import { handleGetTodayMd, handleUpsertTodayMd } from './routes/pb-today'
import { handlePBHealth } from './routes/pb-health'
import { handleGetRelay, handleCreateRelay, handleCompleteRelay } from './routes/pb-relay'
import { handleGetRevisions, handleCreateRevision, handleUpdateRevision, handleGetRevisionComments, handleCreateRevisionComment, handleUpdateRevisionComment, handleGetActiveRevisions } from './routes/revisions';
import { handleMenteeMilestones, handleMenteeMilestoneOverview, handleCreateMenteeMilestone, handleUpdateMenteeMilestone, handleCompleteMenteeMilestone } from './routes/mentee-milestones';
import { handleGetCascade, handleGetImpact, handleGetAllCascades, handleCreateDeadlineDependency, handleDeleteDeadlineDependency } from './routes/deadline-cascade';
import { handleGetSubmissions, handleCreateSubmission, handleUpdateSubmission, handleDeleteSubmission, handleGetActiveSubmissions } from './routes/submissions';
import { handleGetRegulatoryItems, handleGetExpiringItems, handleCreateRegulatoryItem, handleUpdateRegulatoryItem, handleRenewRegulatoryItem } from './routes/regulatory';
import { handleGrantMilestones, handleUpcomingGrantMilestones, handleCreateGrantMilestone, handleUpdateGrantMilestone, handleCompleteGrantMilestone } from './routes/grant-milestones';
import { handleGetConferences, handleGetUpcomingConferences, handleCreateConference, handleUpdateConference, handleDeleteConference } from './routes/conferences';
import { handleGetEmailDrafts, handleGetPendingDrafts, handleSyncEmailDrafts } from './routes/email-drafts';
import { handleGetProjectDocuments, handleCreateProjectDocument, handleDeleteProjectDocument } from './routes/project-documents';
import { handleProactiveBrief } from './routes/proactive-brief';
import { handleGetFileActivity, handleSyncFileActivity } from './routes/file-activity';
import { handleGenerateDigestEmail, handleDigestPreview, handleSendDigestEmail } from './routes/digest-email';

// GET /api/auth/me — return current user or 401
function handleAuthMe(request: Request): Response {
  const user = getAuthUser(request);
  if (!user) {
    return json({ authenticated: false }, 200);
  }
  return json({ authenticated: true, ...user });
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Test mode: swap DB to test database when X-Test-Mode header is present.
    // This isolates Playwright tests from production data entirely.
    if (request.headers.get('X-Test-Mode') === 'true' && env.DB_TEST) {
      env = { ...env, DB: env.DB_TEST };
    }

    // Helper: bump version + notify DO after successful mutations
    const withVersionBump = async (response: Response): Promise<Response> => {
      if (method !== 'GET' && response.status >= 200 && response.status < 300) {
        await Promise.all([
          bumpVersion(env.DB).catch(() => {}),
          notifyClients(env, 'data').catch(() => {}),
        ]);
      }
      return response;
    };

    // API key auth for programmatic access (AI Co-Scientist listener)
    const apiKeyResult = validateApiKey(request, env);
    if (apiKeyResult === false) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }
    // apiKeyResult === true means API key valid (skip browser auth)
    // apiKeyResult === null means no API key header (use browser auth as normal)

    try {
      // Auth endpoint — returns current user from Cloudflare Access JWT
      if (url.pathname === '/api/auth/me') {
        return handleAuthMe(request);
      }

      // Version endpoint — lightweight, no auth needed
      if (url.pathname === '/api/version' && method === 'GET') {
        return handleVersion(env);
      }

      // Read endpoints (GET only)
      if (request.method === 'GET') {
        // PB Sector — PI command center
        if (url.pathname === '/api/pb/command-center') {
          const planDate = url.searchParams.get('date') || undefined;
          return await handleCommandCenter(env, planDate);
        }

        // PB Sector — plan history
        if (url.pathname === '/api/pb/plan/history') {
          return await handlePlanHistory(request, env);
        }

        // PB Sector — dispatch queue pending items
        if (url.pathname === '/api/pb/dispatch/pending') {
          return await handleGetPendingDispatch(env);
        }

        // PB Sector — TODAY.md content
        if (url.pathname === '/api/pb/today') {
          return await handleGetTodayMd(env);
        }

        // PB Sector — session history
        if (url.pathname === '/api/pb/sessions') {
          return await handlePBSessions(request, env);
        }

        // PB Sector — session stats
        if (url.pathname === '/api/pb/sessions/stats') {
          return await handlePBSessionStats(env);
        }

        // PB Sector — system health overview
        if (url.pathname === '/api/pb/health') {
          return await handlePBHealth(env);
        }

        // PB Sector — relay messages
        if (url.pathname === '/api/pb/relay') {
          return await handleGetRelay(env);
        }

        // PI Analytics — leadership dashboard data
        if (url.pathname === '/api/pi/analytics') {
          return await handlePIAnalytics(env);
        }

        // Enhanced PI Dashboard & analytics endpoints
        if (url.pathname === '/api/analytics/pi-dashboard') {
          return await handlePIDashboard(env);
        }
        if (url.pathname === '/api/analytics/mentee-velocity') {
          return await handleMenteeVelocity(env);
        }
        if (url.pathname === '/api/analytics/response-time') {
          return await handleResponseTime(env);
        }
        if (url.pathname === '/api/analytics/team-engagement') {
          return await handleTeamEngagement(env);
        }

        // Contribution score with exponential decay
        if (url.pathname === '/api/analytics/contributions') {
          return await handleContributionsDecay(url, env);
        }

        // Team members by expertise tag
        if (url.pathname === '/api/team/by-expertise') {
          return await handleTeamByExpertise(url, env);
        }

        // Digest endpoints (must come before parameterized catch-alls)
        if (url.pathname === '/api/digest/dates') {
          return await handleDigestDates(env);
        }
        if (url.pathname === '/api/digest') {
          return await handleDigest(url, env);
        }

        // Cross-Project Insight Engine
        if (url.pathname === '/api/insights/connections') {
          return await handleInsightConnections(env);
        }
        if (url.pathname === '/api/insights/suggestions') {
          return await handleInsightSuggestions(url, env);
        }

        // Paper-to-Project linking queries
        if (url.pathname === '/api/papers/by-project') {
          return await handlePapersByProject(url, env);
        }
        if (url.pathname === '/api/papers/by-publication') {
          return await handlePapersByPublication(url, env);
        }

        // Parameterized GET routes
        const commentsGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/comments$/);
        if (commentsGet) {
          return await handleGetComments(commentsGet[1], env);
        }

        // Meeting cadence check (must come before parameterized /api/meetings/:id)
        if (url.pathname === '/api/meetings/cadence-check') {
          return await handleCadenceCheck(env);
        }

        const meetingGet = url.pathname.match(/^\/api\/meetings\/([^/]+)$/);
        if (meetingGet) {
          return await handleGetMeeting(meetingGet[1], env);
        }

        const agendaGet = url.pathname.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
        if (agendaGet) {
          return await handleGetAgendaItems(agendaGet[1], env);
        }

        const projectUpdatesGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/updates$/);
        if (projectUpdatesGet) {
          return await handleGetProjectUpdates(projectUpdatesGet[1], env);
        }

        const projectDocsGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/documents$/);
        if (projectDocsGet) {
          return await handleGetProjectDocuments(projectDocsGet[1], env);
        }

        const projectPapersGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/papers$/);
        if (projectPapersGet) {
          return await handleGetPaperLinks(projectPapersGet[1], env);
        }

        const projectDepsGet = url.pathname.match(/^\/api\/projects\/([^/]+)\/dependencies$/);
        if (projectDepsGet) {
          return await handleGetProjectDependencies(projectDepsGet[1], env);
        }

        if (url.pathname === '/api/dependencies') {
          return await handleGetDependencies(env);
        }

        // Revision tracker — active revisions (must come before parameterized :id)
        if (url.pathname === '/api/revisions/active') {
          return await handleGetActiveRevisions(env);
        }
        if (url.pathname === '/api/revisions') {
          return await handleGetRevisions(url, env);
        }

        const revisionCommentsGet = url.pathname.match(/^\/api\/revisions\/([^/]+)\/comments$/);
        if (revisionCommentsGet) {
          return await handleGetRevisionComments(revisionCommentsGet[1], env);
        }

        // Submission lifecycle events (must come before parameterized :id)
        if (url.pathname === '/api/submissions/active') {
          return await handleGetActiveSubmissions(env);
        }
        if (url.pathname === '/api/submissions') {
          return await handleGetSubmissions(url, env);
        }

        // Grant intelligence — NIH RePORTER proxy
        if (url.pathname === '/api/grants/similar') {
          return await handleSimilarGrants(url, env);
        }

        // Narratives
        if (url.pathname === '/api/narratives') {
          return await handleNarratives(env);
        }

        // Decisions endpoints
        if (url.pathname === '/api/decisions/similar') {
          return await handleSimilarDecisions(url, env);
        }
        if (url.pathname === '/api/decisions/similar-by-id') {
          return await handleSimilarDecisionsById(url, env);
        }
        if (url.pathname === '/api/decisions/review') {
          return await handleGetDecisionsNeedingReview(env);
        }
        if (url.pathname === '/api/decisions/tags') {
          return await handleGetDecisionTags(env);
        }
        if (url.pathname === '/api/decisions') {
          return await handleGetDecisions(url, env);
        }

        // Expertise endpoints
        if (url.pathname === '/api/expertise/suggest') {
          return await handleSuggestExperts(url, env);
        }
        if (url.pathname === '/api/expertise') {
          return await handleGetExpertise(url, env);
        }
        // AI requests
        if (url.pathname === '/api/ai-requests') {
          return await handleGetAIRequests(url, env);
        }

        // Questions (Ask the Lab)
        if (url.pathname === '/api/questions') {
          return await handleGetQuestions(url, env);
        }
        const questionDetailGet = url.pathname.match(/^\/api\/questions\/([^/]+)$/);
        if (questionDetailGet) {
          return await handleGetQuestionDetail(questionDetailGet[1], env);
        }

        switch (url.pathname) {
          case '/api/publications':
            return await handlePublications(url, env);
          case '/api/projects':
            return await handleProjects(url, env);
          case '/api/team':
            return await handleTeam(env);
          case '/api/grants':
            return await handleGrants(env);
          case '/api/graph/collaboration':
            return await handleCollaborationGraph(env);
          case '/api/stats':
            return await handleStats(env);
          case '/api/activity':
            return await handleActivity(url, env);
          case '/api/meetings':
            return await handleMeetings(env);
          case '/api/tasks/overdue-count':
            return await handleOverdueCount(url, env);
          case '/api/tasks':
            return await handleTasks(url, env);
          case '/api/action-items':
            return await handleActionItems(url, env);
          case '/api/updates/recent':
            return await handleRecentUpdates(url, env);
          case '/api/task-updates/recent':
            return await handleGetRecentTaskUpdates(url, env);
          case '/api/projects/health':
            return await handleProjectHealth(env);
          case '/api/grants/timeline':
            return await handleGrantsTimeline(env);
          case '/api/notifications':
            return await handleNotifications(url, request, env);
          case '/api/notifications/count':
            return await handleNotificationCount(url, request, env);
          case '/api/commitments':
            return await handleCommitments(url, env);
          case '/api/team/slugs':
            return await handleTeamSlugs(env);
          case '/api/team/pulse':
            return await handleTeamPulse(url, env);
          case '/api/ideas':
            return await handleIdeas(url, env);
          case '/api/search':
            return await handleSearch(url, env);
          case '/api/activity/heatmap':
            return await handleActivityHeatmap(url, env);
          case '/api/settings':
            return await handleGetSettings(env);
          case '/api/workflow-templates':
            return await handleGetWorkflowTemplates(env);
          case '/api/calendar/events':
            return await handleCalendarEvents(url, env);
        }

        // GET /api/files?entity_type=X&entity_id=Y — list file attachments
        if (url.pathname === '/api/files') {
          return await handleListFiles(url, env);
        }

        // GET /api/files/:key+ — presigned download URL
        const fileGetMatch = url.pathname.match(/^\/api\/files\/(.+)$/);
        if (fileGetMatch) {
          return await handleGetFile(fileGetMatch[1], env);
        }

        // GET /api/team/:slug/cv-data
        const cvDataGet = url.pathname.match(/^\/api\/team\/([^/]+)\/cv-data$/);
        if (cvDataGet) {
          return await handleCVData(cvDataGet[1], env);
        }

        // GET /api/team/:slug/trajectory
        const trajectoryGet = url.pathname.match(/^\/api\/team\/([^/]+)\/trajectory$/);
        if (trajectoryGet) {
          return await handleTrajectory(trajectoryGet[1], env);
        }

        // GET /api/team/:slug/contributions?period=90
        const contributionsGet = url.pathname.match(/^\/api\/team\/([^/]+)\/contributions$/);
        if (contributionsGet) {
          return await handleContributions(contributionsGet[1], url, env);
        }

        // Deadline cascade — dependency chain views
        if (url.pathname === '/api/deadline-cascade/all') {
          return await handleGetAllCascades(env);
        }
        if (url.pathname === '/api/deadline-cascade/impact') {
          return await handleGetImpact(url, env);
        }
        if (url.pathname === '/api/deadline-cascade') {
          return await handleGetCascade(url, env);
        }

        // GET /api/mentee-milestones/overview — PI dashboard overview
        if (url.pathname === '/api/mentee-milestones/overview') {
          return await handleMenteeMilestoneOverview(env);
        }

        // GET /api/mentee-milestones?mentee=&status=&type=
        if (url.pathname === '/api/mentee-milestones') {
          return await handleMenteeMilestones(url, env);
        }

        // GET /api/milestones?project_id=...&grant_id=...
        if (url.pathname === '/api/milestones') {
          return await handleGetMilestones(url, env);
        }

        // Grant post-award milestones
        if (url.pathname === '/api/grant-milestones/upcoming') {
          return await handleUpcomingGrantMilestones(url, env);
        }
        if (url.pathname === '/api/grant-milestones') {
          return await handleGrantMilestones(url, env);
        }

        // Regulatory & Compliance
        if (url.pathname === '/api/regulatory/expiring') {
          return await handleGetExpiringItems(url, env);
        }
        if (url.pathname === '/api/regulatory') {
          return await handleGetRegulatoryItems(url, env);
        }

        // Conference submissions
        if (url.pathname === '/api/conferences/upcoming') {
          return await handleGetUpcomingConferences(env);
        }
        if (url.pathname === '/api/conferences') {
          return await handleGetConferences(url, env);
        }

        // Email drafts
        if (url.pathname === '/api/email-drafts') {
          return await handleGetEmailDrafts(request, env, url);
        }
        if (url.pathname === '/api/email-drafts/pending') {
          return await handleGetPendingDrafts(request, env, url);
        }

        // Proactive brief
        if (url.pathname === '/api/proactive-brief') {
          return await handleProactiveBrief(request, env);
        }

        // Daily digest email preview (returns HTML page for testing)
        if (url.pathname === '/api/digest-preview') {
          return await handleDigestPreview(url, env);
        }

        // File activity heatmap
        if (url.pathname.match(/^\/api\/file-activity\/heatmap/)) {
          return await handleGetFileActivity(request, env, url);
        }

        // GET /api/reactions?target_type=...&target_id=...
        if (url.pathname === '/api/reactions') {
          return await handleGetReactions(url, env);
        }

        // GET /api/tasks/:id/comments
        const taskCommentsGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
        if (taskCommentsGet) {
          return await handleGetTaskComments(taskCommentsGet[1], env);
        }

        // GET /api/tasks/:id/files
        const taskFilesGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/files$/);
        if (taskFilesGet) {
          const { results } = await env.DB.prepare('SELECT * FROM task_files WHERE task_id = ? ORDER BY created_at DESC').bind(taskFilesGet[1]).all();
          return json({ data: results });
        }

        // GET /api/tasks/:id/updates
        const taskUpdatesGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/updates$/);
        if (taskUpdatesGet) {
          return await handleGetTaskUpdates(taskUpdatesGet[1], env);
        }

        // GET /api/tasks/:id/activity
        const taskActivityGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/activity$/);
        if (taskActivityGet) {
          return await handleGetTaskActivity(taskActivityGet[1], env);
        }

        // GET /api/tasks/:id/subtasks
        const taskSubtasksGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/subtasks$/);
        if (taskSubtasksGet) {
          return await handleGetSubtasks(taskSubtasksGet[1], env);
        }

        // GET /api/tasks/:id/handoffs
        const taskHandoffsGet = url.pathname.match(/^\/api\/tasks\/([^/]+)\/handoffs$/);
        if (taskHandoffsGet) {
          return await handleGetHandoffs(taskHandoffsGet[1], env);
        }
      }

      // Write endpoints (POST/PUT)
      // Auth is optional — when Cloudflare Access is configured, JWT provides identity.
      // When Access is not configured, writes are open (public site mode).
      if (request.method === 'POST' || request.method === 'PUT') {
        const user = getAuthUser(request) || { email: 'anonymous', name: 'Team Member' };

        const path = url.pathname;

        // POST /api/upload/url — presigned upload URL
        if (request.method === 'POST' && path === '/api/upload/url') {
          return withVersionBump(await handleUploadUrl(request, user, env));
        }

        // POST /api/upload/done — record file after upload
        if (request.method === 'POST' && path === '/api/upload/done') {
          return withVersionBump(await handleUploadDone(request, user, env));
        }

        // POST /api/files/:id/delete — delete file attachment
        const fileDeleteMatch = path.match(/^\/api\/files\/([^/]+)\/delete$/);
        if (request.method === 'POST' && fileDeleteMatch) {
          return withVersionBump(await handleDeleteFile(fileDeleteMatch[1], env));
        }

        // POST /api/projects — create new project (must come before :id match)
        if (request.method === 'POST' && path === '/api/projects') {
          return withVersionBump(await handleCreateProject(request, user, env));
        }

        // POST /api/projects/:id — update project fields
        const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
        if (request.method === 'POST' && projectMatch) {
          return withVersionBump(await handleUpdateProject(projectMatch[1], request, user, env));
        }

        // POST /api/projects/:id/comments — add comment
        const commentMatch = path.match(/^\/api\/projects\/([^/]+)\/comments$/);
        if (request.method === 'POST' && commentMatch) {
          return await handleAddComment(commentMatch[1], request, user, env);
        }

        // PUT /api/team/:slug — team member updates own profile
        const teamMatch = path.match(/^\/api\/team\/([^/]+)$/);
        if (request.method === 'PUT' && teamMatch) {
          return await handleUpdateTeamMember(teamMatch[1], request, user, env);
        }

        // POST /api/tasks/sync-bulk — bulk upsert from brain.db
        if (request.method === 'POST' && path === '/api/tasks/sync-bulk') {
          return withVersionBump(await handleSyncBulkTasks(request, user, env));
        }

        // POST /api/tasks/batch — batch update tasks
        if (request.method === 'POST' && path === '/api/tasks/batch') {
          return withVersionBump(await handleBatchUpdateTasks(request, user, env));
        }

        // POST /api/tasks/:id/acknowledge — closed-loop task acknowledgment
        const taskAckMatch = path.match(/^\/api\/tasks\/([^/]+)\/acknowledge$/);
        if (request.method === 'POST' && taskAckMatch) {
          return withVersionBump(await handleAcknowledgeTask(taskAckMatch[1], user, env));
        }

        // POST /api/tasks/:id/status — change task status
        const taskStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/);
        if (request.method === 'POST' && taskStatusMatch) {
          return withVersionBump(await handleUpdateTaskStatus(taskStatusMatch[1], request, user, env));
        }

        // POST /api/tasks/:id — update task fields
        const taskUpdateMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
        if (request.method === 'POST' && taskUpdateMatch) {
          return withVersionBump(await handleUpdateTask(taskUpdateMatch[1], request, user, env));
        }

        // POST /api/tasks — create new task
        if (request.method === 'POST' && path === '/api/tasks') {
          return withVersionBump(await handleCreateTask(request, user, env));
        }

        // POST /api/action-items/:id/toggle — backward compat alias
        const toggleMatch = path.match(/^\/api\/action-items\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && toggleMatch) {
          return withVersionBump(await handleToggleTask(toggleMatch[1], user, env));
        }

        // POST /api/action-items — backward compat alias
        if (request.method === 'POST' && path === '/api/action-items') {
          return withVersionBump(await handleCreateTask(request, user, env));
        }

        // GET /api/meetings/:id/prep — facilitator prep view
        const meetingPrepMatch = path.match(/^\/api\/meetings\/([^/]+)\/prep$/);
        if (request.method === 'GET' && meetingPrepMatch) {
          return await handleMeetingPrep(meetingPrepMatch[1], env);
        }

        // POST /api/meetings/:id/notes — update meeting notes
        const meetingNotesMatch = path.match(/^\/api\/meetings\/([^/]+)\/notes$/);
        if (request.method === 'POST' && meetingNotesMatch) {
          return withVersionBump(await handleUpdateMeetingNotes(meetingNotesMatch[1], request, user, env));
        }

        // POST /api/meetings/:id/agenda/reorder — reorder agenda items
        const agendaReorderMatch = path.match(/^\/api\/meetings\/([^/]+)\/agenda\/reorder$/);
        if (request.method === 'POST' && agendaReorderMatch) {
          return withVersionBump(await handleReorderAgenda(agendaReorderMatch[1], request, env));
        }

        // POST /api/meetings/:id/agenda — add agenda item
        const agendaMatch = path.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
        if (request.method === 'POST' && agendaMatch) {
          return withVersionBump(await handleAddAgendaItem(agendaMatch[1], request, user, env));
        }

        // POST /api/milestones/:id/note — add/update "Future Me" note
        const milestoneNoteMatch = path.match(/^\/api\/milestones\/([^/]+)\/note$/);
        if (request.method === 'POST' && milestoneNoteMatch) {
          return withVersionBump(await handleUpdateMilestoneNote(milestoneNoteMatch[1], request, user, env));
        }

        // POST /api/projects/:slug/updates — post project update
        const updateMatch = path.match(/^\/api\/projects\/([^/]+)\/updates$/);
        if (request.method === 'POST' && updateMatch) {
          return withVersionBump(await handlePostProjectUpdate(updateMatch[1], request, user, env));
        }

        // POST /api/projects/:slug/documents — add a document link
        const projectDocCreateMatch = path.match(/^\/api\/projects\/([^/]+)\/documents$/);
        if (request.method === 'POST' && projectDocCreateMatch) {
          return withVersionBump(await handleCreateProjectDocument(projectDocCreateMatch[1], request, user, env));
        }

        // POST /api/projects/:slug/documents/:docId/delete — remove a document link
        const projectDocDeleteMatch = path.match(/^\/api\/projects\/([^/]+)\/documents\/([^/]+)\/delete$/);
        if (request.method === 'POST' && projectDocDeleteMatch) {
          return withVersionBump(await handleDeleteProjectDocument(projectDocDeleteMatch[2], env));
        }

        // POST /api/meetings — create meeting
        if (request.method === 'POST' && path === '/api/meetings') {
          return withVersionBump(await handleCreateMeeting(request, user, env));
        }

        // POST /api/commitments — create/upsert commitment
        if (request.method === 'POST' && path === '/api/commitments') {
          return withVersionBump(await handleCreateCommitment(request, env));
        }

        // POST /api/notifications/:id/read — mark notification as read
        const notifReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
        if (request.method === 'POST' && notifReadMatch) {
          return await handleMarkNotificationRead(notifReadMatch[1], env);
        }

        // POST /api/notifications/read-all — mark all read
        if (request.method === 'POST' && path === '/api/notifications/read-all') {
          let recipient = user.email.split('@')[0];
          try {
            const body = await request.json() as Record<string, string>;
            if (body.recipient) recipient = body.recipient;
          } catch {}
          return await handleMarkAllNotificationsRead(recipient, env);
        }

        // POST /api/reactions — toggle reaction (add or remove)
        if (request.method === 'POST' && path === '/api/reactions') {
          return withVersionBump(await handleToggleReaction(request, user, env));
        }

        // POST /api/tasks/:id/comments — add task comment
        const taskCommentMatch = path.match(/^\/api\/tasks\/([^/]+)\/comments$/);
        if (request.method === 'POST' && taskCommentMatch) {
          return withVersionBump(await handleAddTaskComment(taskCommentMatch[1], request, user, env));
        }

        // POST /api/tasks/:id/updates — post task note/update
        const taskNoteMatch = path.match(/^\/api\/tasks\/([^/]+)\/updates$/);
        if (request.method === 'POST' && taskNoteMatch) {
          return withVersionBump(await handlePostTaskUpdate(taskNoteMatch[1], request, user, env));
        }

        // POST /api/tasks/:id/subtasks — create subtask
        const subtaskCreateMatch = path.match(/^\/api\/tasks\/([^/]+)\/subtasks$/);
        if (request.method === 'POST' && subtaskCreateMatch) {
          return withVersionBump(await handleCreateSubtask(subtaskCreateMatch[1], request, user, env));
        }

        // POST /api/subtasks/:id/toggle — toggle subtask completion
        const subtaskToggleMatch = path.match(/^\/api\/subtasks\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && subtaskToggleMatch) {
          return withVersionBump(await handleToggleSubtask(subtaskToggleMatch[1], user, env));
        }

        // POST /api/subtasks/:id/delete — delete subtask
        const subtaskDeleteMatch = path.match(/^\/api\/subtasks\/([^/]+)\/delete$/);
        if (request.method === 'POST' && subtaskDeleteMatch) {
          return await handleDeleteSubtask(subtaskDeleteMatch[1], env);
        }

        // POST /api/tasks/:id/subtasks/reorder — reorder subtasks
        const subtaskReorderMatch = path.match(/^\/api\/tasks\/([^/]+)\/subtasks\/reorder$/);
        if (request.method === 'POST' && subtaskReorderMatch) {
          return await handleReorderSubtasks(subtaskReorderMatch[1], request, env);
        }

        // POST /api/publications — create a new publication (e.g. from DOI lookup)
        if (request.method === 'POST' && path === '/api/publications') {
          const body = await request.json() as { title: string; authors: string; journal?: string; year?: number; doi?: string; pubmed?: string; abstract?: string; topics?: string[]; status?: string };
          const id = crypto.randomUUID().slice(0, 8);
          await env.DB.prepare(
            `INSERT INTO publications (id, title, authors, journal, year, doi, pubmed, abstract, topics, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(id, body.title, body.authors, body.journal || null, body.year || null, body.doi || null, body.pubmed || null, body.abstract || null, JSON.stringify(body.topics || []), body.status || 'Published').run();
          return json({ data: { id, title: body.title } });
        }

        // POST /api/tasks/:id/files — add file link to task
        const taskFileAddMatch = path.match(/^\/api\/tasks\/([^/]+)\/files$/);
        if (request.method === 'POST' && taskFileAddMatch) {
          const body = await request.json() as { filename: string; url: string; file_type?: string };
          const id = crypto.randomUUID().slice(0, 8);
          await env.DB.prepare(
            'INSERT INTO task_files (id, task_id, filename, url, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(id, taskFileAddMatch[1], body.filename, body.url, body.file_type || 'link', user).run();
          return json({ data: { id, task_id: taskFileAddMatch[1], filename: body.filename, url: body.url } });
        }

        // POST /api/task-files/:id/delete — remove file link
        const taskFileDeleteMatch = path.match(/^\/api\/task-files\/([^/]+)\/delete$/);
        if (request.method === 'POST' && taskFileDeleteMatch) {
          await env.DB.prepare('DELETE FROM task_files WHERE id = ?').bind(taskFileDeleteMatch[1]).run();
          return json({ data: { deleted: taskFileDeleteMatch[1] } });
        }

        // POST /api/tasks/:id/handoffs — create handoff
        const handoffCreateMatch = path.match(/^\/api\/tasks\/([^/]+)\/handoffs$/);
        if (request.method === 'POST' && handoffCreateMatch) {
          return await handleCreateHandoff(handoffCreateMatch[1], request, user, env);
        }

        // POST /api/handoffs/:id/acknowledge — acknowledge handoff
        const handoffAckMatch = path.match(/^\/api\/handoffs\/([^/]+)\/acknowledge$/);
        if (request.method === 'POST' && handoffAckMatch) {
          return await handleAcknowledgeHandoff(handoffAckMatch[1], user, env);
        }

        // POST /api/settings — update lab settings
        if (request.method === 'POST' && path === '/api/settings') {
          return await handleUpdateSettings(request, env);
        }

        // POST /api/workflow-templates — create/update template
        if (request.method === 'POST' && path === '/api/workflow-templates') {
          return await handleCreateWorkflowTemplate(request, env);
        }

        // POST /api/ideas — create idea
        if (request.method === 'POST' && path === '/api/ideas') {
          return withVersionBump(await handleCreateIdea(request, user, env));
        }

        // POST /api/ideas/:id — update idea
        const ideaUpdateMatch = path.match(/^\/api\/ideas\/([^/]+)$/);
        if (request.method === 'POST' && ideaUpdateMatch) {
          return withVersionBump(await handleUpdateIdea(ideaUpdateMatch[1], request, user, env));
        }

        // POST /api/ideas/:id/vote — upvote idea
        const ideaVoteMatch = path.match(/^\/api\/ideas\/([^/]+)\/vote$/);
        if (request.method === 'POST' && ideaVoteMatch) {
          return withVersionBump(await handleVoteIdea(ideaVoteMatch[1], env));
        }

        // POST /api/digest — create/upsert digest paper
        if (request.method === 'POST' && path === '/api/digest') {
          return await handleCreateDigestPaper(request, env);
        }

        // POST /api/digest/:id/status — update paper status
        const digestStatusMatch = path.match(/^\/api\/digest\/([^/]+)\/status$/);
        if (request.method === 'POST' && digestStatusMatch) {
          return await handleUpdateDigestStatus(digestStatusMatch[1], request, user, env);
        }

        // POST /api/paper-links — link a paper to a project
        if (request.method === 'POST' && path === '/api/paper-links') {
          return await handleLinkPaper(request, user, env);
        }

        // POST /api/paper-links/:id/delete
        const paperLinkDeleteMatch = path.match(/^\/api\/paper-links\/([^/]+)\/delete$/);
        if (request.method === 'POST' && paperLinkDeleteMatch) {
          return await handleUnlinkPaper(paperLinkDeleteMatch[1], env);
        }

        // POST /api/dependencies — create dependency
        if (request.method === 'POST' && path === '/api/dependencies') {
          return await handleCreateDependency(request, user, env);
        }

        // POST /api/dependencies/:id/delete
        const depDeleteMatch = path.match(/^\/api\/dependencies\/([^/]+)\/delete$/);
        if (request.method === 'POST' && depDeleteMatch) {
          return await handleDeleteDependency(depDeleteMatch[1], env);
        }

        // POST /api/decisions — create decision
        if (request.method === 'POST' && path === '/api/decisions') {
          return await handleCreateDecision(request, user, env);
        }

        // POST /api/decisions/:id/outcome — update outcome
        const decisionOutcomeMatch = path.match(/^\/api\/decisions\/([^/]+)\/outcome$/);
        if (request.method === 'POST' && decisionOutcomeMatch) {
          return await handleUpdateDecisionOutcome(decisionOutcomeMatch[1], request, user, env);
        }

        // POST /api/decisions/:id/update — update decision fields
        const decisionUpdateMatch = path.match(/^\/api\/decisions\/([^/]+)\/update$/);
        if (request.method === 'POST' && decisionUpdateMatch) {
          return await handleUpdateDecision(decisionUpdateMatch[1], request, user, env);
        }

        // POST /api/expertise — add expertise tag
        if (request.method === 'POST' && path === '/api/expertise') {
          return await handleAddExpertise(request, user, env);
        }

        // POST /api/expertise/:id/delete — remove expertise tag
        const expertiseDeleteMatch = path.match(/^\/api\/expertise\/([^/]+)\/delete$/);
        if (request.method === 'POST' && expertiseDeleteMatch) {
          return await handleRemoveExpertise(expertiseDeleteMatch[1], env);
        }

        // POST /api/questions — create question
        if (request.method === 'POST' && path === '/api/questions') {
          return await handleCreateQuestion(request, user, env);
        }

        // POST /api/questions/:id/answers — add answer
        const questionAnswerMatch = path.match(/^\/api\/questions\/([^/]+)\/answers$/);
        if (request.method === 'POST' && questionAnswerMatch) {
          return await handleCreateAnswer(questionAnswerMatch[1], request, user, env);
        }

        // POST /api/answers/:id/accept — accept answer
        const answerAcceptMatch = path.match(/^\/api\/answers\/([^/]+)\/accept$/);
        if (request.method === 'POST' && answerAcceptMatch) {
          return await handleAcceptAnswer(answerAcceptMatch[1], user, env);
        }

        // POST /api/ai-requests — create AI request
        if (request.method === 'POST' && path === '/api/ai-requests') {
          return await handleCreateAIRequest(request, user, env);
        }

        // POST /api/ai-requests/:id/response — update with AI response
        const aiResponseMatch = path.match(/^\/api\/ai-requests\/([^/]+)\/response$/);
        if (request.method === 'POST' && aiResponseMatch) {
          return await handleUpdateAIResponse(aiResponseMatch[1], request, env);
        }

        // POST /api/pb/capture — quick capture (task, idea, note)
        if (request.method === 'POST' && path === '/api/pb/capture') {
          return await handlePBCapture(request, user, env);
        }

        // POST /api/pb/defer — defer a task
        if (request.method === 'POST' && path === '/api/pb/defer') {
          return await handlePBDefer(request, env);
        }

        // POST /api/pb/plan — save/update daily plan
        if (request.method === 'POST' && path === '/api/pb/plan') {
          return await handleCreateOrUpdatePlan(request, user, env);
        }

        // POST /api/pb/plan/reorder — reorder tasks within a slot
        if (request.method === 'POST' && path === '/api/pb/plan/reorder') {
          return await handleReorderPlan(request, env);
        }

        // POST /api/pb/plan/promote — move task between slots
        if (request.method === 'POST' && path === '/api/pb/plan/promote') {
          return await handlePromoteTask(request, env);
        }

        // POST /api/pb/pomodoro/start — start a pomodoro session
        if (request.method === 'POST' && path === '/api/pb/pomodoro/start') {
          return await handleStartPomodoro(request, user, env);
        }

        // POST /api/pb/pomodoro/complete — complete a pomodoro session
        if (request.method === 'POST' && path === '/api/pb/pomodoro/complete') {
          return await handleCompletePomodoro(request, user, env);
        }

        // POST /api/pb/reflection — save daily reflection
        if (request.method === 'POST' && path === '/api/pb/reflection') {
          return await handleSaveReflection(request, user, env);
        }

        // POST /api/pb/dispatch/add — add item to dispatch queue
        if (request.method === 'POST' && path === '/api/pb/dispatch/add') {
          return await handleAddToDispatch(request, user, env);
        }

        // POST /api/pb/dispatch/send — send all pending dispatch items
        if (request.method === 'POST' && path === '/api/pb/dispatch/send') {
          return await handleSendDispatch(request, user, env);
        }

        // POST /api/pb/dispatch/complete — mark dispatch item completed
        if (request.method === 'POST' && path === '/api/pb/dispatch/complete') {
          return await handleCompleteDispatchItem(request, env);
        }

        // POST /api/pb/sessions — create/upsert a session
        if (request.method === 'POST' && path === '/api/pb/sessions') {
          return await handleCreatePBSession(request, user, env);
        }

        // POST /api/pb/sessions/bulk — bulk upsert sessions
        if (request.method === 'POST' && path === '/api/pb/sessions/bulk') {
          return await handleBulkCreatePBSessions(request, user, env);
        }

        // POST /api/pb/today — upsert TODAY.md content
        if (request.method === 'POST' && path === '/api/pb/today') {
          return await handleUpsertTodayMd(request, env);
        }

        // POST /api/pb/relay — create a relay message
        if (request.method === 'POST' && path === '/api/pb/relay') {
          return await handleCreateRelay(request, user, env);
        }

        // POST /api/pb/relay/:index/complete — mark relay message completed
        if (request.method === 'POST' && path.match(/^\/api\/pb\/relay\/\d+\/complete$/)) {
          const index = parseInt(path.split('/')[4], 10);
          return await handleCompleteRelay(request, env, index);
        }

        // POST /api/impact/check — scan for impact events and create notifications
        if (request.method === 'POST' && path === '/api/impact/check') {
          return await handleCheckImpact(env);
        }

        // ── Revision tracker ──

        // POST /api/revisions — create revision round
        if (request.method === 'POST' && path === '/api/revisions') {
          return await handleCreateRevision(request, user, env);
        }

        // POST /api/revisions/comments/:id — update a reviewer comment
        const revisionCommentUpdateMatch = path.match(/^\/api\/revisions\/comments\/([^/]+)$/);
        if (request.method === 'POST' && revisionCommentUpdateMatch) {
          return await handleUpdateRevisionComment(revisionCommentUpdateMatch[1], request, user, env);
        }

        // POST /api/revisions/:id/comments — add comment to revision
        const revisionCommentMatch = path.match(/^\/api\/revisions\/([^/]+)\/comments$/);
        if (request.method === 'POST' && revisionCommentMatch) {
          return await handleCreateRevisionComment(revisionCommentMatch[1], request, user, env);
        }

        // POST /api/revisions/:id — update revision fields
        const revisionUpdateMatch = path.match(/^\/api\/revisions\/([^/]+)$/);
        if (request.method === 'POST' && revisionUpdateMatch) {
          return await handleUpdateRevision(revisionUpdateMatch[1], request, user, env);
        }

        // ── Submission lifecycle ──

        // POST /api/submissions — create submission event
        if (request.method === 'POST' && path === '/api/submissions') {
          return await handleCreateSubmission(request, user, env);
        }

        // POST /api/submissions/:id/delete — soft delete
        const submissionDeleteMatch = path.match(/^\/api\/submissions\/([^/]+)\/delete$/);
        if (request.method === 'POST' && submissionDeleteMatch) {
          return await handleDeleteSubmission(submissionDeleteMatch[1], user, env);
        }

        // POST /api/submissions/:id — update submission event
        const submissionUpdateMatch = path.match(/^\/api\/submissions\/([^/]+)$/);
        if (request.method === 'POST' && submissionUpdateMatch) {
          return await handleUpdateSubmission(submissionUpdateMatch[1], request, user, env);
        }

        // ── Mentee milestones ──

        // POST /api/mentee-milestones/:id/complete — mark milestone completed
        const menteeMilestoneCompleteMatch = path.match(/^\/api\/mentee-milestones\/([^/]+)\/complete$/);
        if (request.method === 'POST' && menteeMilestoneCompleteMatch) {
          return await handleCompleteMenteeMilestone(menteeMilestoneCompleteMatch[1], user, env);
        }

        // POST /api/mentee-milestones/:id — update milestone fields
        const menteeMilestoneUpdateMatch = path.match(/^\/api\/mentee-milestones\/([^/]+)$/);
        if (request.method === 'POST' && menteeMilestoneUpdateMatch) {
          return await handleUpdateMenteeMilestone(menteeMilestoneUpdateMatch[1], request, user, env);
        }

        // POST /api/mentee-milestones — create milestone
        if (request.method === 'POST' && path === '/api/mentee-milestones') {
          return await handleCreateMenteeMilestone(request, user, env);
        }

        // ── Grant post-award milestones ──

        // POST /api/grant-milestones/:id/complete — mark completed (must come before :id match)
        const grantMilestoneCompleteMatch = path.match(/^\/api\/grant-milestones\/([^/]+)\/complete$/);
        if (request.method === 'POST' && grantMilestoneCompleteMatch) {
          return await handleCompleteGrantMilestone(grantMilestoneCompleteMatch[1], user, env);
        }

        // POST /api/grant-milestones/:id — update milestone
        const grantMilestoneUpdateMatch = path.match(/^\/api\/grant-milestones\/([^/]+)$/);
        if (request.method === 'POST' && grantMilestoneUpdateMatch) {
          return await handleUpdateGrantMilestone(grantMilestoneUpdateMatch[1], request, user, env);
        }

        // POST /api/grant-milestones — create milestone
        if (request.method === 'POST' && path === '/api/grant-milestones') {
          return await handleCreateGrantMilestone(request, user, env);
        }

        // ── Regulatory & Compliance ──

        // POST /api/regulatory/:id/renew — renew item (must come before :id match)
        const regulatoryRenewMatch = path.match(/^\/api\/regulatory\/([^/]+)\/renew$/);
        if (request.method === 'POST' && regulatoryRenewMatch) {
          return await handleRenewRegulatoryItem(regulatoryRenewMatch[1], request, user, env);
        }

        // POST /api/regulatory/:id — update item
        const regulatoryUpdateMatch = path.match(/^\/api\/regulatory\/([^/]+)$/);
        if (request.method === 'POST' && regulatoryUpdateMatch) {
          return await handleUpdateRegulatoryItem(regulatoryUpdateMatch[1], request, user, env);
        }

        // POST /api/regulatory — create item
        if (request.method === 'POST' && path === '/api/regulatory') {
          return await handleCreateRegulatoryItem(request, user, env);
        }

        // ── Conference submissions ──

        // POST /api/conferences/:id/delete — soft delete (must come before :id match)
        const confDeleteMatch = path.match(/^\/api\/conferences\/([^/]+)\/delete$/);
        if (request.method === 'POST' && confDeleteMatch) {
          return await handleDeleteConference(confDeleteMatch[1], user, env);
        }

        // POST /api/conferences/:id — update fields
        const confUpdateMatch = path.match(/^\/api\/conferences\/([^/]+)$/);
        if (request.method === 'POST' && confUpdateMatch) {
          return await handleUpdateConference(confUpdateMatch[1], request, user, env);
        }

        // POST /api/conferences — create submission
        if (request.method === 'POST' && path === '/api/conferences') {
          return await handleCreateConference(request, user, env);
        }

        // ── Deadline cascade dependencies ──

        // POST /api/deadline-dependencies — create dependency link
        if (request.method === 'POST' && path === '/api/deadline-dependencies') {
          return await handleCreateDeadlineDependency(request, user, env);
        }

        // POST /api/deadline-dependencies/:id/delete — remove dependency link
        const deadlineDepDeleteMatch = path.match(/^\/api\/deadline-dependencies\/([^/]+)\/delete$/);
        if (request.method === 'POST' && deadlineDepDeleteMatch) {
          return await handleDeleteDeadlineDependency(deadlineDepDeleteMatch[1], env);
        }

        // ── Daily digest email ──

        // POST /api/digest-email — generate digest for a member (returns HTML + data)
        if (request.method === 'POST' && path === '/api/digest-email') {
          return await handleGenerateDigestEmail(request, env);
        }

        // POST /api/digest-email/send — generate and send via Resend
        if (request.method === 'POST' && path === '/api/digest-email/send') {
          return await handleSendDigestEmail(request, env);
        }

        // ── Email drafts sync ──

        // POST /api/email-drafts/sync-bulk — bulk upsert email drafts
        if (request.method === 'POST' && path === '/api/email-drafts/sync-bulk') {
          return withVersionBump(await handleSyncEmailDrafts(request, env));
        }

        // ── File activity sync ──

        // POST /api/file-activity/sync — bulk upsert file activity entries
        if (request.method === 'POST' && path === '/api/file-activity/sync') {
          return withVersionBump(await handleSyncFileActivity(request, env));
        }

        // POST /api/admin/migrate — apply schema migrations
        if (request.method === 'POST' && path === '/api/admin/migrate') {
          const body = await request.json() as { version: number };
          if (body.version === 22) {
            const results: string[] = [];
            try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN updated_at TEXT').run(); results.push('added updated_at'); } catch { results.push('updated_at already exists'); }
            try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN deleted_at TEXT').run(); results.push('added deleted_at'); } catch { results.push('deleted_at already exists'); }
            try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at)').run(); results.push('created index'); } catch (e) { results.push(`index error: ${e}`); }
            // Backfill updated_at for existing rows
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
                  assigned_to TEXT DEFAULT 'nick',
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
          return error(`Unknown migration version: ${body.version}`, 400);
        }

        // POST /api/test-cleanup — remove test data from all tables (auth-gated)
        if (request.method === 'POST' && path === '/api/test-cleanup') {
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
        }

        return error('Not found', 404);
      }

      if (request.method !== 'GET') {
        return error('Method not allowed', 405);
      }

      // No matching route
      return error('Not found', 404);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Internal server error';
      return error(message, 500);
    }
  },

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

    // Get all team members with emails
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
  },
};
