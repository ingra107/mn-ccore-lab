// matchLaunchCommand — the pure @workon/@quickchat matcher behind
// useLaunchCommands. Regression for 2026-07-06: @workon typed in the Today
// drawer's comment box posted as a team-visible Progress comment instead of
// firing a launch (seed-isolation violation — see the at-tag delegation
// design doc in PB Context/Decisions/2026-06-25).
//
// Run: npx vitest run --config vitest.config.lib.ts

import { describe, it, expect } from 'vitest'
import { matchLaunchCommand } from '../launchCommands'

describe('matchLaunchCommand', () => {
  it('matches @workon with a seed', () => {
    expect(matchLaunchCommand('@workon take a look at the submission from Amy')).toEqual({
      tag: 'workon',
      seed: 'take a look at the submission from Amy',
    })
  })

  it('matches @quickchat case-insensitively', () => {
    expect(matchLaunchCommand('@QuickChat hello there')).toEqual({ tag: 'quickchat', seed: 'hello there' })
  })

  it('matches a bare tag with an empty seed', () => {
    expect(matchLaunchCommand('@workon')).toEqual({ tag: 'workon', seed: '' })
  })

  it('does not match mid-text mentions (prose, not a command)', () => {
    expect(matchLaunchCommand('remember to @workon this later')).toBeNull()
  })

  it('does not match longer words sharing the prefix', () => {
    expect(matchLaunchCommand('@workonx foo')).toBeNull()
  })

  it('does not match other tags or plain comments', () => {
    expect(matchLaunchCommand('@hermes summarize this')).toBeNull()
    expect(matchLaunchCommand('take a look at the submission from Amy')).toBeNull()
  })
})
