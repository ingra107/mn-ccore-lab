import { describe, it, expect } from 'vitest'
import { statusToRestore } from '../undoStatus'

describe('statusToRestore', () => {
  it.each(['in_progress', 'waiting_external', 'blocked', 'todo'])('puts a %s task back as itself', (s) => {
    expect(statusToRestore(s)).toBe(s)
  })
  it('falls back to todo when the task was already done or unknown', () => {
    expect(statusToRestore('done')).toBe('todo')
    expect(statusToRestore(undefined)).toBe('todo')
    expect(statusToRestore(null)).toBe('todo')
    expect(statusToRestore('')).toBe('todo')
  })
})
