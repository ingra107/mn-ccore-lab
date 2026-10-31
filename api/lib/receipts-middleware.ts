// receipts-middleware.ts -- the one place a request gets its receipt origin
// (schema-v154), and the catch-all that keeps every PB write on the card.
//
// Mounted once on /api/*, after the viewer middleware (so the env it stamps is
// the env every route reads through E(c)):
//   - before the handler: env.RECEIPT_ORIGIN from the authenticating key
//     (api/lib/receipts.ts withReceiptOrigin). Every write boundary reads it,
//     so tasks / projects / products / comments / current-draft routes receipt
//     a PB write with no per-route call.
//   - after the handler: a PB-key non-GET that answered 2xx and that no
//     receipt boundary saw gets one summary line '<METHOD> <route pattern>'
//     (receiptCatchAll). The origin's `handled` flag is the counter: every
//     builder sets it, so the middleware knows the request wrote its own
//     lines (or decided, at a boundary, that it had nothing to record).

import type { Context, MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'
import type { Env } from '../types'
import { withReceiptOrigin, receiptCatchAll } from './receipts'

export interface ReceiptsMiddlewareCtx<C extends Context> {
  /** The request's env as routes will read it (E(c)). */
  getEnv: (c: C) => Env
  setEnv: (c: C, env: Env) => void
  /** A valid PB_API_KEY (SERVICE(c)): authentication decides, never a header. */
  pbKey: (c: C) => boolean
}

export function receiptsMiddleware<C extends Context>(ctx: ReceiptsMiddlewareCtx<C>): MiddlewareHandler {
  return async (c, next) => {
    const cc = c as C
    const env = withReceiptOrigin(ctx.getEnv(cc), cc.req.raw, ctx.pbKey(cc))
    ctx.setEnv(cc, env)
    await next()
    if (!env.RECEIPT_ORIGIN) return
    // routePath(c, -1): the matched route's own pattern, not this middleware's.
    let pattern = new URL(cc.req.url).pathname
    try { pattern = routePath(cc, -1) || pattern } catch { /* noqa: BLE001 -- total fallback on the line above */ }
    await receiptCatchAll(env, cc.req.method, pattern, cc.res?.status ?? 0)
  }
}
