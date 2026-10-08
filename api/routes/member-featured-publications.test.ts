/**
 * member-featured-publications.test.ts — PB backlog #906 (schema-v106).
 *
 * The member-curated Top-10 routes. Covers the parts that are easy to get
 * wrong and impossible to see from the UI:
 *   - GET returns the member's OWN order (sort_order), not year order
 *   - PUT writes sort_order from the ARRAY INDEX, so the submitted sequence
 *     is what comes back — the whole point of Nick's 2026-08-01 call
 *   - PUT is a REPLACE-set: one DELETE then N INSERTs, in one D1 batch, so a
 *     failure part-way leaves the previous list whole
 *   - the cap, distinctness, shape, and unknown-id rejections all 400 BEFORE
 *     any write lands
 *   - authorization: own-list yes, someone else's no, anonymous no, PI yes
 *
 * Auth is driven through the REAL helpers (isPiRequest / actorSlugFromRequest)
 * using the TEST_MODE_KEY + X-Test-User bypass that getAuthUser already
 * supports — no stubbed auth seam, so a change to slug resolution or to the
 * PI check is visible here.
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut recorded the statements handed to a stub batch that could not
 * roll back, and answered the GET from canned rows, so "replaces the set" and
 * "orders by sort_order" were claims about SQL text. Here the list is read
 * back from member_featured_publications, the GET runs its own ORDER BY and
 * LIMIT, and a failing INSERT is shown to roll the whole replace back.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import {
  MAX_FEATURED_PUBLICATIONS,
  handleGetMemberFeaturedPublications,
  handlePutMemberFeaturedPublications,
} from './member-featured-publications';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const TEST_KEY = 'test-mode-key-906';

// #8945: eddin022@umn.edu → casey-eddington because the row carries that
// email (api/helpers.ts::resolveSlug), not through a NetID map.
const MEMBER_EMAIL = 'eddin022@umn.edu';
const MEMBER_SLUG = 'casey-eddington';
const PI_EMAIL = 'ingra107@umn.edu';

let db: InstanceType<typeof Database>;
let env: Env;

function pub(id: string, year: number, title = id) {
  insertRow(db, 'publications', { id, title, authors: 'Ingraham NE, Eddington C', journal: 'Chest', year, author_slugs: '["casey-eddington"]' });
}

beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY } as unknown as Env;
  // The chain seeds pi_emails with the lab's own list (schema-v44); this
  // suite's PI is PI_EMAIL. (The first cut never read lab_settings: its stub
  // answered null, so getPiEmails fell back to a hardcoded set.)
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]));
  for (const [id, name, slug, email] of [['m1', 'Casey Eddington', MEMBER_SLUG, MEMBER_EMAIL], ['m2', 'Adams Dudley', 'adams-dudley', 'dudley@umn.edu']]) {
    if (!db.prepare('SELECT 1 FROM team_members WHERE slug = ?').get(slug)) insertRow(db, 'team_members', { id, name, slug, email });
  }
});

const stored = (slug = MEMBER_SLUG) =>
  db.prepare('SELECT publication_id, sort_order FROM member_featured_publications WHERE member_slug = ? ORDER BY sort_order').all(slug) as Array<{ publication_id: string; sort_order: number }>;
function setList(slug: string, ids: string[]) {
  ids.forEach((id, i) => insertRow(db, 'member_featured_publications', { member_slug: slug, publication_id: id, sort_order: i }));
}

/** A PUT as a given user. Omit `asEmail` for an unauthenticated request. */
function putReq(slug: string, body: unknown, asEmail?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (asEmail) {
    headers['X-Test-Mode-Key'] = TEST_KEY;
    headers['X-Test-User'] = asEmail;
  }
  return new Request(
    `https://mn-ccore-lab.pages.dev/api/team/${slug}/featured-publications`,
    { method: 'PUT', headers, body: JSON.stringify(body) },
  );
}

