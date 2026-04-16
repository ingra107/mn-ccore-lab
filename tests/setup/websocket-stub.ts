/**
 * Playwright WebSocket stub for the `hub-realtime` Durable Object.
 *
 * Context: the Hub frontend opens a WebSocket to a `hub-realtime` endpoint
 * for live task/idea/decision updates.  That Durable Object lives in a
 * separate Workers repo (not this one) and the prod endpoint is currently
 * broken — it returns HTTP 400 on handshake.  Phase 0 dogfood caught this
 * during the everything-sprint.
 *
 * For local Miniflare tests we cannot (easily) run the DO in-process
 * alongside the Pages Worker, so we stub the handshake instead.  Any page
 * request to `**\/hub-realtime\/**` is fulfilled with a canned JSON body
 * shaped like a "connected" handshake message, and any actual `ws://` /
 * `wss://` upgrade is routed through Playwright's `page.routeWebSocket`
 * API where available so the client sees a friendly "connected" frame.
 *
 * Usage from a spec file:
 *
 *   import { test } from '@playwright/test'
 *   import { installWebSocketStub } from './setup/websocket-stub'
 *
 *   test.beforeEach(async ({ page }) => {
 *     await installWebSocketStub(page)
 *   })
 *
 * Or as a fixture (preferred for shared suites):
 *
 *   import { test as base } from '@playwright/test'
 *   import { installWebSocketStub } from '../setup/websocket-stub'
 *
 *   export const test = base.extend({
 *     page: async ({ page }, use) => {
 *       await installWebSocketStub(page)
 *       await use(page)
 *     },
 *   })
 */

import type { Page } from '@playwright/test'

/**
 * Install HTTP + WebSocket stubs for hub-realtime traffic on the given page.
 * Safe to call multiple times per test — second call is a no-op because
 * Playwright dedupes route patterns.
 */
export async function installWebSocketStub(page: Page): Promise<void> {
  // 1. HTTP side — any probing fetch to /hub-realtime/... returns a canned
  //    "connected" payload so health-check code paths don't throw.
  await page.route('**/hub-realtime/**', async (route) => {
    const req = route.request()
    if (req.method() === 'GET' || req.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'connected', stub: true }),
      })
      return
    }
    await route.continue()
  })

  // 2. WebSocket side — Playwright 1.48+ exposes page.routeWebSocket.
  //    Older versions don't; fall back to a no-op (the HTTP stub above
  //    prevents most flakes on its own).
  const pageAny = page as unknown as {
    routeWebSocket?: (
      url: string | RegExp,
      handler: (ws: {
        onMessage?: (cb: (msg: unknown) => void) => void
        send: (msg: string) => void
        close: () => void
      }) => void,
    ) => Promise<void>
  }

  if (typeof pageAny.routeWebSocket === 'function') {
    await pageAny.routeWebSocket(/hub-realtime/, (ws) => {
      // Send canned connected message on "upgrade"
      try {
        ws.send(JSON.stringify({ type: 'connected', stub: true }))
      } catch {
        // swallow — stub-only, we don't care if the client closed first
      }
      // Respond to any further client messages with an ack
      ws.onMessage?.(() => {
        try {
          ws.send(JSON.stringify({ type: 'ack', stub: true }))
        } catch {
          /* ignore */
        }
      })
    })
  }
}

/**
 * For environments where Playwright's WS routing isn't available, test specs
 * can call this to silence the real-time client entirely by injecting a
 * window flag the Hub frontend checks before opening a WebSocket.
 */
export async function disableRealtimeClient(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__HUB_REALTIME_DISABLED__ = true
  })
}
