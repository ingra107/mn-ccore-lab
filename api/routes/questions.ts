import type { AuthUser, Env } from '../helpers';
import { json, error, generateId, logActivity } from '../helpers';

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
  return json({ data: result.results || [], count: result.results?.length || 0 });
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
    question: string;
    context?: string;
    project_slug?: string;
  };

  if (!body.question?.trim()) return error('question is required', 400);

  const id = generateId();
  const askedBy = user.email.split('@')[0].toLowerCase();

  await env.DB.prepare(
    'INSERT INTO lab_questions (id, question, context, asked_by, project_slug) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.question.trim(),
    body.context?.trim() || null,
    askedBy,
    body.project_slug || null,
  ).run();

  await logActivity(env, 'question', `New question: "${body.question.trim().slice(0, 80)}"`, askedBy, id, 'question');

  const created = await env.DB.prepare('SELECT * FROM lab_questions WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/questions/:id/answers ────────────────────────────

export async function handleCreateAnswer(questionId: string, request: Request, user: AuthUser, env: Env): Promise<Response> {
  const body = await request.json() as { content: string };

  if (!body.content?.trim()) return error('content is required', 400);

  // Verify question exists
  const question = await env.DB.prepare(
    'SELECT id, question FROM lab_questions WHERE id = ?'
  ).bind(questionId).first<{ id: string; question: string }>();
  if (!question) return error('Question not found', 404);

  const id = generateId();
  const authorSlug = user.email.split('@')[0].toLowerCase();

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

  const created = await env.DB.prepare('SELECT * FROM lab_answers WHERE id = ?').bind(id).first();
  return json({ data: created }, 201);
}

// ── POST /api/answers/:id/accept ───────────────────────────────

export async function handleAcceptAnswer(answerId: string, user: AuthUser, env: Env): Promise<Response> {
  // Get the answer and its question
  const answer = await env.DB.prepare(
    'SELECT * FROM lab_answers WHERE id = ?'
  ).bind(answerId).first<AnswerRow>();
  if (!answer) return error('Answer not found', 404);

  // Mark this answer as accepted
  await env.DB.prepare(
    'UPDATE lab_answers SET is_accepted = 1 WHERE id = ?'
  ).bind(answerId).run();

  // Mark the question as resolved
  await env.DB.prepare(
    'UPDATE lab_questions SET status = ? WHERE id = ?'
  ).bind('resolved', answer.question_id).run();

  const actorSlug = user.email.split('@')[0].toLowerCase();
  await logActivity(
    env,
    'answer_accepted',
    `Accepted answer on a question`,
    actorSlug,
    answer.question_id,
    'question',
  );

  return json({ data: { accepted: true, answer_id: answerId, question_id: answer.question_id } });
}
