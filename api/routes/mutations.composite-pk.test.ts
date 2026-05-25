// mutations.composite-pk.test.ts — vitest unit tests for composite PK support
//
// Stage 3 Phase 3 v3 — codex pass-2 N3 + M5 fix (2026-05-07).
//
// Tests:
//   1. Insert + read agent_knowledge with topic = "contains | pipe" (N3 literal pipe safety)
//   2. Insert + read trajectories with task = "task with \\ char" (N3 backslash safety)
//   3. Insert + read agent_knowledge with topic = "unicode_τοπικ" (N3 unicode / ensure_ascii=False)
//   4. Insert + patch + read agent_knowledge via composite recordId (patch WHERE clause correctness)
//   5. Delete via composite recordId; row reads back with deleted_at IS NOT NULL
//   6. Sessions applyDelete sets deleted_at (schema-v65 M5 fix)

import { describe, it, expect, beforeAll } from 'vitest';
import { nowInstant } from '../lib/time';
import { applyInsert, applyUpdate, applyDelete } from './mutations';
import type { Mutation } from './mutations';

// ── Workers-runtime gap guard ─────────────────────────────────────────────────
//
// vitest runs in Node, which has Buffer. Cloudflare Pages Functions do NOT
// have Buffer (Pages and Workers are separate runtimes; nodejs_compat in
// wrangler.toml only covers the Worker deploy). This beforeAll undefines
// Buffer so that any use of Buffer inside mutations.ts functions called by
// these tests will throw synchronously — the same error production returns.
//
// Regression class: 4790715d shipped Buffer.from in decodeCompositeRecordId;
// vitest passed (Node env had Buffer) but Pages smoke failed with
// "Buffer is not defined". This guard prevents recurrence.
beforeAll(() => {
  // @ts-expect-error intentionally poison Buffer to catch Workers-runtime gap
  globalThis.Buffer = undefined;
});

// ── base64url(JSON array) encoder (mirrors Python _composite_record_id) ──────
// Uses Web APIs (btoa + TextEncoder) — no Buffer dependency — so this encoder
// stays valid even with the Buffer guard above.
function compositeRecordId(...parts: string[]): string {
  const json = JSON.stringify(parts);
  const bytes = new TextEncoder().encode(json);
  // Convert bytes to binary string for btoa
  let binStr = '';
  bytes.forEach(b => { binStr += String.fromCharCode(b); });
  // base64 → base64url
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── In-memory D1 stub ────────────────────────────────────────────────────────
//
// Strategy: parse SQL structurally rather than by regex so that composite
// WHERE clauses (col1=? AND col2=? AND col3=?) work correctly.
//
// Each statement knows its SQL + bound values at `.run()`/`.first()` time.
//
// Table store: Map<table, Map<pkKey, Row>>
// pkKey = JSON.stringify(pkCols.map(c => row[c]))

type Row = Record<string, unknown>;

/** Derive the PK column list for a given table (matches mutations.ts PK_COLUMN). */
function getPkCols(table: string): string[] {
  const map: Record<string, string[]> = {
    agent_knowledge: ['category', 'topic', 'valid_from'],
    pomodoro_sessions: ['start_time', 'source'],
    kg_relations: ['source_id', 'target_id', 'relation_type'],
    trajectories: ['task', 'created_at'],
    sessions: ['session_id'],
    tasks: ['id'],
    projects: ['id'],
    decisions: ['context_id'],
    kg_relation_type_registry: ['relation_type'],
    day_capacity: ['date'],
    memory_facts: ['id'],
    kg_entities: ['id'],
  };
  return map[table] ?? ['id'];
}

function rowPkKey(table: string, row: Row): string {
  return JSON.stringify(getPkCols(table).map(c => row[c]));
}

/** Parse "col1 = ? AND col2 = ? AND col3 = ?" into [{col, val}, ...]. */
function parseWhere(whereClause: string, vals: unknown[]): Array<{ col: string; val: unknown }> {
  const parts = whereClause.split(/\s+AND\s+/i);
  let idx = 0;
  return parts.map(part => {
    const m = part.trim().match(/^(\w+)\s*=\s*\?$/);
    if (!m) throw new Error(`Unsupported WHERE clause fragment: ${part}`);
    return { col: m[1], val: vals[idx++] };
  });
}

/** Parse "col1 = ?, col2 = ?, updated_at = datetime('now'), last_mutation_id = ?"
 *  Returns {setCols, nPlaceholders} where setCols is [{col, literal|placeholder}].
 */
function parseSet(setClause: string): Array<{ col: string; isPlaceholder: boolean; literal?: string }> {
  // Split on commas NOT inside parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of setClause) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map(p => {
    const m = p.match(/^(\w+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`Unsupported SET fragment: ${p}`);
    const col = m[1];
    const rhs = m[2].trim();
    if (rhs === '?') return { col, isPlaceholder: true };
    return { col, isPlaceholder: false, literal: rhs };
  });
}

