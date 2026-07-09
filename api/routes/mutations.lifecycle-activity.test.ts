// Tests for lifecycle activity — the quiet system/completion lines emitted on
// task/project create, complete, and key changes (#93).
//
// Task 1: pure descriptor helpers (DB-free).
// Task 2/3: emitLifecycleActivity wiring is asserted by spying postActivityEntry
//   (vi.mock) — same in-process style as the rest of the api suite, which uses
//   hand-rolled mocks rather than a live D1.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  describeOrigin,
  createEvent,
  taskChangeEvents,
  projectChangeEvents,
  emitLifecycleActivity,
} from '../lib/lifecycle-activity';
import { postActivityEntry } from '../lib/activity-entry';

// emitLifecycleActivity is a thin wiring layer over postActivityEntry — mock it
// and assert the call args (kind / body / visibility / fireSideEffects /
// idempotency key). The actual INSERT-OR-IGNORE idempotency is covered by
// activity-entry.test.ts; here `sourceId` IS the idempotency boundary.
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn(async () => ({ ok: true, row: {} })),
}));
const mockedPost = vi.mocked(postActivityEntry);

describe('describeOrigin', () => {
  it('meeting_id → from a meeting', () => {
    expect(describeOrigin({ meeting_id: 'm1' })).toBe(' · from a meeting');
  });
  it('source=meeting → from a meeting', () => {
    expect(describeOrigin({ source: 'meeting' })).toBe(' · from a meeting');
  });
  it('source=meeting_approval → from a meeting', () => {
    expect(describeOrigin({ source: 'meeting_approval' })).toBe(' · from a meeting');
  });
  it('email_link → email-derived', () => {
    expect(describeOrigin({ email_link: 'https://mail.google.com/…' })).toBe(' · email-derived');
  });
  it('source_thread_id → email-derived', () => {
    expect(describeOrigin({ source_thread_id: 't1' })).toBe(' · email-derived');
  });
  it('inbox_event_id → email-derived', () => {
    expect(describeOrigin({ inbox_event_id: 'e1' })).toBe(' · email-derived');
  });
  it('source=mobile → via mobile', () => {
    expect(describeOrigin({ source: 'mobile' })).toBe(' · via mobile');
  });
  it('manual/unknown/empty → no qualifier', () => {
    expect(describeOrigin({ source: 'manual' })).toBe('');
    expect(describeOrigin({})).toBe('');
    expect(describeOrigin({ source: '  ' })).toBe('');
  });
  it('meeting wins over email signals (priority order)', () => {
    expect(describeOrigin({ meeting_id: 'm1', email_link: 'x' })).toBe(' · from a meeting');
  });
});

describe('createEvent', () => {
  it('task create with meeting origin', () => {
    expect(createEvent('tasks', { meeting_id: 'm1' })).toEqual({
      event: 'created', kind: 'system', body: 'Created this task · from a meeting',
    });
  });
  it('task create manual → no origin qualifier', () => {
    expect(createEvent('tasks', { source: 'manual' })).toEqual({
      event: 'created', kind: 'system', body: 'Created this task',
    });
  });
  it('project create includes category', () => {
    expect(createEvent('projects', { category: 'CLIF' })).toEqual({
      event: 'created', kind: 'system', body: 'Created this project · CLIF',
    });
  });
  it('project create with no category', () => {
    expect(createEvent('projects', {})).toEqual({
      event: 'created', kind: 'system', body: 'Created this project',
    });
  });
});

