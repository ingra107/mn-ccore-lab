// typed-request.test.ts — Z1.5
//
// Branded type construction tests. Each factory should:
//  - return the typed Request when preconditions are met
//  - return null when preconditions fail (caller emits 401/403)

import {
  toAuthedRequest,
  toPIRequest,
  toProjectVisibleRequest,
  type AuthedRequest,
  type PIRequest,
  type ProjectVisibleRequest,
} from './typed-request'

describe('typed-request wrappers', () => {
  it('toAuthedRequest returns the request when authed user present', () => {
    const raw = new Request('https://x/api/x')
    const authed: AuthedRequest | null = toAuthedRequest(raw, {
      email: 'a@b.com',
    })
    expect(authed).not.toBeNull()
    expect((authed as AuthedRequest).url).toBe('https://x/api/x')
  })

  it('toAuthedRequest returns null when no authed user', () => {
    const raw = new Request('https://x/api/x')
    const authed = toAuthedRequest(raw, null)
    expect(authed).toBeNull()
  })

  it('toPIRequest requires both authed AND isPi=true', () => {
    const raw = new Request('https://x/api/x')
    expect(toPIRequest(raw, { email: 'a@b.com' }, false)).toBeNull()
    expect(toPIRequest(raw, null, true)).toBeNull()
    expect(toPIRequest(raw, { email: 'a@b.com' }, true)).not.toBeNull()
  })

  it('toProjectVisibleRequest tags with the resolved projectId', () => {
    const raw = new Request('https://x/api/x')
    const tagged: ProjectVisibleRequest | null = toProjectVisibleRequest(
      raw,
      { email: 'a@b.com' },
      'proj-1',
    )
    expect(tagged).not.toBeNull()
    expect((tagged as ProjectVisibleRequest).projectId).toBe('proj-1')
  })

  it('toProjectVisibleRequest returns null when projectId is empty', () => {
    const raw = new Request('https://x/api/x')
    expect(toProjectVisibleRequest(raw, { email: 'a@b.com' }, '')).toBeNull()
  })

  it('toProjectVisibleRequest returns null when user is missing', () => {
    const raw = new Request('https://x/api/x')
    expect(toProjectVisibleRequest(raw, null, 'proj-1')).toBeNull()
  })
})
