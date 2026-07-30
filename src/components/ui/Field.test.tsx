// Guards the Field primitive's contract, since it is now the shared
// labeled-field wrapper adopted across every "Create X" modal
// (CreateProjectModal, CreateDecisionModal, CreateTaskModal): the label
// text, the optional required asterisk, the field-container wrapper
// (skippable via noContainer), and the labelId prop that lets a caller wire
// aria-labelledby onto a non-labelable child (CreateTaskModal's Owner field
// is a role="group" div, not an input, so htmlFor alone can't associate it).
//
// Runs in real Chromium (vitest.config.ts browser mode). Mounts with
// react-dom directly -- the repo carries no testing-library (see
// src/__tests__/html-artifact-frame.test.tsx for the same pattern).

import { describe, it, expect, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Field from './Field'

let mounted: { host: HTMLElement; root: Root }[] = []

async function mount(node: ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  mounted.push({ host, root })
  // Field itself renders synchronously (no effects), but React 19 commits
  // asynchronously and the first commit in a fresh browser instance is
  // measurably slower than later ones -- poll rather than assume one tick
  // (or a fixed tick) is enough (mirrors html-artifact-frame.test.tsx).
  for (let i = 0; i < 100; i++) {
    if (host.firstChild) return host
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Field never rendered')
}

afterEach(() => {
  for (const { host, root } of mounted) {
    root.unmount()
    host.remove()
  }
  mounted = []
})

describe('Field', () => {
  it('renders the label and wraps children in .field-container by default', async () => {
    const host = await mount(
      <Field label="Title" htmlFor="x">
        <input id="x" />
      </Field>,
    )
    expect(host.querySelector('label')?.textContent).toContain('Title')
    expect(host.querySelector('.field-container input#x')).not.toBeNull()
  })

  it('shows a required asterisk only when required is set', async () => {
    const withReq = await mount(
      <Field label="Owner" required>
        <div />
      </Field>,
    )
    expect(withReq.querySelector('label')?.textContent).toContain('*')

    const without = await mount(
      <Field label="Owner">
        <div />
      </Field>,
    )
    expect(without.querySelector('label')?.textContent).not.toContain('*')
  })

  it('skips the field-container wrapper when noContainer is set', async () => {
    const host = await mount(
      <Field label="Priority" noContainer>
        <div data-testid="child" />
      </Field>,
    )
    expect(host.querySelector('.field-container')).toBeNull()
    expect(host.querySelector('[data-testid="child"]')).not.toBeNull()
  })

  it('sets labelId on the label so a role="group" child can aria-labelledby it', async () => {
    const host = await mount(
      <Field label="Owner (responsible)" htmlFor="task-assignee" labelId="task-assignee-label" noContainer>
        <div id="task-assignee" role="group" aria-labelledby="task-assignee-label" />
      </Field>,
    )
    const label = host.querySelector('label')!
    expect(label.id).toBe('task-assignee-label')
    const group = host.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-labelledby')).toBe(label.id)
  })
})
