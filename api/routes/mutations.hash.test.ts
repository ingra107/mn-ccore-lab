// Codex test #3 — hash-vector cross-language contract (Hub TS side).
//
// Loads the same shared vector file Peripheral-Brain uses
// (../../../Peripheral-Brain/tests/fixtures/hash_vectors.json) and
// asserts hashTouched returns the baked-in expected_hash for each.
// Companion Python test at
// Peripheral-Brain/tests/db/test_a3_hash_contract.py runs the same
// vectors through compute_base_hash. Both must agree byte-for-byte.
//
// The hashTouched function takes (row, fields[]) — for these vectors
// the input dict IS the row, and we pass Object.keys() as fields. That
// mirrors how compute_base_hash is invoked from BrainDB writers.
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { hashTouched } from './mutations'

interface Vector {
  name: string
  input: Record<string, unknown>
  expected_hash: string
}

function loadVectors(): Vector[] {
  // Resolve relative to this test file — Hub repo lives adjacent to
  // Peripheral-Brain on Nick's two laptops.
  const here = path.dirname(new URL(import.meta.url).pathname)
  const candidates = [
    path.resolve(here, '../../../Peripheral-Brain/tests/fixtures/hash_vectors.json'),
    path.resolve(here, '../../../../Peripheral-Brain/tests/fixtures/hash_vectors.json'),
    'C:/Users/ingra/Peripheral-Brain/tests/fixtures/hash_vectors.json',
    'C:/Users/ingra107/Peripheral-Brain/tests/fixtures/hash_vectors.json',
  ]
  for (const p of candidates) {
    try {
      const cleaned = p.replace(/^\/+([A-Za-z]:)/, '$1')  // strip leading / on Windows URL paths
      if (fs.existsSync(cleaned)) {
        return JSON.parse(fs.readFileSync(cleaned, 'utf-8'))
      }
    } catch {
      // try next
    }
  }
  // No adjacent Peripheral-Brain checkout (e.g. GitHub Actions): the
  // cross-repo contract cannot be exercised here — skip loudly rather than
  // fail collection. Both laptops keep full coverage via the adjacent
  // layout. Durable fix tracked in PB improvement backlog: move the vector
  // file into the pb-schema contract package so CI can exercise it too.
  console.warn(
    '[mutations.hash.test] hash_vectors.json not found — adjacent',
    'Peripheral-Brain checkout absent; cross-language hash contract',
    'NOT exercised in this environment (laptop-only coverage).',
  )
  return []
}

const vectors = loadVectors()

describe.skipIf(vectors.length === 0)(
  'hashTouched — cross-language contract with Python compute_base_hash', () => {

  for (const v of vectors) {
    it(`matches Python hash for vector "${v.name}"`, async () => {
      const fields = Object.keys(v.input)
      const actual = await hashTouched(v.input, fields)
      expect(actual).toBe(v.expected_hash)
    })
  }

  it('reordered keys produce the same hash', async () => {
    const a = await hashTouched({ a: 1, b: 'hello' }, ['a', 'b'])
    const b = await hashTouched({ b: 'hello', a: 1 }, ['a', 'b'])
    expect(a).toBe(b)
  })

  it('field order in fields[] does not affect the hash', async () => {
    const a = await hashTouched({ a: 1, b: 2 }, ['a', 'b'])
    const b = await hashTouched({ a: 1, b: 2 }, ['b', 'a'])
    expect(a).toBe(b)
  })
  },
)
