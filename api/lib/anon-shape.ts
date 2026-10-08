// anon-shape.ts — what an anonymous caller may see of a public GET response.
//
// Every GET route declared `auth: 'public'` in the route DSL must carry an
// `anonShape` (route-dsl.ts makes a public GET without one a type error and a
// load-time throw). When auth is enforced and the caller has no identity,
// bindRegistryToHono runs the handler's response through projectAnonResponse
// with that shape. This is the ONE place anonymous reads are shaped.
//
// The shape is an ALLOWLIST. A key not named in the shape never reaches an
// anonymous caller, so a column added to a table tomorrow is private by
// default; it becomes public only when someone names it here on purpose.
// Signed-in callers and API-key callers never pass through this module.
//
// Shape grammar:
//   true          keep the value only if it is a scalar (string, number,
//                 boolean, null). An object or array under `true` is DROPPED:
//                 nested data has to be described, never passed whole.
//   [inner]       the value must be an array; each element is projected
//                 through `inner`.
//   { k: shape }  the value must be a plain object; only the named keys are
//                 kept, each projected through its own shape.
// A value whose type does not match its shape is dropped (fail closed).

export type AnonShape =
  | true
  | readonly [AnonShape]
  | { readonly [key: string]: AnonShape }

type Scalar = string | number | boolean | null

function isScalar(v: unknown): v is Scalar {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Project `value` through `shape`. Returns undefined when nothing survives. */
export function projectAnon(value: unknown, shape: AnonShape): unknown {
  if (shape === true) return isScalar(value) ? value : undefined
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) return undefined
    const inner = shape[0] as AnonShape
    return value.map((v) => {
      const p = projectAnon(v, inner)
      return p === undefined ? null : p
    })
  }
  if (!isPlainObject(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(shape)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    const p = projectAnon(value[key], (shape as Record<string, AnonShape>)[key])
    if (p !== undefined) out[key] = p
  }
  return out
}

// Error envelopes: helpers.error() emits { error }, the global onError emits
// { error, request_id }. A non-2xx keeps that envelope plus the route shape.
const ERROR_SHAPE: AnonShape = { error: true, request_id: true }

function rebuild(res: Response, body: unknown): Response {
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers })
}

/**
 * Apply `shape` to a handler's Response for an anonymous caller.
 *
 * A 2xx body that is not JSON cannot be projected, so it is refused with a
 * 500 and a console.error rather than passed through unshaped: a public route
 * that starts returning something else fails loud, it does not leak quietly.
 */
export async function projectAnonResponse(res: Response, shape: AnonShape, label: string): Promise<Response> {
  const ok = res.status >= 200 && res.status < 300
  const text = await res.text()
  let body: unknown
  try {
    body = text === '' ? null : JSON.parse(text)
  } catch {
    if (!ok) return rebuild(res, { error: 'Request failed' })
    console.error(`[anon-shape] ${label}: 2xx body is not JSON; refusing to send it unshaped`)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  // A non-2xx keeps the error envelope plus whatever the route's own shape
  // already allows (e.g. /api/health's `ok` on a 503). Never wider than 2xx.
  const errShape: AnonShape = typeof shape === 'object' && !Array.isArray(shape)
    ? { ...(shape as Record<string, AnonShape>), ...(ERROR_SHAPE as Record<string, AnonShape>) }
    : ERROR_SHAPE
  const projected = projectAnon(body, ok ? shape : errShape)
  return rebuild(res, projected === undefined ? null : projected)
}
