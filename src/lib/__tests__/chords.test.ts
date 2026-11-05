import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NAV_CHORDS, chordTarget, chordLabelFor } from '../../constants/chords'
import { PATHS } from '../../constants/paths'

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('chord map', () => {
  it('has no key twice', () => {
    const keys = NAV_CHORDS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('keeps the old aliases working but hidden', () => {
    expect(chordTarget('y')).toBe(PATHS.myTasks)
    expect(chordTarget('L')).toBe(PATHS.digestTab)
    expect(chordTarget('k')).toBe(PATHS.deadlines)
    expect(chordLabelFor(PATHS.myTasks)).toBe('G T')
    expect(chordLabelFor(PATHS.deadlines)).toBe('G E')
    expect(chordLabelFor(PATHS.digestTab)).toBe('G R')
  })
  it('shows no chord for a page the keys do not reach', () => {
    expect(chordLabelFor(PATHS.search)).toBeUndefined()
    expect(chordLabelFor(PATHS.tasks)).toBeUndefined()
  })
  it('the hook, the help panel and the palette read the map, not their own tables', () => {
    expect(src('hooks/useKeyboardShortcuts.ts')).not.toMatch(/navMap/)
    expect(src('components/ShortcutHelp.tsx')).not.toMatch(/keys: 'G [A-Z]'/)
    expect(src('components/CommandPalette.tsx')).not.toMatch(/shortcut: 'G [A-Z]'/)
  })
  it('the palette shows a literal key only when something binds it', () => {
    // Q is quick add (GlobalQuickAddModal); chords come through chordLabelFor. A
    // hint nothing binds was on Schedule Meeting ("M").
    const hints = [...src('components/CommandPalette.tsx').matchAll(/shortcut: '([^']+)'/g)].map((m) => m[1])
    expect(hints).toEqual(['Q'])
    expect(src('components/CommandPalette.tsx')).not.toMatch(/label: 'All Tasks'/)
  })
})
