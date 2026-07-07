import { describe, it, expect } from 'vitest'
import { isHermesPrefix, stripHermesPrefix } from '../hermesRouting'

describe('isHermesPrefix', () => {
  it('matches the @hermes command prefix', () => {
    expect(isHermesPrefix('@hermes what should I do next?')).toBe(true)
    expect(isHermesPrefix('@Hermes DRAFT the note')).toBe(true) // case-insensitive
  })

  it('tolerates leading whitespace (trimmed before routing)', () => {
    expect(isHermesPrefix('   @hermes hi')).toBe(true)
  })

  it('rejects a mid-text @hermes mention (stays a comment)', () => {
    expect(isHermesPrefix('can you ask @hermes about this')).toBe(false)
    expect(isHermesPrefix('note: @hermes later')).toBe(false)
  })

  it('rejects tokens that only start with hermes (word boundary)', () => {
    expect(isHermesPrefix('@hermesx do a thing')).toBe(false)
    expect(isHermesPrefix('@hermetic seal')).toBe(false)
  })

  it('does not collide with other command prefixes', () => {
    expect(isHermesPrefix('@workon CLIF paper')).toBe(false)
    expect(isHermesPrefix('@quickchat hey')).toBe(false)
    expect(isHermesPrefix('@backlog idea here')).toBe(false)
  })
})

describe('stripHermesPrefix', () => {
  it('removes the leading @hermes token', () => {
    expect(stripHermesPrefix('@hermes do the thing')).toBe('do the thing')
    expect(stripHermesPrefix('@hermes   extra   spaces')).toBe('extra   spaces')
  })

  it('falls back to the original when nothing follows the token', () => {
    expect(stripHermesPrefix('@hermes')).toBe('@hermes')
    expect(stripHermesPrefix('@hermes   ')).toBe('@hermes')
  })
})