describe('GET /api/team/:slug/featured-publications', () => {
  it('returns the member list in THEIR order (sort_order), not year order, with a count', async () => {
    pub('pub_a', 2026, 'A');
    pub('pub_c', 2019, 'C');
    setList(MEMBER_SLUG, ['pub_c', 'pub_a']);
    const res = await handleGetMemberFeaturedPublications(MEMBER_SLUG, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string; title: string }[]; count: number };
    expect(body.data.map((p) => p.id)).toEqual(['pub_c', 'pub_a']);
    expect(body.data[0].title).toBe('C');
    expect(body.count).toBe(2);
  });

  it('caps at ten in SQL', async () => {
    const ids = Array.from({ length: MAX_FEATURED_PUBLICATIONS + 2 }, (_, i) => `pub_${String(i).padStart(2, '0')}`);
    ids.forEach((id, i) => pub(id, 2000 + i));
    setList(MEMBER_SLUG, ids);
    const res = await handleGetMemberFeaturedPublications(MEMBER_SLUG, env);
    const body = await res.json() as { data: { id: string }[] };
    expect(body.data.map((p) => p.id)).toEqual(ids.slice(0, MAX_FEATURED_PUBLICATIONS));
  });

  it('is empty, not an error, for a member who has featured nothing', async () => {
    const res = await handleGetMemberFeaturedPublications('adams-dudley', env);
    expect(res.status).toBe(200);
    expect((await res.json() as { data: unknown[] }).data).toEqual([]);
  });
});

describe('PUT /api/team/:slug/featured-publications — the write', () => {
  beforeEach(() => { pub('pub_a', 2026, 'A'); pub('pub_b', 2024, 'B'); pub('pub_c', 2019, 'C'); });

  it('replaces the whole set; sort_order comes from the ARRAY INDEX', async () => {
    setList(MEMBER_SLUG, ['pub_b']);
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ['pub_c', 'pub_a', 'pub_b'] }, MEMBER_EMAIL), env,
    );
    expect(res.status).toBe(200);
    expect(stored()).toEqual([
      { publication_id: 'pub_c', sort_order: 0 },
      { publication_id: 'pub_a', sort_order: 1 },
      { publication_id: 'pub_b', sort_order: 2 },
    ]);
  });

  it('accepts an empty array as "clear my list"', async () => {
    setList(MEMBER_SLUG, ['pub_a', 'pub_b']);
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: [] }, MEMBER_EMAIL), env);
    expect(res.status).toBe(200);
    expect(stored()).toEqual([]);
  });

  it('echoes the stored list back, not the submitted array', async () => {
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ['pub_a'] }, MEMBER_EMAIL), env);
    const body = await res.json() as { data: { id: string; title: string }[] };
    expect(body.data).toEqual([expect.objectContaining({ id: 'pub_a', title: 'A' })]);
  });

  it('a failing INSERT rolls the whole replace back: the previous list survives', async () => {
    setList(MEMBER_SLUG, ['pub_b', 'pub_c']);
    // Fail the SECOND insert, after the DELETE and the first INSERT already ran
    // inside the same batch transaction.
    let insertsSeen = 0;
    env = {
      DB: d1Adapter(db, {
        onExec: (sql) => {
          if (/INSERT INTO member_featured_publications/.test(sql) && ++insertsSeen === 2) {
            throw new Error('D1_ERROR: simulated D1 failure: SQLITE_ERROR');
          }
        },
      }),
      TEST_MODE_KEY: TEST_KEY,
    } as unknown as Env;

    let threw = false;
    let status = 0;
    try {
      const res = await handlePutMemberFeaturedPublications(
        MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ['pub_a', 'pub_b'] }, MEMBER_EMAIL), env,
      );
      status = res.status;
    } catch {
      threw = true;
    }
    expect(threw || status >= 500).toBe(true);
    expect(stored()).toEqual([
      { publication_id: 'pub_b', sort_order: 0 },
      { publication_id: 'pub_c', sort_order: 1 },
    ]);
  });
});

