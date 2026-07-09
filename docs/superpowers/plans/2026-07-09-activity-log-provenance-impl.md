# Activity-Log Provenance (lifecycle entries) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-emit quiet, timestamped "lifecycle" activity lines (created / completed / key changes) for tasks and projects into the existing unified activity timeline, visually distinct from comments.

**Architecture:** A single side-effect helper `emitLifecycleActivity()` fires from the two shared A3 write chokepoints in `mutations.ts` (`applyInsert` for create, `applyUpdate` for complete/change) — mirroring the existing transition-guarded `advanceProjectMovement()`. It writes through the existing `postActivityEntry()` primitive as `kind='system'|'completion'` rows, idempotent per `mutation_id:event`. One shared renderer (`ActivityEntryItem`) gets a branch that draws these kinds as a minimal italic timestamped line instead of a comment card.

**Tech Stack:** Cloudflare Workers + Hono + D1 (TypeScript, `api/`); React 19 + Tailwind v4 (`src/`); Vitest (`npm run test:api`); no new deps.

**Spec:** `docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md`

## Global Constraints

- **No schema migration, no new columns, no pb-schema bump, no PB coordination.** Reuse `activity_entries` (schema-v77) as-is: kinds `system`/`completion`, `visibility`, `source_table`/`source_id`, `metadata_json`, and the existing `idx_ae_source` UNIQUE(source_table, source_id) WHERE source_table IS NOT NULL (`api/schema-v77-activity-entries.sql:63`) — generic, covers `source_table='lifecycle'`.
- **A lifecycle-entry failure must NEVER fail the underlying mutation.** Every emit call is wrapped in try/catch that logs and swallows (like `postActivityEntry`'s own mention try/catch).
- **Events tracked:** created · completed · reopened · status · assignee · project move · due/deadline · **priority**. **Silent** (not tracked): title, description, short_title, effort, and all other fields.
- **Visibility:** always `'team'`. **Side effects:** always `fireSideEffects: false` (no @mention notify / owner re-notify / Hermes on an auto line).
- **Idempotency key:** `sourceTable='lifecycle'`, `sourceId=`\``${mut.mutation_id}:${event}`\` where `event ∈ {created, completed, reopened, status, assignee, project, due, priority, stage}`.
- **Voice:** terse (`Status: todo → in progress`), NOT narrative. **Glyph per event** (rendered, not stored): `created→＋`, `completed→✓`, `reopened→↻`, else `⇄`.
- **Timestamps:** created line shows an absolute viewer-local datetime inline; all others show relative; every lifecycle time is a `<time dateTime={utcISO} title={formatLocal(utcISO)}>` so hover reveals exact local date+time. Use `formatLocal` (`src/lib/time.ts:17`) + `formatRelativeTime` (`src/lib/dateUtils.ts:61`).
- **One line per change** (no burst folding this build).
- Follow CLAUDE.md commit rules: path-explicit `git add <path>` + `git commit -F <msgfile> -- <paths>`, author `ingra107`, NO Claude attribution.

---

## File Structure

- **Create** `api/lib/lifecycle-activity.ts` — the `emitLifecycleActivity()` side-effect + pure descriptor helpers (`describeOrigin`, `taskChangeEvents`, `projectChangeEvents`). One responsibility: turn a mutation (+ before-image) into zero-or-more `postActivityEntry` calls.
- **Modify** `api/routes/mutations.ts` — import + call `emitLifecycleActivity` at the create path (`applyInsert`, before line 755) and the two update return paths (`applyUpdate`, after `advanceProjectMovement` at :919 and :931).
- **Create** `src/components/activity/LifecycleActivityLine.tsx` — the minimal italic timestamped line renderer.
- **Modify** `src/components/activity/activityRender.tsx` — early branch in `ActivityEntryItem` (:479): `kind ∈ {system, completion}` → render `<LifecycleActivityLine>`.
- **Create** `api/routes/mutations.lifecycle-activity.test.ts` — vitest coverage for emit behavior + idempotency + isolation.

---

### Task 1: Pure descriptor helpers

**Files:**
- Create: `api/lib/lifecycle-activity.ts`
- Test: `api/routes/mutations.lifecycle-activity.test.ts`

**Interfaces:**
- Produces:
  - `describeOrigin(row: Record<string, unknown>): string` — returns `' · from a meeting'` | `' · email-derived'` | `' · via mobile'` | `''`.
  - `type LifecycleEvent = { event: string; kind: 'system'|'completion'; body: string }`
  - `taskChangeEvents(before, patch): LifecycleEvent[]`
  - `projectChangeEvents(before, patch): LifecycleEvent[]`
  - `createEvent(table: 'tasks'|'projects', payload): LifecycleEvent`

- [ ] **Step 1: Write the failing tests**

```typescript
// api/routes/mutations.lifecycle-activity.test.ts
import { describe, it, expect } from 'vitest';
import { describeOrigin, taskChangeEvents, createEvent } from '../lib/lifecycle-activity';

describe('describeOrigin', () => {
  it('meeting_id → from a meeting', () => {
    expect(describeOrigin({ meeting_id: 'm1' })).toBe(' · from a meeting');
  });
  it('source=meeting → from a meeting', () => {
    expect(describeOrigin({ source: 'meeting' })).toBe(' · from a meeting');
  });
  it('email_link → email-derived', () => {
    expect(describeOrigin({ email_link: 'https://mail…' })).toBe(' · email-derived');
  });
  it('source_thread_id → email-derived', () => {
    expect(describeOrigin({ source_thread_id: 't1' })).toBe(' · email-derived');
  });
  it('source=mobile → via mobile', () => {
    expect(describeOrigin({ source: 'mobile' })).toBe(' · via mobile');
  });
  it('manual/unknown → empty', () => {
    expect(describeOrigin({ source: 'manual' })).toBe('');
    expect(describeOrigin({})).toBe('');
  });
});

describe('createEvent', () => {
  it('task create with meeting origin', () => {
    const e = createEvent('tasks', { meeting_id: 'm1' });
    expect(e).toEqual({ event: 'created', kind: 'system', body: 'Created this task · from a meeting' });
  });
  it('project create includes category', () => {
    const e = createEvent('projects', { category: 'CLIF' });
    expect(e).toEqual({ event: 'created', kind: 'system', body: 'Created this project · CLIF' });
  });
});

describe('taskChangeEvents', () => {
  it('status→done is a single completion event, not a status line', () => {
    const evs = taskChangeEvents({ status: 'in_progress' }, { status: 'done', completed: 1 });
    expect(evs).toEqual([{ event: 'completed', kind: 'completion', body: 'Completed' }]);
  });
  it('done→todo is reopened', () => {
    const evs = taskChangeEvents({ status: 'done' }, { status: 'todo' });
    expect(evs).toEqual([{ event: 'reopened', kind: 'system', body: 'Reopened' }]);
  });
  it('non-done status transition', () => {
    const evs = taskChangeEvents({ status: 'todo' }, { status: 'in_progress' });
    expect(evs).toEqual([{ event: 'status', kind: 'system', body: 'Status: todo → in progress' }]);
  });
  it('assignee reassign', () => {
    const evs = taskChangeEvents({ assignee: 'nick-ingraham' }, { assignee: 'will-parker' });
    expect(evs).toEqual([{ event: 'assignee', kind: 'system', body: 'Reassigned @nick-ingraham → @will-parker' }]);
  });
  it('priority change', () => {
    const evs = taskChangeEvents({ priority: 'medium' }, { priority: 'high' });
    expect(evs).toEqual([{ event: 'priority', kind: 'system', body: 'Priority: medium → high' }]);
  });
  it('untracked field change (title) emits nothing', () => {
    expect(taskChangeEvents({ title: 'a' }, { title: 'b' })).toEqual([]);
  });
  it('no-op patch (same value) emits nothing', () => {
    expect(taskChangeEvents({ status: 'todo' }, { status: 'todo' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/routes/mutations.lifecycle-activity.test.ts`
Expected: FAIL — `describeOrigin` / `createEvent` / `taskChangeEvents` not exported.

- [ ] **Step 3: Implement the pure helpers**

```typescript
// api/lib/lifecycle-activity.ts
// Lifecycle activity: turn a task/project create/update mutation into quiet
// activity_entries "system"/"completion" lines. See
// docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md.

export type LifecycleEvent = { event: string; kind: 'system' | 'completion'; body: string };

const val = (r: Record<string, unknown>, k: string): unknown => r[k];
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null;

/** Creation-only origin qualifier, derived from existing row signals. */
export function describeOrigin(row: Record<string, unknown>): string {
  const source = str(val(row, 'source'));
  if (str(val(row, 'meeting_id')) || source === 'meeting' || source === 'meeting_approval') {
    return ' · from a meeting';
  }
  if (str(val(row, 'email_link')) || str(val(row, 'source_thread_id')) ||
      str(val(row, 'inbox_event_id')) || source === 'email') {
    return ' · email-derived';
  }
  if (source === 'mobile' || source === 'pwa') return ' · via mobile';
  return '';
}

function humanStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

export function createEvent(
  table: 'tasks' | 'projects',
  payload: Record<string, unknown>,
): LifecycleEvent {
  if (table === 'projects') {
    const cat = str(val(payload, 'category'));
    return { event: 'created', kind: 'system', body: `Created this project${cat ? ` · ${cat}` : ''}` };
  }
  return { event: 'created', kind: 'system', body: `Created this task${describeOrigin(payload)}` };
}

/** True when the patch asserts task completion (status='done' or completed truthy). */
function patchAssertsDone(patch: Record<string, unknown>): boolean {
  return patch.status === 'done' || patch.completed === 1 || patch.completed === true;
}
function rowIsDone(row: Record<string, unknown>): boolean {
  return row.status === 'done' || row.completed === 1 || row.completed === true;
}

const TASK_DUE_FIELDS = ['due_date', 'deadline'] as const;

export function taskChangeEvents(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];

  // Completion is a special-cased status transition — ONE line, and it
  // suppresses a duplicate "Status → done".
  const wasDone = rowIsDone(before);
  const nowDone = patchAssertsDone(patch);
  let statusHandled = false;
  if (!wasDone && nowDone) {
    out.push({ event: 'completed', kind: 'completion', body: 'Completed' });
    statusHandled = true;
  } else if (wasDone && 'status' in patch && patch.status !== 'done' && !patchAssertsDone(patch)) {
    out.push({ event: 'reopened', kind: 'system', body: 'Reopened' });
    statusHandled = true;
  }

  // Status (non-completion transition).
  if (!statusHandled && 'status' in patch && str(patch.status) && patch.status !== before.status) {
    out.push({
      event: 'status', kind: 'system',
      body: `Status: ${humanStatus(String(before.status ?? 'none'))} → ${humanStatus(String(patch.status))}`,
    });
  }

  // Assignee.
  if ('assignee' in patch && patch.assignee !== before.assignee) {
    const to = str(patch.assignee);
    const from = str(before.assignee);
    out.push({
      event: 'assignee', kind: 'system',
      body: !to ? 'Unassigned'
        : !from ? `Assigned to @${to}`
        : `Reassigned @${from} → @${to}`,
    });
  }

  // Project move.
  if ('project_id' in patch && patch.project_id !== before.project_id) {
    const to = str(patch.project_id);
    out.push({
      event: 'project', kind: 'system',
      body: to ? `Moved to ${to}` : 'Removed from project',
    });
  }

  // Due / deadline (first tracked date field that changed).
  for (const f of TASK_DUE_FIELDS) {
    if (f in patch && patch[f] !== before[f]) {
      const to = str(patch[f]);
      const label = f === 'deadline' ? 'Deadline' : 'Due date';
      out.push({
        event: 'due', kind: 'system',
        body: to ? `${label} set to ${to}` : `${label} cleared`,
      });
      break;
    }
  }

  // Priority.
  if ('priority' in patch && str(patch.priority) && patch.priority !== before.priority) {
    out.push({
      event: 'priority', kind: 'system',
      body: `Priority: ${before.priority ?? 'none'} → ${patch.priority}`,
    });
  }

  return out;
}

const PROJECT_STATUS_DONE = new Set(['done']);

export function projectChangeEvents(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];

  // Stage.
  if ('stage' in patch && str(patch.stage) && patch.stage !== before.stage) {
    out.push({
      event: 'stage', kind: 'system',
      body: `Stage: ${humanStatus(String(before.stage ?? 'none'))} → ${humanStatus(String(patch.stage))}`,
    });
  }

  // Status — done is a completion; other transitions are system.
  if ('status' in patch && str(patch.status) && patch.status !== before.status) {
    const to = String(patch.status);
    if (PROJECT_STATUS_DONE.has(to) && !PROJECT_STATUS_DONE.has(String(before.status ?? ''))) {
      out.push({ event: 'status', kind: 'completion', body: 'Marked done' });
    } else {
      out.push({
        event: 'status', kind: 'system',
        body: `Status: ${humanStatus(String(before.status ?? 'none'))} → ${humanStatus(to)}`,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/routes/mutations.lifecycle-activity.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add api/lib/lifecycle-activity.ts api/routes/mutations.lifecycle-activity.test.ts
git commit -F <msgfile> -- api/lib/lifecycle-activity.ts api/routes/mutations.lifecycle-activity.test.ts
# msg: "feat(activity): pure lifecycle-event descriptor helpers (#93)"
```

---

### Task 2: The `emitLifecycleActivity` side-effect + create wiring

**Files:**
- Modify: `api/lib/lifecycle-activity.ts` (add `emitLifecycleActivity`)
- Modify: `api/routes/mutations.ts` (import + call in `applyInsert` before :755)
- Test: `api/routes/mutations.lifecycle-activity.test.ts`

**Interfaces:**
- Consumes: `postActivityEntry` (`api/lib/activity-entry.ts`), `actorSlug` (`api/helpers.ts`), `Mutation`/`Env`/`AuthUser` types.
- Produces: `emitLifecycleActivity(env: Env, mut: Mutation, user: AuthUser, before: Record<string, unknown> | null): Promise<void>` — never throws.

- [ ] **Step 1: Write the failing test** (uses the test harness's D1 — mirror an existing `mutations.*.test.ts` setup; the repo's test env exposes a real Miniflare D1).

```typescript
// append to api/routes/mutations.lifecycle-activity.test.ts
import { applyMutation } from './mutations';
// (reuse the existing test bootstrap from a sibling mutations test — env + seeded team/project)

it('task create emits ONE system row with origin + team visibility', async () => {
  const env = await makeTestEnv();               // sibling-test helper
  const user = { email: 'nick.ingraham@umn.edu', name: 'Nick' };
  const id = 'task_TESTCREATE1';
  await applyMutation(env, {
    table: 'tasks', record_id: id, op: 'insert',
    payload: { title: '_TEST_DELETE_ lifecycle', assignee: 'nick-ingraham', status: 'todo',
               priority: 'medium', completed: 0, source: 'meeting', meeting_id: 'm1' },
    route: 'test', user,
  });
  const rows = await env.DB.prepare(
    "SELECT kind, visibility, body FROM activity_entries WHERE entity_id=? AND source_table='lifecycle'"
  ).bind(id).all();
  expect(rows.results).toHaveLength(1);
  expect(rows.results[0]).toMatchObject({ kind: 'system', visibility: 'team', body: 'Created this task · from a meeting' });
});

it('create is idempotent — replaying the same mutation_id inserts no 2nd row', async () => {
  // Directly call emitLifecycleActivity twice with the SAME mut object → 1 row.
  const env = await makeTestEnv();
  const id = 'task_TESTIDEMP1';
  await env.DB.prepare("INSERT INTO tasks (id,title,status,assignee,priority,completed) VALUES (?,?,?,?,?,0)")
    .bind(id, '_TEST_DELETE_ idemp', 'todo', 'nick-ingraham', 'medium').run();
  const mut = { mutation_id: 'mut_FIXED', table: 'tasks', record_id: id, op: 'insert',
                payload: { title: 'x', source: 'manual' } } as any;
  await emitLifecycleActivity(env, mut, { email: 'nick.ingraham@umn.edu' } as any, null);
  await emitLifecycleActivity(env, mut, { email: 'nick.ingraham@umn.edu' } as any, null);
  const rows = await env.DB.prepare(
    "SELECT COUNT(*) c FROM activity_entries WHERE source_id='mut_FIXED:created'").first();
  expect(rows.c).toBe(1);
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run api/routes/mutations.lifecycle-activity.test.ts` → FAIL (`emitLifecycleActivity` undefined / no rows).

- [ ] **Step 3: Implement `emitLifecycleActivity` + wire create**

Append to `api/lib/lifecycle-activity.ts`:

```typescript
import type { Env, AuthUser } from '../helpers';
import { actorSlug } from '../helpers';
import { postActivityEntry } from './activity-entry';
import type { Mutation } from './mutations-types'; // or the Mutation type's real import; see note

/**
 * Fire lifecycle activity for a create (before=null) or update (before=row).
 * NEVER throws — a lifecycle-entry failure must not fail the mutation.
 */
export async function emitLifecycleActivity(
  env: Env,
  mut: Mutation,
  user: AuthUser,
  before: Record<string, unknown> | null,
): Promise<void> {
  try {
    if (mut.table !== 'tasks' && mut.table !== 'projects') return;
    const entityType = mut.table === 'tasks' ? 'task' : 'project';
    const actor = actorSlug(user?.email ?? '') || 'nick-ingraham';

    let events: LifecycleEvent[] = [];
    if (mut.op === 'insert' && before === null) {
      events = [createEvent(mut.table, (mut.payload ?? {}) as Record<string, unknown>)];
    } else if ((mut.op === 'update' || mut.op === 'append') && before) {
      const patch = (mut.patch ?? {}) as Record<string, unknown>;
      events = mut.table === 'tasks'
        ? taskChangeEvents(before, patch)
        : projectChangeEvents(before, patch);
    }
    if (events.length === 0) return;

    // Pre-derive project_id to skip postActivityEntry's existence SELECT.
    const taskProjectId = mut.table === 'tasks'
      ? ((before?.project_id ?? (mut.payload as Record<string, unknown> | undefined)?.project_id ?? null) as string | null)
      : undefined;

    for (const ev of events) {
      const r = await postActivityEntry({
        env, user,
        entityType,
        entityId: mut.record_id,
        kind: ev.kind,
        body: ev.body,
        actorSlug: actor,
        visibility: 'team',
        fireSideEffects: false,
        sourceTable: 'lifecycle',
        sourceId: `${mut.mutation_id}:${ev.event}`,
        metadata: { event: ev.event, lifecycle: true },
        ...(taskProjectId !== undefined ? { taskProjectId } : {}),
      });
      if (!r.ok) console.error('emitLifecycleActivity: postActivityEntry failed', r.error);
    }
  } catch (e) {
    console.error('emitLifecycleActivity failed (non-fatal):', e);
  }
}
```

> **Note on the `Mutation` type:** it is declared in `api/routes/mutations.ts`. To avoid a circular import, either (a) import the `Mutation` type via `import type` from `mutations.ts` (type-only imports don't create runtime cycles), or (b) type the param structurally as `{ table: string; record_id: string; op: string; mutation_id: string; payload?: Record<string,unknown>; patch?: Record<string,unknown> }`. Prefer (a) `import type { Mutation } from '../routes/mutations'`.

Wire the create call in `api/routes/mutations.ts` `applyInsert`, immediately BEFORE line 755 (`const canonical = await readCanonical(...)`), i.e. on the genuine-insert path (dedup/race paths return earlier):

```typescript
  // Lifecycle activity: record the create (quiet system line). Non-fatal.
  await emitLifecycleActivity(env, mut, user, null);

  const canonical = await readCanonical(env, mut.table, mut.record_id);
```

Add the import at the top of `mutations.ts`:
```typescript
import { emitLifecycleActivity } from '../lib/lifecycle-activity';
```

- [ ] **Step 4: Run tests to verify pass** — `npx vitest run api/routes/mutations.lifecycle-activity.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add api/lib/lifecycle-activity.ts api/routes/mutations.ts api/routes/mutations.lifecycle-activity.test.ts
git commit -F <msgfile> -- api/lib/lifecycle-activity.ts api/routes/mutations.ts api/routes/mutations.lifecycle-activity.test.ts
# msg: "feat(activity): emit lifecycle 'created' entry on task/project insert (#93)"
```

---

### Task 3: Complete + key-change wiring (update path)

**Files:**
- Modify: `api/routes/mutations.ts` (`applyUpdate` — add emit after both `advanceProjectMovement` calls at :919 and :931)
- Test: `api/routes/mutations.lifecycle-activity.test.ts`

**Interfaces:**
- Consumes: `emitLifecycleActivity` (Task 2). `applyUpdate` already holds `mut`, `user`, and `current` (the before-image).

- [ ] **Step 1: Write failing tests**

```typescript
it('completing a task emits ONE completion row (no status line)', async () => {
  const env = await makeTestEnv();
  const id = 'task_TESTDONE1';
  await env.DB.prepare("INSERT INTO tasks (id,title,status,assignee,priority,completed) VALUES (?,?, 'in_progress','nick-ingraham','medium',0)")
    .bind(id, '_TEST_DELETE_ done').run();
  await applyMutation(env, { table: 'tasks', record_id: id, op: 'update',
    patch: { status: 'done', completed: 1, completed_at: '2026-07-09T10:00:00Z' }, route: 'test',
    user: { email: 'will.parker@umn.edu' } });
  const rows = await env.DB.prepare(
    "SELECT kind, body FROM activity_entries WHERE entity_id=? AND source_table='lifecycle' ORDER BY created_at").bind(id).all();
  expect(rows.results).toHaveLength(1);
  expect(rows.results[0]).toMatchObject({ kind: 'completion', body: 'Completed' });
});

it('an untracked-only patch (title) emits no lifecycle row', async () => {
  const env = await makeTestEnv();
  const id = 'task_TESTTITLE1';
  await env.DB.prepare("INSERT INTO tasks (id,title,status,assignee,priority,completed) VALUES (?,?, 'todo','nick-ingraham','medium',0)")
    .bind(id, '_TEST_DELETE_ t').run();
  await applyMutation(env, { table: 'tasks', record_id: id, op: 'update',
    patch: { title: '_TEST_DELETE_ renamed' }, route: 'test', user: { email: 'nick.ingraham@umn.edu' } });
  const c = await env.DB.prepare(
    "SELECT COUNT(*) c FROM activity_entries WHERE entity_id=? AND source_table='lifecycle'").bind(id).first();
  expect(c.c).toBe(0);
});

it('a lifecycle failure does not fail the mutation', async () => {
  // Force postActivityEntry to throw by passing a record_id that exists as a task
  // but stub env.DB failure only inside the emit — simplest: assert applyMutation
  // still returns accepted even if activity insert is impossible. Use a spy or a
  // broken activity_entries table shim per the sibling tests' mocking style.
  // Expected: result.status === 'accepted'.
});
```

- [ ] **Step 2: Run to verify fail** — the completion test currently produces 0 lifecycle rows (update path not wired) → FAIL.

- [ ] **Step 3: Wire the update emit**

In `api/routes/mutations.ts` `applyUpdate`, after EACH `await advanceProjectMovement(env, mut, current);` (lines ~919 and ~931), add:

```typescript
      await emitLifecycleActivity(env, mut, user, current);
```

(Both the `merged_clean` return path and the clean-apply return path — mirror the existing duplicated `advanceProjectMovement` calls exactly.)

- [ ] **Step 4: Run to verify pass** — completion + untracked tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/routes/mutations.ts api/routes/mutations.lifecycle-activity.test.ts
git commit -F <msgfile> -- api/routes/mutations.ts api/routes/mutations.lifecycle-activity.test.ts
# msg: "feat(activity): emit lifecycle entries on complete + key changes (#93)"
```

---

### Task 4: Project lifecycle coverage (create + stage + status)

**Files:**
- Test: `api/routes/mutations.lifecycle-activity.test.ts`

(Task 2/3 wiring already covers projects because `emitLifecycleActivity` branches on `mut.table`; this task adds the project-specific tests and confirms `projectChangeEvents` is reached.)

- [ ] **Step 1: Write failing/verifying tests**

```typescript
it('project create emits system row with category', async () => {
  const env = await makeTestEnv();
  const id = 'proj_TESTP1';
  await applyMutation(env, { table: 'projects', record_id: id, op: 'insert',
    payload: { slug: '_test_delete_p1', name: '_TEST_DELETE_ P1', status: 'active', stage: 'idea', category: 'CLIF' },
    route: 'test', user: { email: 'nick.ingraham@umn.edu' } });
  const r = await env.DB.prepare(
    "SELECT kind, body FROM activity_entries WHERE entity_id=? AND source_table='lifecycle'").bind(id).first();
  expect(r).toMatchObject({ kind: 'system', body: 'Created this project · CLIF' });
});

it('project stage change emits a system stage line', async () => {
  const env = await makeTestEnv();
  const id = 'proj_TESTP2';
  await env.DB.prepare("INSERT INTO projects (id,slug,name,status,stage,category) VALUES (?,?,?, 'active','data_analysis','CLIF')")
    .bind(id, '_test_delete_p2', '_TEST_DELETE_ P2').run();
  await applyMutation(env, { table: 'projects', record_id: id, op: 'update',
    patch: { stage: 'writing' }, route: 'test', user: { email: 'nick.ingraham@umn.edu' } });
  const r = await env.DB.prepare(
    "SELECT body FROM activity_entries WHERE entity_id=? AND source_id LIKE '%:stage'").bind(id).first();
  expect(r.body).toBe('Stage: data analysis → writing');
});
```

- [ ] **Step 2: Run** — `npx vitest run api/routes/mutations.lifecycle-activity.test.ts`. Expected PASS (wiring already present). If the project create path does NOT reach `applyInsert`'s emit (verify `handleCreateProject` routes through `applyMutation`), adjust: confirm via `grep -n "applyMutation" api/routes/projects.ts`; if it uses a direct INSERT, add an `emitLifecycleActivity(env, syntheticMut, user, null)` call there too.

- [ ] **Step 3: Commit**

```bash
git add api/routes/mutations.lifecycle-activity.test.ts
git commit -F <msgfile> -- api/routes/mutations.lifecycle-activity.test.ts
# msg: "test(activity): project lifecycle coverage (#93)"
```

---

### Task 5: Minimal render — `LifecycleActivityLine` + `ActivityEntryItem` branch

**Files:**
- Create: `src/components/activity/LifecycleActivityLine.tsx`
- Modify: `src/components/activity/activityRender.tsx` (branch in `ActivityEntryItem` at :479, uses `ActivityEntryItemRow` from :231)

**Interfaces:**
- Consumes: `formatLocal` (`src/lib/time.ts:17`), `formatRelativeTime` (`src/lib/dateUtils.ts:61`), `getPersonInfo` (`src/data/team.ts`), `ActivityEntryItemRow` shape (kind, actor_slug, body, created_at, entity_type, metadata_json).
- Produces: `LifecycleActivityLine({ entry }: { entry: ActivityEntryItemRow })`.

- [ ] **Step 1: Create `LifecycleActivityLine.tsx`**

```tsx
// src/components/activity/LifecycleActivityLine.tsx
// Quiet system chrome for lifecycle rows (kind system|completion). NOT a message:
// one italic muted line, event glyph, actor, timestamp. Design ref:
// docs/superpowers/specs/2026-07-09-activity-log-provenance-design.md
import { getPersonInfo } from '../../data/team';
import { formatLocal } from '../../lib/time';
import { formatRelativeTime } from '../../lib/dateUtils';
import type { ActivityEntryItemRow } from './activityRender';

const GLYPH: Record<string, string> = { created: '＋', completed: '✓', reopened: '↻' };

function eventOf(entry: ActivityEntryItemRow): string {
  try {
    const md = entry.metadata_json ? JSON.parse(entry.metadata_json as string) : null;
    if (md && typeof md.event === 'string') return md.event;
  } catch { /* ignore */ }
  return entry.kind === 'completion' ? 'completed' : 'changed';
}

export function LifecycleActivityLine({ entry }: { entry: ActivityEntryItemRow }) {
  const ev = eventOf(entry);
  const glyph = GLYPH[ev] ?? '⇄';
  const glyphColor =
    ev === 'created' ? 'var(--gold)' : ev === 'completed' ? 'var(--green)' : 'var(--teal-subtle, var(--teal))';
  const who = getPersonInfo(entry.actor_slug)?.name ?? entry.actor_slug;
  const iso = entry.created_at;
  const isCreated = ev === 'created';
  // Created shows an absolute local datetime inline; others relative. Both hover→absolute.
  const shownTime = isCreated
    ? formatLocal(iso, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : formatRelativeTime(iso);
  const fullLocal = formatLocal(iso, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div
      className="flex items-baseline gap-2"
      style={{ padding: '0.25rem 0.5rem', fontStyle: 'italic', color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.4 }}
    >
      <span aria-hidden="true" style={{ fontStyle: 'normal', color: glyphColor, fontWeight: 700, flex: 'none', width: '0.95rem', textAlign: 'center' }}>{glyph}</span>
      <span style={{ minWidth: 0 }}>{entry.body} <span style={{ fontStyle: 'normal', fontWeight: 600 }}>— {who}</span></span>
      <time
        dateTime={iso}
        title={fullLocal}
        style={{ marginLeft: 'auto', paddingLeft: '0.8rem', flex: 'none', fontStyle: 'normal', color: 'var(--ink-faint, var(--muted))', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums', cursor: 'help' }}
      >{shownTime}</time>
    </div>
  );
}
```

- [ ] **Step 2: Branch in `ActivityEntryItem`**

In `src/components/activity/activityRender.tsx`, add an early return at the very top of `ActivityEntryItem` (right after `const person = ...`, before the bar-colour logic ~:503):

```tsx
  // Lifecycle rows (created/completed/changed) render as a quiet minimal line,
  // NOT a comment card. Overrides the (previously unused) card treatment for
  // these kinds. Hermes rows are always kind='comment', so this never catches them.
  if (entry.kind === 'system' || entry.kind === 'completion') {
    return (
      <ActivityEntryWrapper motionProps={motionProps} style={{}}>
        <LifecycleActivityLine entry={entry} />
      </ActivityEntryWrapper>
    );
  }
```

Add the import near the top of `activityRender.tsx`:
```tsx
import { LifecycleActivityLine } from './LifecycleActivityLine';
```

> If `ActivityEntryItemRow` is not already exported from `activityRender.tsx`, add `export` to its `interface ActivityEntryItemRow` at :231 so `LifecycleActivityLine` can import the type.

- [ ] **Step 3: Verify the render (no unit runner for the feed — verify by build + the app)**

Run: `npx tsc -b --noEmit` → Expected: clean (0 errors).
Run: `npm run build` → Expected: build succeeds.
Then drive the app (Task 6) and confirm a created/completed line renders italic + muted + hover tooltip, distinct from comment cards.

- [ ] **Step 4: Commit**

```bash
git add src/components/activity/LifecycleActivityLine.tsx src/components/activity/activityRender.tsx
git commit -F <msgfile> -- src/components/activity/LifecycleActivityLine.tsx src/components/activity/activityRender.tsx
# msg: "feat(activity): minimal lifecycle line renderer, distinct from comments (#93)"
```

---

### Task 6: Full verification + deploy

**Files:** none (verification/deploy).

- [ ] **Step 1: Typecheck** — `npx tsc -b --noEmit` → 0 errors.
- [ ] **Step 2: Full API suite** — `npm run test:api` → all pass (existing count + new lifecycle tests). Confirms no regression in mutations / activity / notification tests.
- [ ] **Step 3: Build** — `npm run build` → succeeds.
- [ ] **Step 4: Drive the real flow** (superpowers:verify / the `run` skill): create a task from the Hub UI, complete it, change its status/assignee/due/priority, and confirm each produces exactly one quiet italic line in the task's Activity feed, interleaved with a comment, with the System pill isolating them and hover showing the absolute local time. Do the same for a project (create + stage change).
- [ ] **Step 5: Deploy** — `npm run deploy:pages:gated` (build + gated Pages deploy). No worker/cron change, so `deploy:worker` is NOT needed (pure `/api/*` handler + frontend).
- [ ] **Step 6: Post-deploy probe** — create + complete a `_TEST_DELETE_` task via the live API and confirm the two lifecycle rows appear via `GET /api/tasks/:id/activity`; then delete the test task (cascade clears its activity_entries).
- [ ] **Step 7: Close the issue** (CLAUDE.md Rule 75) — `gh issue close 93 --comment "Shipped in <sha> (auto lifecycle activity entries: create/complete/key-changes for tasks+projects, minimal italic timestamped lines). Live <deploy-sha>."` and mark bug_reports row `bug_mqv8t3esxfn2ek` resolved.

---

## Self-Review

**1. Spec coverage:**
- Events create/complete/reopen/status/assignee/project/due/priority → Tasks 1–3. ✅
- Projects create/stage/status(done) → Tasks 1,4. ✅
- Visible-by-default + System filter → no code (existing `filterMatchesKind`; `ActivityEntryItem` branch renders in the "All" stream). ✅
- Terse voice + typed glyph + created-absolute-time + hover-to-local → Task 5. ✅
- Idempotency per `mutation_id:event`, no schema change → Task 2 (helper) + Global Constraints. ✅
- Failure isolation → Task 2 (try/catch) + Task 3 test. ✅
- No PB coordination / no migration → Global Constraints. ✅

**2. Placeholder scan:** The Task 3 "failure does not fail the mutation" test is described rather than fully coded because it depends on the sibling tests' D1-mock style — the implementer must copy that harness. Flagged, not silent. All other steps carry real code.

**3. Type consistency:** `emitLifecycleActivity(env, mut, user, before)` signature is identical across Tasks 2–3 wiring. `LifecycleEvent` shape (`{event, kind, body}`) consistent in Tasks 1–2. `ActivityEntryItemRow` imported (not redefined) in Task 5. `postActivityEntry` call matches the real `PostActivityEntryInput` (activity-entry.ts:50).

**Open verification item for the implementer:** confirm `handleCreateProject` (`api/routes/projects.ts`) routes project creation through `applyMutation`/`applyInsert` (Task 4 Step 2). If it uses a direct INSERT, add an explicit `emitLifecycleActivity` call there. Same check for `handleCreateTask` is already satisfied (mobile + create paths route through `applyMutation`, verified `tasks.ts:1352`).
