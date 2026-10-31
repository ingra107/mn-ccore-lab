// Prepared first step in the task drawer (Nick's picks 2026-10-30: B1 drawer +
// B4 instruction first, draft never collapsed, orange when changed). Runs in
// real Chromium (vitest browser mode) with fetch stubbed.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PacketBlock, type PacketPayload } from './PacketBlock'
import { segmentBody } from '../../lib/packetBody'
import { CardTags } from '../tasks/TaskCardRow'
import { waitFor } from '../../__tests__/testMount'

let mounted: { host: HTMLElement; root: Root }[] = []
afterEach(() => {
  mounted.forEach(({ host, root }) => { root.unmount(); host.remove() })
  mounted = []
  vi.restoreAllMocks()
})

const BODY = 'Hi Lianne,\nI would use ICC 0.05 for the power calc.\nCan we meet Thursday?'
const payload = (state: 'ready' | 'changed' | 'unverified', reasons: string[] = []): PacketPayload => ({
  packet: { id: 'pk1' },
  version: {
    version: 2, manifest_hash: 'abc',
    instruction: 'review the 2 highlighted answers.', minutes: 5,
    body: BODY,
    calls: [
      { title: 'ICC value', decision: 'Used 0.05, from the pilot.', anchor: 'ICC 0.05' },
      { title: 'Meeting day', decision: 'Offered Thursday.', anchor: 'Thursday' },
    ],
    deliverable: { kind: 'gmail_draft', url: 'https://mail.google.com/draft/1', to: 'lianne@umn.edu', subject: 'Power calc' },
  },
  freshness: { state, reasons },
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function mountPacket(get: PacketPayload | { packet: null }, onPost?: (url: string) => Response) {
  const calls: string[] = []
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST') { calls.push(url); return onPost ? onPost(url) : json({}) }
    return json(get)
  })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <QueryClientProvider client={new QueryClient()}>
      <div className="tk"><PacketBlock taskId="t1" /></div>
    </QueryClientProvider>,
  )
  mounted.push({ host, root })
  return { host, calls }
}

describe('segmentBody', () => {
  it('marks each anchor with its call number and keeps the rest as text', () => {
    const segs = segmentBody(BODY, payload('ready').version!.calls)
    expect(segs.filter((s) => s.n).map((s) => [s.n, s.text])).toEqual([[1, 'ICC 0.05'], [2, 'Thursday']])
    expect(segs.map((s) => s.text).join('')).toBe(BODY)
  })

  it('skips an anchor that is absent or overlaps an earlier one', () => {
    const segs = segmentBody('abcdef', [
      { title: 'a', decision: '', anchor: 'bcd' },
      { title: 'b', decision: '', anchor: 'cde' },
      { title: 'c', decision: '', anchor: 'zzz' },
    ])
    expect(segs.filter((s) => s.n).map((s) => s.n)).toEqual([1])
  })
})

