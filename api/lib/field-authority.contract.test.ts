// field-authority.contract.test.ts — make a SILENTLY-dropped Hub-synced column
// impossible to ship green (PB backlog #225, codex-recommended "B+" design).
//
// THE BUG CLASS THIS GUARDS
// -------------------------
// A new task/project column accepted by /api/mutations (the GENERATED
// `TABLE_FIELDS` set in pb-schema field-authority.generated.ts) must ALSO be
// threaded through ~6 HAND-MAINTAINED Hub spots or it is silently dropped in
// prod while every test stays green:
//   1. TASK_PLAIN_COLS        (api/lib/task-cols.ts)      — read projection
//   2. TASK_ALLOWED_FIELDS    (api/routes/tasks.ts)       — REST update allow-list
//   3. handleCreateTask       (api/routes/tasks.ts)       — REST create payload
//   4. handleMobileTasksToHub (api/routes/tasks.ts)       — mobile create payload (6th spot)
//   5. PROJECT_ALLOWED_FIELDS (api/routes/projects.ts)    — REST update allow-list
//   6. handleCreateProject    (api/routes/projects.ts)    — REST create payload
// `approval_status` (schema-v90) shipped GREEN + DEPLOYED but broke in prod
// because the hand spots dropped it. This test turns that drift RED at
// test-time: a new TABLE_FIELDS field that nobody consciously projected /
// allow-listed / bucketed makes a set-equality (or map-completeness) assertion
// fail. There is NO live route-behavior change here — only exports + a test.
//
// HOW TO SATISFY A RED FROM THIS FILE (the intended workflow)
// -----------------------------------------------------------
// You added a field to TABLE_FIELDS. For each RED assertion, do the REAL work,
// not the test edit, UNLESS the field is genuinely read-only/derived/excluded —
// in which case add it to the matching EXCLUDED/EXTRA set or CREATE bucket WITH
// a one-line reason. Never silence a RED by guessing.

import { describe, it, expect, vi } from 'vitest'
// Same relative module id mutations.ts imports (api/routes is two levels deep,
// api/lib is two levels deep) — pin to the GENERATED authority, never a copy.
import { TABLE_FIELDS } from '../../pb-schema/pb_schema/generated/field-authority.generated.ts'
import { TASK_PLAIN_COLS } from './task-cols'
import { TASK_ALLOWED_FIELDS } from '../routes/tasks'
import { PROJECT_ALLOWED_FIELDS } from '../routes/projects'

// ── set helpers ─────────────────────────────────────────────────────────────
const arr = (s: Iterable<string>) => [...s].sort()
const minus = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => !b.has(x)))
const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b])
/** Returns { missing, extra } so a failed expect() prints exactly which field
 *  drifted and on which side — the readable signal a future field-adder needs. */
function diff(actual: Set<string>, expected: Set<string>) {
  return {
    missing: [...expected].filter((x) => !actual.has(x)).sort(), // in contract, absent from the hand-maintained set
    extra: [...actual].filter((x) => !expected.has(x)).sort(),   // in the hand-maintained set, not in the derived expectation
  }
}

const TASKS = TABLE_FIELDS.tasks
const PROJECTS = TABLE_FIELDS.projects

// ════════════════════════════════════════════════════════════════════════════
// A) TASK READ projection — TASK_PLAIN_COLS ≡ (TABLE_FIELDS.tasks ∪ EXTRA) − EXCLUDED
// ════════════════════════════════════════════════════════════════════════════
//
// EXTRA = columns the read projection exposes that are NOT in the wire contract
// (system/PK/cursor columns Hub reads but PB does not write via /api/mutations).
const TASK_READ_EXTRA = new Set<string>([
  'id',              // PK — never a synced field
  'updated_at',      // system, seq-trigger driven
  'deleted_at',      // tombstone, system
  'seq',             // sync cursor, system
  'last_mutation_id',// A3 idempotency marker, system
  'watchers',        // Hub-readable, not a /api/mutations field (PB does not sync it)
  'reminder_days',   // Hub-readable, not a /api/mutations field
  'instructions',    // Hub-readable, not a /api/mutations field
])
// EXCLUDED = wire-contract fields deliberately NOT in the raw read projection.
const TASK_READ_EXCLUDED = new Set<string>([
  'project_id',      // resolved via COALESCE(slug, raw) AS project_id (PROJECT_ID_AS_SLUG), NOT raw t.project_id — the P2 half-migration guard (task-cols.test.ts:52-63)
  // NOTE: codex's mental model also expected `notes` here, but `notes` is NOT in
  // TABLE_FIELDS.tasks — it was retired from the wire in pb-schema 0.4.0
  // (tasks.ts:308). So it cannot appear in (TABLE_FIELDS − TASK_PLAIN_COLS).
  // `notes` privacy is independently guarded by TABLE_PRIVATE_COLS (task-cols.ts:100)
  // + tasks.notes-leak.test.ts — out of scope for this field-authority contract.
])

