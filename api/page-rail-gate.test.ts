// scripts/check-page-rail.mjs -- the main + rail layout ratchet (s79). Each
// shape of a hand-built rail must count; the card grids, equal-column grids and
// the token's own definition must not. Lives under api/ so the api vitest suite
// runs it, like the color-jobs gate test beside it.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
// @ts-expect-error -- plain .mjs, no type declarations; tests are not typechecked
import { findRailMarks, compare, scan, BASELINE_PATH } from '../scripts/check-page-rail.mjs'
import fs from 'node:fs'

type Mark = { shape: string; line: number }
const marks = (file: string, text: string): Mark[] => findRailMarks(file, text)
const shapes = (file: string, text: string) => marks(file, text).map((m) => m.shape)

describe('a hand-built main + rail layout counts', () => {
  it('the rail token as a grid track, in CSS and in an inline style', () => {
    expect(shapes('src/x.css', '.g { grid-template-columns: minmax(0, 1fr) var(--col-rail); }')).toEqual(['rail-token'])
    expect(shapes('src/X.tsx', "const s = { gridTemplateColumns: 'minmax(0, var(--col-main)) var(--col-rail)' }")).toEqual(['rail-token'])
  })

  it('the rail token as a flex basis or a Tailwind width', () => {
    expect(shapes('src/x.css', '.aside { flex: 0 0 var(--col-rail); }')).toEqual(['rail-token'])
    expect(shapes('src/X.tsx', 'const a = <aside className="w-[var(--col-rail)] shrink-0" />')).toEqual(['rail-token'])
  })

  it('a literal px rail: 1fr 320px, 320px 1fr, and the Tailwind arbitrary value', () => {
    expect(shapes('src/x.css', '.g { display: grid; grid-template-columns: 1fr 320px; }')).toEqual(['px-grid'])
    expect(shapes('src/x.css', '.g { grid-template-columns: 340px minmax(0, 1fr); }')).toEqual(['px-grid'])
    expect(shapes('src/X.tsx', 'const c = "grid lg:grid-cols-[1fr_320px] gap-6"')).toEqual(['px-grid'])
    expect(shapes('src/X.tsx', 'const c = "grid grid-cols-[minmax(0,1fr)_300px]"')).toEqual(['px-grid'])
  })

  it('a multi-line template', () => {
    const css = ['.g {', '  display: grid;', '  grid-template-columns:', '    minmax(0, 1fr)', '    320px;', '}'].join('\n')
    expect(shapes('src/x.css', css)).toEqual(['px-grid'])
  })

  it('a 12-col grid with a col-span main + aside pair, reported at the grid-cols-12 line', () => {
    const tsx = ['<div className="lg:grid lg:grid-cols-12 lg:gap-12">', '  <aside className="lg:col-span-4 xl:col-span-3" />', '  <div className="lg:col-span-8 xl:col-span-9" />', '</div>'].join('\n')
    expect(marks('src/X.tsx', tsx)).toEqual([{ shape: 'col-span', line: 1, src: expect.any(String) }])
  })
})

describe('layouts that are not a rail do not count', () => {
  it('card grids (repeat/minmax), equal columns and percentage grids', () => {
    expect(marks('src/x.css', '.g { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }')).toEqual([])
    expect(marks('src/X.tsx', "const s = { gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }")).toEqual([])
    expect(marks('src/X.tsx', 'const c = "grid grid-cols-1 lg:grid-cols-3 gap-6"')).toEqual([])
    expect(marks('src/x.css', '.g { grid-template-columns: 2fr 1fr; }')).toEqual([])
  })

  it('a 12-col grid without a span pair, a small px track, and a commented-out rail', () => {
    expect(marks('src/X.tsx', 'const c = "grid grid-cols-12"')).toEqual([])
    expect(marks('src/x.css', '.g { grid-template-columns: 1fr 120px; }')).toEqual([])
    expect(marks('src/x.css', '/* grid-template-columns: 1fr var(--col-rail) */ .g { color: red; }')).toEqual([])
  })

  it('the token definition and the --page-width calc', () => {
    expect(marks('src/x.css', ':root { --col-rail: 320px; --page-width: calc(var(--col-main) + var(--col-rail)); }')).toEqual([])
  })
})

describe('the ratchet', () => {
  it('a rise fails, a fall passes, a new file with a mark fails', () => {
    const found = { 'src/a.css': [{ shape: 'px-grid', line: 1, src: '' }, { shape: 'px-grid', line: 2, src: '' }] }
    expect(compare(found, { 'src/a.css': 1 }).rises).toHaveLength(1)
    expect(compare(found, { 'src/a.css': 2 }).rises).toHaveLength(0)
    expect(compare(found, { 'src/a.css': 3 }).falls).toHaveLength(1)
    expect(compare(found, {}).rises).toHaveLength(1)
  })

  it('the repo as committed has no rise over the baseline, and the CLI exits 0', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    expect(compare(scan(), baseline).rises).toEqual([])
    const r = spawnSync(process.execPath, ['scripts/check-page-rail.mjs'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
  })
})