describe('PacketBlock', () => {
  it('renders nothing when the task has no packet', async () => {
    const { host } = await mountPacket({ packet: null })
    await new Promise((r) => setTimeout(r, 50))
    expect(host.querySelector('[data-testid="packet-block"]')).toBeNull()
  })

  it('ready: instruction first, numbered calls, whole draft with numbered highlights', async () => {
    const { host } = await mountPacket(payload('ready'))
    await waitFor(() => host.querySelector('[data-testid="packet-block"]'), 'packet')
    const kids = [...host.querySelector('[data-testid="packet-block"]')!.children].map((c) => c.getAttribute('data-testid'))
    expect(kids.slice(0, 4)).toEqual(['packet-freshness', 'packet-instruction', 'packet-calls', 'packet-draft'])
    expect(host.querySelector('[data-testid="packet-instruction"]')!.textContent).toContain('Start here: review the 2 highlighted answers.')
    expect(host.querySelectorAll('[data-testid="packet-calls"] li').length).toBe(2)
    const body = host.querySelector('.tk-pk-body')!
    // the superscript number sits inside the highlight, so compare the plain text
    expect(body.textContent!.replace(/\d$/gm, '')).toContain('Hi Lianne,')
    expect(body.textContent).toContain('Can we meet Thursday')
    expect([...body.querySelectorAll('mark')].map((m) => m.getAttribute('data-n'))).toEqual(['1', '2'])
    expect(host.querySelector('.tk-tag.tk-ac')!.textContent).toBe('Ready')
  })

  it('changed: orange tag with the reasons', async () => {
    const { host } = await mountPacket(payload('changed', ['Lianne replied 10:42']))
    await waitFor(() => host.querySelector('.tk-tag.tk-stale'), 'stale tag')
    expect(host.querySelector('[data-testid="packet-freshness"]')!.textContent).toContain('Lianne replied 10:42')
    expect(host.querySelector('.tk-tag.tk-ac')).toBeNull()
  })

  it('unverified: grey line, never Ready', async () => {
    const { host } = await mountPacket(payload('unverified', ['thread not checked']))
    await waitFor(() => host.querySelector('.tk-tag.tk-n'), 'grey tag')
    expect(host.textContent).not.toContain('Ready')
    expect(host.querySelector('[data-testid="packet-freshness"]')!.textContent).toContain('thread not checked')
  })

  it('Use posts version and hash, then opens the draft url', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { host, calls } = await mountPacket(payload('ready'), () => json({ url: 'https://mail.google.com/draft/1' }))
    await waitFor(() => host.querySelector('.tk-pk-acts'), 'actions')
    const bodies: string[] = []
    const f = window.fetch as unknown as { mock: { calls: [unknown, RequestInit?][] } }
    ;(host.querySelector('.tk-pk-acts .tk-ask-go') as HTMLButtonElement).click()
    await expect.poll(() => calls).toEqual(['/api/packets/pk1/use'])
    f.mock.calls.forEach(([, init]) => { if (init?.method === 'POST') bodies.push(String(init.body)) })
    expect(JSON.parse(bodies[0])).toEqual({ version: 2, manifest_hash: 'abc' })
    await expect.poll(() => open.mock.calls.some((c) => c[0] === 'https://mail.google.com/draft/1')).toBe(true)
  })

  it('409 shows the reasons and the button reads "Refresh, then use"', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { host } = await mountPacket(payload('ready'), () => json({ reasons: ['A reply landed'] }, 409))
    await waitFor(() => host.querySelector('.tk-pk-acts'), 'actions')
    ;(host.querySelector('.tk-pk-acts .tk-ask-go') as HTMLButtonElement).click()
    await waitFor(() => host.querySelector('[data-testid="packet-refused"]'), 'refusal')
    expect(host.querySelector('[data-testid="packet-refused"]')!.textContent).toContain('A reply landed')
    expect(host.querySelector('.tk-pk-acts .tk-ask-go')!.textContent).toBe('Refresh, then use')
  })

  it('Dismiss posts and says the draft stays in Gmail', async () => {
    const { host, calls } = await mountPacket(payload('ready'))
    await waitFor(() => host.querySelector('.tk-pk-dis'), 'dismiss')
    ;(host.querySelector('.tk-pk-dis') as HTMLButtonElement).click()
    await waitFor(() => host.querySelector('[data-testid="packet-dismissed"]'), 'dismissed note')
    expect(calls).toEqual(['/api/packets/pk1/dismiss'])
    expect(host.textContent).toContain('Dismissed here; draft stays in Gmail.')
  })
})

describe('row tag', () => {
  const tags = (state: string | null) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    root.render(<div className="tk"><CardTags task={{ packet_state: state }} isNew={false} /></div>)
    mounted.push({ host, root })
    return host
  }

  it('ready is teal, changed is orange, unverified and null show nothing', async () => {
    const ready = tags('ready')
    await waitFor(() => ready.querySelector('.tk-tag'), 'ready tag')
    expect(ready.querySelector('.tk-tag.tk-ac')!.textContent).toBe('Ready')
    const changed = tags('changed')
    await waitFor(() => changed.querySelector('.tk-tag'), 'changed tag')
    expect(changed.querySelector('.tk-tag.tk-stale')!.textContent).toBe('Changed')
    expect(tags('unverified').querySelector('.tk-tag')).toBeNull()
    expect(tags(null).querySelector('.tk-tag')).toBeNull()
  })
})
