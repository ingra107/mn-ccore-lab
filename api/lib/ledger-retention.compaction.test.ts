// #8842: compactProcessedMutationsJson against the migrated schema.
// It used to SET original_response_json = NULL on a TEXT NOT NULL column, so
// every run failed and nothing was ever compacted in prod (276 accepted rows
// >48h still carried full JSON on 2026-09-23, 0 NULL rows).

import { describe, it, expect } from 'vitest'
import { compactProcessedMutationsJson } from './ledger-retention'
import { minimalReceiptJson } from '../routes/mutations'
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db'

describe('compactProcessedMutationsJson', () => {
  it('replaces old accepted bodies with the minimal receipt JSON and is idempotent', async () => {
    const db = prodSchemaDb()
    const ins = db.prepare(`INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id)
      VALUES (?, 'home', ?, ?, ?, 'tasks', 't')`)
    ins.run('mut_old_acc', '2020-01-01 00:00:00', 'accepted', '{"mutation_id":"mut_old_acc","status":"accepted","canonical_payload":{"x":1}}')
    ins.run('mut_old_conf', '2020-01-01 00:00:00', 'conflict', '{"big":"keep"}')
    ins.run('mut_new_acc', '2999-01-01 00:00:00', 'accepted', '{"big":"keep"}')

    const env = d1Adapter(db) as unknown as D1Database
    expect(await compactProcessedMutationsJson(env)).toBe(1)
    const get = (id: string) => (db.prepare('SELECT original_response_json j FROM processed_mutations WHERE mutation_id = ?').get(id) as { j: string }).j
    // Byte-identical to the placeholder commitRowWrite writes, so one replay
    // path serves both.
    expect(get('mut_old_acc')).toBe(minimalReceiptJson('mut_old_acc', 'accepted'))
    expect(get('mut_old_conf')).toBe('{"big":"keep"}')
    expect(get('mut_new_acc')).toBe('{"big":"keep"}')
    expect(await compactProcessedMutationsJson(env)).toBe(0)
  })
})