describe('A) task read projection (TASK_PLAIN_COLS) vs TABLE_FIELDS.tasks', () => {
  it('EXTRA columns really are outside the wire contract (self-consistency)', () => {
    // If a future edit moves an EXTRA into TABLE_FIELDS, this catches the stale list.
    expect([...TASK_READ_EXTRA].filter((c) => TASKS.has(c))).toEqual([])
    // EXTRA must actually be present in the projection (else it is a phantom).
    const plain = new Set(TASK_PLAIN_COLS)
    expect([...TASK_READ_EXTRA].filter((c) => !plain.has(c))).toEqual([])
  })

  it('EXCLUDED columns are wire-contract fields genuinely absent from the projection', () => {
    expect([...TASK_READ_EXCLUDED].filter((c) => !TASKS.has(c))).toEqual([])
    const plain = new Set(TASK_PLAIN_COLS)
    expect([...TASK_READ_EXCLUDED].filter((c) => plain.has(c))).toEqual([])
  })

  it('TASK_PLAIN_COLS === (TABLE_FIELDS.tasks ∪ EXTRA) − EXCLUDED  (bidirectional)', () => {
    const expected = minus(union(TASKS, TASK_READ_EXTRA), TASK_READ_EXCLUDED)
    const actual = new Set(TASK_PLAIN_COLS)
    // A new TABLE_FIELDS field absent from BOTH the projection AND EXCLUDED lands
    // in `missing` → RED. A projection col that is neither a contract field nor a
    // known EXTRA lands in `extra` → RED.
    expect(diff(actual, expected)).toEqual({ missing: [], extra: [] })
  })

  it('TASK_PLAIN_COLS has no duplicates', () => {
    expect(TASK_PLAIN_COLS.length).toBe(new Set(TASK_PLAIN_COLS).size)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// B) TASK UPDATE allow-list — TASK_ALLOWED_FIELDS ≡ TABLE_FIELDS.tasks − EXCLUDED
// ════════════════════════════════════════════════════════════════════════════
//
// EXCLUDED = read-only / system / server-derived fields a REST PATCH must NOT set.
const TASK_UPDATE_EXCLUDED = new Set<string>([
  'created_at',      // insert-only
  'acknowledged_at', // Slack-style seen model — set by the view/ack path, not a client PATCH
  'acknowledged_by', // same
  'email_link',      // DERIVED from source_thread_id at write time (gmailThreadUrl); never a direct client field
  'source',          // provenance, fixed at create
  'waiting_since',   // W1 operational timestamp, server/trigger-managed (waiting_on IS allow-listed; the timestamp is not)
])

describe('B) task update allow-list (TASK_ALLOWED_FIELDS) vs TABLE_FIELDS.tasks', () => {
  it('allow-list is a subset of the wire contract (no phantom-updatable field)', () => {
    expect([...TASK_ALLOWED_FIELDS].filter((c) => !TASKS.has(c))).toEqual([])
  })

  it('EXCLUDED are contract fields genuinely absent from the allow-list', () => {
    expect([...TASK_UPDATE_EXCLUDED].filter((c) => !TASKS.has(c))).toEqual([])
    expect([...TASK_UPDATE_EXCLUDED].filter((c) => TASK_ALLOWED_FIELDS.has(c))).toEqual([])
  })

  it('TASK_ALLOWED_FIELDS === TABLE_FIELDS.tasks − EXCLUDED', () => {
    const expected = minus(TASKS, TASK_UPDATE_EXCLUDED)
    // New TABLE_FIELDS field not allow-listed AND not excluded → `missing` → RED.
    expect(diff(TASK_ALLOWED_FIELDS, expected)).toEqual({ missing: [], extra: [] })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// C) PROJECT UPDATE allow-list — PROJECT_ALLOWED_FIELDS ≡ TABLE_FIELDS.projects − EXCLUDED
// ════════════════════════════════════════════════════════════════════════════
const PROJECT_UPDATE_EXCLUDED = new Set<string>([
  'created_at',      // insert-only (PROJECT_ALLOWED_FIELDS comment, projects.ts:522)
  // `type` VERDICT (codex flag): projects.type IS in TABLE_FIELDS.projects (wire-
  // accepted via /api/mutations) but is referenced NOWHERE in api/routes/projects.ts
  // — not set by handleCreateProject, not in PROJECT_ALLOWED_FIELDS. So project.type
  // is WRITE-ONLY via the A3 sync path (PB brain.db → Hub); it cannot be created or
  // edited through the Hub REST surface. The B-8 sweep (projects.ts:516-522) added
  // every sibling field TABLE_FIELDS.projects accepts EXCEPT `type` (and the
  // legitimately insert-only `created_at`). Its sibling `domain` IS allow-listed,
  // so the type/category/domain trio is asymmetric. This is a LIKELY LATENT GAP,
  // not a clearly-intended exclusion — surfaced to the orchestrator for a backlog
  // row. Parked here (not made RED) so the test is green on today's reality per the
  // "no live route-behavior change" constraint; revisit when #225's verdict lands.
  'type',
])

describe('C) project update allow-list (PROJECT_ALLOWED_FIELDS) vs TABLE_FIELDS.projects', () => {
  it('allow-list is a subset of the wire contract', () => {
    expect([...PROJECT_ALLOWED_FIELDS].filter((c) => !PROJECTS.has(c))).toEqual([])
  })

  it('EXCLUDED are contract fields genuinely absent from the allow-list', () => {
    expect([...PROJECT_UPDATE_EXCLUDED].filter((c) => !PROJECTS.has(c))).toEqual([])
    expect([...PROJECT_UPDATE_EXCLUDED].filter((c) => PROJECT_ALLOWED_FIELDS.has(c))).toEqual([])
  })

  it('PROJECT_ALLOWED_FIELDS === TABLE_FIELDS.projects − EXCLUDED', () => {
    const expected = minus(PROJECTS, PROJECT_UPDATE_EXCLUDED)
    expect(diff(PROJECT_ALLOWED_FIELDS, expected)).toEqual({ missing: [], extra: [] })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// D) CREATE classification — every wire field is consciously bucketed at create
// ════════════════════════════════════════════════════════════════════════════
//
// Plain allow-list checks (A/B/C) miss the CREATE payloads: a new field can be
// allow-listed for UPDATE yet silently never set at create. This map forces a
// conscious decision for EVERY TABLE_FIELDS field. Buckets:
//   direct         — passed straight from the request body (body.X / body.X ?? null / trim)
//   defaulted      — body value OR a non-null literal/computed default
//   derived        — computed from ANOTHER field or a function (title↔description, gmailThreadUrl, completion triad, project resolve)
//   server_owned   — server identity / time / id (user.email, nowInstant())
//   route_excluded — not set in the create payload (DB default / set only via /api/mutations sync)
type CreateBucket = 'direct' | 'defaulted' | 'derived' | 'server_owned' | 'route_excluded'
const BUCKETS: ReadonlySet<CreateBucket> = new Set(['direct', 'defaulted', 'derived', 'server_owned', 'route_excluded'])

// handleCreateTask payload (tasks.ts:537-569).
const TASK_CREATE_BUCKETS: Record<string, CreateBucket> = {
  // direct passthrough from body
  approval_status: 'direct',     // body.approval_status ?? null
  assignee: 'direct',
  deadline: 'direct',
  description: 'direct',
  due_date: 'direct',
  effort: 'direct',
  key_link_1: 'direct',
  key_link_1_desc: 'direct',
  key_link_2: 'direct',
  key_link_2_desc: 'direct',
  key_link_3: 'direct',
  key_link_3_desc: 'direct',
  meeting_id: 'direct',
  related_message_ids: 'direct',
  short_title: 'direct',
  source_thread_id: 'direct',
  // defaulted (body OR a non-null default)
  priority: 'defaulted',         // body.priority || 'medium'
  source: 'defaulted',           // body.source || (meeting_id ? 'meeting' : 'manual')
  status: 'defaulted',           // validated body.status, else 'todo'
  // derived (computed from another field / function)
  title: 'derived',              // body.title || body.description
  completed: 'derived',          // isInsertDone ? 1 : 0  (completion triad)
  completed_at: 'derived',       // isInsertDone ? nowInstant() : null
  completed_by: 'derived',       // isInsertDone ? user.email : null
  email_link: 'derived',         // gmailThreadUrl(body.source_thread_id)
  project_id: 'derived',         // projectRefToCanonical(body.project_id)
  // server-owned
  assigned_by: 'server_owned',   // user.email
  // route_excluded (no create payload key — DB default or /api/mutations-only)
  created_at: 'route_excluded',
  acknowledged_at: 'route_excluded',
  acknowledged_by: 'route_excluded',
  blocked_by: 'route_excluded',
  deadline_type: 'route_excluded',
  description_json: 'route_excluded',
  estimated_minutes: 'route_excluded',
  group_override: 'route_excluded',
  inbox_event_id: 'route_excluded',
  next_artifact: 'route_excluded',
  next_checkin_date: 'route_excluded',
  nick_followup_date: 'route_excluded',
  plan_rank: 'route_excluded',
  plan_slot: 'route_excluded',
  plan_start_min: 'route_excluded',
  planned_for: 'route_excluded',
  promise_date: 'route_excluded',
  promised_to: 'route_excluded',
  requires_nick_brain: 'route_excluded',
  waiting_on: 'route_excluded',
  waiting_since: 'route_excluded',
}

// handleCreateProject payload (projects.ts:168-178).
const PROJECT_CREATE_BUCKETS: Record<string, CreateBucket> = {
  title: 'direct',                 // body.title.trim()
  category: 'defaulted',           // body.category || 'MNCCORE'
  stage: 'defaulted',              // body.stage || 'idea'
  description: 'defaulted',        // body.description || ''
  status: 'defaulted',            // literal 'active' at create
  pi: 'derived',                   // resolveActor(...).slug
  slug: 'derived',                 // sanitize(body.slug || body.title) + collision suffix
  created_at: 'server_owned',      // nowInstant()
  stage_entered_at: 'server_owned',// nowInstant()
  // route_excluded — not in the create payload; DB default or /api/mutations-only
  analysis_path: 'route_excluded',
  author_role: 'route_excluded',
  box_url: 'route_excluded',
  citation: 'route_excluded',
  context_links: 'route_excluded',
  doi: 'route_excluded',
  domain: 'route_excluded',
  due_date: 'route_excluded',
  github_url: 'route_excluded',
  journal: 'route_excluded',
  key_files: 'route_excluded',
  key_link_1: 'route_excluded',
  key_link_1_desc: 'route_excluded',
  key_link_2: 'route_excluded',
  key_link_2_desc: 'route_excluded',
  key_link_3: 'route_excluded',
  key_link_3_desc: 'route_excluded',
  last_meaningful_movement: 'route_excluded',
  manuscript_path: 'route_excluded',
  next_action: 'route_excluded',
  next_artifact: 'route_excluded',
  pi_context: 'route_excluded',
  primary_folder: 'route_excluded',
  publication_date: 'route_excluded',
  pubmed_id: 'route_excluded',
  short_name: 'route_excluded',
  stage_notes: 'route_excluded',
  stale_active_since: 'route_excluded',
  state: 'route_excluded',
  strategic_context: 'route_excluded',
  tier: 'route_excluded',
  type: 'route_excluded',          // PB-owned; see `type` verdict in section C
}

describe('D) create classification — every wire field is in exactly one bucket', () => {
  it('every TABLE_FIELDS.tasks field is classified (new field in NO bucket → RED)', () => {
    expect(diff(new Set(Object.keys(TASK_CREATE_BUCKETS)), TASKS)).toEqual({ missing: [], extra: [] })
  })

  it('every task bucket value is a legal bucket', () => {
    const bad = Object.entries(TASK_CREATE_BUCKETS).filter(([, b]) => !BUCKETS.has(b))
    expect(bad).toEqual([])
  })

  it('every TABLE_FIELDS.projects field is classified (new field in NO bucket → RED)', () => {
    expect(diff(new Set(Object.keys(PROJECT_CREATE_BUCKETS)), PROJECTS)).toEqual({ missing: [], extra: [] })
  })

  it('every project bucket value is a legal bucket', () => {
    const bad = Object.entries(PROJECT_CREATE_BUCKETS).filter(([, b]) => !BUCKETS.has(b))
    expect(bad).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// E) BEHAVIOR — the nontrivial create coercions codex named, on the REAL route.
//    Mocks ONLY the persistence boundary (applyMutation); captures the exact
//    payload handleCreateTask builds. No prod, no DB.
// ════════════════════════════════════════════════════════════════════════════
//
// vi.hoisted: the factory is hoisted above imports, so the mock fn must be too.
const { applyMutationMock } = vi.hoisted(() => ({ applyMutationMock: vi.fn() }))
// '../routes/mutations' from api/lib resolves to the SAME module tasks.ts imports
// as './mutations' → tasks.ts receives this mock for applyMutation.
vi.mock('../routes/mutations', () => ({
  applyMutation: applyMutationMock,
}))

// Generic no-op chainable D1 stub: satisfies logActivity / notifications / any
// stray query without modelling SQL (assignee='claude-ai' skips the only .first()
// that must return a row — the team_members validation).
function noopDB() {
  const stmt: Record<string, unknown> = {
    bind: () => stmt,
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 0 } }),
    all: async () => ({ results: [], success: true, meta: {} }),
  }
  return { prepare: () => stmt, batch: async () => [] }
}

async function captureCreatePayload(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { handleCreateTask } = await import('../routes/tasks')
  applyMutationMock.mockReset()
  applyMutationMock.mockResolvedValue({ status: 'accepted' })
  const env = { DB: noopDB(), RESEND_API_KEY: undefined } as unknown as import('../helpers').Env
  const user = { email: 'ingra107@umn.edu', name: 'Nick' } as import('../helpers').AuthUser
  const req = new Request('https://x/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignee: 'claude-ai', ...body }),
  })
  await handleCreateTask(req, user, env)
  expect(applyMutationMock).toHaveBeenCalledTimes(1)
  return (applyMutationMock.mock.calls[0][1] as { payload: Record<string, unknown> }).payload
}

describe('E) handleCreateTask payload coercions (real route, persistence mocked)', () => {
  it('defaults missing approval_status → null', async () => {
    const payload = await captureCreatePayload({ description: 'a task with no approval_status' })
    expect(payload.approval_status).toBeNull()
  })

  it('passes an explicit approval_status through unchanged', async () => {
    const payload = await captureCreatePayload({ description: 'pending approval task', approval_status: 'pending' })
    expect(payload.approval_status).toBe('pending')
  })

  it('source_thread_id present → email_link derived as the paired Gmail-thread link', async () => {
    const payload = await captureCreatePayload({ description: 'email-sourced task', source_thread_id: 'THREAD123' })
    expect(payload.source_thread_id).toBe('THREAD123')
    expect(payload.email_link).toBe('https://mail.google.com/mail/u/1/#inbox/THREAD123')
  })

  it('source_thread_id absent → email_link is null (pair moves together)', async () => {
    const payload = await captureCreatePayload({ description: 'no thread task' })
    expect(payload.source_thread_id).toBeNull()
    expect(payload.email_link).toBeNull()
  })
})
