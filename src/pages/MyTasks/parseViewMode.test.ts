import { describe, it, expect } from 'vitest'
import { parseViewMode, VIEW_MODES } from './constants'

describe('parseViewMode', () => {
  it('accepts every view mode, Board included (a saved Board view reopened as List)', () => {
    for (const v of VIEW_MODES) expect(parseViewMode(v)).toBe(v)
  })
  it('falls back to List, the default the URL leaves out', () => {
    expect(parseViewMode(null)).toBe('list')
    expect(parseViewMode(undefined)).toBe('list')
    expect(parseViewMode('')).toBe('list')
    expect(parseViewMode('kanban')).toBe('list')
  })
})
