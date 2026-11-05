// A key link's icon on the Hub: the URL says what it is, unless the link is
// described as a Gmail draft. Runs in real Chromium (vitest browser mode).
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LinkRow, type TaskLink } from './primitives'
import { UndoToastProvider } from '../UndoToast'
import { linkTypeFor } from '../../lib/linkIcon'

const THREAD = 'https://mail.google.com/mail/u/1/#all/1a039e44363f84c7'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
})

function glyph(links: TaskLink[]): string {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ host, root })
  flushSync(() => root.render(<UndoToastProvider><LinkRow links={links} /></UndoToastProvider>))
  return host.querySelector('a svg')?.getAttribute('class') ?? ''
}

describe('LinkRow icons', () => {
  it('a_thread_url_described_as_a_draft_gets_the_draft_icon', () => {
    expect(glyph([{ url: THREAD, desc: 'Gmail Draft' }])).toContain('lucide-pencil-line')
  })

  it('a_thread_url_with_no_description_stays_a_thread', () => {
    expect(glyph([{ url: THREAD }])).toContain('lucide-mail')
  })

  it('a stored thread type described as a draft still follows the description', () => {
    expect(glyph([{ url: THREAD, desc: 'gmail draft', type: 'gmail_thread' }])).toContain('lucide-pencil-line')
  })

  it('a stored type on any other link still wins', () => {
    expect(glyph([{ url: 'https://example.org/x', desc: 'Gmail draft', type: 'artifact' }])).toContain('lucide-sparkles')
  })
})

describe('linkTypeFor', () => {
  it('reads a draft from the description only on a Gmail URL', () => {
    expect(linkTypeFor(THREAD, 'Gmail Draft for Amy')).toBe('gmail_draft')
    expect(linkTypeFor('https://example.org/x', 'Gmail draft')).toBe('web')
  })

  it('leaves everything else to normalizeLink', () => {
    expect(linkTypeFor(THREAD, 'Gmail thread')).toBe('gmail_thread')
    expect(linkTypeFor(THREAD, null)).toBe('gmail_thread')
    expect(linkTypeFor(THREAD.replace('#all', '#drafts'), 'Gmail thread')).toBe('gmail_draft')
    expect(linkTypeFor('not a link')).toBeNull()
  })
})
