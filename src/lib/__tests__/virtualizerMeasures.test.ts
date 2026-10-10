// Class guard: a virtualizer with a fixed estimateSize and no measureElement
// overlaps rows wherever a row is taller than the estimate (phone cards, wrapped
// titles). Every useVirtualizer / useWindowVirtualizer call site in src must
// measure real heights: measureElement in the same file and data-index on rows.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

describe('virtualizers measure real row heights', () => {
  const files = walk(join(process.cwd(), 'src')).filter((f) => /use(Window)?Virtualizer\(/.test(readFileSync(f, 'utf8')))
  it('finds the known call sites', () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })
  // Comments are stripped first, so a comment that mentions measureElement cannot
  // satisfy the check; and each virtualizer in a file needs its own measuring ref
  // (`.measureElement}` as a ref, or `.measureElement(` from a callback ref).
  const code = (f: string) =>
    readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const f of files) {
    it(`${f.replace(process.cwd(), '')} uses measureElement + data-index`, () => {
      const s = code(f)
      const virtualizers = (s.match(/use(Window)?Virtualizer\(/g) ?? []).length
      const measuringRefs = (s.match(/\.measureElement\s*[(}]/g) ?? []).length
      expect(virtualizers).toBeGreaterThan(0)
      expect(measuringRefs).toBeGreaterThanOrEqual(virtualizers)
      expect(s).toMatch(/data-index=/)
    })
  }
})
