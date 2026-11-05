import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8')

describe('deep-link consumers wait for the load, not for rows', () => {
  it("ProjectDetail's ?openTask= consumer is ready when the tasks query has answered", () => {
    const src = read('src/pages/ProjectDetail.tsx')
    const at = src.indexOf("useOpenParam(\n    'openTask'")
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, src.indexOf(')\n', src.indexOf('ready:', at)) + 1)
    expect(block).toContain('ready: !tasksPending')
    expect(block).not.toMatch(/projectTasks\.length/)
  })
})
