import type { Env } from './types';
import { corsHeaders, json, error, getAuthUser } from './helpers';

// ── Route modules ──────────────────────────────────────────
import { handleTasks, handleUpdateTaskStatus, handleToggleTask, handleUpdateTask, handleCreateTask, handleGetTaskComments, handleAddTaskComment, handleGetTaskActivity, handleBatchUpdateTasks } from './routes/tasks';
import { handleProjects, handleCreateProject, handleGetComments, handleGetProjectUpdates, handleProjectHealth, handleRecentUpdates, handleUpdateProject, handleAddComment, handlePostProjectUpdate, handleGetMilestones, handleUpdateMilestoneNote } from './routes/projects';
import { handleMeetings, handleGetMeeting, handleGetAgendaItems, handleAddAgendaItem, handleReorderAgenda, handleCreateMeeting, handleUpdateMeetingNotes } from './routes/meetings';
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
import { handleGetPaperLinks, handleLinkPaper, handleUnlinkPaper } from './routes/paper-links';
import { handleGetDependencies, handleGetProjectDependencies, handleCreateDependency, handleDeleteDependency } from './routes/dependencies';
import { handleTrajectory } from './routes/trajectory';
import { handleContributions } from './routes/contributions';
import { handleSimilarGrants } from './routes/grant-intelligence';
import { handleGetDecisions, handleCreateDecision, handleUpdateDecisionOutcome, handleGetDecisionsNeedingReview } from './routes/decisions';
import { handleSimilarDecisions } from './routes/decision-replay';
import { handleNarratives } from './routes/narratives';
import { handleGetExpertise, handleAddExpertise, handleRemoveExpertise, handleSuggestExperts } from './routes/expertise';
import { handleGetQuestions, handleGetQuestionDetail, handleCreateQuestion, handleCreateAnswer, handleAcceptAnswer } from './routes/questions';
import { handleGetHandoffs, handleCreateHandoff, handleAcknowledgeHandoff } from './routes/handoffs';
import { handleCheckImpact } from './routes/impact-trace';
import { handlePIAnalytics } from './routes/pi-analytics';
import { handleCadenceCheck } from './routes/meeting-cadence';
import { handleGetAIRequests, handleCreateAIRequest, handleUpdateAIResponse } from './routes/ai-requests';
import { handleCommandCenter, handlePBCapture, handlePBDefer, handleCreateOrUpdatePlan, handleReorderPlan, handlePromoteTask, handleStartPomodoro, handleCompletePomodoro, handleSaveReflection, handlePlanHistory, handleAddToDispatch, handleGetPendingDispatch, handleSendDispatch, handleCompleteDispatchItem } from './routes/pb-sector';