function makeCompositeDb() {
  const store = new Map<string, Map<string, Row>>();

  function getTable(table: string): Map<string, Row> {
    if (!store.has(table)) store.set(table, new Map());
    return store.get(table)!;
  }

  function execInsert(sql: string, vals: unknown[]): void {
    // INSERT INTO <table> (col1, col2, ...) VALUES (?, ?, ...) ON CONFLICT(...) DO NOTHING
    const m = sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) return; // processed_mutations or other — skip
    const table = m[1].toLowerCase();
    if (table === 'processed_mutations') return;
    const colNames = m[2].split(',').map(c => c.trim());
    const row: Row = {};
    colNames.forEach((col, i) => { row[col] = vals[i]; });
    const tbl = getTable(table);
    const key = rowPkKey(table, row);
    if (!tbl.has(key)) tbl.set(key, row); // DO NOTHING on conflict
  }

  function execUpdate(sql: string, vals: unknown[]): void {
    // UPDATE <table> SET ... WHERE ...
    const m = sql.match(/UPDATE (\w+)\s+SET (.+?)\s+WHERE (.+)$/i);
    if (!m) return;
    const table = m[1].toLowerCase();
    const setItems = parseSet(m[2]);
    const whereClause = m[3];

    // Split vals into SET-placeholder vals and WHERE vals
    const nSetPlaceholders = setItems.filter(s => s.isPlaceholder).length;
    const setVals = vals.slice(0, nSetPlaceholders);
    const whereVals = vals.slice(nSetPlaceholders);

    const filters = parseWhere(whereClause, whereVals);

    const tbl = getTable(table);
    for (const [key, row] of tbl.entries()) {
      if (filters.every(({ col, val }) => row[col] === val)) {
        let setIdx = 0;
        for (const item of setItems) {
          if (item.isPlaceholder) {
            row[item.col] = setVals[setIdx++];
          } else if (item.literal) {
            const lit = item.literal.trim();
            if (lit.toUpperCase() === 'NULL') {
              row[item.col] = null;
            } else if (lit.match(/^datetime\(/i)) {
              row[item.col] = nowInstant().replace('T', ' ').substring(0, 19);
            }
          }
        }
        tbl.set(key, row);
        break; // WHERE on PK: only 1 row matches
      }
    }
  }

  function execSelect(sql: string, vals: unknown[]): Row | null {
    if (sql.match(/processed_mutations/i)) return null;
    const m = sql.match(/FROM (\w+)\s+WHERE (.+)$/i);
    if (!m) return null;
    const table = m[1].toLowerCase();
    const whereClause = m[2];
    const filters = parseWhere(whereClause, vals);
    const tbl = getTable(table);
    for (const row of tbl.values()) {
      if (filters.every(({ col, val }) => row[col] === val)) return row;
    }
    return null;
  }

  function makeStmt(sql: string, boundVals: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T = Row>() => {
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith('SELECT')) return execSelect(sql, boundVals) as T | null;
        return null;
      },
      all: async <T = Row>() => ({ results: [] as T[], success: true, meta: {} }),
      run: async () => {
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith('INSERT')) execInsert(sql, boundVals);
        else if (upper.startsWith('UPDATE')) execUpdate(sql, boundVals);
        return { success: true, meta: { changes: 1 }, results: [] };
      },
    };
  }

  return {
    prepare: (sql: string) => makeStmt(sql, []),
    batch: (_stmts: unknown[]) => Promise.resolve([]),
    _store: store,
  };
}

