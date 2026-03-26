/**
 * Cloudflare Pages Function — catch-all for /api/* routes.
 *
 * This proxies all /api requests to the Worker handler defined in api/index.ts.
 * Pages Functions get D1 bindings from the Pages project environment
 * (configured in Cloudflare Dashboard > Pages > Settings > Functions > D1 bindings).
 */

import handler from '../../api/index'

interface Env {
  DB: D1Database
}

export const onRequest: PagesFunction<Env> = async (context) => {
  return handler.fetch(context.request, context.env as any)
}
