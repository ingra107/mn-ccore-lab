// Two causes of mass test failures, both reproduced on 2026-11-05:
//   1. Worktrees share node_modules through a junction. Vite's optimized-deps hash
//      includes the root, so a run in another checkout deleted this run's deps:
//      "Failed to fetch dynamically imported module".
//   2. One unparsable file fails the dep scan. Vite then discovers deps at runtime
//      and reloads mid-run, leaving two Reacts on the page: "Cannot read properties
//      of null (reading 'useState')".
// The config answers with a per-checkout cacheDir and a named dep list; this keeps
// the list complete as dependencies are added.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(repo, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

// No test imports it, and listing it would bundle three.js into every run.
const NOT_IN_TESTS = new Set(['reagraph'])

describe('vitest config', () => {
  it('every config keeps its cache in the checkout, not the shared node_modules', () => {
    for (const f of ['vitest.config.ts', 'vitest.config.api.ts', 'vitest.config.lib.ts', 'vite.config.ts']) {
      expect(read(f), f).toMatch(/^\s*cacheDir: '\.vite-cache'/m)
    }
    expect(read('.gitignore')).toMatch(/^\.vite-cache\/\r?$/m)
  })

  it('names every package dependency the browser code imports', () => {
    const config = read('vitest.config.ts')
    const start = config.indexOf('include: [')
    const include = config.slice(start, config.indexOf('],', start))
    const deps = Object.keys((JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies)
    const source = walk(join(repo, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n')
    const imported = [...source.matchAll(/(?:from|import\()\s*['"]([^'"./][^'"]*)['"]/g)].map((m) => m[1])
    const missing = [...new Set(imported.filter((spec) => deps.some((d) => spec === d || spec.startsWith(`${d}/`))))]
      .filter((spec) => !include.includes(`'${spec}'`) && !NOT_IN_TESTS.has(spec))
    expect(missing).toEqual([])
  })
})
