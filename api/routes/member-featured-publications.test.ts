/**
 * member-featured-publications.test.ts — PB backlog #906 (schema-v106).
 *
 * The member-curated Top-10 routes. Covers the parts that are easy to get
 * wrong and impossible to see from the UI:
 *   - GET returns the member's OWN order (sort_order), not year order
 *   - PUT writes sort_order from the ARRAY INDEX, so the submitted sequence
 *     is what comes back — the whole point of Nick's 2026-08-01 call
 *   - PUT is a REPLACE-set: one DELETE then N INSERTs, in one D1 batch
 *   - the cap, distinctness, shape, and unknown-id rejections all 400 BEFORE
 *     any write is issued (asserted by "the batch never ran", not by reading
 *     the handler)
 *   - authorization: own-list yes, someone else's no, anonymous no, PI yes
 *
 * Auth is driven through the REAL helpers (isPiRequest / actorSlugFromRequest)
 * using the TEST_MODE_KEY + X-Test-User bypass that getAuthUser already
 * supports — no stubbed auth seam, so a change to actorSlug's LUT or to the
 * PI check is visible here.
 */

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import {
  MAX_FEATURED_PUBLICATIONS,
  handleGetMemberFeaturedPublications,
  handlePutMemberFeaturedPublications,
} from './member-featured-publications';

const TEST_KEY = 'test-mode-key-906';

// ── DB stub ─────────────────────────────────────────────────────────────────
// Regex-routed, same shape as api/routes/artifact-tags.test.ts's makeDb.
// `batched` records every statement handed to DB.batch() so a test can assert
// both WHAT was written and THAT nothing was written on a rejected request.

interface Written { sql: string; binds: unknown[] }

interface StubStmt {
  __sql: string;
  __binds: unknown[];
  bind: (...args: unknown[]) => StubStmt;
  run: () => Promise<unknown>;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
}

interface StubDb {
  prepare: (sql: string) => StubStmt;
  batch: (stmts: StubStmt[]) => Promise<unknown[]>;
}

