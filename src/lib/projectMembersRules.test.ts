// Who may remove whom, and the self-removal signal (#145).
import { describe, it, expect } from 'vitest'
import { addableMembers, canRemoveMember, memberInitials, memberLabel, removedSelfOutOfProject } from './projectMembersRules'

describe('canRemoveMember', () => {
  it('lets a member remove themself', () => {
    expect(canRemoveMember({ slug: 'casey-eddington', isPi: false }, 'casey-eddington')).toBe(true)
  })
  it('lets a PI remove anyone', () => {
    expect(canRemoveMember({ slug: 'nick-ingraham', isPi: true }, 'casey-eddington')).toBe(true)
  })
  it('does not offer a non-PI the button for someone else', () => {
    expect(canRemoveMember({ slug: 'casey-eddington', isPi: false }, 'nate-mesfin')).toBe(false)
  })
  it('offers nothing before the viewer slug is known', () => {
    expect(canRemoveMember({ slug: '', isPi: false }, '')).toBe(false)
  })
})

describe('removedSelfOutOfProject', () => {
  it('is true for removed + empty list (the viewer lost the project)', () => {
    expect(removedSelfOutOfProject({ data: [], project_id: 'p1', removed: true })).toBe(true)
  })
  it('is false when the list still comes back', () => {
    const m = { slug: 'a', name: 'A', preferred_name: null, photo_url: null, member_type: null, email: null, added_by: 'x', created_at: '' }
    expect(removedSelfOutOfProject({ data: [m], project_id: 'p1', removed: true })).toBe(false)
  })
  it('is false when nothing was removed', () => {
    expect(removedSelfOutOfProject({ data: [], project_id: 'p1', removed: false })).toBe(false)
  })
})

describe('labels and picker', () => {
  it('falls back to the API name for a slug the static directory does not know', () => {
    expect(memberLabel({ slug: 'zz-new-person', name: 'Zed Person', preferred_name: null })).toBe('Zed Person')
    expect(memberLabel({ slug: 'zz-new-person', name: 'Zed Person', preferred_name: 'Zee' })).toBe('Zee')
  })
  it('makes two-letter initials', () => {
    expect(memberInitials('Casey Eddington')).toBe('CE')
    expect(memberInitials('Nate')).toBe('NA')
    expect(memberInitials('')).toBe('?')
  })
  it('offers only people not already on the project', () => {
    const team = [{ slug: 'a' }, { slug: 'b' }, { slug: undefined }]
    expect(addableMembers(team, [{ slug: 'a' }])).toEqual([{ slug: 'b' }])
  })
})
