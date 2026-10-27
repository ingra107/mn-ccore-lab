// A product's draft rows (schema-v149) keep their kind picker on the project
// page; only the role control is gone (third cold review, 2026-10-26: one
// permission had been hiding both).

import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ProjectLinkLibrary from '../components/ProjectLinkLibrary'
import type { LinkKind, StoredLink } from '../hooks/useApiData'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

const kinds = [{ key: 'manuscript_draft', label: 'Manuscript draft', sort_order: 40 }] as LinkKind[]
const links: StoredLink[] = [
  { id: 'd1', role: 'current_draft', product_id: 'prd_1', owner_table: 'projects', type: 'google_doc',
    canonical_url: 'https://docs.google.com/document/d/1DRAFT/edit', short_title: 'Main paper v3', sort_order: 0 } as StoredLink,
  { id: 'k1', role: 'key', owner_table: 'projects', type: 'web', canonical_url: 'https://example.com/a',
    short_title: 'Protocol', sort_order: 1 } as StoredLink,
]

describe('ProjectLinkLibrary on a product draft row', () => {
  it('shows the kind picker on both rows and the archive control only on the project-wide one', async () => {
    const h = await mount(
      <MemoryRouter><ProjectLinkLibrary links={links} kinds={kinds} onSetKind={() => {}} onSetRole={() => {}} /></MemoryRouter>,
      { ready: (x) => x.querySelectorAll('[aria-label^="Kind:"]').length >= 2, label: 'ProjectLinkLibrary draft kind' },
    )
    expect(h.querySelectorAll('[aria-label^="Kind:"]').length).toBe(2)
    expect(h.querySelectorAll('button[aria-label^="Archive link"]').length).toBe(1)
  })
})
