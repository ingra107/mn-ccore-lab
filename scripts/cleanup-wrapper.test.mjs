// cleanup-wrapper.test.mjs — Z7.2
//
// Run with: node scripts/cleanup-wrapper.test.mjs
// Uses node:test + node:assert (Node 18+) — no external test runner required.
// Also discoverable by vitest via: npx vitest run --project scripts (if a config
// is added later), but the canonical verification gate is the node command above.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runCleanup } from './cleanup-wrapper.mjs'

describe('runCleanup() wrapper', () => {
  it('writes _final_summary.json with verified=true on success', async () => {
    const writes = {}
    const fs = {
      writeFileSync: (filePath, contents) => { writes[filePath] = contents },
      mkdirSync: () => {},
    }
    const preCounts = async () => ({ stale_tasks: 25, dup_slugs: 3 })
    const mutate = async () => ({ mutation_batch_id: 'b-1', changed: 28 })
    const postCounts = async () => ({ stale_tasks: 0, dup_slugs: 0 })
    const waitValidator = async () => undefined  // 5-min wait stubbed
    const result = await runCleanup({
      label: 'phase-5-cleanup',
      outDir: 'Scratch/phase-5-test',
      preCounts, mutate, postCounts, waitValidator,
      fs,
    })
    assert.equal(result.verified, true)
    const finalJson = writes['Scratch/phase-5-test/_final_summary.json']
    assert.ok(finalJson, '_final_summary.json must be written on success')
    assert.ok(finalJson.includes('"verified": true'), '_final_summary.json must contain verified: true')
    assert.ok(finalJson.includes('"mutation_batch_id": "b-1"'), '_final_summary.json must contain mutation_batch_id')
  })

  it('writes _error_summary.json (NOT _final_summary.json) on mutate failure', async () => {
    const writes = {}
    const fs = {
      writeFileSync: (filePath, contents) => { writes[filePath] = contents },
      mkdirSync: () => {},
    }
    const preCounts = async () => ({ stale_tasks: 25 })
    const mutate = async () => { throw new Error('D1 5xx') }
    const postCounts = async () => ({ stale_tasks: 25 })  // unchanged
    const result = await runCleanup({
      label: 'phase-5-cleanup',
      outDir: 'Scratch/phase-5-test',
      preCounts, mutate, postCounts,
      waitValidator: async () => {},
      fs,
    })
    assert.equal(result.verified, false)
    assert.ok(writes['Scratch/phase-5-test/_error_summary.json'], '_error_summary.json must be written on mutate failure')
    assert.equal(writes['Scratch/phase-5-test/_final_summary.json'], undefined, '_final_summary.json must NOT be written on failure')
  })

  it('writes _verification_failed.json when post-counts disagree with mutation', async () => {
    const writes = {}
    const fs = {
      writeFileSync: (filePath, contents) => { writes[filePath] = contents },
      mkdirSync: () => {},
    }
    const preCounts = async () => ({ stale_tasks: 25 })
    const mutate = async () => ({ mutation_batch_id: 'b-2', changed: 25 })
    const postCounts = async () => ({ stale_tasks: 7 })  // 7 survivors — mutation did NOT clear
    const result = await runCleanup({
      label: 'phase-5-cleanup',
      outDir: 'Scratch/phase-5-test',
      preCounts, mutate, postCounts,
      waitValidator: async () => {},
      fs,
    })
    assert.equal(result.verified, false)
    assert.ok(writes['Scratch/phase-5-test/_verification_failed.json'], '_verification_failed.json must be written on post-count mismatch')
    assert.equal(writes['Scratch/phase-5-test/_final_summary.json'], undefined, '_final_summary.json must NOT be written when verification fails')
  })
})
