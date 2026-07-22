import { describe, it, expect } from 'vitest'
import { isHermesPrefix, stripHermesPrefix, isBacklogPrefix, stripBacklogPrefix } from '../hermesRouting'

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

  it('#891: matches a model-tag suffix, underscore or hyphen (was unreachable for underscore -- `_` is a regex word char, so a bare \\b never matched)', () => {
    expect(isHermesPrefix('@hermes_opus do the analysis')).toBe(true)
    expect(isHermesPrefix('@hermes-haiku quick summary')).toBe(true)
    expect(isHermesPrefix('@hermes_sonnet routine task')).toBe(true)
    expect(isHermesPrefix('@Hermes_Opus mixed case')).toBe(true) // case-insensitive
  })

  it('#891: an unrecognised underscore tag is a known, unchanged limitation (only opus/sonnet/haiku are literal alternatives)', () => {
    // A hyphenated bogus tag already passed pre-#891 ('-' is never a regex
    // word char, so \b held regardless of what followed it); an underscore
    // bogus tag still does not, same structural reason '@hermes_opus' failed
    // before this fix. Widening further was out of scope for #891 (row named
    // only opus/sonnet/haiku) -- documented, not silently fixed.
    expect(isHermesPrefix('@hermes-bogus still dispatches')).toBe(true)
    expect(isHermesPrefix('@hermes_bogus does not dispatch')).toBe(false)
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

  it('#891: leaves a model-tag suffix INTACT -- it must ride through to /api/ai-requests\' prompt field for PB\'s select_model() to parse (#217); do not widen this alongside HERMES_PREFIX_RE', () => {
    expect(stripHermesPrefix('@hermes_opus do the thing')).toBe('_opus do the thing')
    expect(stripHermesPrefix('@hermes-haiku quick one')).toBe('-haiku quick one')
  })
})

describe('isBacklogPrefix', () => {
  it('matches the @backlog command prefix, with or without a colon', () => {
    expect(isBacklogPrefix('@backlog this should be a shared component')).toBe(true)
    expect(isBacklogPrefix('@backlog: this should be a shared component')).toBe(true)
    expect(isBacklogPrefix('@Backlog DRAFT the idea')).toBe(true) // case-insensitive
  })

  it('tolerates leading whitespace (trimmed before routing)', () => {
    expect(isBacklogPrefix('   @backlog hi')).toBe(true)
  })

  it('rejects a mid-text @backlog mention (stays a comment)', () => {
    expect(isBacklogPrefix('file this on @backlog later')).toBe(false)
  })

  it('rejects tokens that only start with backlog (word boundary)', () => {
    expect(isBacklogPrefix('@backlogged idea')).toBe(false)
  })

  it('does not collide with other command prefixes', () => {
    expect(isBacklogPrefix('@hermes idea here')).toBe(false)
    expect(isBacklogPrefix('@workon CLIF paper')).toBe(false)
    expect(isBacklogPrefix('@quickchat hey')).toBe(false)
  })
})

describe('stripBacklogPrefix', () => {
  it('removes the leading @backlog token, with or without a colon', () => {
    expect(stripBacklogPrefix('@backlog do the thing')).toBe('do the thing')
    expect(stripBacklogPrefix('@backlog: do the thing')).toBe('do the thing')
    expect(stripBacklogPrefix('@backlog:   extra   spaces')).toBe('extra   spaces')
  })

  it('falls back to the original when nothing follows the token', () => {
    expect(stripBacklogPrefix('@backlog')).toBe('@backlog')
    expect(stripBacklogPrefix('@backlog:   ')).toBe('@backlog:')
  })
})
