// member-contributions.test.ts -- the member page's score card and its
// "N contributions" heatmap read ONE contribution list, on the prod schema.
//
// Prod check 2026-10-11: Casey's page said "0 contribution score . Stable"
// above "9 contributions in the last 90 days". Every one of her completed
// tasks had been ticked off by Nick, so the score (completed_by only) found
// nothing while the heatmap (assignee too, plus raw activity_log) found them.

import { describe, it, expect } from 'vitest';
import type { Env } from '../helpers';
import { handleContributionsDecay } from '../routes/contributions-decay';
import { handleActivityHeatmap } from '../routes/activity';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';

function insertRow(db: ReturnType<typeof prodSchemaDb>, table: string, vals: Record<string, unknown>) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; notnull: number; dflt_value: unknown; pk: number; type: string }>;
  const row = { ...vals };
  for (const c of cols) {
    if (c.notnull && c.dflt_value == null && !(c.name in row) && !(c.pk && /INT/i.test(c.type))) row[c.name] = /INT|REAL/i.test(c.type) ? 0 : 'x';
  }
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function setup() {
  const db = prodSchemaDb();
  // Three of Casey's tasks completed by Nick (the prod shape), one by Casey herself.
  for (const [i, by] of [[1, 'nick-ingraham'], [2, 'ingra107@umn.edu'], [3, 'nick-ingraham'], [4, 'casey-eddington']] as const) {
    insertRow(db, 'tasks', { id: `t${i}`, title: `Task ${i}`, assignee: 'casey-eddington', status: 'done', completed: 1, completed_at: daysAgo(i * 5), completed_by: by });
  }
  // Someone else's task, done in the window: not Casey's.
  insertRow(db, 'tasks', { id: 't9', title: 'Other', assignee: 'nick-ingraham', status: 'done', completed: 1, completed_at: daysAgo(3), completed_by: 'nick-ingraham' });
  // Casey's open task: not a contribution yet.
  insertRow(db, 'tasks', { id: 't10', title: 'Open', assignee: 'casey-eddington', status: 'todo', completed: 0 });
  return { db, env: { DB: d1Adapter(db) } as unknown as Env };
}

async function body<T>(res: Response): Promise<T> {
  return ((await res.json()) as { data: T }).data;
}

describe('member contributions: score card and heatmap agree', () => {
  it('credits a completed task to its assignee even when someone else clicked done', async () => {
    const { env } = setup();
    const score = await body<{ total_score: number; breakdown: Record<string, { count: number }> }>(
      await handleContributionsDecay(new URL('https://h/api/analytics/contributions?slug=casey-eddington&days=90'), env),
    );
    expect(score.breakdown.task.count).toBe(4);
    expect(score.total_score).toBeGreaterThan(0);
  });

  it('the heatmap total equals the score card count, contribution for contribution', async () => {
    const { env } = setup();
    const score = await body<{ breakdown: Record<string, { count: number }> }>(
      await handleContributionsDecay(new URL('https://h/api/analytics/contributions?slug=casey-eddington&days=90'), env),
    );
    const heat = await body<Record<string, number>>(
      await handleActivityHeatmap(new URL('https://h/api/activity/heatmap?slug=casey-eddington&days=90'), env),
    );
    const scored = Object.values(score.breakdown).reduce((n, v) => n + v.count, 0);
    const heatTotal = Object.values(heat).reduce((n, v) => n + v, 0);
    expect(scored).toBe(4);
    expect(heatTotal).toBe(scored);
  });
});