function makeDb(opts: {
  memberExists?: boolean;
  knownPublicationIds?: string[];
  featured?: Record<string, unknown>[];
  batched: Written[];
}): StubDb {
  return {
    prepare: (sql: string) => {
      const binds: unknown[] = [];
      const stmt: StubStmt = {
        __sql: sql,
        __binds: binds,
        bind: (...args: unknown[]) => { binds.push(...args); return stmt; },
        run: async () => ({ success: true, meta: { changes: 1 }, results: [] }),
        first: async () => {
          if (/FROM team_members WHERE slug/.test(sql)) {
            return opts.memberExists === false ? null : { ok: 1 };
          }
          // getPiEmails' lab_settings lookup → null → PI_EMAILS_FALLBACK.
          return null;
        },
        all: async () => {
          if (/FROM publications WHERE id IN/.test(sql)) {
            const known = new Set(opts.knownPublicationIds ?? []);
            return { results: binds.filter((b) => known.has(String(b))).map((id) => ({ id })) };
          }
          if (/FROM member_featured_publications m/.test(sql)) {
            return { results: opts.featured ?? [] };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    batch: async (stmts: StubStmt[]) => {
      for (const s of stmts) opts.batched.push({ sql: s.__sql, binds: [...s.__binds] });
      return stmts.map(() => ({ success: true, meta: {}, results: [] }));
    },
  };
}

function makeEnv(db: unknown): Env {
  return { DB: db, TEST_MODE_KEY: TEST_KEY } as unknown as Env;
}

function pubRow(id: string, year: number, title: string) {
  return {
    id, title, authors: 'Ingraham NE, Eddington C', journal: 'Chest', year,
    status: 'Published', doi: null, pubmed: null, abstract: null, topics: null,
    featured: 0, author_slugs: '["casey-eddington"]',
    created_at: '2026-01-01', updated_at: '2026-01-01',
  };
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

// eddington@umn.edu → casey-eddington via EMAIL_PREFIX_TO_SLUG (api/helpers.ts).
const MEMBER_EMAIL = 'eddington@umn.edu';
const MEMBER_SLUG = 'casey-eddington';
const PI_EMAIL = 'ingra107@umn.edu';

describe('GET /api/team/:slug/featured-publications', () => {
  it('returns the rows the join produced, with a count', async () => {
    const batched: Written[] = [];
    const featured = [pubRow('pub_c', 2019, 'C'), pubRow('pub_a', 2026, 'A')];
    const res = await handleGetMemberFeaturedPublications(
      MEMBER_SLUG, makeEnv(makeDb({ featured, batched })),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { id: string }[]; count: number };
    expect(body.data.map((p) => p.id)).toEqual(['pub_c', 'pub_a']);
    expect(body.count).toBe(2);
  });

  it('orders by the member sort_order and caps at ten in SQL, not in JS', async () => {
    const batched: Written[] = [];
    let seenSql = '';
    let seenBinds: unknown[] = [];
    const db = makeDb({ featured: [], batched });
    const wrapped: StubDb = {
      batch: db.batch,
      prepare: (sql: string) => {
        const stmt = db.prepare(sql);
        if (/FROM member_featured_publications m/.test(sql)) {
          seenSql = sql;
          seenBinds = stmt.__binds;
        }
        return stmt;
      },
    };
    await handleGetMemberFeaturedPublications(MEMBER_SLUG, makeEnv(wrapped));
    expect(seenSql).toMatch(/ORDER BY\s+m\.sort_order ASC/);
    expect(seenSql).toMatch(/LIMIT \?/);
    expect(seenBinds).toEqual([MEMBER_SLUG, MAX_FEATURED_PUBLICATIONS]);
    // No `year DESC` — the member's order is the order (Nick 2026-08-01).
    expect(seenSql).not.toMatch(/year DESC/);
  });

  it('is empty, not an error, for a member who has featured nothing', async () => {
    const batched: Written[] = [];
    const res = await handleGetMemberFeaturedPublications(
      'adams-dudley', makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(200);
    expect((await res.json() as { data: unknown[] }).data).toEqual([]);
  });
});

describe('PUT /api/team/:slug/featured-publications — the write', () => {
  it('replaces the whole set: one DELETE then one INSERT per id, in order', async () => {
    const batched: Written[] = [];
    const env = makeEnv(makeDb({
      knownPublicationIds: ['pub_a', 'pub_b', 'pub_c'], featured: [], batched,
    }));
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: ['pub_c', 'pub_a', 'pub_b'] }, MEMBER_EMAIL),
      env,
    );
    expect(res.status).toBe(200);

    expect(batched).toHaveLength(4);
    expect(batched[0].sql).toMatch(/DELETE FROM member_featured_publications/);
    expect(batched[0].binds).toEqual([MEMBER_SLUG]);
    // sort_order comes from the ARRAY INDEX — submitted order is stored order.
    expect(batched.slice(1).map((w) => w.binds)).toEqual([
      [MEMBER_SLUG, 'pub_c', 0],
      [MEMBER_SLUG, 'pub_a', 1],
      [MEMBER_SLUG, 'pub_b', 2],
    ]);
  });

  it('accepts an empty array as "clear my list" (DELETE only)', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: [] }, MEMBER_EMAIL),
      makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(200);
    expect(batched).toHaveLength(1);
    expect(batched[0].sql).toMatch(/DELETE FROM member_featured_publications/);
  });

  it('echoes the stored list back, not the submitted array', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: ['pub_a'] }, MEMBER_EMAIL),
      makeEnv(makeDb({
        knownPublicationIds: ['pub_a'],
        featured: [pubRow('pub_a', 2026, 'A')],
        batched,
      })),
    );
    const body = await res.json() as { data: { id: string; title: string }[] };
    expect(body.data).toEqual([expect.objectContaining({ id: 'pub_a', title: 'A' })]);
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
      const batched: Written[] = [];
      const res = await handlePutMemberFeaturedPublications(
        MEMBER_SLUG,
        putReq(MEMBER_SLUG, c.body, MEMBER_EMAIL),
        makeEnv(makeDb({ knownPublicationIds: c.known ?? [], featured: [], batched })),
      );
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toMatch(c.match);
      expect(batched).toEqual([]);
    });
  }

  it('exactly ten is allowed (the cap is inclusive)', async () => {
    const ids = Array.from({ length: MAX_FEATURED_PUBLICATIONS }, (_, i) => `pub_${i}`);
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: ids }, MEMBER_EMAIL),
      makeEnv(makeDb({ knownPublicationIds: ids, featured: [], batched })),
    );
    expect(res.status).toBe(200);
    expect(batched).toHaveLength(1 + MAX_FEATURED_PUBLICATIONS);
  });

  it('404s for an unknown member slug and writes nothing', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: [] }, MEMBER_EMAIL),
      makeEnv(makeDb({ memberExists: false, featured: [], batched })),
    );
    expect(res.status).toBe(404);
    expect(batched).toEqual([]);
  });

  it('400s on a malformed JSON body', async () => {
    const batched: Written[] = [];
    const req = new Request(
      `https://mn-ccore-lab.pages.dev/api/team/${MEMBER_SLUG}/featured-publications`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Mode-Key': TEST_KEY,
          'X-Test-User': MEMBER_EMAIL,
        },
        body: '{not json',
      },
    );
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG, req, makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(400);
    expect(batched).toEqual([]);
  });
});

describe('PUT — authorization', () => {
  it('lets a member edit their OWN list', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: [] }, MEMBER_EMAIL),
      makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(200);
  });

  it('403s a member editing SOMEONE ELSE, and writes nothing', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      'adams-dudley',
      putReq('adams-dudley', { publicationIds: [] }, MEMBER_EMAIL),
      makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(403);
    expect(batched).toEqual([]);
  });

  it('403s an unauthenticated caller', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      MEMBER_SLUG,
      putReq(MEMBER_SLUG, { publicationIds: [] }),
      makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(403);
    expect(batched).toEqual([]);
  });

  it('lets a PI edit any member list', async () => {
    const batched: Written[] = [];
    const res = await handlePutMemberFeaturedPublications(
      'adams-dudley',
      putReq('adams-dudley', { publicationIds: [] }, PI_EMAIL),
      makeEnv(makeDb({ featured: [], batched })),
    );
    expect(res.status).toBe(200);
  });

  it('lets the PB service key edit any member list', async () => {
    const batched: Written[] = [];
    const req = new Request(
      'https://mn-ccore-lab.pages.dev/api/team/adams-dudley/featured-publications',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer svc-key-906' },
        body: JSON.stringify({ publicationIds: [] }),
      },
    );
    const env = {
      DB: makeDb({ featured: [], batched }),
      TEST_MODE_KEY: TEST_KEY,
      PB_API_KEY: 'svc-key-906',
    } as unknown as Env;
    const res = await handlePutMemberFeaturedPublications('adams-dudley', req, env);
    expect(res.status).toBe(200);
  });
});
