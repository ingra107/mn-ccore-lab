// One caret style (Nick's mock, L1): a control that opens or folds shows the
// typed caret, 11px, through ui/Caret. Lucide up/down chevrons survive only as
// verbs: previous/next task, move up/down, hide a card. A chevron back on a
// picker fails here.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const VERBS = new Set([
  'components/tasks/TaskDetailPanel.tsx', // previous / next task
  'components/MemberFeaturedPublications.tsx', // move up / down
  'components/tasks/QuestionsCard.tsx', // hide the Needs you card
  'components/Layout.tsx', // back to top
])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

describe('one caret', () => {
  it('has no lucide up or down chevron outside the verb list', () => {
    const offenders = sources(SRC)
      .map((p) => relative(SRC, p).split(sep).join('/'))
      .filter((rel) => !VERBS.has(rel))
      .filter((rel) => /<Chev(ron(Down|Up))?\b|\bChevron(Down|Up)\s*[,}:]/.test(readFileSync(join(SRC, rel), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('styles the typed caret at 11px, so it stops reading as a dot', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/\.caret\{[^}]*font-size:11px/)
    expect(css).not.toMatch(/\.sr-car\{[^}]*font-size:9px/)
    expect(css).not.toMatch(/\.tk-caret\{[^}]*font-size:9px/)
  })
})
