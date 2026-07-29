/**
 * taskLinkOverflow — unit tests for the #910 slot-vs-stored-links partition.
 *
 * The invariant under test: every live stored link is either slot-covered
 * (rendered editably by KeyLinksEditor) or returned as overflow (rendered as
 * a read-only chip). No predicate may leave a live row invisible — that was
 * the filed bug (a 4th typed link on a 3-slot task rendered nowhere and was
 * indistinguishable from "never saved").
 *
 * Run: npx vitest run --config vitest.config.lib.ts src/lib/__tests__/taskLinkOverflow.test.ts
 */

import { describe, it, expect } from 'vitest'
import { slotCanonicalUrls, taskOwnOverflowLinks } from '../taskLinkOverflow'
import { normalizeLink } from '../pbLinks.generated'
import type { StoredLink } from '../../hooks/useApiData'

function link(id: string, canonical_url: string, sort_order = 1, type = 'web'): StoredLink {
  return { id, role: 'key', type, canonical_url, short_title: null, sort_order }
}

describe('slotCanonicalUrls', () => {
  it('collects raw trimmed URLs and skips empty/null/undefined slots', () => {
    const set = slotCanonicalUrls(['https://example.com/a', null, undefined, '  ', ''])
    expect(set.has('https://example.com/a')).toBe(true)
    expect(set.has('')).toBe(false)
    expect(set.size).toBeGreaterThanOrEqual(1)
  })

  it('adds the PB-canonical form when it differs from the raw slot URL', () => {
    // Real transform pinned by probe 2026-07-29: the generated link contract
    // strips a #heading fragment from a Google Doc URL.
    const raw = 'https://docs.google.com/document/d/ABC123xyz/edit#heading=h.abc'
    const canonical = normalizeLink(raw)?.canonical_url
    expect(canonical).toBe('https://docs.google.com/document/d/ABC123xyz/edit')
    expect(canonical).not.toBe(raw) // guard: if the contract changes, fail loud
    const set = slotCanonicalUrls([raw])
    expect(set.has(raw)).toBe(true)
    expect(set.has(canonical!)).toBe(true)
  })
})

describe('taskOwnOverflowLinks', () => {
  it('returns the 4th+ links a 3-slot task silently dropped (the #910 shape)', () => {
    // The filed instance: gmail_thread + gmail_draft + 2 artifacts, 3 slots.
    const stored = [
      link('lnk_1', 'https://mail.google.com/mail/u/1/#all/19f61d9c71e5322f', 1, 'gmail_thread'),
      link('lnk_2', 'https://mail.google.com/mail/u/1/#drafts/19f944ed11401306', 1, 'gmail_draft'),
      link('lnk_3', 'https://claude.ai/code/artifact/e4312cbc', 2, 'artifact'),
      link('lnk_4', 'https://mn-ccore-lab.pages.dev/portal/artifacts/art_544b91b0', 2, 'artifact'),
    ]
    const slots = [
      'https://mail.google.com/mail/u/1/#all/19f61d9c71e5322f',
      'https://mail.google.com/mail/u/1/#drafts/19f944ed11401306',
      'https://mn-ccore-lab.pages.dev/portal/artifacts/art_544b91b0',
    ]
    const overflow = taskOwnOverflowLinks(stored, slots)
    expect(overflow.map((l) => l.id)).toEqual(['lnk_3'])
  })

  it('excludes a link whose canonical_url matches a slot only via canonicalization', () => {
    const rawSlot = 'https://docs.google.com/document/d/ABC123xyz/edit#heading=h.abc'
    const canonical = normalizeLink(rawSlot)!.canonical_url
    const stored = [link('lnk_doc', canonical, 1, 'google_doc')]
    expect(taskOwnOverflowLinks(stored, [rawSlot, null, null])).toEqual([])
  })

  it('degrades toward visibility: an unmatched near-miss renders as overflow, never disappears', () => {
    // Slot holds a URL the contract cannot relate to the stored row — the row
    // must surface (duplicate chip is the accepted cost; invisibility is not).
    const stored = [link('lnk_x', 'https://example.com/x', 1)]
    const overflow = taskOwnOverflowLinks(stored, ['https://example.com/x?utm=different', null, null])
    expect(overflow.map((l) => l.id)).toEqual(['lnk_x'])
  })

  it('returns all links when every slot is empty', () => {
    const stored = [link('lnk_a', 'https://a.example'), link('lnk_b', 'https://b.example')]
    expect(taskOwnOverflowLinks(stored, [null, null, null])).toHaveLength(2)
  })

  it('returns [] for undefined or empty input', () => {
    expect(taskOwnOverflowLinks(undefined, ['https://a.example'])).toEqual([])
    expect(taskOwnOverflowLinks([], ['https://a.example'])).toEqual([])
  })

  it('preserves the caller-supplied (sort_order, id) order', () => {
    const stored = [
      link('lnk_1', 'https://a.example', 1),
      link('lnk_2', 'https://b.example', 2),
      link('lnk_3', 'https://c.example', 2),
    ]
    expect(taskOwnOverflowLinks(stored, [null, null, null]).map((l) => l.id))
      .toEqual(['lnk_1', 'lnk_2', 'lnk_3'])
  })

  it('TOTAL COVERAGE: every stored link is slot-covered or in overflow — none vanish', () => {
    const slots = [
      'https://docs.google.com/document/d/ABC123xyz/edit#heading=h.abc',
      'https://example.com/x.',
      null,
    ]
    const covered = slotCanonicalUrls(slots)
    const stored = [
      link('lnk_1', 'https://docs.google.com/document/d/ABC123xyz/edit', 1, 'google_doc'),
      link('lnk_2', 'https://example.com/x', 1),
      link('lnk_3', 'https://unrelated.example/y', 2),
      link('lnk_4', 'https://another.example/z', 3),
    ]
    const overflow = taskOwnOverflowLinks(stored, slots)
    for (const l of stored) {
      const isCovered = covered.has(l.canonical_url)
      const inOverflow = overflow.some((o) => o.id === l.id)
      // Exactly one render path each — never neither.
      expect(isCovered || inOverflow).toBe(true)
      expect(isCovered && inOverflow).toBe(false)
    }
  })
})
