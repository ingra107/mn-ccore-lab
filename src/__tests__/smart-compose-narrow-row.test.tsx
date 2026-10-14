// SmartCompose's action row on a phone-width field. Today's composer puts three
// tools, a "send to home" chip, the "Quick Chat launch" badge and Capture in one
// row; at 390px that row is ~400px wide in a ~296px slot. A nowrap row pushed
// Capture off the right edge (the page scrolled sideways) and squeezed it to
// 36px (prod probe 2026-10-14). The row now wraps and Capture keeps the right
// edge of the field, at full width, on whichever line it lands.
//
// The phone rule (.sc-bar .sc-tool 36px, min-width 36px) sits in an index.css
// media query this runner's viewport may not match, so the test applies the
// rule's own declarations, read from the real index.css text.
//
// Run: npx vitest run src/__tests__/smart-compose-narrow-row.test.tsx

import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SmartCompose from '../components/SmartCompose'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'
import css from '../index.css?raw'

cleanupMountsAfterEach()
afterEach(() => {
  vi.unstubAllGlobals()
  document.getElementById('sc-phone-rule')?.remove()
})

function phoneRule(): string {
  const m = css.match(/\.sc-bar \.sc-tool \{[^}]*\}/)
  if (!m) throw new Error('index.css lost the .sc-bar .sc-tool phone rule')
  return m[0]
}

function render(node: ReactElement): Promise<HTMLElement> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response))
  const style = document.createElement('style')
  style.id = 'sc-phone-rule'
  style.textContent = phoneRule()
  document.head.appendChild(style)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mountShared(
    <QueryClientProvider client={queryClient}>
      <div data-testid="field" style={{ width: 296 }}>{node}</div>
    </QueryClientProvider>,
    { ready: (h) => h.querySelector('textarea'), label: 'SmartCompose' },
  )
}

describe('SmartCompose action row at phone width', () => {
  it('keeps Capture inside the field, unsqueezed, with a chip and a command badge in the row', async () => {
    const host = await render(
      <SmartCompose
        onSubmit={async () => {}}
        value="@quickchat check the overnight wave results"
        onChange={() => {}}
        alwaysShowToolbar
        submitLabel="Capture"
        ownLaunchRouting
        hideKbdHint
        // The chip, plus a stand-in for the PI-only "Quick Chat launch" badge
        // (it renders only for a signed-in PI) and the Attach tool: on prod the
        // row's controls total ~400px in a 296px slot.
        toolbarExtra={<>
          <button type="button" style={{ height: 22, padding: '0 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>send to home</button>
          <span style={{ display: 'inline-block', width: 130, flexShrink: 0 }} aria-hidden="true" />
        </>}
      />,
    )
    const field = host.querySelector('[data-testid="field"]')!.getBoundingClientRect()
    const capture = host.querySelector('button[aria-label="Capture"]') as HTMLButtonElement
    expect(capture).toBeTruthy()
    const r = capture.getBoundingClientRect()
    expect(r.right).toBeLessThanOrEqual(field.right + 0.5)
    expect(r.left).toBeGreaterThanOrEqual(field.left - 0.5)
    // Not squeezed: the label fits its box.
    expect(capture.scrollWidth).toBeLessThanOrEqual(Math.ceil(r.width) + 1)
    // Right-aligned on its line.
    expect(field.right - r.right).toBeLessThan(2)
  })
})