describe('taskChangeEvents', () => {
  it('status→done is a single completion event, not a status line', () => {
    expect(taskChangeEvents({ status: 'in_progress' }, { status: 'done', completed: 1 })).toEqual([
      { event: 'completed', kind: 'completion', body: 'Completed' },
    ]);
  });
  it('completion via completed flag only (no status in patch)', () => {
    expect(taskChangeEvents({ status: 'in_progress', completed: 0 }, { completed: 1 })).toEqual([
      { event: 'completed', kind: 'completion', body: 'Completed' },
    ]);
  });
  it('idempotent re-stamp of an already-done task emits nothing', () => {
    expect(taskChangeEvents({ status: 'done', completed: 1 }, { status: 'done', completed: 1 })).toEqual([]);
  });
  it('done→todo is reopened', () => {
    expect(taskChangeEvents({ status: 'done', completed: 1 }, { status: 'todo', completed: 0 })).toEqual([
      { event: 'reopened', kind: 'system', body: 'Reopened' },
    ]);
  });
  it('non-done status transition', () => {
    expect(taskChangeEvents({ status: 'todo' }, { status: 'in_progress' })).toEqual([
      { event: 'status', kind: 'system', body: 'Status: todo → in progress' },
    ]);
  });
  it('assignee reassign', () => {
    expect(taskChangeEvents({ assignee: 'nick-ingraham' }, { assignee: 'will-parker' })).toEqual([
      { event: 'assignee', kind: 'system', body: 'Reassigned @nick-ingraham → @will-parker' },
    ]);
  });
  it('assignee first-assign (was null)', () => {
    expect(taskChangeEvents({ assignee: null }, { assignee: 'will-parker' })).toEqual([
      { event: 'assignee', kind: 'system', body: 'Assigned to @will-parker' },
    ]);
  });
  it('assignee cleared', () => {
    expect(taskChangeEvents({ assignee: 'will-parker' }, { assignee: null })).toEqual([
      { event: 'assignee', kind: 'system', body: 'Unassigned' },
    ]);
  });
  it('project move uses the resolved name, never the raw id', () => {
    expect(
      taskChangeEvents({ project_id: 'proj_OLD' }, { project_id: 'proj_NEW' }, { projectName: 'CLIF Provider Variation' }),
    ).toEqual([{ event: 'project', kind: 'system', body: 'Moved to CLIF Provider Variation' }]);
  });
  it('project move with no resolved name falls back to a neutral phrase (no id leak)', () => {
    const evs = taskChangeEvents({ project_id: null }, { project_id: 'proj_NEW' });
    expect(evs).toEqual([{ event: 'project', kind: 'system', body: 'Moved to another project' }]);
    expect(evs[0].body).not.toContain('proj_');
  });
  it('project removed', () => {
    expect(taskChangeEvents({ project_id: 'proj_OLD' }, { project_id: null })).toEqual([
      { event: 'project', kind: 'system', body: 'Removed from project' },
    ]);
  });
  it('due date set', () => {
    expect(taskChangeEvents({ due_date: null }, { due_date: '2026-07-11' })).toEqual([
      { event: 'due', kind: 'system', body: 'Due date set to 2026-07-11' },
    ]);
  });
  it('deadline cleared', () => {
    expect(taskChangeEvents({ deadline: '2026-07-11' }, { deadline: null })).toEqual([
      { event: 'due', kind: 'system', body: 'Deadline cleared' },
    ]);
  });
  it('priority change', () => {
    expect(taskChangeEvents({ priority: 'medium' }, { priority: 'high' })).toEqual([
      { event: 'priority', kind: 'system', body: 'Priority: medium → high' },
    ]);
  });
  it('untracked field change (title) emits nothing', () => {
    expect(taskChangeEvents({ title: 'a' }, { title: 'b' })).toEqual([]);
  });
  it('no-op patch (same value) emits nothing', () => {
    expect(taskChangeEvents({ status: 'todo' }, { status: 'todo' })).toEqual([]);
  });
  it('multiple tracked changes in one patch → one line each, in order', () => {
    const evs = taskChangeEvents(
      { status: 'todo', assignee: null, priority: 'medium' },
      { status: 'in_progress', assignee: 'will-parker', priority: 'high' },
    );
    expect(evs.map((e) => e.event)).toEqual(['status', 'assignee', 'priority']);
  });
});

describe('projectChangeEvents', () => {
  it('stage change', () => {
    expect(projectChangeEvents({ stage: 'data_analysis' }, { stage: 'writing' })).toEqual([
      { event: 'stage', kind: 'system', body: 'Stage: data analysis → writing' },
    ]);
  });
  it('status → done is a completion', () => {
    expect(projectChangeEvents({ status: 'active' }, { status: 'done' })).toEqual([
      { event: 'status', kind: 'completion', body: 'Marked done' },
    ]);
  });
  it('non-done status transition is a system line', () => {
    expect(projectChangeEvents({ status: 'active' }, { status: 'waiting_external' })).toEqual([
      { event: 'status', kind: 'system', body: 'Status: active → waiting external' },
    ]);
  });
  it('untracked project field change emits nothing', () => {
    expect(projectChangeEvents({ name: 'a' }, { name: 'b' })).toEqual([]);
  });
});

