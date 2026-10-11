// SmartCompose has ONE look, read from page tokens, so the field keeps a
// visible edge in light and dark mode (UI principle 20: an input must look
// like an input). It used to default to a hex-pinned dark theme with pale ink
// on a 2% white fill; four callers that never passed theme="light" shipped an
// edgeless field on the light page. The `theme` prop is gone so no caller can
// pick that look again; the @ts-expect-error below fails tsc if it returns.
//
// Run: npx vitest run src/__tests__/smart-compose-field-edge.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmartCompose from '../components/SmartCompose'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()
afterEach(() => vi.unstubAllGlobals())

function render(node: ReactElement): Promise<HTMLElement> {
  // useTeamSlugs (inside MentionInput) fires a real fetch on mount.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mountShared(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>, {
    ready: (h) => h.querySelector('textarea'),
    label: 'SmartCompose',
  })
}

describe('SmartCompose field edge (principle 20)', () => {
  it('draws the field from page tokens, not hex-pinned dark ink', async () => {
    const host = await render(<SmartCompose onSubmit={async () => {}} alwaysShowToolbar />)
    const style = host.querySelector('textarea')!.getAttribute('style') ?? ''
    expect(style).toContain('var(--border-subtle)')
    expect(style).toContain('var(--cream)')
    expect(style).toContain('var(--ink)')
    expect(style).not.toMatch(/rgba\(255,\s*255,\s*255/)
    expect(style).not.toContain('#e2e8f0')
  })

  it('toolbar buttons use token colors too', async () => {
    const host = await render(<SmartCompose onSubmit={async () => {}} alwaysShowToolbar />)
    const btn = host.querySelector('button[aria-label="Mention someone"]')!
    const style = btn.getAttribute('style') ?? ''
    expect(style).toContain('var(--border-subtle)')
    expect(style).toContain('var(--slate)')
  })

  it('offers no theme prop to choose', () => {
    // @ts-expect-error theme was removed; a caller can no longer pick a look
    const el = <SmartCompose onSubmit={async () => {}} theme="dark" />
    expect(el).toBeTruthy()
  })
})
