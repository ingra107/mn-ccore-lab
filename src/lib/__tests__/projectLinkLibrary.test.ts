// ProjectLinkLibrary pure helpers — role partition, contract sort, date format.
// The archive group is what keeps role='archive' distinct from a tombstone, so
// the partition is the load-bearing piece: a link must never fall out of both
// buckets, and a legacy row with no `role` must land in `current`.

import { describe, it, expect } from 'vitest'
import { partitionByRole, sortForDisplay } from '../projectLinkLibrary'
import type { StoredLink } from '../../hooks/useApiData'

function link(over: Partial<StoredLink> & { id: string }): StoredLink {
  return {
    role: 'key',
    type: 'google_doc',
    canonical_url: `https://docs.google.com/document/d/${over.id}`,
    short_title: over.id,
    sort_order: 0,
    ...over,
  }
}

describe('partitionByRole', () => {
  it('splits key from archive', () => {
    const { current, archived } = partitionByRole([
      link({ id: 'a' }),
      link({ id: 'b', role: 'archive' }),
      link({ id: 'c' }),
    ])
    expect(current.map((l) => l.id)).toEqual(['a', 'c'])
    expect(archived.map((l) => l.id)).toEqual(['b'])
  })

  it('treats a missing role as current (pre-widening rows)', () => {
    const legacy = link({ id: 'old' })
    delete (legacy as Partial<StoredLink>).role
    const { current, archived } = partitionByRole([legacy])
    expect(current).toHaveLength(1)
    expect(archived).toHaveLength(0)
  })

  it('loses nothing — every input lands in exactly one bucket', () => {
    const input = [
      link({ id: 'a' }),
      link({ id: 'b', role: 'archive' }),
      link({ id: 'c', role: 'weird_future_role' }),
    ]
    const { current, archived } = partitionByRole(input)
    expect(current.length + archived.length).toBe(input.length)
    // An unknown role is NOT archived — it stays visible rather than vanishing.
    expect(current.map((l) => l.id)).toContain('c')
  })

  it('handles an empty list', () => {
    expect(partitionByRole([])).toEqual({ current: [], archived: [] })
  })
})

describe('sortForDisplay', () => {
  it('orders by link-contract type rank, then sort_order', () => {
    const sorted = sortForDisplay([
      link({ id: 'artifact', type: 'artifact' }),
      link({ id: 'doc2', type: 'google_doc', sort_order: 2 }),
      link({ id: 'iwd', type: 'iwd' }),
      link({ id: 'doc1', type: 'google_doc', sort_order: 1 }),
    ])
    expect(sorted.map((l) => l.id)).toEqual(['iwd', 'doc1', 'doc2', 'artifact'])
  })

  it('does not mutate its input', () => {
    const input = [link({ id: 'artifact', type: 'artifact' }), link({ id: 'iwd', type: 'iwd' })]
    sortForDisplay(input)
    expect(input.map((l) => l.id)).toEqual(['artifact', 'iwd'])
  })
})

// Date formatting is NOT tested here: it moved to `formatDbLocal` in src/lib/time.ts,
// the canonical stored-timestamp chokepoint, which owns its own coverage. This file
// previously carried a private formatLinkDate with a third, divergent implementation
// of the D1-timestamp fix (/simplify reuse pass, 2026-08-25).
