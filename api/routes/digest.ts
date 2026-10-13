import type { AuthUser, Env } from '../helpers';
import { json, error, logActivity, isPiRequest, resolveActor } from '../helpers';
import { handleCreateTask } from './tasks';
import { taskTitleTakenCheck, type TaskTitleTakenCheck } from '../lib/task-dedup-sql';

// Reading state is PER PERSON (schema-v136, Nick 2026-10-13): a member's Save
// or Dismiss lives in digest_paper_state, keyed by their slug, and 'new' is
// the absence of a row. research_digest holds only the paper's own facts.
//
// The paper columns are named, never `rd.*`: `status` is computed per viewer,
// and a second `status` key from the paper row would shadow it.
const PAPER_COLS = `rd.id, rd.title, rd.authors, rd.journal, rd.pub_date, rd.abstract, rd.summary,
  rd.significance, rd.pmid, rd.doi, rd.relevance_score, rd.relevance_reason, rd.topics,
  rd.digest_date, rd.created_at`;

// A note's task is shown as a link only when this viewer can open it. `tasks`
// reads through the viewer handle, so a task the viewer cannot see answers 0.
const TASK_VISIBLE = (col: string) =>
  `CASE WHEN ${col} IS NOT NULL AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = ${col} AND t.deleted_at IS NULL) THEN 1 ELSE 0 END`;

// One paper row as the viewer sees it: their status, the note count, and the
// newest note. Bind order: the viewer slug, then whatever the caller appends.
const PAPER_SELECT = `SELECT ${PAPER_COLS},
    COALESCE(s.status, 'new') AS status,
    s.updated_at AS status_at,
    (SELECT COUNT(*) FROM digest_comments c WHERE c.paper_id = rd.id) AS note_count,
    n.id AS note_id, n.author_slug AS note_author, n.content AS note_text,
    n.created_at AS note_at, n.task_id AS note_task_id, ${TASK_VISIBLE('n.task_id')} AS note_task_visible
  FROM research_digest rd
  LEFT JOIN digest_paper_state s ON s.paper_id = rd.id AND s.member_slug = ?
  LEFT JOIN digest_comments n ON n.id = (
    SELECT c2.id FROM digest_comments c2 WHERE c2.paper_id = rd.id
    ORDER BY c2.created_at DESC, c2.rowid DESC LIMIT 1)`;

type PaperRow = Record<string, unknown>;

/** Fold the newest-note columns into one `latest_note` object (null when none). */
function shapePaper(row: PaperRow): PaperRow {
  const { note_id, note_author, note_text, note_at, note_task_id, note_task_visible, ...paper } = row;
  return {
    ...paper,
    latest_note: note_id
      ? {
          id: note_id, author_slug: note_author, content: note_text, created_at: note_at,
          task_id: note_task_id ?? null, task_visible: note_task_visible === 1,
        }
      : null,
  };
}

const READING_STATUSES: readonly string[] = ['new', 'saved', 'dismissed'];