// GET /api/auth/me — return current user or 401
function handleAuthMe(request: Request): Response {
  const user = getAuthUser(request);
  if (!user) {
    return json({ authenticated: false }, 200);
  }
  return json({ authenticated: true, ...user });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Auth endpoint — returns current user from Cloudflare Access JWT
      if (url.pathname === '/api/auth/me') {
        return handleAuthMe(request);
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

        // PI Analytics — leadership dashboard data
        if (url.pathname === '/api/pi/analytics') {
          return await handlePIAnalytics(env);
        }

        // Digest endpoints (must come before parameterized catch-alls)
        if (url.pathname === '/api/digest/dates') {
          return await handleDigestDates(env);
        }
        if (url.pathname === '/api/digest') {
          return await handleDigest(url, env);
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
        if (url.pathname === '/api/decisions/review') {
          return await handleGetDecisionsNeedingReview(env);
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
          case '/api/tasks':
            return await handleTasks(url, env);
          case '/api/action-items':
            return await handleTasks(url, env);  // backward compat alias
          case '/api/updates/recent':
            return await handleRecentUpdates(url, env);
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

        // GET /api/milestones?project_id=...&grant_id=...
        if (url.pathname === '/api/milestones') {
          return await handleGetMilestones(url, env);
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

        // POST /api/projects — create new project (must come before :id match)
        if (request.method === 'POST' && path === '/api/projects') {
          return await handleCreateProject(request, user, env);
        }

        // POST /api/projects/:id — update project fields
        const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
        if (request.method === 'POST' && projectMatch) {
          return await handleUpdateProject(projectMatch[1], request, user, env);
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

        // POST /api/tasks/batch — batch update tasks
        if (request.method === 'POST' && path === '/api/tasks/batch') {
          return await handleBatchUpdateTasks(request, user, env);
        }

        // POST /api/tasks/:id/status — change task status
        const taskStatusMatch = path.match(/^\/api\/tasks\/([^/]+)\/status$/);
        if (request.method === 'POST' && taskStatusMatch) {
          return await handleUpdateTaskStatus(taskStatusMatch[1], request, user, env);
        }

        // POST /api/tasks/:id — update task fields
        const taskUpdateMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
        if (request.method === 'POST' && taskUpdateMatch) {
          return await handleUpdateTask(taskUpdateMatch[1], request, user, env);
        }

        // POST /api/tasks — create new task
        if (request.method === 'POST' && path === '/api/tasks') {
          return await handleCreateTask(request, user, env);
        }

        // POST /api/action-items/:id/toggle — backward compat alias
        const toggleMatch = path.match(/^\/api\/action-items\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && toggleMatch) {
          return await handleToggleTask(toggleMatch[1], user, env);
        }

        // POST /api/action-items — backward compat alias
        if (request.method === 'POST' && path === '/api/action-items') {
          return await handleCreateTask(request, user, env);
        }

        // POST /api/meetings/:id/notes — update meeting notes
        const meetingNotesMatch = path.match(/^\/api\/meetings\/([^/]+)\/notes$/);
        if (request.method === 'POST' && meetingNotesMatch) {
          return await handleUpdateMeetingNotes(meetingNotesMatch[1], request, user, env);
        }

        // POST /api/meetings/:id/agenda/reorder — reorder agenda items
        const agendaReorderMatch = path.match(/^\/api\/meetings\/([^/]+)\/agenda\/reorder$/);
        if (request.method === 'POST' && agendaReorderMatch) {
          return await handleReorderAgenda(agendaReorderMatch[1], request, env);
        }

        // POST /api/meetings/:id/agenda — add agenda item
        const agendaMatch = path.match(/^\/api\/meetings\/([^/]+)\/agenda$/);
        if (request.method === 'POST' && agendaMatch) {
          return await handleAddAgendaItem(agendaMatch[1], request, user, env);
        }

        // POST /api/milestones/:id/note — add/update "Future Me" note
        const milestoneNoteMatch = path.match(/^\/api\/milestones\/([^/]+)\/note$/);
        if (request.method === 'POST' && milestoneNoteMatch) {
          return await handleUpdateMilestoneNote(milestoneNoteMatch[1], request, user, env);
        }

        // POST /api/projects/:slug/updates — post project update
        const updateMatch = path.match(/^\/api\/projects\/([^/]+)\/updates$/);
        if (request.method === 'POST' && updateMatch) {
          return await handlePostProjectUpdate(updateMatch[1], request, user, env);
        }

        // POST /api/meetings — create meeting
        if (request.method === 'POST' && path === '/api/meetings') {
          return await handleCreateMeeting(request, user, env);
        }

        // POST /api/commitments — create/upsert commitment
        if (request.method === 'POST' && path === '/api/commitments') {
          return await handleCreateCommitment(request, env);
        }

        // POST /api/notifications/:id/read — mark notification as read
        const notifReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
        if (request.method === 'POST' && notifReadMatch) {
          return await handleMarkNotificationRead(notifReadMatch[1], env);
        }

        // POST /api/notifications/read-all — mark all read
        if (request.method === 'POST' && path === '/api/notifications/read-all') {
          const body = await request.json() as Record<string, string>;
          return await handleMarkAllNotificationsRead(body.recipient || user.email.split('@')[0], env);
        }

        // POST /api/reactions — toggle reaction (add or remove)
        if (request.method === 'POST' && path === '/api/reactions') {
          return await handleToggleReaction(request, user, env);
        }

        // POST /api/tasks/:id/comments — add task comment
        const taskCommentMatch = path.match(/^\/api\/tasks\/([^/]+)\/comments$/);
        if (request.method === 'POST' && taskCommentMatch) {
          return await handleAddTaskComment(taskCommentMatch[1], request, user, env);
        }

        // POST /api/tasks/:id/subtasks — create subtask
        const subtaskCreateMatch = path.match(/^\/api\/tasks\/([^/]+)\/subtasks$/);
        if (request.method === 'POST' && subtaskCreateMatch) {
          return await handleCreateSubtask(subtaskCreateMatch[1], request, user, env);
        }

        // POST /api/subtasks/:id/toggle — toggle subtask completion
        const subtaskToggleMatch = path.match(/^\/api\/subtasks\/([^/]+)\/toggle$/);
        if (request.method === 'POST' && subtaskToggleMatch) {
          return await handleToggleSubtask(subtaskToggleMatch[1], user, env);
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
          return await handleCreateIdea(request, user, env);
        }

        // POST /api/ideas/:id — update idea
        const ideaUpdateMatch = path.match(/^\/api\/ideas\/([^/]+)$/);
        if (request.method === 'POST' && ideaUpdateMatch) {
          return await handleUpdateIdea(ideaUpdateMatch[1], request, user, env);
        }

        // POST /api/ideas/:id/vote — upvote idea
        const ideaVoteMatch = path.match(/^\/api\/ideas\/([^/]+)\/vote$/);
        if (request.method === 'POST' && ideaVoteMatch) {
          return await handleVoteIdea(ideaVoteMatch[1], env);
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

        // POST /api/impact/check — scan for impact events and create notifications
        if (request.method === 'POST' && path === '/api/impact/check') {
          return await handleCheckImpact(env);
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
