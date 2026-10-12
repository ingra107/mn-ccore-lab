/**
 * #129 "Is this the paper?" moved from the project status write to the product
 * stage write (contract phase step 3): useSetProductStage calls
 * suggestPaperLink when a MANUSCRIPT product reaches its terminal rung. These
 * pin the helper itself: it offers the best title match once per project, and
 * stays quiet when the project already has a publication linked.
 */
import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { suggestPaperLink } from '../hooks/mutations/useProjectMutations'
import { publishedAPaper } from '../lib/products'

describe('publishedAPaper (the useSetProductStage condition)', () => {
  it('fires for a manuscript on its terminal rung only', () => {
    expect(publishedAPaper({ kind: 'manuscript', stage_is_terminal: 1 })).toBe(true)
    expect(publishedAPaper({ kind: 'manuscript', stage_is_terminal: 0 })).toBe(false)
  })
  it('never fires for another kind, terminal or not', () => {
    for (const kind of ['abstract', 'grant_application', 'award', 'honor', 'trial_ops', 'infrastructure']) {
      expect(publishedAPaper({ kind, stage_is_terminal: 1 }), kind).toBe(false)
      expect(publishedAPaper({ kind, stage_is_terminal: 0 }), kind).toBe(false)
    }
  })
})

function client(linked: boolean) {
  const qc = new QueryClient()
  qc.setQueryData(['projects'], [{ slug: 'sepsis-paper', title: 'Sedation variation in sepsis' }])
  qc.setQueryData(['publications', undefined], [
    { id: 'pub_1', title: 'Sedation variation in sepsis', journal: 'CHEST', year: 2026 },
    { id: 'pub_2', title: 'Something else entirely', journal: 'JAMA', year: 2025 },
  ])
  qc.setQueryData(['project-publications', 'all'], linked ? [{ project_slug: 'sepsis-paper' }] : [])
  return qc
}

describe('suggestPaperLink', () => {
  it('offers the matching publication once per project', () => {
    const showInfo = vi.fn()
    suggestPaperLink(client(false), showInfo, 'sepsis-paper')
    expect(showInfo).toHaveBeenCalledTimes(1)
    expect(showInfo.mock.calls[0][0]).toBe('Is this the paper? Sedation variation in sepsis (CHEST 2026)')
    suggestPaperLink(client(false), showInfo, 'sepsis-paper')
    expect(showInfo).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the project already has a publication linked', () => {
    const showInfo = vi.fn()
    const qc = client(true)
    qc.setQueryData(['projects'], [{ slug: 'other-slug-linked', title: 'Sedation variation in sepsis' }])
    qc.setQueryData(['project-publications', 'all'], [{ project_slug: 'other-slug-linked' }])
    suggestPaperLink(qc, showInfo, 'other-slug-linked')
    expect(showInfo).not.toHaveBeenCalled()
  })
})
