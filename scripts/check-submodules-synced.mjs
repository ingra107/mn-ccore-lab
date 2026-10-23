#!/usr/bin/env node
// Deploy gate: every submodule's checkout must be the commit this repo records.
//
// The API imports pb-schema's generated files (TABLE_FIELDS etc.) straight
// from the pb-schema/ checkout. On 2026-10-23 that checkout sat at 0.19.0
// while main recorded 0.20.0, so every deploy that day shipped a field list
// without links.kind and /api/mutations refused it. Wrangler only warned
// "uncommitted changes". `git submodule status` prefixes such a checkout with
// '+' (different commit) or '-' (not checked out); either fails the gate.
import { execFileSync } from 'node:child_process'

const out = execFileSync('git', ['submodule', 'status'], { encoding: 'utf8' })
const bad = out.split('\n').filter((l) => /^[+\-U]/.test(l))
if (bad.length) {
  console.error('check-submodules-synced: a submodule checkout is not the commit main records:')
  for (const l of bad) console.error('  ' + l.trim())
  console.error('Run `git submodule update` (or commit the new pointer on purpose), then deploy.')
  process.exit(1)
}
console.log('check-submodules-synced: every submodule matches its recorded commit.')
