// The artifacts shelf is how you find something weeks later, so "search finds
// nothing" fails silently — you conclude the artifact was never saved. These
// pin the two real artifacts on the shelf as of 2026-07-24.

import { describe, it, expect } from 'vitest'
import { filterArtifacts } from '../pages/portal/artifactGalleryFilter'
import type { GalleryArtifact } from '../hooks/useArtifacts'

function artifact(over: Partial<GalleryArtifact>): GalleryArtifact {
  return {
    id: 'art_x', title: 'Untitled', version: 1, task_id: null, project_id: null,
    created_by: 'claude-ai', content_type: 'html', visibility: 'team',
    created_at: '2026-07-24 00:00:00', updated_at: '2026-07-24 00:00:00', tags: [],
    ...over,
  }
}

const AIMS = artifact({
  id: 'art_aims',
  title: 'Aims Funnel Framework (Specific Aims reference)',
  tags: ['grant-writing', 'specific-aims'],
})
const TEACHING = artifact({
  id: 'art_teach',
  title: 'Agentic Coding for Medical Students (resource card)',
  tags: ['agentic-coding', 'teaching'],
})
const SHELF = [AIMS, TEACHING]

const none = new Set<string>()

describe('filterArtifacts', () => {
  it('returns everything with no tag and no query', () => {
    expect(filterArtifacts(SHELF, none, '')).toHaveLength(2)
    expect(filterArtifacts(SHELF, none, '   ')).toHaveLength(2)
  })

  it('finds an artifact by a word in its title', () => {
    expect(filterArtifacts(SHELF, none, 'medical')).toEqual([TEACHING])
    expect(filterArtifacts(SHELF, none, 'funnel')).toEqual([AIMS])
  })

  it('finds an artifact by a tag you did not click', () => {
    expect(filterArtifacts(SHELF, none, 'teaching')).toEqual([TEACHING])
  })

  it('ignores case and word order', () => {
    expect(filterArtifacts(SHELF, none, 'AIMS grant')).toEqual([AIMS])
    expect(filterArtifacts(SHELF, none, 'grant aims')).toEqual([AIMS])
  })

  it('finds Hermes-authored artifacts by the name shown on the card', () => {
    expect(filterArtifacts(SHELF, none, 'hermes')).toHaveLength(2)
  })

  it('composes with the tag chips instead of overriding them', () => {
    // searching a term that only matches AIMS, while standing on the teaching shelf
    expect(filterArtifacts(SHELF, new Set(['teaching']), 'funnel')).toEqual([])
    expect(filterArtifacts(SHELF, new Set(['teaching']), 'medical')).toEqual([TEACHING])
  })

  it('returns nothing rather than everything when a term matches nothing', () => {
    expect(filterArtifacts(SHELF, none, 'zzzznotathing')).toEqual([])
  })
})
