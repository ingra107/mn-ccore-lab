// Guards that a Hermes answer renders as markdown, not as raw asterisks.
//
// Hermes writes markdown -- the system prompt's own structured-tail section is
// markdown, and its answers use numbered lists and **bold** unprompted. This
// component rendered the prose as pre-wrap plain text, so a structured answer
// arrived with its markup showing (Nick, 2026-09-08, reading a meeting answer:
// "is hermes trying to do md formatting? ... we should make it so that it
// works"). The fenced ```hermes tail must keep parsing out to pills, and human
// comments elsewhere deliberately stay plain -- only this component changed.
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with react-dom
// directly -- the repo carries no testing-library (same pattern as
// src/components/ui/Field.test.tsx).

import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import HermesResponse from './HermesResponse'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  // Citations render react-router <Link>s, so a router has to be in scope.
  root.render(<MemoryRouter>{node}</MemoryRouter>)
  mounted.push({ host, root })
  for (let i = 0; i < 100; i++) {
    if (host.firstChild) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('HermesResponse never rendered')
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
})

// The shape of the real answer that prompted the fix.
const REAL_ANSWER = [
  'Straight from the transcript\'s closing minutes, CLIF still needs to answer:',
  '',
  '1. **Time horizon** — what timeframe is CLIF building for?',
  '2. **Convening mission** — has it changed?',
  '',
  'Parker also said the steering committee needs to meet on its own first.',
].join('\n')

describe('HermesResponse — markdown', () => {
  it('renders **bold** as <strong>, not as literal asterisks', async () => {
    const host = await mount(<HermesResponse content={REAL_ANSWER} />)
    const strongs = [...host.querySelectorAll('strong')].map((e) => e.textContent)
    expect(strongs).toContain('Time horizon')
    expect(strongs).toContain('Convening mission')
    // The regression this replaces: the raw markers reaching the reader.
    expect(host.textContent).not.toContain('**')
  })

  it('renders a numbered list as a real <ol>, one <li> per item', async () => {
    const host = await mount(<HermesResponse content={REAL_ANSWER} />)
    const ol = host.querySelector('ol')
    expect(ol).not.toBeNull()
    expect(ol!.querySelectorAll('li').length).toBe(2)
  })

  it('keeps the surrounding prose', async () => {
    const host = await mount(<HermesResponse content={REAL_ANSWER} />)
    expect(host.textContent).toContain('CLIF still needs to answer')
    expect(host.textContent).toContain('steering committee needs to meet on its own first')
  })

  it('renders a plain answer with no markdown unchanged', async () => {
    const host = await mount(<HermesResponse content={'Yes — the meeting is at 2pm.'} />)
    expect(host.textContent).toContain('Yes — the meeting is at 2pm.')
    expect(host.querySelector('strong')).toBeNull()
  })

  it('never emits raw HTML from a model-authored body', async () => {
    // MarkdownView builds React elements and never uses dangerouslySetInnerHTML,
    // so an injected tag has to surface as literal text. Asserted here because
    // this body is written by a model, not by a trusted author.
    const host = await mount(
      <HermesResponse content={'before <img src=x onerror="alert(1)"> after'} />,
    )
    expect(host.querySelector('img')).toBeNull()
    expect(host.textContent).toContain('<img src=x onerror="alert(1)">')
  })

  it('still parses the fenced hermes tail into pills, and keeps it out of the prose', async () => {
    const content = [
      'The steering committee owns this one.',
      '',
      '```hermes',
      JSON.stringify({
        citations: [{ type: 'project', slug: 'clif-steering-committee', title: 'CLIF Steering Committee' }],
        findings: [{ value: '1.2M', label: 'hospitalizations in the federated cohort' }],
      }),
      '```',
    ].join('\n')
    const host = await mount(<HermesResponse content={content} />)
    expect(host.textContent).toContain('CLIF Steering Committee')
    expect(host.textContent).toContain('1.2M')
    // The fence itself is metadata — it must never render as prose.
    expect(host.textContent).not.toContain('```')
    expect(host.textContent).not.toContain('"citations"')
  })
})