describe('PUT — rejections happen BEFORE any write', () => {
  const cases: { name: string; body: unknown; known?: string[]; match: RegExp }[] = [
    { name: 'more than ten ids', body: { publicationIds: Array.from({ length: 11 }, (_, i) => `pub_${i}`) }, known: Array.from({ length: 11 }, (_, i) => `pub_${i}`), match: /At most 10/ },
    { name: 'duplicate ids', body: { publicationIds: ['pub_a', 'pub_a'] }, known: ['pub_a'], match: /distinct/ },
    { name: 'a non-array body', body: { publicationIds: 'pub_a' }, match: /must be an array/ },
    { name: 'a missing key', body: {}, match: /must be an array/ },
    { name: 'a non-string element', body: { publicationIds: ['pub_a', 7] }, match: /non-empty publication id strings/ },
    { name: 'an empty-string element', body: { publicationIds: ['  '] }, match: /non-empty publication id strings/ },
    { name: 'an unknown publication id', body: { publicationIds: ['pub_a', 'pub_nope'] }, known: ['pub_a'], match: /Unknown publication id\(s\): pub_nope/ },
  ];

  for (const c of cases) {
    it(`400s on ${c.name} and writes nothing`, async () => {
      for (const id of c.known ?? []) pub(id, 2020);
      if (!(c.known ?? []).includes('pub_keep')) pub('pub_keep', 2020);
      setList(MEMBER_SLUG, ['pub_keep']);
      const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, c.body, MEMBER_EMAIL), env);
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toMatch(c.match);
      expect(stored()).toEqual([{ publication_id: 'pub_keep', sort_order: 0 }]);
    });
  }

  it('exactly ten is allowed (the cap is inclusive)', async () => {
    const ids = Array.from({ length: MAX_FEATURED_PUBLICATIONS }, (_, i) => `pub_${i}`);
    ids.forEach((id) => pub(id, 2020));
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ids }, MEMBER_EMAIL), env);
    expect(res.status).toBe(200);
    expect(stored()).toHaveLength(MAX_FEATURED_PUBLICATIONS);
  });

  it('404s for an unknown member slug and writes nothing', async () => {
    db.prepare('DELETE FROM team_members WHERE slug = ?').run(MEMBER_SLUG);
    // As the PI: with the row gone, the member's own email no longer resolves
    // to MEMBER_SLUG (#8945, the row IS the identity), so a self-edit is a 403
    // before the lookup. The PI reaches the unknown-member check.
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: [] }, PI_EMAIL), env);
    expect(res.status).toBe(404);
  });

  it('400s on a malformed JSON body', async () => {
    pub('pub_keep', 2020);
    setList(MEMBER_SLUG, ['pub_keep']);
    const req = new Request(
      `https://mn-ccore-lab.pages.dev/api/team/${MEMBER_SLUG}/featured-publications`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Test-Mode-Key': TEST_KEY, 'X-Test-User': MEMBER_EMAIL },
        body: '{not json',
      },
    );
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, req, env);
    expect(res.status).toBe(400);
    expect(stored()).toHaveLength(1);
  });
});

describe('PUT — authorization', () => {
  beforeEach(() => {
    pub('pub_keep', 2020);
    setList('adams-dudley', ['pub_keep']);
  });

  it('lets a member edit their OWN list', async () => {
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ['pub_keep'] }, MEMBER_EMAIL), env);
    expect(res.status).toBe(200);
    expect(stored()).toEqual([{ publication_id: 'pub_keep', sort_order: 0 }]);
  });

  it('403s a member editing SOMEONE ELSE, and writes nothing', async () => {
    const res = await handlePutMemberFeaturedPublications('adams-dudley', putReq('adams-dudley', { publicationIds: [] }, MEMBER_EMAIL), env);
    expect(res.status).toBe(403);
    expect(stored('adams-dudley')).toHaveLength(1);
  });

  it('403s an unauthenticated caller, and writes nothing', async () => {
    pub('pub_other', 2021);
    const res = await handlePutMemberFeaturedPublications(MEMBER_SLUG, putReq(MEMBER_SLUG, { publicationIds: ['pub_other'] }), env);
    expect(res.status).toBe(403);
    expect(stored()).toEqual([]);
  });

  it('lets a PI edit any member list', async () => {
    const res = await handlePutMemberFeaturedPublications('adams-dudley', putReq('adams-dudley', { publicationIds: [] }, PI_EMAIL), env);
    expect(res.status).toBe(200);
    expect(stored('adams-dudley')).toEqual([]);
  });

  it('lets the PB service key edit any member list', async () => {
    const req = new Request(
      'https://mn-ccore-lab.pages.dev/api/team/adams-dudley/featured-publications',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer svc-key-906' },
        body: JSON.stringify({ publicationIds: [] }),
      },
    );
    const svcEnv = { DB: d1Adapter(db), TEST_MODE_KEY: TEST_KEY, PB_API_KEY: 'svc-key-906' } as unknown as Env;
    const res = await handlePutMemberFeaturedPublications('adams-dudley', req, svcEnv);
    expect(res.status).toBe(200);
    expect(stored('adams-dudley')).toEqual([]);
  });
});
