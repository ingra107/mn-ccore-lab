// A surface painted with var(--ink) FLIPS with the theme (dark in light mode,
// light in dark mode). Text on it must flip too: var(--cream) is the pair, as
// UndoToast and PageTooltip use. Fixed-white text (var(--ink-bright), rgba
// white) on it is white-on-near-white in dark mode, the #146 contrast bug on
// the bulk toolbar. This scans every component file for the pair so the class
// cannot come back through a different component.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p)
    return /\.tsx$/.test(name) ? [p] : []
  })
}

const FIXED_WHITE_TEXT = /\bcolor:\s*['"](?:var\(--ink-bright|rgba\(255,\s*255,\s*255|#fff)/
const INK_SURFACE = /\bbackground(?:Color)?:\s*['"]var\(--ink\)['"]/

describe('a var(--ink) surface never carries fixed-white text', () => {
  it('finds none in src/', () => {
    const hits: string[] = []
    for (const file of sources('src')) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!INK_SURFACE.test(line)) return
        // The whole file, not a window: the bulk toolbar's bar sat 70 lines
        // from the button styles that carried its white text.
        if (lines.some((l) => FIXED_WHITE_TEXT.test(l))) hits.push(`${file}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })
})
