/**
 * Cloudflare Pages Function — /assets/* : a MISSING hashed chunk must be a 404,
 * never the cached SPA fallback.
 *
 * Why this exists (2026-09-14, found while verifying a deploy): Pages answers
 * any unknown path with index.html as `200 text/html` (SPA mode), and
 * public/_headers stamps `/assets/*` with `Cache-Control: max-age=31536000,
 * immutable` — on THAT response too. So a browser that asks for a chunk the
 * edge cannot serve at that instant (the seconds around a deploy, before the
 * new asset set has propagated, or a stale tab reloading onto the new
 * index.html) caches an HTML document under the chunk's URL for a year. Every
 * later visit imports that HTML as a module, the import rejects, and the
 * portal renders an empty <div id="root">. Measured in the PI's own Chrome
 * profile: /assets/dateUtils-BOZ-d9vO.js served from cache as 4,930 bytes of
 * HTML while the network copy was 2,826 bytes of JS.
 *
 * The comment in _headers assumed a missing chunk 404s. It did not. This
 * makes it true: a fallback HTML body for an asset path becomes a 404 with
 * `no-store`, so nothing wrong is ever cached under an asset URL. Real assets
 * pass through untouched (their immutable header still comes from _headers).
 *
 * Why not `_redirects` (`/assets/*  /404.html  404`) instead of a Function on
 * every asset request? Two documented reasons: Pages `_redirects` supports only
 * 301/302/303/307/308 and 200, so a 404 rule is rejected; and "redirects are
 * always followed, regardless of whether or not an asset matches", so the rule
 * would fire on chunks that exist. The content-type check is the only shape
 * that leaves real assets alone. Cost: one Worker invocation per uncached
 * asset request — the immutable header makes repeat loads free.
 */

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const res = await context.env.ASSETS.fetch(context.request)
  const type = res.headers.get('content-type') || ''
  if (res.ok && /text\/html/i.test(type)) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }
  return res
}