// ── emitLifecycleActivity wiring (postActivityEntry spied) ──────────────────────

function fakeEnv(projectName: string | null = null): any {
  return {
    DB: {
      prepare: () => ({ bind: () => ({ first: async () => (projectName ? { name: projectName } : null) }) }),
    },
  };
}
const NICK: any = { email: 'ingra107@umn.edu', name: 'Nick' }; // → actorSlug 'nick-ingraham'

describe('emitLifecycleActivity', () => {
  beforeEach(() => mockedPost.mockClear());

  it('task create → one system row: team visibility, side-effects off, idempotency key :created', async () => {
    const mut: any = {
      mutation_id: 'mut_1', table: 'tasks', record_id: 'task_A', op: 'insert',
      payload: { source: 'meeting', meeting_id: 'm1', project_id: 'proj_X' },
    };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, null);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toMatchObject({
      entityType: 'task', entityId: 'task_A', kind: 'system',
      body: 'Created this task · from a meeting', visibility: 'team', fireSideEffects: false,
      sourceTable: 'lifecycle', sourceId: 'mut_1:created', actorSlug: 'nick-ingraham', taskProjectId: 'proj_X',
    });
  });

  it('non tasks/projects table → no emit', async () => {
    const mut: any = { mutation_id: 'm', table: 'sessions', record_id: 's1', op: 'insert', payload: {} };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, null);
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('completion update → one completion row keyed :completed', async () => {
    const mut: any = { mutation_id: 'mut_2', table: 'tasks', record_id: 'task_B', op: 'update', patch: { status: 'done', completed: 1 } };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, { status: 'in_progress', completed: 0, project_id: null });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toMatchObject({ kind: 'completion', body: 'Completed', sourceId: 'mut_2:completed' });
  });

  it('untracked-only update (title) → no emit', async () => {
    const mut: any = { mutation_id: 'm', table: 'tasks', record_id: 't', op: 'update', patch: { title: 'x' } };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, { title: 'y' });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('task project-move resolves the NAME (never leaks the proj_ id) keyed :project', async () => {
    const mut: any = { mutation_id: 'mut_3', table: 'tasks', record_id: 'task_C', op: 'update', patch: { project_id: 'proj_NEW' } };
    await emitLifecycleActivity(fakeEnv('CLIF Provider Variation'), mut, NICK, { project_id: 'proj_OLD' });
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const arg = mockedPost.mock.calls[0][0];
    expect(arg.body).toBe('Moved to CLIF Provider Variation');
    expect(arg.body).not.toContain('proj_');
    expect(arg.sourceId).toBe('mut_3:project');
  });

  it('multiple tracked changes → one row per event, keyed by event', async () => {
    const mut: any = { mutation_id: 'mut_4', table: 'tasks', record_id: 'task_D', op: 'update', patch: { status: 'in_progress', priority: 'high' } };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, { status: 'todo', priority: 'medium' });
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls.map((c) => c[0].sourceId)).toEqual(['mut_4:status', 'mut_4:priority']);
  });

  it('project create → system row with category', async () => {
    const mut: any = { mutation_id: 'mut_5', table: 'projects', record_id: 'proj_P', op: 'insert', payload: { category: 'CLIF' } };
    await emitLifecycleActivity(fakeEnv(), mut, NICK, null);
    expect(mockedPost.mock.calls[0][0]).toMatchObject({ entityType: 'project', kind: 'system', body: 'Created this project · CLIF', sourceId: 'mut_5:created' });
  });

  it('a postActivityEntry failure does NOT throw — the mutation stays safe', async () => {
    mockedPost.mockRejectedValueOnce(new Error('boom'));
    const mut: any = { mutation_id: 'm', table: 'tasks', record_id: 't', op: 'insert', payload: {} };
    await expect(emitLifecycleActivity(fakeEnv(), mut, NICK, null)).resolves.toBeUndefined();
  });
});
