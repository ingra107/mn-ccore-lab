// scripts/check-color-jobs.mjs -- the color-job ratchet (rules-ui-design
// principle 21). Falsified both ways: a raw hue use must count, a job token
// or the gray ramp must not, and the baseline may only go down. Lives under
// api/ so the api vitest suite (pre-commit + CI) runs it, like the
// raw-wrangler-d1 gate test beside it.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
// @ts-expect-error -- plain .mjs, no type declarations; tests are not typechecked
import { findLeaks, compare, lowerBaseline, scan, BASELINE_PATH } from '../scripts/check-color-jobs.mjs'

type Leak = { line: number; family: string; text: string }
const leaks = (path: string, text: string): Leak[] => findLeaks(path, text)

describe('a raw hue use is a leak', () => {
  it('var(--gold) in an inline style', () => {
    const tsx = `export const A = () => <span style={{ color: 'var(--gold)' }} />\n`
    expect(leaks('src/components/A.tsx', tsx)).toMatchObject([{ line: 1, family: 'gold', text: 'var(--gold)' }])
  })

  it('a tint variant, an --sk- hue and an ACCENT_ constant', () => {
    const tsx = [
      `const a = 'var(--teal-hover)'`,
      `const b = 'var(--sk-gold)'`,
      `const c = withAlpha(ACCENT_GOLD, 20)`,
      `const d = 'var(--maroon)'`,
      `const e = 'var(--sk-urg)'`,
    ].join('\n')
    expect(leaks('src/components/B.tsx', tsx).map((l) => l.family)).toEqual(['teal', 'gold', 'gold', 'red', 'orange'])
  })

  it('a hue in a CSS rule outside the token blocks', () => {
    const css = `.x { color: var(--teal); }\n`
    expect(leaks('src/x.css', css)).toHaveLength(1)
  })

  it('a custom property on an ordinary selector is still a use (no laundering)', () => {
    const css = `.card { --edge: var(--gold); border-color: var(--edge); }\n`
    expect(leaks('src/x.css', css)).toHaveLength(1)
  })
})

describe('a color literal is a leak by the hue it draws', () => {
  it('rgba() triplets, other hexes, hsl() and oklch() are counted by hue', () => {
    const tsx = [
      `const a = 'rgba(122,0,25,0.1)'`,
      `const b = '#c9a84c'`,
      `const c = 'rgb(255 204 51)'`,
      `const d = 'rgba(34, 197, 94, 0.4)'`,
      `const e = '#dc2626'`,
      `const f = 'rgba(45,138,138,0.3)'`,
      `const g = 'hsl(30, 90%, 50%)'`,
      `const h = 'oklch(0.62 0.16 45)'`,
      `const i = '#9333ea'`,
    ].join('\n')
    expect(leaks('src/components/L.tsx', tsx).map((l) => l.family)).toEqual(
      ['red', 'gold', 'gold', 'green', 'red', 'teal', 'orange', 'orange', 'purple'],
    )
  })

  it('neutral literals (white, black, the slate grays) are not hues', () => {
    const tsx = [
      `const a = '#fff'`, `const b = 'rgba(0,0,0,0.2)'`, `const c = 'rgba(100,116,139,0.1)'`,
      `const d = '#94a3b8'`, `const e = '#20293a'`, `const f = 'oklch(0.86 0 0)'`, `const g = '&#10003;'`,
    ].join('\n')
    expect(leaks('src/components/N.tsx', tsx)).toEqual([])
  })

  it('a literal inside a :root token block defines a token; outside it, it is a use', () => {
    const css = `:root {\n  --lk-doc: #5b8def;\n}\n.x { color: #5b8def; }\n`
    expect(leaks('src/x.css', css)).toHaveLength(1)
  })
})