// GET /api/digest?date=&status=&topic=&limit=&offset=&with_relevance=true
//
// `viewerSlug` is the calling member (null for anyone else: every paper reads
// 'new' for them). `status=saved` with no `date` is the Saved list across every
// digest date, newest save first.
export async function handleGetDigest(url: URL, env: Env, viewerSlug: string | null = null): Promise<Response> {
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const topic = url.searchParams.get('topic');
  const withRelevance = url.searchParams.get('with_relevance') === 'true';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 300);
  // A page past the 300 cap: the Saved list pages through every save with it.
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  if (status && !READING_STATUSES.includes(status)) {
    return error('Invalid status. Must be: new, saved, or dismissed', 400);
  }

  let query = `${PAPER_SELECT} WHERE 1=1`;
  const params: (string | number)[] = [viewerSlug ?? ''];

  if (date) {
    query += ' AND rd.digest_date = ?';
    params.push(date);
  }

  if (status === 'new') {
    query += ' AND s.status IS NULL';
  } else if (status) {
    query += ' AND s.status = ?';
    params.push(status);
  }

  if (topic) {
    query += ' AND rd.topics LIKE ?';
    params.push(`%"${topic}"%`);
  }

  // rd.id last: a total order, so pages neither skip nor repeat a paper.
  query += status === 'saved' && !date
    ? ' ORDER BY s.updated_at DESC, rd.relevance_score DESC, rd.id LIMIT ? OFFSET ?'
    : ' ORDER BY rd.relevance_score DESC, rd.pub_date DESC, rd.id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await env.DB.prepare(query).bind(...params).all();
  const papers = (result.results as PaperRow[]).map(shapePaper);

  if (!withRelevance) {
    return json({ data: papers, count: papers.length });
  }

  // Match paper topics against expertise_tags: one read of the whole table,
  // filtered in memory. Every paper is matched; the old cap at 20 left the
  // rest with no members, so "For you" undercounted any date with more papers.
  const expertiseRowsRes = await env.DB.prepare(
    'SELECT member_slug, LOWER(tag) AS tag FROM expertise_tags',
  ).all();
  const expertiseRows = (expertiseRowsRes.results || []) as Array<{ member_slug: string; tag: string }>;
  const enriched = papers.map((paper) => {
    const topicsRaw = paper.topics as string | null;
    if (!topicsRaw) return { ...paper, relevant_members: [] };
    try {
      const topics = JSON.parse(topicsRaw) as string[];
      if (!topics.length) return { ...paper, relevant_members: [] };
      const needles = topics.map((t) => t.toLowerCase());
      const members = new Set<string>();
      for (const row of expertiseRows) {
        if (needles.some((n) => row.tag.includes(n))) {
          members.add(row.member_slug);
        }
      }
      return { ...paper, relevant_members: [...members] };
    } catch {
      return { ...paper, relevant_members: [] };
    }
  });

  return json({ data: enriched, count: enriched.length });
}

