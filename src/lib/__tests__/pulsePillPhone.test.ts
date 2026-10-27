// #156 review: the What's new / Lab pulse pill renders on phones too. It used
// to sit behind `hidden sm:flex` (the old banner's slot), so a phone never saw
// a release or an announcement and "reading on the phone clears the laptop"
// could not happen.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('PulsePill on phones', () => {
  it('the top-bar slot is not hidden below sm', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'components', 'PortalLayout.tsx'), 'utf8')
    const at = src.indexOf('<PulsePill />')
    expect(at).toBeGreaterThan(-1)
    const wrapper = src.slice(src.lastIndexOf('<div', at), at)
    expect(wrapper).not.toMatch(/\bhidden\b/)
  })
})
