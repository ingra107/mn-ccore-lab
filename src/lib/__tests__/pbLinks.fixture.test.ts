/**
 * Parity gate: asserts that the TS interpreter (pbLinks.generated.ts) produces
 * byte-identical output to the PB Python runtime for every case in the shared
 * fixture corpus.
 *
 * Also asserts PB_LINK_RULES_HASH matches the SHA-256 of the embedded rule table
 * (link-rules.generated.json), catching any manual edits to the generated files
 * without going through the Python codegen (master plan §6d).
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { normalizeLink, PB_LINK_RULES_HASH } from '../pbLinks.generated'
import fixtures from './link-fixtures.json'

const __dir = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Hash drift gate (§6d)
// ---------------------------------------------------------------------------
// Mirrors Python: hashlib.sha256(rules_as_json().encode("ascii")).hexdigest()
// The file on disk has Windows CRLF; Python hashes the LF-normalised string.
function computeRulesHash(): string {
  const raw = readFileSync(join(__dir, '../link-rules.generated.json'), 'ascii')
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\n$/, '')
  return createHash('sha256').update(normalised).digest('hex')
}

describe('PB_LINK_RULES_HASH drift gate', () => {
  it('PB_LINK_RULES_HASH matches SHA-256 of link-rules.generated.json (§6d)', () => {
    expect(PB_LINK_RULES_HASH).toBe(computeRulesHash())
  })
})

// ---------------------------------------------------------------------------
// Fixture parity: TS runtime === Python reference for every case
// ---------------------------------------------------------------------------
describe('pbLinks.generated normalizeLink — fixture parity (21 cases)', () => {
  for (const { raw, expected } of fixtures) {
    it(`normalizeLink(${JSON.stringify(raw)})`, () => {
      const result = normalizeLink(raw)
      expect(result).not.toBeNull()
      expect(result!.type).toBe(expected.type)
      expect(result!.canonical_url).toBe(expected.canonical_url)
      expect(result!.short_title).toBe(expected.short_title)
    })
  }
})
