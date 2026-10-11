import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  projectShortLabel, projectFullTitleHint, projectShortLabelMap,
  taskShortLabel, taskFullTitleHint,
} from '../displayNames'

describe('project labels', () => {
  const cqode = { slug: 'cqode-clif-etl', title: 'CQODE Backbone / UMN CLIF', short_name: 'CQODE-CLIF ETL' }

  it('shows the short name, never the long title, when one is set', () => {
    expect(projectShortLabel(cqode)).toBe('CQODE-CLIF ETL')
    expect(projectShortLabelMap([cqode]).get('cqode-clif-etl')).toBe('CQODE-CLIF ETL')
  })

  it('falls back title -> slug -> id, never adds a "#"', () => {
    expect(projectShortLabel({ short_name: '  ', title: 'K23 award', slug: 'k23' })).toBe('K23 award')
    expect(projectShortLabel({ short_name: null, title: null, slug: 'k23' })).toBe('k23')
    expect(projectShortLabel({ id: 'proj_x' })).toBe('proj_x')
    expect(projectShortLabel(cqode).startsWith('#')).toBe(false)
  })

  it('gives the full title as a hover hint only when it differs', () => {
    expect(projectFullTitleHint(cqode)).toBe('CQODE Backbone / UMN CLIF')
    expect(projectFullTitleHint({ short_name: 'LPV', title: 'LPV' })).toBeUndefined()
    expect(projectFullTitleHint({ title: 'K23 award' })).toBeUndefined()
  })
})

describe('task labels', () => {
  it('prefers the curated short_title, then title, then description', () => {
    expect(taskShortLabel({ short_title: 'Upgrade CLIFpy 3.0', title: 'Upgrade to CLIFpy 3.0 (CLIF 2.1 -> 3.0 migration)' })).toBe('Upgrade CLIFpy 3.0')
    expect(taskShortLabel({ short_title: null, title: 'Draft methods' })).toBe('Draft methods')
    expect(taskShortLabel({ short_title: '', title: '', description: 'from the meeting' })).toBe('from the meeting')
  })

  it('gives the full title as a hover hint only when it differs', () => {
    expect(taskFullTitleHint({ short_title: 'Upgrade CLIFpy 3.0', title: 'Upgrade to CLIFpy 3.0' })).toBe('Upgrade to CLIFpy 3.0')
    expect(taskFullTitleHint({ short_title: null, title: 'Draft methods' })).toBeUndefined()
  })
})

// The class guard: display code picks names through displayNames.ts only.
// An inline `x.short_name || x.title` (or short_title) elsewhere is how three
// pages drifted from Today; a page building its name map from `p.title ?? p.slug`
// is the exact My Tasks shape (eval item 3, 2026-10-10).
describe('no inline name fallbacks outside displayNames.ts', () => {
  const srcRoot = resolve(__dirname, '../..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !p.endsWith('displayNames.ts')) files.push(p)
    }
  }
  walk(srcRoot)

  const banned = [
    /\b([\w.]+)\.short_(?:name|title)\s*\|\|\s*\1\.title\b/,
    /\b([\w.]+)\.title\s*(?:\?\?|\|\|)\s*\1\.slug\b/,
  ]

  it('walks a real tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('finds no inline fallback', () => {
    const hits: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (banned.some((re) => re.test(line))) hits.push(`${relative(srcRoot, f)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })
})
