/**
 * api/routes/member-featured-publications.ts — PB backlog #906 residual.
 *
 * Per-member curated "Top-10 Featured Articles" on a member page. Backed by
 * the join table schema-v106-member-featured-publications.sql. Two routes:
 *
 *   GET  /api/team/:slug/featured-publications  — public. The member's chosen
 *        papers as ordinary Publication rows, in the member's own order.
 *   PUT  /api/team/:slug/featured-publications  — the member themselves, a PI,
 *        or the service key. Body { publicationIds: string[] }, ORDERED,
 *        max 10, distinct. Replace-set: the array IS the new list.
 *
 * Why replace-set instead of add/remove endpoints: the thing the member edits
 * is a ranked list of at most ten, and every constraint we care about (the cap,
 * distinctness, dense 0..N-1 ordering) is a property of the WHOLE list. A pair
 * of add/remove routes would have to re-derive and re-check those on every
 * call and could still leave gaps in sort_order after a delete. One ordered PUT
 * makes the invalid states unreachable instead of guarded (ethos #15): the
 * writer never renumbers, because it always writes the full sequence.
 *
 * The write is one D1 batch (DELETE + N INSERTs), which D1 runs as a single
 * transaction — a half-applied list is not observable.
 */

import type { Env } from '../helpers';
import { json, error, actorSlugFromRequest, isPiRequest } from '../helpers';
import type { PublicationRow } from '../types';

/** Nick's spec is literally "Top-10". Enforced here, not in the schema —
 *  the replace-set write rejects an over-long list before it writes anything,
 *  so a trigger would guard a state the writer cannot produce. */
export const MAX_FEATURED_PUBLICATIONS = 10;

/**
 * The member's chosen publications, joined and in the member's own order.
 *
 * ORDER BY is (sort_order, id): sort_order is dense and gapless because the
 * writer assigns it from the submitted array index, and `p.id` is only a
 * deterministic tiebreak for rows written before this route existed or by
 * hand. Deliberately NO `year DESC` tiebreak — the member's order is the
 * point, and a DESC + LIMIT pair in the same statement is the shape PB's
 * R1 cursor lint watches for.
 */
export async function handleGetMemberFeaturedPublications(
  slug: string,
  env: Env,
): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT p.id, p.title, p.authors, p.journal, p.year, p.status,
            p.doi, p.pubmed, p.abstract, p.topics, p.featured, p.author_slugs,
            p.created_at, p.updated_at
       FROM member_featured_publications m
       JOIN publications p ON p.id = m.publication_id
      WHERE m.member_slug = ?
      ORDER BY m.sort_order ASC, p.id ASC
      LIMIT ?`,
  )
    .bind(slug, MAX_FEATURED_PUBLICATIONS)
    .all<PublicationRow>();

  const rows = result.results ?? [];
  return json({ data: rows, count: rows.length });
}

/**
 * Replace the member's featured list with the submitted ORDERED array.
 *
 * Authorization: the member editing their own list, OR a PI / valid service
 * key (isPiRequest covers both). Fail-closed regardless of REQUIRE_AUTH — an
 * unauthenticated caller has no actor slug, so it can never match `slug`.
 *
 * NOT validated: that the member is actually an author of each publication.
 * `publications.author_slugs` on rows already in prod holds ONE member slug
 * per paper in practice — duplicate ingestion used to keep the first
 * generated row and drop the rest instead of unioning their author slugs
 * (PB backlog #1126). The generation-time bug is fixed (src/data/merge
 * Publications.ts `unionAuthorSlugs`, used by both mergePublications() and
 * fetch-publications.ts's own intra-run dedup) — but that only changes what
 * NEW rows carry going forward. Every row inserted before the fix still has
 * its collapsed single-slug value; scripts/backfill-author-slugs-report.ts
 * is the read-only report for what those rows would gain (#1126). An
 * authorship check against `author_slugs` today would still reject
 * legitimate coauthors on any pre-fix row. Add the check AFTER the backfill
 * (report reviewed, then an actual UPDATE) lands, not before.
 */
export async function handlePutMemberFeaturedPublications(
  slug: string,
  request: Request,
  env: Env,
): Promise<Response> {
  // ── authorization ────────────────────────────────────────────────────────
  if (!(await isPiRequest(request, env))) {
    const caller = await actorSlugFromRequest(request, env);
    if (!caller || caller !== slug) {
      return error(`Not authorized to edit featured publications for "${slug}"`, 403);
    }
  }

  // ── the member must exist ────────────────────────────────────────────────
  // D1 does not enforce the declared FK (no PRAGMA foreign_keys=ON), so this
  // is what actually keeps orphan rows out of the table.
  const member = await env.DB.prepare(
    'SELECT 1 AS ok FROM team_members WHERE slug = ? LIMIT 1',
  ).bind(slug).first<{ ok: number }>();
  if (!member) return error(`Unknown member "${slug}"`, 404);

  // ── body ─────────────────────────────────────────────────────────────────
  let body: { publicationIds?: unknown };
  try {
    body = await request.json() as { publicationIds?: unknown };
  } catch {
    return error('Invalid JSON body', 400);
  }

  const submitted = body.publicationIds;
  if (!Array.isArray(submitted)) {
    return error('publicationIds must be an array of publication ids (ordered)', 400);
  }
  if (!submitted.every((v) => typeof v === 'string' && v.trim() !== '')) {
    return error('publicationIds must contain non-empty publication id strings', 400);
  }
  const ids = (submitted as string[]).map((v) => v.trim());

  if (ids.length > MAX_FEATURED_PUBLICATIONS) {
    return error(
      `At most ${MAX_FEATURED_PUBLICATIONS} featured publications (received ${ids.length})`,
      400,
    );
  }
  if (new Set(ids).size !== ids.length) {
    return error('publicationIds must be distinct', 400);
  }

  // ── every id must be a real publication ──────────────────────────────────
  // Reject the whole request naming the unknown ids, rather than silently
  // dropping them — a silent drop would render as "the site lost my pick".
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');
    const found = await env.DB.prepare(
      `SELECT id FROM publications WHERE id IN (${placeholders})`,
    ).bind(...ids).all<{ id: string }>();
    const known = new Set((found.results ?? []).map((r) => r.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) {
      return error(`Unknown publication id(s): ${missing.join(', ')}`, 400);
    }
  }

  // ── replace-set, atomically ──────────────────────────────────────────────
  // An empty array is a legitimate request: it clears the member's list.
  const statements = [
    env.DB.prepare('DELETE FROM member_featured_publications WHERE member_slug = ?').bind(slug),
    ...ids.map((id, index) =>
      env.DB.prepare(
        `INSERT INTO member_featured_publications (member_slug, publication_id, sort_order)
         VALUES (?, ?, ?)`,
      ).bind(slug, id, index),
    ),
  ];
  await env.DB.batch(statements);

  // Echo the stored list back so the client can seed its cache from the
  // canonical rows instead of from what it hoped it wrote.
  return handleGetMemberFeaturedPublications(slug, env);
}
