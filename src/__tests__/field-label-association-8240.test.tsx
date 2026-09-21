// #8240: the Field primitive adoption sweep. Every create/edit form label now
// renders through ui/Field instead of a hand-rolled <label>. The thing a swap
// like this can silently break is the label -> control association (htmlFor
// -> id), which is what screen readers and click-to-focus depend on; the
// styling is the same one primitive everywhere, so this pins the wiring.
//
// Runs in real Chromium (vitest.config.ts browser mode): `label.control` is
// the browser's own resolution of the association, not a string compare.

import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import BugReportModal from '../components/BugReportModal'
import Field from '../components/ui/Field'
import { mount, cleanupMountsAfterEach } from './testMount'

cleanupMountsAfterEach()

describe('Field adoption keeps the label wired to its control (#8240)', () => {
  it('BugReportModal: "What happened?" labels the description textarea', async () => {
    // The modal portals into document.body, so query the document, not the host.
    await mount(
      <MemoryRouter>
        <BugReportModal open onClose={() => {}} />
      </MemoryRouter>,
      { ready: () => !!document.querySelector('#bug-description'), label: 'BugReportModal' },
    )
    const textarea = document.querySelector<HTMLTextAreaElement>('#bug-description')!
    const label = document.querySelector<HTMLLabelElement>('label[for="bug-description"]')!
    expect(label).not.toBeNull()
    expect(label.textContent?.trim()).toBe('What happened?')
    // The browser's own association, not a string compare on the attributes.
    expect(label.control).toBe(textarea)
    expect(textarea.labels?.[0]).toBe(label)
  })

  it('Field: required marker is decoration, not part of the accessible name', async () => {
    const host = await mount(
      <Field label="Question" required htmlFor="q" noContainer>
        <textarea id="q" />
      </Field>,
      { ready: (h) => h.querySelector('label'), label: 'Field' },
    )
    const label = host.querySelector<HTMLLabelElement>('label')!
    expect(label.control).toBe(host.querySelector('#q'))
    // The "*" is aria-hidden; the label's text still carries it visually.
    expect(label.querySelector('[aria-hidden="true"]')?.textContent).toBe('*')
    expect(label.childNodes[0].textContent).toBe('Question')
  })
})
