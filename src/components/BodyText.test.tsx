// BodyText / LinkifiedText: free-text bodies make URLs and markdown links
// clickable (Nick 2026-10-22: "why any link in the description isn't a
// hyperlink i can click"). Runs in real Chromium; mounts with react-dom
// directly (no testing-library in the repo).

import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import BodyText from './BodyText'
import { plainTextNodes } from '../lib/plainTextNodes'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  for (let i = 0; i < 100; i++) {
    if (host.firstChild) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('BodyText never rendered')
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
})

describe('BodyText', () => {
  it('turns the screenshot URL into a new-tab link and keeps the trailing period as text', async () => {
    const host = await mount(
      <BodyText text="Check https://clif-icu.com/portal/project-runs." />,
    )
    const a = host.querySelector('a')!
    expect(a.getAttribute('href')).toBe('https://clif-icu.com/portal/project-runs')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(host.textContent!.endsWith('.')).toBe(true)
  })

  it('drops a closing paren from the URL', async () => {
    const host = await mount(<BodyText text="(see https://example.org/a/b)" />)
    expect(host.querySelector('a')!.getAttribute('href')).toBe('https://example.org/a/b')
    expect(host.textContent!.endsWith(')')).toBe(true)
  })

  it('renders a markdown link as its text, pointing at the url', async () => {
    const host = await mount(<BodyText text="Open [the portal](https://clif-icu.com/portal) now" />)
    const a = host.querySelector('a')!
    expect(a.textContent).toBe('the portal')
    expect(a.getAttribute('href')).toBe('https://clif-icu.com/portal')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(host.textContent).toBe('Open the portal now')
  })

  it('never makes a javascript: link', async () => {
    const host = await mount(<BodyText text="[x](javascript:alert(1)) and javascript:alert(2)" />)
    expect(host.querySelector('a')).toBeNull()
  })

  it('keeps line breaks (pre-wrap) and renders nothing for empty text', async () => {
    const host = await mount(<BodyText text={'a\nb'} />)
    expect((host.firstChild as HTMLElement).style.whiteSpace).toBe('pre-wrap')
    const empty = document.createElement('div')
    document.body.appendChild(empty)
    const root = createRoot(empty)
    root.render(<BodyText text={null} />)
    mounted.push({ host: empty, root })
    await new Promise((r) => setTimeout(r, 30))
    expect(empty.firstChild).toBeNull()
  })
})

describe('plainTextNodes (task editor plain-text fallback)', () => {
  it('marks a bare URL as a link and leaves trailing punctuation as text', () => {
    expect(plainTextNodes('see https://clif-icu.com/portal/project-runs.')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'text', text: 'https://clif-icu.com/portal/project-runs', marks: [{ type: 'link', attrs: { href: 'https://clif-icu.com/portal/project-runs' } }] },
      { type: 'text', text: '.' },
    ])
  })

  it('returns one text node when there is no URL', () => {
    expect(plainTextNodes('no links')).toEqual([{ type: 'text', text: 'no links' }])
  })
})