// GET /api/digest/dates — list available digest dates with paper counts
export async function handleDigestDates(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT digest_date as date, COUNT(*) as count
     FROM research_digest
     WHERE digest_date IS NOT NULL
     GROUP BY digest_date
     ORDER BY digest_date DESC`
  ).all();
  return json({ data: result.results });
}

// POST /api/digest/:id/status — set THIS member's status for a paper.
//
// `memberSlug` is the caller's own slug, never a body field, so one person
// cannot write another's state. 'new' deletes the row. The write is an
// INSERT OR IGNORE then an UPDATE: viewer-db refuses ON CONFLICT DO UPDATE on
// a scoped table, and the pair converges under a double tap.
export async function handleUpdateDigestStatus(
  id: string,
  request: Request,
  user: AuthUser,
  env: Env,
  memberSlug: string | null,
): Promise<Response> {
  if (!memberSlug) return error('Sign in as a lab member to save or dismiss papers', 403);
  const body = await request.json() as { status?: string };

  if (!body.status || !READING_STATUSES.includes(body.status)) {
    return error('Invalid status. Must be: new, saved, or dismissed', 400);
  }

  const exists = await env.DB.prepare('SELECT 1 AS ok FROM research_digest WHERE id = ?').bind(id).first();
  if (!exists) return error('Paper not found', 404);

  if (body.status === 'new') {
    await env.DB.prepare('DELETE FROM digest_paper_state WHERE paper_id = ? AND member_slug = ?')
      .bind(id, memberSlug).run();
  } else {
    const ins = await env.DB.prepare(
      'INSERT OR IGNORE INTO digest_paper_state (paper_id, member_slug, status) VALUES (?, ?, ?)'
    ).bind(id, memberSlug, body.status).run();
    if (ins.meta.changes === 0) {
      await env.DB.prepare(
        `UPDATE digest_paper_state SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE paper_id = ? AND member_slug = ?`
      ).bind(body.status, id, memberSlug).run();
    }
  }

  await logActivity(env, 'digest', `${body.status === 'saved' ? 'Saved' : body.status === 'dismissed' ? 'Dismissed' : 'Reset'} digest paper`, user.email, id, 'digest');

  const updated = await env.DB.prepare(`${PAPER_SELECT} WHERE rd.id = ?`).bind(memberSlug, id).first<PaperRow>();
  return json({ data: updated ? shapePaper(updated) : null });
}

const COMMENT_SELECT = `SELECT c.id, c.paper_id, c.author_slug, c.content, c.created_at, c.task_id,
    ${TASK_VISIBLE('c.task_id')} AS task_visible
  FROM digest_comments c`;

// GET /api/digest/:id/comments — list notes on a paper, oldest first
export async function handleGetDigestComments(
  paperId: string,
  env: Env,
): Promise<Response> {
  const result = await env.DB.prepare(
    `${COMMENT_SELECT} WHERE c.paper_id = ? ORDER BY c.created_at ASC, c.rowid ASC`
  ).bind(paperId).all();
  return json({ data: result.results });
}

// POST /api/digest/:id/comments — add a note to a paper
export async function handleCreateDigestComment(
  paperId: string,
  request: Request,
  user: AuthUser,
  env: Env,
): Promise<Response> {
  const body = await request.json() as { content?: string; author_slug?: string };
  if (!body.content?.trim()) {
    return error('content is required', 400);
  }

  const id = crypto.randomUUID();
  // AM-2: validate/canonicalize author_slug. Pre-fix used a raw
  // email.split('@')[0].replace(/\./g,'-') derivation that bypassed actorSlug
  // (so it never canonicalized aliases like ningraha → nick-ingraham).
  const actor = await resolveActor(env, user, body.author_slug, { allowImpersonation: await isPiRequest(request, env) });
  if ('error' in actor) return error(actor.error, 400);
  const authorSlug = actor.slug;

  await env.DB.prepare(
    'INSERT INTO digest_comments (id, paper_id, author_slug, content) VALUES (?, ?, ?, ?)'
  ).bind(id, paperId, authorSlug, body.content.trim()).run();

  await logActivity(env, 'digest', `Commented on digest paper`, user.email, paperId, 'digest');

  const comment = await env.DB.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).bind(id).first();
  return json({ data: comment }, 201);
}

/**
 * A task title from a note: its first line plus a tag, at most 120 characters.
 * The tag names the paper ("PMID 222"), so the same short note on two papers
 * gives two titles; with no tag the title is the line alone. The line is cut
 * to fit, never the tag.
 */
export function noteTaskTitle(note: string, tag?: string): string {
  const line = note.trim().split(/\r?\n/)[0].trim();
  const suffix = tag ? ` (${tag})` : '';
  const room = 120 - suffix.length;
  const head = line.length > room ? `${line.slice(0, room - 1).trimEnd()}…` : line;
  return `${head}${suffix}`;
}

/** The paper's short tag: its PMID, else its DOI, else its title, each capped. */
export function paperTag(p: { pmid: string | null; doi: string | null; title: string }): string {
  const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  if (p.pmid) return `PMID ${p.pmid}`;
  if (p.doi) return `doi ${cap(p.doi, 40)}`;
  return cap(p.title, 40);
}

/** The note's own tag: the paper tag plus the first 6 characters of its id.
 *  No other note can produce it, so a title carrying it is free unless this
 *  very note already made a task. */
export function noteTag(noteId: string, paper: string): string {
  return `${paper} · note ${noteId.replace(/-/g, '').slice(0, 6)}`;
}

// POST /api/digest/comments/:id/task — turn a note into a Hub task.
//
// The task goes through the one task-create path (handleCreateTask: the
// applyMutation insert, I18 title dedup, assignment notice), assigned to the
// caller, with the paper as its first key link. The note keeps the task id,
// so a second tap returns the same task instead of making another. Only a
// task the caller can see AND that was deleted frees the note for a new one;
// a task the caller cannot see still blocks a duplicate (it reads as absent
// through the viewer handle, and absent counts as "still there").
//
// Title identity. The task-create path adopts any open project-less task with
// the same title (I18), whoever owns it. Two guards keep a note from being
// stamped with somebody else's task:
//   1. The title carries the paper tag, and if that title is taken anywhere in
//      the lab (the route hands in the oracle over the UNSCOPED handle, so a
//      task the caller cannot see counts too) it carries the note's own tag instead.
//   2. The create runs with adopt:false, so an adoption that still happens (a
//      race) answers 409 'title_taken' and never hands back the other task's
//      id. The stamp below only ever sees an id this call minted.
export async function handleMakeTaskFromNote(
  commentId: string,
  user: AuthUser,
  env: Env,
  waitUntil?: (promise: Promise<unknown>) => void,
  titleTaken: TaskTitleTakenCheck = taskTitleTakenCheck(env.DB),
): Promise<Response> {
  if (!user.slug || user.slug === 'anonymous') return error('Sign in as a lab member to make a task', 403);

  const note = await env.DB.prepare(
    `SELECT c.id, c.content, c.task_id, rd.title, rd.journal, rd.pub_date, rd.pmid, rd.doi
     FROM digest_comments c JOIN research_digest rd ON rd.id = c.paper_id
     WHERE c.id = ?`
  ).bind(commentId).first<{
    id: string; content: string; task_id: string | null; title: string;
    journal: string | null; pub_date: string | null; pmid: string | null; doi: string | null;
  }>();
  if (!note) return error('Note not found', 404);

  if (note.task_id) {
    const prior = await env.DB.prepare('SELECT deleted_at FROM tasks WHERE id = ?')
      .bind(note.task_id).first<{ deleted_at: string | null }>();
    if (!prior || prior.deleted_at == null) return json({ data: { task_id: note.task_id, created: false } });
  }

  const paperUrl = note.pmid
    ? `https://pubmed.ncbi.nlm.nih.gov/${note.pmid}/`
    : note.doi ? `https://doi.org/${note.doi}` : null;
  const cite = [note.journal, note.pub_date?.slice(0, 4)].filter(Boolean).join(', ');
  const paperTitle = note.title.length > 80 ? `${note.title.slice(0, 79).trimEnd()}…` : note.title;

  // Guard 1: pick a title no open project-less task holds, seen lab-wide.
  const tag = paperTag(note);
  let title = noteTaskTitle(note.content, tag);
  if (await titleTaken(title, null)) title = noteTaskTitle(note.content, noteTag(note.id, tag));

  const res = await handleCreateTask(
    new Request('https://internal/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: `${note.content.trim()}\n\nFrom the Research Digest: ${note.title}${cite ? ` (${cite})` : ''}`,
        assignee: user.slug,
        source: 'digest',
        key_link_1: paperUrl,
        key_link_1_desc: paperUrl ? `Paper: ${paperTitle}` : null,
      }),
    }),
    user,
    env,
    waitUntil,
    { adopt: false },  // Guard 2: an adopted row never comes back as ours.
  );
  if (res.status !== 201) return res;
  const created = await res.json() as { data?: { id?: string } | null };
  const taskId = created.data?.id;
  // A 201 with adopt:false is a row this call minted; the caller made it, so
  // the viewer handle reads it back. No id here means the read failed.
  if (!taskId) return error('The task was made but could not be read back', 500);

  const stamped = await env.DB.prepare(
    'UPDATE digest_comments SET task_id = ? WHERE id = ? AND (task_id IS NULL OR task_id = ?)'
  ).bind(taskId, note.id, note.task_id ?? '').run();
  if (stamped.meta.changes === 0) {
    // A second tap won the race: answer with the task it stored.
    const row = await env.DB.prepare('SELECT task_id FROM digest_comments WHERE id = ?').bind(note.id).first<{ task_id: string | null }>();
    return json({ data: { task_id: row?.task_id ?? taskId, created: false } });
  }

  await logActivity(env, 'digest', 'Made a task from a digest note', user.email, taskId, 'task');
  return json({ data: { task_id: taskId, created: true } }, 201);
}

