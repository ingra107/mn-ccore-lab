// route-dsl.test.ts — Z1.1+Z1.2
//
// Unit tests for defineRoute() metadata registration and bindRegistryToHono().

import { Hono } from 'hono'
import {
  defineRoute,
  bindRegistryToHono,
  ROUTE_REGISTRY,
  _resetRegistryForTests,
  type ReadGate,
} from './route-dsl'

const OPEN_GATE: ReadGate = {
  isAnonymous: () => false,
  deny: () => new Response('denied', { status: 401 }),
}
const ANON_GATE: ReadGate = {
  isAnonymous: () => true,
  deny: () => new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
}

const jsonRes = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

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
      anonShape: { data: true },
      handler: async () => new Response(),
    })
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/y',
        auth: 'public',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).toThrow(/duplicate route/i)
  })

  it('accepts auth=public with an anonShape and no entity/visibility', () => {
    expect(() =>
      defineRoute({
        method: 'GET',
        path: '/api/test/z',
        auth: 'public',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).not.toThrow()
  })

  it('rejects a public GET with no anonShape (load-time half of the type error)', () => {
    expect(() =>
      // @ts-expect-error a public GET without anonShape must not type-check
      defineRoute({
        method: 'GET',
        path: '/api/test/no-shape',
        auth: 'public',
        handler: async () => new Response(),
      }),
    ).toThrow(/no anonShape/i)
  })

  it('rejects an anonShape on a route that is not a public GET', () => {
    expect(() =>
      // @ts-expect-error only a public GET may carry anonShape
      defineRoute({
        method: 'GET',
        path: '/api/test/authed-shape',
        auth: 'authed',
        anonShape: { data: true },
        handler: async () => new Response(),
      }),
    ).toThrow(/not a public GET/i)
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
      anonShape: { data: true },
      handler: async () => jsonRes({ data: 'a', secret: 's' }),
    })
    defineRoute({
      method: 'POST',
      path: '/api/bind-test/b',
      auth: 'authed',
      handler: async () => jsonRes({ data: 'b' }),
    })
    const app = new Hono()
    bindRegistryToHono(app, OPEN_GATE)
    const resA = await app.request('/api/bind-test/a')
    const resB = await app.request('/api/bind-test/b', { method: 'POST' })
    // An identified caller gets the handler's response untouched.
    expect(await resA.json()).toEqual({ data: 'a', secret: 's' })
    expect(await resB.json()).toEqual({ data: 'b' })
  })

  it('anonymous: a public GET is cut to its anonShape, an authed GET is denied before its handler', async () => {
    let authedHandlerRan = false
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/pub',
      auth: 'public',
      anonShape: { data: [{ id: true }], count: true },
      handler: async () => jsonRes({ data: [{ id: 'p1', note: 'private', nested: { x: 1 } }], count: 1, extra: 'x' }),
    })
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/priv',
      auth: 'authed',
      handler: async () => {
        authedHandlerRan = true
        return jsonRes({ data: 'secret' })
      },
    })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    const pub = await app.request('/api/bind-test/pub')
    expect(pub.status).toBe(200)
    expect(await pub.json()).toEqual({ data: [{ id: 'p1' }], count: 1 })
    const priv = await app.request('/api/bind-test/priv')
    expect(priv.status).toBe(401)
    expect(authedHandlerRan).toBe(false)
    // Hono routes HEAD through GET handlers; the gate covers it too.
    const head = await app.request('/api/bind-test/priv', { method: 'HEAD' })
    expect(head.status).toBe(401)
    expect(authedHandlerRan).toBe(false)
  })

  it('anonymous: a non-2xx from a public GET passes only the error envelope', async () => {
    defineRoute({
      method: 'GET',
      path: '/api/bind-test/err',
      auth: 'public',
      anonShape: { data: true },
      handler: async () => new Response(JSON.stringify({ error: 'Not found', detail: 'SELECT ...' }), { status: 404 }),
    })
    const app = new Hono()
    bindRegistryToHono(app, ANON_GATE)
    const res = await app.request('/api/bind-test/err')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})
