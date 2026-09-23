// Guards TeamArtifactFrame's src + sandbox shape (#2411), plus the
// login-loop fallback state machine (2026-09-23, following 0e955794).
//
// Runs in real Chromium (vitest.config.ts browser mode), same pattern as
// html-artifact-frame.test.tsx.

import { describe, it, expect, vi } from 'vitest'
import TeamArtifactFrame from '../components/TeamArtifactFrame'
import { PUBLIC_ARTIFACT_ORIGIN_FE, TEAM_ARTIFACT_READY_MESSAGE } from '../lib/artifactOrigin'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

async function mount(id: string, title: string): Promise<HTMLIFrameElement> {
  const host = await mountShared(<TeamArtifactFrame id={id} title={title} />, {
    ready: (h) => h.querySelector('iframe'),
    label: 'iframe',
  })
  return host.querySelector('iframe')!
}

/** Waits up to ~2s for `check(host)` to become truthy; throws `label` if not. */
async function waitFor(host: HTMLElement, check: (h: HTMLElement) => unknown, label: string) {
  for (let i = 0; i < 200; i++) {
    if (check(host)) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`${label} never became true`)
}

/** A real MessageEvent with a spoofable `origin`, dispatched on window —
 *  exercises the exact listener TeamArtifactFrame registers, not a mock. */
function postAs(origin: string, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, origin }))
}

describe('TeamArtifactFrame', () => {
  it('points src at the cookieless artifacts origin team route, not the Hub or a blob url', async () => {
    const iframe = await mount('art_deadbeef', 'Desk')
    expect(iframe.getAttribute('src')).toBe('https://mn-ccore-artifacts.pages.dev/a/team/art_deadbeef')
  })

  it('grants allow-same-origin — safe ONLY because src is a different SITE from the Hub', async () => {
    const iframe = await mount('art_deadbeef', 'Desk')
    const sandbox = (iframe.getAttribute('sandbox') || '').split(' ')
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
    // A refactor that pointed this component's src back at the Hub origin
    // while keeping allow-same-origin would be the #508 vulnerability class
    // reinstated. The origin assertion above is what makes this token safe.
    expect(iframe.getAttribute('src')).not.toContain('mn-ccore-lab.pages.dev')
  })

  it('delegates clipboard-write for deskkit\'s Copy-for-Claude button', async () => {
    const iframe = await mount('art_deadbeef', 'Desk')
    expect(iframe.getAttribute('allow')).toBe('clipboard-write')
  })

  it('is not a blob url — no lifecycle to revoke, real url handles in-page anchors natively', async () => {
    const iframe = await mount('art_deadbeef', 'Desk')
    expect(iframe.getAttribute('src')).not.toMatch(/^blob:/)
    expect(iframe.hasAttribute('srcdoc')).toBe(false)
  })
})

describe('TeamArtifactFrame — the login-loop fallback', () => {
  it('stays on the iframe when a valid ready message arrives before the grace window closes', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_ok" title="Desk" readyGraceMs={50} absoluteTimeoutMs={200} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    const iframe = host.querySelector('iframe')!
    iframe.dispatchEvent(new Event('load'))
    postAs(PUBLIC_ARTIFACT_ORIGIN_FE, TEAM_ARTIFACT_READY_MESSAGE)
    // Outlive both timers; the ready message must have cancelled them.
    await new Promise((r) => setTimeout(r, 300))
    expect(host.querySelector('iframe')).not.toBeNull()
    expect(host.textContent).not.toContain('Sign in to view this artifact.')
  })

  it('falls back when the iframe loads (the Access login page) but no ready message follows', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_blocked" title="Desk" readyGraceMs={30} absoluteTimeoutMs={5000} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    host.querySelector('iframe')!.dispatchEvent(new Event('load'))
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    // The iframe stays in the DOM (hidden), not unmounted — see the next
    // test: this is what lets a late ready message still recover.
    expect(host.querySelector('iframe')).not.toBeNull()
    expect((host.querySelector('iframe') as HTMLIFrameElement).style.display).toBe('none')
  })

  it('falls back on the absolute backstop even when `load` never fires', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_stuck" title="Desk" readyGraceMs={5000} absoluteTimeoutMs={40} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    expect(host.querySelector('iframe')).not.toBeNull()
    expect((host.querySelector('iframe') as HTMLIFrameElement).style.display).toBe('none')
  })

  it('recovers automatically when a ready message arrives AFTER the backstop already declared blocked', async () => {
    // The bug this guards: unmounting the iframe on 'blocked' destroys its
    // browsing context, so a load that was merely slower than
    // absoluteTimeoutMs — not actually stuck — could never deliver a late
    // ready message. The iframe must stay mounted (just hidden) so this
    // message can still be heard and the frame can recover without a reload.
    const host = await mountShared(
      <TeamArtifactFrame id="art_slow" title="Desk" readyGraceMs={5000} absoluteTimeoutMs={30} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    postAs(PUBLIC_ARTIFACT_ORIGIN_FE, TEAM_ARTIFACT_READY_MESSAGE)
    await waitFor(
      host,
      (h) => !h.textContent?.includes('Sign in to view this artifact.'),
      'fallback notice to clear',
    )
    const iframe = host.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).not.toBeNull()
    expect(iframe.style.display).not.toBe('none')
  })

  it('ignores a ready-shaped message from the wrong origin', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_spoof" title="Desk" readyGraceMs={30} absoluteTimeoutMs={40} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    postAs('https://evil.example', TEAM_ARTIFACT_READY_MESSAGE)
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
  })

  it('"Open to sign in" opens the same artifact url in a new tab', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_open" title="Desk" readyGraceMs={10} absoluteTimeoutMs={20} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const [openButton] = Array.from(host.querySelectorAll('button')).filter(
      (b) => b.textContent === 'Open to sign in',
    )
    openButton.click()
    expect(openSpy).toHaveBeenCalledWith(
      'https://mn-ccore-artifacts.pages.dev/a/team/art_open',
      '_blank',
      'noopener,noreferrer',
    )
    openSpy.mockRestore()
  })

  it('"Retry" swaps the fallback back for a fresh iframe', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_retry" title="Desk" readyGraceMs={10} absoluteTimeoutMs={20} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    const [retryButton] = Array.from(host.querySelectorAll('button')).filter((b) => b.textContent === 'Retry')
    retryButton.click()
    await waitFor(host, (h) => h.querySelector('iframe'), 'iframe after retry')
    expect(host.textContent).not.toContain('Sign in to view this artifact.')
  })

  it('auto-retries the moment the window regains focus', async () => {
    const host = await mountShared(
      <TeamArtifactFrame id="art_focus" title="Desk" readyGraceMs={10} absoluteTimeoutMs={20} />,
      { ready: (h) => h.querySelector('iframe'), label: 'iframe' },
    )
    await waitFor(host, (h) => h.textContent?.includes('Sign in to view this artifact.'), 'fallback notice')
    window.dispatchEvent(new Event('focus'))
    await waitFor(host, (h) => h.querySelector('iframe'), 'iframe after focus retry')
    expect(host.textContent).not.toContain('Sign in to view this artifact.')
  })
})