// POST /api/digest — create or upsert a digest paper
export async function handleCreateDigestPaper(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  if (!body.id || !body.title) return error('id and title required', 400);

  // Upsert, and every clause here is load-bearing. Three classes of column:
  //
  //  1. The READER's state is not in this table at all: Save / Dismiss live
  //     per person in digest_paper_state (schema-v136), which no push names.
  //     (This was INSERT OR REPLACE over a lab-wide `status` column, which
  //     reset a saved or dismissed paper to 'new' on every re-push.) A body
  //     `status` field from an older PB client is ignored.
  //
  //  2. FIRST-SIGHT facts -- `digest_date`. COALESCE keeps the stored value:
  //     it means "the date this paper appeared in the digest", and PB's
  //     Digest.md is a ROLLING document whose frontmatter carries only the
  //     date it was last generated. Writing `excluded` collapsed 1065 papers
  //     onto one day and flattened the date selector's whole history
  //     (2026-09-22, repaired from `created_at`).
  //
  //  3. The paper's own facts -- everything else. `COALESCE(excluded.x, x)`,
  //     so a push that has nothing to say for a field leaves what is there.
  //     A re-generated Digest.md drops the LLM TLDR from older entries; a bare
  //     `excluded.summary` erased 74 stored summaries that no source still
  //     holds. Absent means "not parsed this run", never "clear it".
  //     `title` is the exception: it is required, so it always lands, and
  //     `relevance_score` is written whenever the push carries one (a real
  //     score below the old field-presence 0.7/0.8 must replace it; MAX kept
  //     the fake value) and left alone when the push sends none (site audit F87).
  await env.DB.prepare(
    `INSERT INTO research_digest (id, title, authors, journal, pub_date, abstract, summary, significance, pmid, doi, relevance_score, relevance_reason, topics, digest_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       authors = COALESCE(excluded.authors, research_digest.authors),
       journal = COALESCE(excluded.journal, research_digest.journal),
       pub_date = COALESCE(excluded.pub_date, research_digest.pub_date),
       abstract = COALESCE(excluded.abstract, research_digest.abstract),
       summary = COALESCE(excluded.summary, research_digest.summary),
       significance = COALESCE(excluded.significance, research_digest.significance),
       pmid = COALESCE(excluded.pmid, research_digest.pmid),
       doi = COALESCE(excluded.doi, research_digest.doi),
       relevance_score = COALESCE(?, research_digest.relevance_score),
       relevance_reason = COALESCE(excluded.relevance_reason, research_digest.relevance_reason),
       topics = COALESCE(excluded.topics, research_digest.topics),
       digest_date = COALESCE(research_digest.digest_date, excluded.digest_date)`
  ).bind(
    body.id as string,
    body.title as string,
    (body.authors as string) ?? null,
    (body.journal as string) ?? null,
    (body.pub_date as string) ?? null,
    (body.abstract as string) ?? null,
    (body.summary as string) ?? null,
    (body.significance as string) ?? null,
    (body.pmid as string) ?? null,
    (body.doi as string) ?? null,
    (body.relevance_score as number) ?? 0,
    (body.relevance_reason as string) ?? null,
    (body.topics as string) ?? null,
    (body.digest_date as string) ?? null,
    typeof body.relevance_score === 'number' ? body.relevance_score : null,
  ).run();

  return json({ data: { id: body.id } }, 201);
}
