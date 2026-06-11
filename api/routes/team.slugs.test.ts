/**
 * team.slugs.test.ts — @mention autocomplete source (N1c, 2026-06-11).
 *
 * /api/team/slugs feeds MentionInput's typeahead. Hermes has no
 * team_members row (author slug claude-ai; mention token @hermes), so the
 * route injects it. Pin: hermes leads the list, team rows follow — if a
 * future rewrite drops the injection, @hermes silently loses autocomplete
 * again (the exact N1c bug).
 */

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleTeamSlugs } from './team';

function makeDb(rows: Record<string, unknown>[]) {
  return {
    prepare: () => ({
      all: async () => ({ results: rows }),
    }),
  };
}

describe('GET /api/team/slugs', () => {
  it('prepends hermes to the team slug list', async () => {
    const env = {
      DB: makeDb([
        { slug: 'abbie-begnaud', name: 'Abbie Begnaud' },
        { slug: 'nick-ingraham', name: 'Nick Ingraham' },
      ]),
    } as unknown as Env;
    const res = await handleTeamSlugs(env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { slug: string; name: string }[] };
    expect(body.data[0]).toEqual({ slug: 'hermes', name: 'Hermes' });
    expect(body.data.map((d) => d.slug)).toEqual(['hermes', 'abbie-begnaud', 'nick-ingraham']);
  });

  it('still returns hermes when the team table is empty', async () => {
    const env = { DB: makeDb([]) } as unknown as Env;
    const res = await handleTeamSlugs(env);
    const body = (await res.json()) as { data: { slug: string }[] };
    expect(body.data).toEqual([{ slug: 'hermes', name: 'Hermes' }]);
  });
});
