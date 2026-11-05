import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { taskLinkFor, TASK_LINK_PATH } from '../taskLink'
import { PATHS } from '../../constants/paths'

describe('taskLinkFor', () => {
  it('opens the task through ?open=, the param My Tasks reads', () => {
    expect(taskLinkFor('task_01ABC')).toBe('/portal/my-tasks?open=task_01ABC')
  })
  it('uses the My Tasks path the router uses', () => {
    expect(TASK_LINK_PATH).toBe(PATHS.myTasks)
  })
  it('escapes an id that is not URL-safe', () => {
    expect(taskLinkFor('a&b c')).toBe('/portal/my-tasks?open=a%26b%20c')
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('no surface hand-builds a task link', () => {
  it('no source file writes ?open= / ?openTask= / ?task= against the task pages', () => {
    const bad: string[] = []
    const repo = join(__dirname, '..', '..', '..')
    const roots = ['src', 'api', 'shared', 'functions'].map((d) => join(repo, d))
    for (const f of roots.flatMap((r) => walk(r))) {
      if (f.endsWith('taskLink.ts')) continue
      const src = readFileSync(f, 'utf8')
      src.split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return
        if (/(my-tasks|PATHS\.myTasks|PATHS\.tasks)[^\n]*[?&](open|openTask|task)=/.test(line)) bad.push(`${f}:${i + 1}`)
      })
    }
    expect(bad).toEqual([])
  })
})
