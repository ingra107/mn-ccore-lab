import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity, actorSlug, isPiRequest, resolveActor } from '../helpers';
import { filterFixtures } from '../lib/fixtures';

// ── AI Co-Scientist: detect @hermes/@claude mentions in answers ──
async function handleClaudeMentionInAnswer(
  content: string,
  answerId: string,
  questionId: string,
  user: AuthUser,
  env: Env,
): Promise<void> {
  if (!/@(hermes|claude)\b/i.test(content)) return;

  const aiPrompt = content.replace(/@(hermes|claude)/gi, '').trim();
  if (aiPrompt.length <= 5) return;

  // Get question context
  const question = await env.DB.prepare(
    'SELECT question, project_slug FROM lab_questions WHERE id = ?'
  ).bind(questionId).first<{ question: string; project_slug: string | null }>();

  // Create AI request record
  const aiId = generateId();
  await env.DB.prepare(
    'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    aiId,
    'lab_answer',
    answerId,
    question?.project_slug || null,
    aiPrompt,
    question ? `Question: ${question.question}` : null,
    user.email,
  ).run();

  // Create a placeholder answer from claude-ai
  const responseId = generateId();
  await env.DB.prepare(
    'INSERT INTO lab_answers (id, question_id, content, author_slug) VALUES (?, ?, ?, ?)'
  ).bind(responseId, questionId, 'Thinking about this... (AI response pending)', 'claude-ai').run();
}

// ── Types ──────────────────────────────────────────────────────

interface QuestionRow {
  id: string;
  question: string;
  context: string | null;
  asked_by: string;
  project_slug: string | null;
  status: string;
  created_at: string;
}

interface AnswerRow {
  id: string;
  question_id: string;
  content: string;
  author_slug: string;
  is_accepted: number;
  created_at: string;
}

// ── GET /api/questions ─────────────────────────────────────────

export async function handleGetQuestions(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const projectSlug = url.searchParams.get('project_slug');
  const includeFixtures = url.searchParams.get('include_fixtures') === '1';

  let query = `
    SELECT q.*,
      (SELECT COUNT(*) FROM lab_answers a WHERE a.question_id = q.id) as answer_count
    FROM lab_questions q
    WHERE 1=1
  `;
  const params: string[] = [];

  if (status) { query += ' AND q.status = ?'; params.push(status); }
  if (projectSlug) { query += ' AND q.project_slug = ?'; params.push(projectSlug); }

  query += ' ORDER BY q.created_at DESC';

  const result = await env.DB.prepare(query).bind(...params).all();
  const rows = filterFixtures(result.results || [], 'question', includeFixtures);
  return json({ data: rows, count: rows.length });
}

// ── GET /api/questions/:id ─────────────────────────────────────

export async function handleGetQuestionDetail(id: string, env: Env): Promise<Response> {
  const question = await env.DB.prepare(
    'SELECT * FROM lab_questions WHERE id = ?'
  ).bind(id).first<QuestionRow>();

  if (!question) return error('Question not found', 404);

  const answers = await env.DB.prepare(
    'SELECT * FROM lab_answers WHERE question_id = ? ORDER BY is_accepted DESC, created_at ASC'
  ).bind(id).all<AnswerRow>();

  return json({
    data: {
      ...question,
      answers: answers.results || [],
      answer_count: answers.results?.length || 0,
    },
  });
}

// ── POST /api/questions ────────────────────────────────────────

