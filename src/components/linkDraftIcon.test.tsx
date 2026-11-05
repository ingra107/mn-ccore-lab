// The Gmail draft rule on every surface that draws a key link with its
// description (linkTypeFor in lib/linkIcon.ts; LinkRow's own test is
// today/primitives.test.tsx). Each one gets a thread URL described as a Gmail
// draft. Runs in real Chromium (vitest browser mode).
import { describe, it, expect } from 'vitest'
import type { ReactElement } from 'react'
import { mount, cleanupMountsAfterEach } from '../__tests__/testMount'
import { UndoToastProvider } from './UndoToast'
import LinkChip from './LinkChip'
import StoredLinkChip from './StoredLinkChip'
import KeyLinksEditor from './KeyLinksEditor'
import ProjectLinkLibrary from './ProjectLinkLibrary'
import { ProjectLinksCell } from './project/ProjectSleekList'
import { KeyLinkIcon } from './tasks/TaskGridView'
import { LinkCards } from './today/LinkCards'
import type { StoredLink } from '../hooks/useApiData'

cleanupMountsAfterEach()

const THREAD = 'https://mail.google.com/mail/u/1/#all/1a039e44363f84c7'
const DRAFT = 'lucide-pencil-line'
const MAIL = 'lucide-mail'

const stored = (short_title: string | null): StoredLink => ({
  id: 'link_1', role: 'key', type: 'gmail_thread', canonical_url: THREAD, short_title, sort_order: 1,
})

/** The class of the first link's icon. */
async function glyph(node: ReactElement): Promise<string> {
  const host = await mount(<UndoToastProvider>{node}</UndoToastProvider>, {
    ready: (h) => h.querySelector('a svg'),
    label: 'a link icon',
  })
  return host.querySelector('a svg')?.getAttribute('class') ?? ''
}

describe('a thread URL described as a Gmail draft gets the draft icon', () => {
  it('LinkCards', async () => {
    expect(await glyph(<LinkCards links={[stored('Gmail Draft')]} />)).toContain(DRAFT)
  })

  it('StoredLinkChip', async () => {
    expect(await glyph(<StoredLinkChip link={stored('Gmail Draft')} />)).toContain(DRAFT)
  })

  it('LinkChip', async () => {
    expect(await glyph(<LinkChip url={THREAD} type="gmail_thread" label="Gmail Draft" />)).toContain(DRAFT)
  })

  it('KeyLinksEditor', async () => {
    expect(await glyph(<KeyLinksEditor links={[{ url: THREAD, desc: 'Gmail Draft' }]} onSave={() => {}} />)).toContain(DRAFT)
  })

  it('TaskGridView', async () => {
    expect(await glyph(<KeyLinkIcon url={THREAD} label="Gmail Draft" />)).toContain(DRAFT)
  })

  it('ProjectSleekList', async () => {
    expect(await glyph(<ProjectLinksCell links={[stored('Gmail Draft')]} />)).toContain(DRAFT)
  })

  it('ProjectLinkLibrary, whose chip drops a "(Gmail draft)" suffix from the title it shows', async () => {
    expect(await glyph(<ProjectLinkLibrary links={[stored('Reply to Amy (Gmail draft)')]} isLoading={false} />)).toContain(DRAFT)
  })
})

describe('anything else keeps the icon it had', () => {
  it('a thread described as a thread, or in free words, stays a thread', async () => {
    expect(await glyph(<StoredLinkChip link={stored('Gmail thread')} />)).toContain(MAIL)
    expect(await glyph(<LinkCards links={[stored('Draft reply to Amy')]} />)).toContain(MAIL)
    expect(await glyph(<KeyLinkIcon url={THREAD} label="Draft reply to Amy" />)).toContain(MAIL)
  })

  it('a stored type on another kind of link still wins', async () => {
    const artifact = { ...stored('Gmail draft'), type: 'artifact', canonical_url: 'https://example.org/a' }
    expect(await glyph(<StoredLinkChip link={artifact} />)).toContain('lucide-sparkles')
  })
})
