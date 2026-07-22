// mentionCommandTags.test.ts -- #891: the mention-dropdown must suggest ONLY
// plain @hermes (the sonnet default) while typing "@herm"/"@hermes", and
// surface the -opus/-haiku variants ONLY once '-' has been typed. Extracted
// from MentionInput.tsx precisely so this filtering logic is unit-testable
// without mounting the component (no RTL/jsdom harness exists in this repo).
import { describe, it, expect } from 'vitest'
import { KNOWN_COMMAND_TAGS, HERMES_MODEL_VARIANT_TAGS, isExactCommandTag, filterCommandTags } from '../mentionCommandTags'

describe('filterCommandTags — #891 dropdown gating', () => {
  it('suggests the base command tags on a bare prefix (unchanged #240 behavior)', () => {
    expect(filterCommandTags('herm').map(([k]) => k)).toEqual(['hermes'])
    expect(filterCommandTags('q').map(([k]) => k)).toEqual(['quickchat'])
  })

  it('suggests ONLY plain @hermes while mid-word — opus/haiku must not appear', () => {
    const result = filterCommandTags('herme')
    expect(result).toEqual([['hermes', KNOWN_COMMAND_TAGS.hermes]])
    expect(result.some(([k]) => k.includes('opus') || k.includes('haiku'))).toBe(false)
  })

  it('never shows a variant for any filter that has not reached the hyphen yet', () => {
    for (const filter of ['h', 'he', 'her', 'herm', 'herme', 'hermes']) {
      const keys = filterCommandTags(filter).map(([k]) => k)
      expect(keys.every((k) => !(k in HERMES_MODEL_VARIANT_TAGS))).toBe(true)
    }
  })

  it('surfaces the opus/haiku variants ONLY once "-" is typed', () => {
    expect(filterCommandTags('hermes-').map(([k]) => k).sort()).toEqual(['hermes-haiku', 'hermes-opus'])
  })

  it('narrows to a single variant as more of the tag is typed', () => {
    expect(filterCommandTags('hermes-op').map(([k]) => k)).toEqual(['hermes-opus'])
    expect(filterCommandTags('hermes-ha').map(([k]) => k)).toEqual(['hermes-haiku'])
  })

  it('does not surface hermes-sonnet (deliberately omitted -- identical outcome to bare @hermes)', () => {
    expect(filterCommandTags('hermes-').some(([k]) => k === 'hermes-sonnet')).toBe(false)
  })
})

describe('isExactCommandTag — #221 dropdown-close parity', () => {
  it('is true for a fully-typed base tag', () => {
    expect(isExactCommandTag('hermes')).toBe(true)
    expect(isExactCommandTag('backlog')).toBe(true)
  })

  it('#891: is also true for a fully-typed model variant, so Enter falls through to command routing instead of re-inserting a stale suggestion', () => {
    expect(isExactCommandTag('hermes-opus')).toBe(true)
    expect(isExactCommandTag('hermes-haiku')).toBe(true)
  })

  it('is false for a partial/prefix match', () => {
    expect(isExactCommandTag('herm')).toBe(false)
    expect(isExactCommandTag('hermes-')).toBe(false)
    expect(isExactCommandTag('hermes-op')).toBe(false)
  })
})