describe('--job-brand is gold outside .portal-shell', () => {
  it('counts in a portal file', () => {
    expect(leaks('src/components/StatsCard.tsx', `const a = 'var(--job-brand)'\n`)).toMatchObject([{ family: 'brand' }])
  })

  it('passes in a public file', () => {
    expect(leaks('src/pages/Home.tsx', `const a = 'var(--job-brand)'\n`)).toEqual([])
  })
})

describe('a job token or the gray ramp passes', () => {
  it('every --job-* token and the --sk-t* ramp', () => {
    const tsx = [
      `const a = 'var(--job-overdue)'`, `const b = 'var(--job-wants)'`, `const c = 'var(--job-milestone)'`,
      `const d = 'var(--job-accent)'`, `const e = 'var(--job-stale)'`,
      `const g = 'var(--job-accent-solid)'`, `const h = 'var(--sk-t1)'`, `const i = 'var(--sk-t3)'`,
    ].join('\n')
    expect(leaks('src/components/C.tsx', tsx)).toEqual([])
  })

  it('comments, imports and re-exports are not uses', () => {
    const tsx = [
      `import { ACCENT_GOLD, withAlpha } from '../lib/taskGrouping'`,
      `export { ACCENT_TEAL } from '../lib/taskGrouping'`,
      `// was var(--gold) before 2026-10-11`,
      `/* ACCENT_TEAL used to fill this */`,
      `const x = 1`,
    ].join('\n')
    expect(leaks('src/components/D.tsx', tsx)).toEqual([])
  })

  it('text ON a fill (--sk-ac-fg) is not a hue', () => {
    expect(leaks('src/components/E.tsx', `const s = 'var(--sk-ac-fg)'\n`)).toEqual([])
  })

  it('the theme token blocks in a .css file define the jobs from the palette', () => {
    const css = `@import "tailwindcss";\n:root {\n  --gold: #6b5420;\n  --job-wants: var(--sk-gold);\n}\n.dark { --job-accent: var(--sk-ac); }\n`
    expect(leaks('src/index.css', css)).toEqual([])
  })

  it('an allowlisted public page keeps its brand gold, but not other hues', () => {
    const tsx = `const a = 'var(--gold)'\nconst b = 'var(--maroon)'\n`
    expect(leaks('src/pages/Home.tsx', tsx).map((l) => l.family)).toEqual(['red'])
  })
})

describe('the baseline is a ratchet', () => {
  it('a rise in a known file fails, a new file fails, a drop passes', () => {
    const base = { 'src/a.tsx': 3, 'src/b.tsx': 2 }
    const r = compare({ 'src/a.tsx': 4, 'src/b.tsx': 1, 'src/new.tsx': 1 }, base)
    expect(r.rose.map((x: { file: string }) => x.file).sort()).toEqual(['src/a.tsx', 'src/new.tsx'])
    expect(r.fell.map((x: { file: string }) => x.file)).toEqual(['src/b.tsx'])
  })

  it('--update only lowers: it refuses a rise and drops emptied files', () => {
    const base = { 'src/a.tsx': 3, 'src/b.tsx': 2 }
    expect(lowerBaseline({ 'src/a.tsx': 5 }, base).error).toEqual(['src/a.tsx: 3 -> 5'])
    expect(lowerBaseline({ 'src/a.tsx': 1 }, base).baseline).toEqual({ 'src/a.tsx': 1 })
  })

  it('--init refuses to overwrite an existing baseline', () => {
    const before = fs.readFileSync(BASELINE_PATH, 'utf8')
    const r = spawnSync(process.execPath, ['scripts/check-color-jobs.mjs', '--init'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--init refuses')
    expect(fs.readFileSync(BASELINE_PATH, 'utf8')).toBe(before)
  }, 30_000) // spawns a node process; the 5 s default fails under load

  it('the real tree is at or under the committed baseline', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    const { counts } = scan()
    expect(compare(counts, baseline).rose).toEqual([])
  }, 30_000) // scans all of src/; the 5 s default fails under load
})
