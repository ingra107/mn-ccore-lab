/**
 * digest.upsert.test.ts — what a digest re-push is allowed to overwrite (#136).
 *
 * PB re-pushes papers it has already sent (that is the whole point of making
 * the push corrective). The SQL below is the only thing standing between a
 * re-push and the reader's state, so it is pinned here rather than trusted:
 *
 *   - `status` / `saved_by` never appear in the DO UPDATE clause. They were
 *     rewritten by INSERT OR REPLACE, which reset a saved or dismissed paper
 *     to 'new'.
 *   - `digest_date` keeps the STORED value. Digest.md is a rolling document
 *     whose frontmatter is the date it was last generated; writing it through
 *     collapsed 1065 papers onto one day and flattened the date selector.
 *   - every other paper fact takes COALESCE(excluded, stored), so a run that
 *     did not parse a field leaves what is there. A regenerated Digest.md
 *     drops the LLM TLDR from older entries, and a bare `excluded.summary`
 *     erased 74 stored summaries no source still holds.
 */

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleCreateDigestPaper } from './digest';

function captureSql(): { env: Env; sql: () => string; binds: () => unknown[] } {
  let seenSql = '';
  let seenBinds: unknown[] = [];
  const env = {
    DB: {
      prepare: (s: string) => {
        seenSql = s;
        return {
          bind: (...args: unknown[]) => {
            seenBinds = args;
            return { run: async () => ({ meta: { changes: 1 } }) };
          },
        };
      },
    },
  } as unknown as Env;
  return { env, sql: () => seenSql, binds: () => seenBinds };
}

function post(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/digest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const MINIMAL = { id: 'digest-1', title: 'A paper' };

describe('handleCreateDigestPaper upsert clause', () => {
  it('requires id and title', async () => {
    const { env } = captureSql();
    const res = await handleCreateDigestPaper(post({ id: 'digest-1' }), env);
    expect(res.status).toBe(400);
  });

  it('never writes the reader state on conflict', async () => {
    const { env, sql } = captureSql();
    await handleCreateDigestPaper(post(MINIMAL), env);
    const doUpdate = sql().slice(sql().indexOf('DO UPDATE'));
    expect(doUpdate).not.toMatch(/\bstatus\s*=/);
    expect(doUpdate).not.toMatch(/\bsaved_by\s*=/);
    // ...but a FIRST insert still sets them, so a new paper lands as 'new'.
    expect(sql()).toMatch(/INSERT INTO research_digest \([^)]*\bstatus\b/);
  });

  it('keeps the stored digest_date rather than the pushed one', async () => {
    const { env, sql } = captureSql();
    await handleCreateDigestPaper(post(MINIMAL), env);
    expect(sql()).toMatch(
      /digest_date\s*=\s*COALESCE\(research_digest\.digest_date,\s*excluded\.digest_date\)/,
    );
  });

  it('lets an absent field fall back to what is stored', async () => {
    const { env, sql } = captureSql();
    await handleCreateDigestPaper(post(MINIMAL), env);
    for (const col of ['summary', 'significance', 'abstract', 'relevance_reason', 'journal', 'authors', 'pub_date', 'doi', 'topics', 'pmid']) {
      expect(sql()).toMatch(
        new RegExp(`${col}\\s*=\\s*COALESCE\\(excluded\\.${col},\\s*research_digest\\.${col}\\)`),
      );
    }
    // relevance_score is derived from which fields PB parsed, so a thinner
    // run is missing information, not a demotion.
    expect(sql()).toMatch(/relevance_score\s*=\s*MAX\(excluded\.relevance_score,\s*research_digest\.relevance_score\)/);
    // A title correction is meant to land: it is required, so it is never absent.
    expect(sql()).toMatch(/title\s*=\s*excluded\.title/);
  });

  it('binds summary and significance as their own columns, not as abstract', async () => {
    const { env, sql, binds } = captureSql();
    await handleCreateDigestPaper(
      post({ ...MINIMAL, abstract: 'ABS', summary: 'TLDR', significance: 'WHY' }),
      env,
    );
    const cols = sql().slice(sql().indexOf('(') + 1, sql().indexOf(')')).split(',').map((c) => c.trim());
    expect(binds()[cols.indexOf('abstract')]).toBe('ABS');
    expect(binds()[cols.indexOf('summary')]).toBe('TLDR');
    expect(binds()[cols.indexOf('significance')]).toBe('WHY');
  });

  it('binds null, not undefined, for an omitted optional field', async () => {
    const { env, binds } = captureSql();
    await handleCreateDigestPaper(post(MINIMAL), env);
    expect(binds().every((b) => b !== undefined)).toBe(true);
  });
});
