// The coverage gate for api/lib/trigger-rule-codes.ts, plus the behaviour of
// the registry at the engine boundary (applyErrorResult) on the real schema.
//
// The gate reads every executable RAISE in the triggers of the migration-built
// schema (api/test-support/prod-schema-db.ts), so a replaced or dropped trigger
// is judged as it stands, not as an old migration file once said. It fails on
// (1) a RAISE whose id has no registry row, (2) a registry row no trigger
// raises, (3) an unlabelled RAISE not on the legacy list, (4) a legacy entry
// no trigger raises. Decision: PB Context/Decisions/2026-10-31-business-rule-refusal-code.md.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMutation } from '../routes/mutations'
import type { Env, AuthUser } from '../helpers'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import {
  TRIGGER_RULE_CODES, UNLABELLED_LEGACY_RAISES, classifyTriggerFailure, leadingRuleId,
} from './trigger-rule-codes'
import { QUESTION_ERROR_CODES } from './task-question'
import { REFUSAL_CODES } from '../../pb-schema/pb_schema/generated/refusal-codes.generated.ts'

const user = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' } as AuthUser

/** Drop SQL comments, leaving string literals (a `--` inside a message is text). */
function stripComments(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m.startsWith("'") ? m : ' '))
}

function triggerRaises(db: InstanceType<typeof Database>): { trigger: string; message: string }[] {
  const out: { trigger: string; message: string }[] = []
  const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all() as { name: string; sql: string }[]
  for (const t of triggers) {
    const sql = stripComments(t.sql)
    const found = [...sql.matchAll(/RAISE\s*\(\s*(?:ABORT|FAIL|ROLLBACK)\s*,\s*'((?:[^']|'')*)'\s*\)/gi)]
    const all = sql.match(/RAISE\s*\(/gi) ?? []
    const ignores = sql.match(/RAISE\s*\(\s*IGNORE\s*\)/gi) ?? []
    // A RAISE shape the extractor cannot read (an expression message) must not pass silently.
    expect(found.length + ignores.length, `${t.name}: a RAISE the gate cannot read`).toBe(all.length)
    for (const f of found) out.push({ trigger: t.name, message: f[1].replace(/''/g, "'") })
  }
  return out
}

describe('trigger RAISE coverage gate', () => {
  const raises = triggerRaises(prodSchemaDb())

  it('reads a plausible number of RAISE sites (the extractor is not blind)', () => {
    expect(raises.length).toBeGreaterThan(50)
  })

  it('every labelled RAISE id has a registry row', () => {
    const missing = raises.map((r) => ({ ...r, id: leadingRuleId(r.message) }))
      .filter((r) => r.id !== null && !(r.id in TRIGGER_RULE_CODES))
    expect(missing, `unclassified RAISE ids: add each to TRIGGER_RULE_CODES`).toEqual([])
  })

  it('every registry row is raised by a live trigger', () => {
    const raised = new Set(raises.map((r) => leadingRuleId(r.message)))
    const dead = Object.keys(TRIGGER_RULE_CODES).filter((id) => !raised.has(id))
    expect(dead, 'registry rows no trigger raises: delete them').toEqual([])
  })

  it('every unlabelled RAISE is on the explicit legacy list, and the list holds no stranger', () => {
    const unlabelled = raises.filter((r) => leadingRuleId(r.message) === null)
    const unlisted = unlabelled.filter((r) => !UNLABELLED_LEGACY_RAISES.some((p) => r.message.startsWith(p)))
    expect(unlisted, 'a new RAISE needs a rule id: "<id>: <words>"').toEqual([])
    const stale = UNLABELLED_LEGACY_RAISES.filter((p) => !unlabelled.some((r) => r.message.startsWith(p)))
    expect(stale, 'legacy entries no trigger raises: delete them').toEqual([])
  })

  it('the legacy list may not grow', () => {
    expect(UNLABELLED_LEGACY_RAISES.length).toBeLessThanOrEqual(8)
  })

  it('every code in the registry is one pb-schema lists', () => {
    for (const code of Object.values(TRIGGER_RULE_CODES)) {
      expect(REFUSAL_CODES as readonly string[]).toContain(code)
    }
  })

  it('a question id agrees with the code task-question.ts gives the same rule', () => {
    for (const [id, code] of Object.entries(TRIGGER_RULE_CODES)) {
      if (id in QUESTION_ERROR_CODES) {
        expect(code, id).toBe(QUESTION_ERROR_CODES[id as keyof typeof QUESTION_ERROR_CODES])
      }
    }
    expect(TRIGGER_RULE_CODES.question_answer_frozen).toBe('question_rule')
    expect(TRIGGER_RULE_CODES.question_kind_immutable).toBe('question_rule')
  })

  it('task_parent_not_live stays loud until its id is split', () => {
    expect(TRIGGER_RULE_CODES.task_parent_not_live).toBe('constraint')
  })
})

describe('the parser reads the leading rule id only', () => {
  const D1 = (m: string) => `D1_ERROR: ${m}: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`
  it('reads both the workerd and the better-sqlite3 message shapes', () => {
    expect(classifyTriggerFailure(D1('task_parent_open_steps: finish or release its steps'))).toEqual({ code: 'business_rule', rule_id: 'task_parent_open_steps' })
    expect(classifyTriggerFailure('task_parent_open_steps: finish or release its steps')).toEqual({ code: 'business_rule', rule_id: 'task_parent_open_steps' })
    expect(classifyTriggerFailure(D1('question_answer_frozen: this join request was already decided')).code).toBe('question_rule')
    expect(classifyTriggerFailure(D1('watch_run_incomplete'))).toEqual({ code: 'constraint', rule_id: 'watch_run_incomplete' })
  })
  it('an id that is not leading is not read', () => {
    expect(classifyTriggerFailure(D1('something happened near task_parent_open_steps: here'))).toEqual({ code: 'constraint' })
    expect(classifyTriggerFailure(D1('tasks completion triad guard: task_parent_done'))).toEqual({ code: 'constraint' })
  })
  it('an unknown or prefix-only id is the loud default', () => {
    expect(classifyTriggerFailure(D1('task_parent_open_steps_v2: new rule'))).toEqual({ code: 'constraint' })
    expect(classifyTriggerFailure(D1('task_parent: x'))).toEqual({ code: 'constraint' })
    expect(classifyTriggerFailure('NOT NULL constraint failed: tasks.title')).toEqual({ code: 'constraint' })
    expect(classifyTriggerFailure('')).toEqual({ code: 'constraint' })
  })
  it('inherited object keys are not rule ids', () => {
    expect(classifyTriggerFailure('constructor: x')).toEqual({ code: 'constraint' })
    expect(classifyTriggerFailure('toString')).toEqual({ code: 'constraint' })
  })
})

describe('applyErrorResult on the real schema', () => {
  let db: InstanceType<typeof Database>
  let env: Env
  beforeEach(() => {
    db = prodSchemaDb()
    env = { DB: d1Adapter(db) } as unknown as Env
    insertRow(db, 'team_members', { slug: 'nick-ingraham', name: 'Nick' })
  })
  const task = (id: string, extra: Record<string, unknown> = {}) =>
    insertRow(db, 'tasks', { id, title: id, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...extra })

  it('a designed trigger refusal carries business_rule and its rule id', async () => {
    task('task_P')
    task('task_S', { parent_id: 'task_P' })
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_P', op: 'update', route: 'test', user,
      patch: { status: 'done', completed: 1, completed_at: '2026-10-30 12:00:00', completed_by: 'ingra107@umn.edu' },
    })
    expect(r.status).toBe('error')
    expect(r.code).toBe('business_rule')
    expect(r.rule_id).toBe('task_parent_open_steps')
  })

  it('task_parent_not_live (a retired parent) stays constraint, with its id', async () => {
    task('task_D', { status: 'deleted', deleted_at: '2026-10-30 12:00:00' })
    task('task_X')
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_X', op: 'update', patch: { parent_id: 'task_D' }, route: 'test', user,
    })
    expect(r.status).toBe('error')
    expect(r.code).toBe('constraint')
    expect(r.rule_id).toBe('task_parent_not_live')
  })

  it('a non-trigger constraint (NOT NULL / CHECK) is constraint with no rule id', async () => {
    task('task_N')
    const r = await applyMutation(env, {
      table: 'tasks', record_id: 'task_N', op: 'update', patch: { title: null }, route: 'test', user,
    })
    expect(r.status).toBe('error')
    expect(r.rule_id).toBeUndefined()
    expect(['constraint', 'protected_null', 'value_invalid']).toContain(r.code)
  })
})
