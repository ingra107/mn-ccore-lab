import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { REAL_INPUT_TESTS } from '../../../vitest.realInputTests'

// A real-input test in the parallel suite races the other files (vitest.realInputTests.ts).
describe('real-input tests run apart', () => {
  it('every test that uses cdp() or userEvent is on the list', () => {
    const files = (readdirSync('src', { recursive: true }) as string[])
      .map((f) => join('src', f).replaceAll('\\', '/'))
      .filter((f) => /\.test\.tsx?$/.test(f) && !f.startsWith('src/lib/__tests__/') && !f.includes('__screenshots__'))
    const uses = files.filter((f) => /^import .*\b(cdp|userEvent)\b.* from 'vitest\/browser'/m.test(readFileSync(f, 'utf8')))
    expect(uses.sort()).toEqual([...REAL_INPUT_TESTS].sort())
  })
})
