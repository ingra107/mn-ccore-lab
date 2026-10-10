import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// data/publications.ts runs mergePublications() at module top level over the 358 KB
// publications.generated.ts. A top-level call is a side effect the bundler must keep, so any
// STATIC import of either module ships the whole set in the prod bundle (94.5 KB gzip in the
// useApiData chunk until 2026-10-10). The only sanctioned edge is the DEV-gated dynamic
// import in hooks/useApiData.ts. This fails the moment any src/ file adds a static one.
describe('the static publications set stays out of the prod bundle', () => {
  it('no src/ file statically imports data/publications or publications.generated', () => {
    const root = join(process.cwd(), 'src')
    const staticImport = /^\s*(import|export)\b[^;]*?\bfrom\s+['"][^'"]*\/publications(\.generated)?['"]/m
    const offenders: string[] = []
    let scanned = 0
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
          if (name === '__tests__' || name === 'node_modules') continue
          walk(full)
        } else if (/\.(ts|tsx)$/.test(name)) {
          scanned++
          const rel = relative(root, full).split(sep).join('/')
          // publications.ts itself is the module that pulls in the generated file.
          if (rel !== 'data/publications.ts' && staticImport.test(readFileSync(full, 'utf8'))) offenders.push(rel)
        }
      }
    }
    walk(root)
    expect(scanned).toBeGreaterThan(100) // the walk actually saw the tree
    expect(offenders).toEqual([])
  })
})