// ── Fake AuthUser and Env ────────────────────────────────────────────────────

const FAKE_USER = { id: 'user_test', email: 'test@test.com' } as any;

function makeEnv(db?: ReturnType<typeof makeCompositeDb>) {
  return { DB: db ?? makeCompositeDb() } as any;
}

function mut(overrides: Partial<Mutation>): Mutation {
  return {
    mutation_id: 'mut_' + Math.random().toString(36).slice(2),
    origin_machine: 'test',
    table: 'agent_knowledge',
    op: 'insert',
    record_id: '',
    base_seq: null,
    base_row_hash: null,
    patch: undefined,
    payload: undefined,
    depends_on: null,
    client_ts: nowInstant(),
    issued_at: nowInstant(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('composite PK — N3 escape-safety', () => {

  it('Test 1: agent_knowledge insert with topic containing literal | pipe', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const topicWithPipe = 'contains | pipe';
    const recordId = compositeRecordId('test_cat', topicWithPipe, '2026-05-07T00:00:00');

    const m = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'test_cat',
        topic: topicWithPipe,
        valid_from: '2026-05-07T00:00:00',
        knowledge: 'pipe test',
        confidence: 'medium',
      },
    });

    const result = await applyInsert(env, m, FAKE_USER);

    expect(result.status).toBe('accepted');
    // Verify the stored row has the literal pipe preserved — NOT split on |
    const tbl = db._store.get('agent_knowledge');
    expect(tbl).toBeDefined();
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe(topicWithPipe);
    expect(rows[0].category).toBe('test_cat');
    expect(rows[0].valid_from).toBe('2026-05-07T00:00:00');
  });

  it('Test 2: trajectories insert with task containing literal backslash', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const taskWithBackslash = 'task with \\ char';
    const recordId = compositeRecordId(taskWithBackslash, '2026-05-07T01:00:00');

    const m = mut({
      table: 'trajectories',
      op: 'insert',
      record_id: recordId,
      payload: {
        task: taskWithBackslash,
        created_at: '2026-05-07T01:00:00',
        steps: 'step1',
        outcome: 'success',
      },
    });

    const result = await applyInsert(env, m, FAKE_USER);

    expect(result.status).toBe('accepted');
    const tbl = db._store.get('trajectories');
    expect(tbl).toBeDefined();
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].task).toBe(taskWithBackslash); // literal backslash preserved
  });

  it('Test 3: agent_knowledge insert with unicode topic (ensure_ascii=False)', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const unicodeTopic = 'unicode_τοπικ';
    const recordId = compositeRecordId('unicode_cat', unicodeTopic, '2026-05-07T02:00:00');

    const m = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'unicode_cat',
        topic: unicodeTopic,
        valid_from: '2026-05-07T02:00:00',
        knowledge: 'unicode test',
        confidence: 'high',
      },
    });

    const result = await applyInsert(env, m, FAKE_USER);

    expect(result.status).toBe('accepted');
    const tbl = db._store.get('agent_knowledge');
    expect(tbl).toBeDefined();
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].topic).toBe(unicodeTopic); // unicode preserved byte-for-byte
  });

  it('Test 4: agent_knowledge insert + patch via composite recordId', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const recordId = compositeRecordId('patch_cat', 'patch_topic', '2026-05-07T03:00:00');

    // Insert first
    const insertMut = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'patch_cat',
        topic: 'patch_topic',
        valid_from: '2026-05-07T03:00:00',
        knowledge: 'original knowledge',
        confidence: 'low',
      },
    });
    const insertResult = await applyInsert(env, insertMut, FAKE_USER);
    expect(insertResult.status).toBe('accepted');

    // Patch it
    const patchMut = mut({
      table: 'agent_knowledge',
      op: 'update',
      record_id: recordId,
      base_seq: null,
      patch: {
        knowledge: 'updated knowledge',
        confidence: 'high',
      },
    });
    const patchResult = await applyUpdate(env, patchMut, FAKE_USER);
    expect(patchResult.status).toBe('accepted');

    // Verify row was updated using composite WHERE
    const tbl = db._store.get('agent_knowledge');
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].knowledge).toBe('updated knowledge');
    expect(rows[0].confidence).toBe('high');
    // PK fields preserved
    expect(rows[0].category).toBe('patch_cat');
    expect(rows[0].topic).toBe('patch_topic');
    expect(rows[0].valid_from).toBe('2026-05-07T03:00:00');
  });

  it('Test 5: delete via composite recordId sets deleted_at on agent_knowledge', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const recordId = compositeRecordId('del_cat', 'del_topic', '2026-05-07T04:00:00');

    // Insert first (without deleted_at so applyDelete can set it)
    const insertMut = mut({
      table: 'agent_knowledge',
      op: 'insert',
      record_id: recordId,
      payload: {
        category: 'del_cat',
        topic: 'del_topic',
        valid_from: '2026-05-07T04:00:00',
        knowledge: 'to be deleted',
        confidence: 'low',
      },
    });
    const insertResult = await applyInsert(env, insertMut, FAKE_USER);
    expect(insertResult.status).toBe('accepted');

    // Confirm no deleted_at yet
    const tblBefore = db._store.get('agent_knowledge')!;
    expect(Array.from(tblBefore.values())[0].deleted_at).toBeFalsy();

    // Delete via composite record_id
    const deleteMut = mut({
      table: 'agent_knowledge',
      op: 'delete',
      record_id: recordId,
    });
    const deleteResult = await applyDelete(env, deleteMut, FAKE_USER);
    expect(deleteResult.status).toBe('accepted');

    // Verify deleted_at was set
    const tbl = db._store.get('agent_knowledge');
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deleted_at).not.toBeUndefined();
    expect(typeof rows[0].deleted_at).toBe('string');
  });

});

