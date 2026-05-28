// route-dsl.test.ts — Z1.1+Z1.2
//
// Unit tests for defineRoute() metadata registration and bindRegistryToHono().

import { Hono } from 'hono'
import {
  defineRoute,
  bindRegistryToHono,
  ROUTE_REGISTRY,
  _resetRegistryForTests,
} from './route-dsl'

describe('defineRoute()', () => {
  beforeEach(() => _resetRegistryForTests())

  it('records metadata in ROUTE_REGISTRY', () => {
    const handler = async () => new Response('ok')
    defineRoute({
      method: 'GET',
      path: '/api/test/x',
      auth: 'authed',
      entity: 'tasks',
      visibility: 'pb-aware',
      handler,
    })
    expect(ROUTE_REGISTRY).toHaveLength(1)
    expect(ROUTE_REGISTRY[0]).toMatchObject({
      method: 'GET',
      path: '/api/test/x',
      auth: 'authed',
      entity: 'tasks',
      visibility: 'pb-aware',
    })
    expect(ROUTE_REGISTRY[0].handler).toBe(handler)
  })

  it('rejects duplicate registrations of (method, path)', () => {
    defineRoute({
      method: 'GET',
      path: '/api/test/y',
      auth: 'public',
      handler: async () => new Response(),
    })
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/y',
        auth: 'public',
        handler: async () => new Response(),
      }),
    ).toThrow(/duplicate route/i)
  })

  it('accepts auth=public without entity/visibility', () => {
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/z',
        auth: 'public',
        handler: async () => new Response(),
      }),
    ).not.toThrow()
  })

  it('rejects unknown auth level', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defineRoute({
        method: 'GET',
        path: '/api/test/w',
        auth: 'wat' as any,
        handler: async () => new Response(),
      }),
    ).toThrow(/auth must be one of/i)
  })
})

describe('bindRegistryToHono()', () => {
  beforeEach(() => _resetRegistryForTests())

  it('binds every registered route to the Hono app', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/a',
      auth: 'public',
      handler: async () =>
        new Response(JSON.stringify({ data: 'a' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    defineRoute({
      method: 'POST',
      path: '/api/bind-test/b',
      auth: 'authed',
      handler: async () =>
        new Response(JSON.stringify({ data: 'b' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    })
    const app = new Hono()
    bindRegistryToHono(app)
    const resA = await app.request('/api/bind-test/a')
    const resB = await app.request('/api/bind-test/b', { method: 'POST' })
    expect(await resA.json()).toEqual({ data: 'a' })
    expect(await resB.json()).toEqual({ data: 'b' })
  })
})
