// ProjectLinkLibrary pure helpers — role partition, contract sort, date format.
// The archive group is what keeps role='archive' distinct from a tombstone, so
// the partition is the load-bearing piece: a link must never fall out of both
// buckets, and a legacy row with no `role` must land in `current`.

import { describe, it, expect } from 'vitest'
import { canChangeRole, kindFilterOptions, kindLabel, matchesKind, partitionByRole, partitionForProjectPage, sortForDisplay } from '../projectLinkLibrary'
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

// #2091: the project page renders ONE Links card. A stored row whose URL is also
// a key-link slot shows once, as the pinned chip, never again in the library.
describe('partitionForProjectPage', () => {
  const gdoc = (id: string) => `https://docs.google.com/document/d/${id}/edit`

  it('moves a current row matching a slot into pinned', () => {
    const { pinned, current, archived } = partitionForProjectPage(
      [link({ id: 'a', canonical_url: gdoc('A') }), link({ id: 'b', canonical_url: gdoc('B') })],
      [gdoc('A'), null, undefined],
    )
    expect(pinned.map((l) => l.id)).toEqual(['a'])
    expect(current.map((l) => l.id)).toEqual(['b'])
    expect(archived).toEqual([])
  })

  it('matches a raw slot URL to its canonical row (tab suffix, trailing space)', () => {
    const { pinned, current } = partitionForProjectPage(
      [link({ id: 'a', canonical_url: gdoc('A') })],
      [` https://docs.google.com/document/d/A/edit?tab=t.0 `],
    )
    expect(pinned.map((l) => l.id)).toEqual(['a'])
    expect(current).toEqual([])
  })

  it('never folds an archived row into pinned', () => {
    const { pinned, archived } = partitionForProjectPage(
      [link({ id: 'old', role: 'archive', canonical_url: gdoc('A') })],
      [gdoc('A')],
    )
    expect(pinned).toEqual([])
    expect(archived.map((l) => l.id)).toEqual(['old'])
  })

  it('loses nothing: every input lands in exactly one bucket', () => {
    const input = [
      link({ id: 'a', canonical_url: gdoc('A') }),
      link({ id: 'b', role: 'archive' }),
      link({ id: 'c' }),
      link({ id: 'd', role: 'derived', type: 'box_folder', canonical_url: 'https://app.box.com/folder/1' }),
    ]
    const { pinned, current, archived } = partitionForProjectPage(input, [gdoc('A'), '', null])
    expect(pinned.length + current.length + archived.length).toBe(input.length)
  })

  it('empty slots pin nothing', () => {
    const { pinned, current } = partitionForProjectPage([link({ id: 'a' })], [null, '', '   '])
    expect(pinned).toEqual([])
    expect(current).toHaveLength(1)
  })
})

describe('canChangeRole', () => {
  it('offers the archive control only on stored rows', () => {
    expect(canChangeRole(link({ id: 'k' }))).toBe(true)
    expect(canChangeRole(link({ id: 'x', role: 'archive' }))).toBe(true)
    // derived rows are synthesised per request; there is no row to update
    expect(canChangeRole(link({ id: 'd', role: 'derived' }))).toBe(false)
    // a product's current draft and its archived drafts move only through the route
    expect(canChangeRole(link({ id: 'c', role: 'current_draft', product_id: 'prd_1' }))).toBe(false)
    expect(canChangeRole(link({ id: 'h', role: 'archive', product_id: 'prd_1' }))).toBe(false)
  })
})

// #151: layout B, tier first. Task-owned rows feed "From tasks" (grouped by
// URL), a task URL every holder archived sits in Archived, and a task URL the
// project already holds is shadowed (shown once, as the project's).
describe('partitionForProjectPage — the From tasks tier (#151)', () => {
  const t = (id: string, url: string, role = 'key', task = 'Draft aims') =>
    link({ id, canonical_url: url, role, owner_table: 'tasks', task_id: `task_${id}`, task_title: task })

  it('every project AND task input lands in exactly one bucket', () => {
    const links = [link({ id: 'p1', canonical_url: 'u/p1' }), link({ id: 'p2', role: 'archive', canonical_url: 'u/p2' })]
    const tasks = [
      t('t1', 'u/a'), t('t2', 'u/a', 'archive', 'Other task'), // one current holder -> From tasks
      t('t3', 'u/b', 'archive'),                                 // every holder archived -> Archived
      t('t4', 'u/p1'), t('t5', 'u/p2'),                          // the project holds the URL -> shadowed
    ]
    const p = partitionForProjectPage(links, [], tasks)
    const taskRows = [...p.fromTasks, ...p.archivedFromTasks].flatMap((d) => d.rows).length + p.shadowed.length
    expect(taskRows).toBe(tasks.length)
    expect(p.pinned.length + p.current.length + p.archived.length).toBe(links.length)
    expect(p.fromTasks.map((d) => d.url)).toEqual(['u/a'])
    expect(p.fromTasks[0].link.id).toBe('t1')
    expect(p.fromTasks[0].rows.map((r) => r.id)).toEqual(['t1', 't2'])
    expect(p.archivedFromTasks.map((d) => d.url)).toEqual(['u/b'])
    expect(p.shadowed.map((r) => r.id)).toEqual(['t4', 't5'])
  })

  it('a promoted copy shows once: the project row, never the task row', () => {
    const p = partitionForProjectPage([link({ id: 'copy', canonical_url: 'u/x' })], [], [t('t', 'u/x')])
    expect(p.current.map((l) => l.id)).toEqual(['copy'])
    expect(p.fromTasks).toEqual([])
  })

  it('without task links the tier buckets are empty (the Milestone drawer)', () => {
    const p = partitionForProjectPage([link({ id: 'a' })], [])
    expect(p.fromTasks).toEqual([])
    expect(p.archivedFromTasks).toEqual([])
  })
})

describe('kind filter and labels (#151)', () => {
  const kinds = [{ key: 'aims', label: 'Aims', sort_order: 10 }, { key: 'protocol', label: 'Protocol', sort_order: 90 }]

  it('NULL kind is Unfiled; a key the vocabulary does not list shows raw', () => {
    expect(kindLabel(null, kinds)).toBe('Unfiled')
    expect(kindLabel('aims', kinds)).toBe('Aims')
    expect(kindLabel('budget', kinds)).toBe('budget')
  })

  it('matches by kind, Unfiled, or everything', () => {
    expect(matchesKind({ kind: 'aims' }, 'aims')).toBe(true)
    expect(matchesKind({ kind: 'aims' }, 'protocol')).toBe(false)
    expect(matchesKind({ kind: null }, 'unfiled')).toBe(true)
    expect(matchesKind({}, 'unfiled')).toBe(true)
    expect(matchesKind({ kind: 'aims' }, 'all')).toBe(true)
  })

  it('offers the kinds present in vocabulary order, then Unfiled; derived rows add nothing', () => {
    const opts = kindFilterOptions([
      { kind: 'protocol', role: 'key' }, { kind: 'aims', role: 'key' }, { kind: 'aims', role: 'archive' },
      { kind: null, role: 'key' }, { kind: null, role: 'derived' },
    ], kinds)
    expect(opts).toEqual([
      { value: 'aims', label: 'Aims', count: 2 },
      { value: 'protocol', label: 'Protocol', count: 1 },
      { value: 'unfiled', label: 'Unfiled', count: 1 },
    ])
  })
})
