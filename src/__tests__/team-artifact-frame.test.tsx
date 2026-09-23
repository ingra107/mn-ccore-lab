// Guards TeamArtifactFrame's src + sandbox shape (#2411).
//
// Runs in real Chromium (vitest.config.ts browser mode), same pattern as
// html-artifact-frame.test.tsx.

import { describe, it, expect } from 'vitest'
import TeamArtifactFrame from '../components/TeamArtifactFrame'
import { mount as mountShared, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

async function mount(id: string, title: string): Promise<HTMLIFrameElement> {
  const host = await mountShared(<TeamArtifactFrame id={id} title={title} />, {
    ready: (h) => h.querySelector('iframe'),
    label: 'iframe',
  })
  return host.querySelector('iframe')!
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
