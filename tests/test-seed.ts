/**
 * Playwright globalSetup — seeds the DB_TEST database with minimal fixtures.
 *
 * Runs before the test suite via playwright.config.ts `globalSetup`.
 * All records use "test_delete_" prefix so they are identifiable and cleanable.
 * Idempotent: checks for existing seed data before inserting.
 */
import type { FullConfig } from '@playwright/test';

const BASE_URL = 'https://mn-ccore-lab.pages.dev';
const TEST_HEADERS = {
  'Content-Type': 'application/json',
  'X-Test-Mode': 'true',
};

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: TEST_HEADERS,
      body: JSON.stringify(body),
    });
  } catch {
    // Swallow network errors — seed is best-effort
  }
}

async function get(path: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, { headers: TEST_HEADERS });
    if (!res.ok) return [];
    const json = await res.json() as { data?: unknown[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function globalSetup(_config: FullConfig): Promise<void> {
  // Check if seed data already exists (idempotency guard)
  const tasks = await get('/api/tasks?limit=5');
  const seedExists = Array.isArray(tasks) && tasks.some(
    (t) => (t as { title?: string }).title?.startsWith('test_delete_')
  );
  if (seedExists) {
    console.log('[test-seed] Seed data already present — skipping.');
    return;
  }

  console.log('[test-seed] Seeding DB_TEST...');

  // ── Projects (3) ───────────────────────────────────────────────────────────
  await post('/api/projects', {
    title: 'test_delete_ Active Project',
    slug: 'test-delete-active-project',
    category: 'CLIF',
    stage: 'Active',
    description: 'Seed project for inspection tests',
    pi: 'nick',
  });

  await post('/api/projects', {
    title: 'test_delete_ Writing Project',
    slug: 'test-delete-writing-project',
    category: 'Lab',
    stage: 'Writing',
    description: 'Seed project in writing stage',
    pi: 'nick',
  });

  await post('/api/projects', {
    title: 'test_delete_ Review Project',
    slug: 'test-delete-review-project',
    category: 'Mesfin',
    stage: 'Review',
    description: 'Seed project under review',
    pi: 'nick',
  });

  // ── Tasks (15) — assorted assignees/statuses/priorities/due dates ──────────
  const today = new Date();
  const past = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };
  const future = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const taskSeeds = [
    { description: 'test_delete_ Todo task 1', assignee: 'nick', priority: 'high', due_date: future(3) },
    { description: 'test_delete_ Todo task 2', assignee: 'nick', priority: 'medium', due_date: future(7) },
    { description: 'test_delete_ In-progress task', assignee: 'nick', priority: 'high', due_date: future(1) },
    { description: 'test_delete_ Overdue task', assignee: 'nick', priority: 'high', due_date: past(2) },
    { description: 'test_delete_ Low priority task', assignee: 'nick', priority: 'low', due_date: future(14) },
    { description: 'test_delete_ No due date task', assignee: 'nick', priority: 'medium' },
    { description: 'test_delete_ Member task A', assignee: 'member1', priority: 'medium', due_date: future(5) },
    { description: 'test_delete_ Member task B', assignee: 'member1', priority: 'high', due_date: past(1) },
    { description: 'test_delete_ Member task C', assignee: 'member2', priority: 'low', due_date: future(10) },
    { description: 'test_delete_ Blocked task', assignee: 'nick', priority: 'medium', due_date: future(4) },
    { description: 'test_delete_ Urgent task', assignee: 'nick', priority: 'high', due_date: today.toISOString().split('T')[0] },
    { description: 'test_delete_ Future task 1', assignee: 'nick', priority: 'low', due_date: future(30) },
    { description: 'test_delete_ Future task 2', assignee: 'member2', priority: 'medium', due_date: future(21) },
    { description: 'test_delete_ Past task completed', assignee: 'nick', priority: 'medium', due_date: past(5) },
    { description: 'test_delete_ Coordination task', assignee: 'coordinator', priority: 'high', due_date: future(2) },
  ];

  for (const task of taskSeeds) {
    await post('/api/tasks', task);
  }

  // ── Meetings (2) ───────────────────────────────────────────────────────────
  await post('/api/meetings', {
    date: past(7),
    title: 'test_delete_ Past Lab Meeting',
    type: 'biweekly',
  });

  await post('/api/meetings', {
    date: future(7),
    title: 'test_delete_ Upcoming Lab Meeting',
    type: 'biweekly',
  });

  // ── Ideas (5) ──────────────────────────────────────────────────────────────
  const ideaSeeds = [
    { title: 'test_delete_ Idea Alpha', description: 'First seed idea', research_area: 'CLIF' },
    { title: 'test_delete_ Idea Beta', description: 'Second seed idea', research_area: 'Lab' },
    { title: 'test_delete_ Idea Gamma', description: 'Third seed idea', research_area: 'CLIF' },
    { title: 'test_delete_ Idea Delta', description: 'Fourth seed idea' },
    { title: 'test_delete_ Idea Epsilon', description: 'Fifth seed idea', research_area: 'Mesfin' },
  ];

  for (const idea of ideaSeeds) {
    await post('/api/ideas', idea);
  }

  // ── Decisions (4) ──────────────────────────────────────────────────────────
  const decisionSeeds = [
    { title: 'test_delete_ Decision 1', rationale: 'Seed rationale A', context: 'Seed context A' },
    { title: 'test_delete_ Decision 2', rationale: 'Seed rationale B', context: 'Seed context B' },
    { title: 'test_delete_ Decision 3', rationale: 'Seed rationale C' },
    { title: 'test_delete_ Decision 4', rationale: 'Seed rationale D', context: 'Seed context D' },
  ];

  for (const decision of decisionSeeds) {
    await post('/api/decisions', decision);
  }

  console.log('[test-seed] DB_TEST seeded: 3 projects, 15 tasks, 2 meetings, 5 ideas, 4 decisions.');
}

export default globalSetup;
