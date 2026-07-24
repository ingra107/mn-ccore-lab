/**
 * artifact-search.test.ts — GET /api/artifacts/search?q= (backlog #913).
 *
 * Finds shelved artifacts by the words INSIDE them and returns ids only, so
 * bodies never ride a list response. Covers: the empty query short-circuit, the
 * AND-across-terms shape, lowercasing, LIKE-wildcard escaping, the term cap,
 * and the curation gate that keeps untagged artifacts off the shelf.
 */

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleSearchArtifacts } from './artifacts';

function makeDb(ids: string[] = []) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    calls,
    prepare: (sql: string) => {
      let bound: unknown[] = [];
      const stmt: Record<string, unknown> = {
        bind: (...args: unknown[]) => { bound = [...bound, ...args]; calls.push({ sql, binds: [...bound] }); return stmt; },
        all: async () => ({ results: ids.map((id) => ({ id })) }),
      };
      return stmt;
    },
  };
  return db;
}

const url = (q: string) => new URL(`https://x/api/artifacts/search?q=${encodeURIComponent(q)}`);

describe('GET /api/artifacts/search', () => {
  it('returns the matching ids', async () => {
    const db = makeDb(['art_a', 'art_b']);
    const res = await handleSearchArtifacts(url('sedation'), { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: ['art_a', 'art_b'], count: 2 });
  });

  it('never queries on an empty or blank query', async () => {
    const db = makeDb(['art_a']);
    for (const q of ['', '   ']) {
      const res = await handleSearchArtifacts(url(q), { DB: db } as unknown as Env);
      expect(await res.json()).toEqual({ data: [], count: 0 });
    }
    // an empty query means "no opinion" — the page already shows the whole shelf
    expect(db.calls).toHaveLength(0);
  });

  it('matches a term against the title OR the body, lowercased', async () => {
    const db = makeDb();
    await handleSearchArtifacts(url('Sedation'), { DB: db } as unknown as Env);
    const { sql, binds } = db.calls[0];
    expect(sql).toMatch(/LOWER\(a\.title\) LIKE \?/);
    expect(sql).toMatch(/LOWER\(a\.body_md\) LIKE \?/);
    expect(binds).toEqual(['%sedation%', '%sedation%']);
  });

  it('ANDs the terms so every word must appear somewhere', async () => {
    const db = makeDb();
    await handleSearchArtifacts(url('sedation protocol'), { DB: db } as unknown as Env);
    const { sql, binds } = db.calls[0];
    expect(sql.match(/LOWER\(a\.title\)/g)).toHaveLength(2);
    expect(sql).toContain(') AND (');
    expect(binds).toEqual(['%sedation%', '%sedation%', '%protocol%', '%protocol%']);
  });

  it('escapes LIKE wildcards so a literal % or _ matches itself', async () => {
    const db = makeDb();
    await handleSearchArtifacts(url('50%_x'), { DB: db } as unknown as Env);
    const { sql, binds } = db.calls[0];
    expect(binds[0]).toBe('%50\\%\\_x%');
    expect(sql).toContain("ESCAPE '\\'");
  });

  it('caps the number of terms', async () => {
    const db = makeDb();
    await handleSearchArtifacts(url('a b c d e f g h i'), { DB: db } as unknown as Env);
    // 6 terms max, two binds each
    expect(db.calls[0].binds).toHaveLength(12);
  });

  it('only searches artifacts that are on the shelf', async () => {
    const db = makeDb();
    await handleSearchArtifacts(url('anything'), { DB: db } as unknown as Env);
    // same curation gate as the gallery: >=1 collection tag
    expect(db.calls[0].sql).toContain('SELECT artifact_id FROM artifact_tags');
  });
});
