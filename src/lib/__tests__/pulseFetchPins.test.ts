// Code-review pins (#156 session close): the pulse refreshes on a timer, and a
// project page opened by its proj_ id waits for the slug before fetching.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detailQueryRef } from '../projectRef'

describe('usePulse', () => {
  it('refetches every five minutes on its own (it opts out of the lab-change refetch)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'hooks', 'usePulse.ts'), 'utf8')
    expect(src).toContain('refetchInterval: 5 * 60_000')
    expect(src).toContain('labChangeRefetch: false')
  })
})

describe('detailQueryRef', () => {
  it('waits for the project list when the URL names a proj_ id', () => {
    expect(detailQueryRef('proj_01ABC', undefined, true, false)).toBeUndefined()
  })
  it('uses the slug once the id resolves', () => {
    expect(detailQueryRef('proj_01ABC', { slug: 'clif-foundation' }, false, false)).toBe('clif-foundation')
  })
  it('starts at once on a slug URL, before the list answers', () => {
    expect(detailQueryRef('clif-foundation', undefined, true, false)).toBe('clif-foundation')
  })
  it('stops when the list answered without the project', () => {
    expect(detailQueryRef('nope', undefined, false, false)).toBeUndefined()
    expect(detailQueryRef('proj_01ABC', undefined, false, false)).toBeUndefined()
  })
  it('keeps going on a list error (the page shows its error state)', () => {
    expect(detailQueryRef('clif-foundation', undefined, false, true)).toBe('clif-foundation')
  })
})