describe('sessions applyDelete — schema-v65 M5 fix', () => {

  it('Test 6: sessions delete sets deleted_at (schema-v65 column required)', async () => {
    const db = makeCompositeDb();
    const env = makeEnv(db);
    const sessionId = 'session_2026-05-07T14-00-00';

    // Insert a sessions row (sessions PK = session_id, scalar)
    const insertMut = mut({
      table: 'sessions',
      op: 'insert',
      record_id: sessionId,
      payload: {
        session_id: sessionId,
        started_at: '2026-05-07T14:00:00',
        machine_id: 'work',
      },
    });
    const insertResult = await applyInsert(env, insertMut, FAKE_USER);
    expect(insertResult.status).toBe('accepted');

    // Delete it — this requires schema-v65 deleted_at column on sessions D1
    const deleteMut = mut({
      table: 'sessions',
      op: 'delete',
      record_id: sessionId,
    });
    const deleteResult = await applyDelete(env, deleteMut, FAKE_USER);
    expect(deleteResult.status).toBe('accepted');

    // Verify deleted_at IS NOT NULL — this is what schema-v65 enables
    const tbl = db._store.get('sessions');
    const rows = Array.from(tbl!.values());
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deleted_at).not.toBeUndefined();
    expect(typeof rows[0].deleted_at).toBe('string');
    expect(rows[0].session_id).toBe(sessionId);
  });

});
