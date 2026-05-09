/**
 * Scheduled cron dispatch tests (api/scheduled.test.ts)
 *
 * Validates that each registered cron expression triggers exactly the right
 * handler and no others. Protects against the bug fixed in this commit:
 * the "* /15 * * * *" guard in scheduled() was not updated when commit
 * 441ec212 changed wrangler.toml to hourly ("0 * * * *"), causing the
 * calendar poller to never run AND pulse/digest to fire on every cron tick.
 *
 * Uses vi.mock to replace the four imported handler functions so the
 * test never needs a live D1 binding or SENDGRID/RESEND key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the handler modules before importing index.ts ───────────────────────
// vi.mock is hoisted by Vitest; the mock factories run before any imports.

const mockPollAllStaleFeeds = vi.fn().mockResolvedValue(undefined)
const mockHandleCheckImpact = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ data: { notifications_created: 0 } }), {
    headers: { 'content-type': 'application/json' },
  })
)
const mockHandleSendDailyDigests = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
)

vi.mock('./routes/calendar-feeds', () => ({
  handleListFeeds: vi.fn(),
  handleAddFeed: vi.fn(),
  handleDeleteFeed: vi.fn(),
  handleListEvents: vi.fn(),
  pollAllStaleFeeds: mockPollAllStaleFeeds,
}))

vi.mock('./routes/impact-trace', () => ({
  handleCheckImpact: mockHandleCheckImpact,
}))

vi.mock('./routes/digest-email', () => ({
  handleGenerateDigestEmail: vi.fn(),
  handleDigestPreview: vi.fn(),
  handleSendDigestEmail: vi.fn(),
  handleSendDailyDigests: mockHandleSendDailyDigests,
}))

// ── Build a minimal Env stub ──────────────────────────────────────────────────
// Only include the fields that scheduled() actually touches.
function makeEnv(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    DB: {
      prepare: () => ({
        all: () => Promise.resolve({ results: [] }),
        first: () => Promise.resolve(null),
        bind: () => ({
          all: () => Promise.resolve({ results: [] }),
          first: () => Promise.resolve(null),
        }),
      }),
    },
    SENDGRID_API_KEY: 'sg-test-key',
    RESEND_API_KEY: 'resend-test-key',
    ...overrides,
  }
}

// ── Helper: build a ScheduledEvent-like object ────────────────────────────────
function makeEvent(cron: string): { cron: string; scheduledTime: number; type: string } {
  return { cron, scheduledTime: Date.now(), type: 'scheduled' }
}

// ── Import the scheduled handler after mocks are in place ────────────────────
// Dynamic import so the vi.mock hoisting has already replaced the modules.
let scheduledHandler: (
  event: { cron: string; scheduledTime: number; type: string },
  env: Record<string, unknown>,
  ctx: object
) => Promise<void>

beforeEach(async () => {
  vi.clearAllMocks()
  // Re-import each time so module state is fresh. Vitest caches by default;
  // clearAllMocks() resets call counts but not the cached module.
  // Using the same cached import is fine here since the mocks are shared refs.
  if (!scheduledHandler) {
    const mod = await import('./index')
    scheduledHandler = (mod.default as unknown as { scheduled: typeof scheduledHandler }).scheduled
  }
})

// ─────────────────────────────────────────────────────────────────────────────

describe('scheduled() cron dispatch', () => {
  it('0 * * * * → pollAllStaleFeeds only, no pulse/digest', async () => {
    const env = makeEnv()
    await scheduledHandler(makeEvent('0 * * * *'), env, {})

    expect(mockPollAllStaleFeeds).toHaveBeenCalledTimes(1)
    expect(mockPollAllStaleFeeds).toHaveBeenCalledWith(env)
    expect(mockHandleCheckImpact).not.toHaveBeenCalled()
    expect(mockHandleSendDailyDigests).not.toHaveBeenCalled()
  })

  it('0 13 * * 1-5 → morning pulse (impact + member query) only, no digest/calendar', async () => {
    const env = makeEnv()
    await scheduledHandler(makeEvent('0 13 * * 1-5'), env, {})

    // pulse queries impact check
    expect(mockHandleCheckImpact).toHaveBeenCalledTimes(1)
    // no calendar poll, no digest
    expect(mockPollAllStaleFeeds).not.toHaveBeenCalled()
    expect(mockHandleSendDailyDigests).not.toHaveBeenCalled()
  })

  it('0 13 * * 1-5 → skips email body when SENDGRID_API_KEY absent', async () => {
    const env = makeEnv({ SENDGRID_API_KEY: undefined })
    await scheduledHandler(makeEvent('0 13 * * 1-5'), env, {})

    // Early return — no impact check, no member queries, no digest
    expect(mockHandleCheckImpact).not.toHaveBeenCalled()
    expect(mockPollAllStaleFeeds).not.toHaveBeenCalled()
    expect(mockHandleSendDailyDigests).not.toHaveBeenCalled()
  })

  it('0 11 * * * → handleSendDailyDigests only, no pulse/calendar', async () => {
    const env = makeEnv()
    await scheduledHandler(makeEvent('0 11 * * *'), env, {})

    expect(mockHandleSendDailyDigests).toHaveBeenCalledTimes(1)
    expect(mockHandleSendDailyDigests).toHaveBeenCalledWith(env)
    expect(mockPollAllStaleFeeds).not.toHaveBeenCalled()
    expect(mockHandleCheckImpact).not.toHaveBeenCalled()
  })

  it('*/15 * * * * (old cron, now retired) → no handler fires', async () => {
    // This cron was removed from wrangler.toml in commit 441ec212.
    // The switch default should warn and return cleanly with no side effects.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const env = makeEnv()

    await scheduledHandler(makeEvent('*/15 * * * *'), env, {})

    expect(mockPollAllStaleFeeds).not.toHaveBeenCalled()
    expect(mockHandleCheckImpact).not.toHaveBeenCalled()
    expect(mockHandleSendDailyDigests).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('*/15 * * * *')
    )
    warnSpy.mockRestore()
  })

  it('bogus cron → warns and returns, no side effects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const env = makeEnv()

    await scheduledHandler(makeEvent('5 4 * * *'), env, {})

    expect(mockPollAllStaleFeeds).not.toHaveBeenCalled()
    expect(mockHandleCheckImpact).not.toHaveBeenCalled()
    expect(mockHandleSendDailyDigests).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('5 4 * * *')
    )
    warnSpy.mockRestore()
  })
})