export async function handleCreateQuestion(request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as {
    question?: string;
    title?: string;
    body?: string;
    context?: string;
    project_slug?: string;
    asked_by?: string;
  };

  // Accept both 'question' and 'title' field names
  const questionText = body.question || body.title;
  if (!questionText?.trim()) return error('question is required', 400);

  const id = generateId();
  // AM-2: validate/canonicalize asked_by; impersonation requires PI/service.
  const actor = await resolveActor(env, user, body.asked_by, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const askedBy = actor.slug;

  await env.DB.prepare(
    'INSERT INTO lab_questions (id, question, context, asked_by, project_slug) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    id,
    questionText.trim(),
    body.body || body.context?.trim() || null,
    askedBy,
    body.project_slug || null,
  ).run();

  await logActivity(env, 'question', `New question: "${questionText.trim().slice(0, 80)}"`, askedBy, id, 'question');

  // Check for @hermes/@claude mention in question → create AI request + placeholder answer
  try {
    if (/@(hermes|claude)\b/i.test(questionText)) {
      const aiPrompt = questionText.replace(/@(hermes|claude)/gi, '').trim();
      if (aiPrompt.length > 5) {
        const aiId = generateId();
        await env.DB.prepare(
          'INSERT INTO ai_requests (id, source_type, source_id, project_slug, prompt, context, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(aiId, 'lab_question', id, body.project_slug || null, aiPrompt, null, user.email).run();

        const responseId = generateId();
        await env.DB.prepare(
          'INSERT INTO lab_answers (id, question_id, content, author_slug) VALUES (?, ?, ?, ?)'
        ).bind(responseId, id, 'Thinking about this... (AI response pending)', 'claude-ai').run();
      }
    }
  } catch (e) {
    console.error('Failed to create AI request for @hermes mention in question:', e);
  }

  const created = await env.DB.prepare('SELECT * FROM lab_questions WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/questions/:id/answers ────────────────────────────

export async function handleCreateAnswer(questionId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string; author_slug?: string };

  if (!body.content?.trim()) return error('content is required', 400);

  // Verify question exists
  const question = await env.DB.prepare(
    'SELECT id, question FROM lab_questions WHERE id = ?'
  ).bind(questionId).first<{ id: string; question: string }>();
  if (!question) return error('Question not found', 404);

  const id = generateId();
  // AM-2: validate/canonicalize author_slug; impersonation requires PI/service.
  // claude-ai (Hermes) is always allowed by resolveActor.
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  await env.DB.prepare(
    'INSERT INTO lab_answers (id, question_id, content, author_slug) VALUES (?, ?, ?, ?)'
  ).bind(id, questionId, body.content.trim(), authorSlug).run();

  await logActivity(
    env,
    'answer',
    `Answered question: "${question.question.slice(0, 60)}"`,
    authorSlug,
    questionId,
    'question',
  );

  // Check for @hermes/@claude mention → create AI request + placeholder answer
  try {
    await handleClaudeMentionInAnswer(body.content, id, questionId, user, env);
  } catch (e) {
    console.error('Failed to create AI request for @hermes mention in answer:', e);
  }

  const created = await env.DB.prepare('SELECT * FROM lab_answers WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/answers/:id/accept ───────────────────────────────

export async function handleAcceptAnswer(answerId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  // Get the answer and its question
  const answer = await env.DB.prepare(
    'SELECT * FROM lab_answers WHERE id = ?'
  ).bind(answerId).first<AnswerRow>();
  if (!answer) return error('Answer not found', 404);

  // Authorization: PI OR the asker can accept (Stack Overflow model). D1 in DECISIONS-RESOLVED.
  const question = await env.DB.prepare(
    'SELECT asked_by FROM lab_questions WHERE id = ?'
  ).bind(answer.question_id).first<{ asked_by: string }>();
  if (!question) return error('Question not found', 404);

  const actorSlugValue = actorSlug(user.email);
  const isPi = await isPiRequest(request, env);
  if (!isPi && actorSlugValue !== question.asked_by) {
    return error('Only the PI or the question asker can accept an answer', 403);
  }

  // Mark this answer as accepted
  await env.DB.prepare(
    'UPDATE lab_answers SET is_accepted = 1 WHERE id = ?'
  ).bind(answerId).run();

  // Mark the question as resolved
  await env.DB.prepare(
    'UPDATE lab_questions SET status = ? WHERE id = ?'
  ).bind('resolved', answer.question_id).run();

  await logActivity(
    env,
    'answer_accepted',
    `Accepted answer on a question`,
    actorSlugValue,
    answer.question_id,
    'question',
  );

  return json({ data: { accepted: true, answer_id: answerId, question_id: answer.question_id } });
}
