/**
 * digest.upsert.test.ts — what a digest re-push is allowed to overwrite (#136).
 *
 * PB re-pushes papers it has already sent (that is the whole point of making
 * the push corrective). The upsert is the only thing standing between a
 * re-push and the reader's state, so it is pinned here rather than trusted:
 *
 *   - `status` / `saved_by` are never rewritten on conflict. They were
 *     rewritten by INSERT OR REPLACE, which reset a saved or dismissed paper
 *     to 'new'.
 *   - `digest_date` keeps the STORED value. Digest.md is a rolling document
 *     whose frontmatter is the date it was last generated; writing it through
 *     collapsed 1065 papers onto one day and flattened the date selector.
 *   - every other paper fact takes COALESCE(excluded, stored), so a run that
 *     did not parse a field leaves what is there. A regenerated Digest.md
 *     drops the LLM TLDR from older entries, and a bare `excluded.summary`
 *     erased 74 stored summaries no source still holds.
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut captured the SQL text and regex-matched its DO UPDATE clause,
 * so it pinned the spelling of the upsert, not what it does to a stored row.
 * Here every rule is a push, a re-push, and a read of the row.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env } from '../helpers';
import { handleCreateDigestPaper } from './digest';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) } as unknown as Env;
});

function post(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/digest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
async function push(body: Record<string, unknown>) {
  const res = await handleCreateDigestPaper(post(body), env);
  expect(res.status).toBe(201);
}
const paper = (id = 'digest-1') => db.prepare('SELECT * FROM research_digest WHERE id = ?').get(id) as Record<string, unknown>;

const FULL = {
  id: 'digest-1', title: 'A paper', authors: 'Smith J', journal: 'Lancet', pub_date: '2026-09-01',
  abstract: 'ABS', summary: 'TLDR', significance: 'WHY', pmid: '123', doi: '10.1/x',
  relevance_score: 7, relevance_reason: 'sepsis', topics: 'sepsis,icu', digest_date: '2026-09-02',
};

describe('handleCreateDigestPaper upsert', () => {
  it('requires id and title, and writes nothing without them', async () => {
    const res = await handleCreateDigestPaper(post({ id: 'digest-1' }), env);
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM research_digest').get()).toEqual({ n: 0 });
  });

  it('an omitted optional field binds null, not undefined (D1 refuses undefined; d1Adapter does too)', async () => {
    // Only the required fields: every optional bind must be an explicit null.
    // A dropped `?? null` makes d1Adapter throw D1_TYPE_ERROR here, as D1 would.
    await push({ id: 'digest-min', title: 'Minimal' })
    const row = paper('digest-min')
    for (const col of ['authors', 'journal', 'pub_date', 'abstract', 'summary', 'significance', 'pmid', 'doi', 'relevance_reason', 'topics', 'digest_date']) {
      expect(row[col], col).toBeNull()
    }
    expect(row).toMatchObject({ status: 'new', relevance_score: 0 })
  })

  it('a first push lands as status new with every field in its own column', async () => {
    await push(FULL);
    expect(paper()).toMatchObject({ ...FULL, status: 'new' });
  });

  it('never rewrites the reader state on a re-push', async () => {
    await push(FULL);
    db.prepare("UPDATE research_digest SET status = 'saved', saved_by = 'nick-ingraham' WHERE id = 'digest-1'").run();
    await push({ ...FULL, status: 'new' });
    expect(paper()).toMatchObject({ status: 'saved', saved_by: 'nick-ingraham' });
  });

  it('keeps the stored digest_date rather than the pushed one', async () => {
    await push(FULL);
    await push({ ...FULL, digest_date: '2026-10-05' });
    expect(paper().digest_date).toBe('2026-09-02');
  });

  it('lets an absent field fall back to what is stored', async () => {
    await push(FULL);
    // A thinner run: only the required fields.
    await push({ id: 'digest-1', title: 'A paper' });
    const row = paper();
    for (const col of ['summary', 'significance', 'abstract', 'relevance_reason', 'journal', 'authors', 'pub_date', 'doi', 'topics', 'pmid'] as const) {
      expect(row[col], col).toBe(FULL[col]);
    }
    // relevance_score is derived from which fields PB parsed, so a thinner
    // run is missing information, not a demotion.
    expect(row.relevance_score).toBe(7);
  });

  it('a present field and a title correction do land', async () => {
    await push(FULL);
    await push({ id: 'digest-1', title: 'A paper (corrected)', summary: 'NEW TLDR', relevance_score: 9 });
    expect(paper()).toMatchObject({ title: 'A paper (corrected)', summary: 'NEW TLDR', relevance_score: 9, abstract: 'ABS' });
  });
});
