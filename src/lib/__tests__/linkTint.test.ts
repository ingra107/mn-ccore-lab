/**
 * Today link tints: type -> tint name, and the kind-suffix strip used by the
 * drawer's link cards. Run: npx vitest run --config vitest.config.lib.ts
 */
import { describe, it, expect } from 'vitest'
import { linkTintForType, stripLinkKindSuffix } from '../linkIcon'
import { normalizeLink } from '../pbLinks.generated'

describe('linkTintForType', () => {
  it('maps the five tinted families', () => {
    expect(linkTintForType('google_doc')).toBe('doc')
    expect(linkTintForType('google_sheet')).toBe('sheet')
    expect(linkTintForType('google_slide')).toBe('slides')
    expect(linkTintForType('artifact')).toBe('artifact')
    expect(linkTintForType('gmail_thread')).toBe('email')
    expect(linkTintForType('gmail_draft')).toBe('email')
  })
  it('leaves everything else gray', () => {
    expect(linkTintForType('web')).toBeNull()
    expect(linkTintForType('box_folder')).toBeNull()
    expect(linkTintForType(null)).toBeNull()
    expect(linkTintForType(undefined)).toBeNull()
  })
  it('tints claude.ai artifact URLs through the canonical normalizer', () => {
    const t = normalizeLink('https://claude.ai/code/artifact/0123abcd-4567-89ab-cdef-0123456789ab')?.type
    expect(linkTintForType(t)).toBe('artifact')
  })
})

describe('stripLinkKindSuffix', () => {
  it('drops a trailing kind suffix', () => {
    expect(stripLinkKindSuffix('Aim 1 draft (Google Doc)')).toBe('Aim 1 draft')
    expect(stripLinkKindSuffix('Budget (Google Sheet)')).toBe('Budget')
    expect(stripLinkKindSuffix('Deck (Google Slides)')).toBe('Deck')
    expect(stripLinkKindSuffix('Re: ICC (Gmail thread)')).toBe('Re: ICC')
  })
  it('keeps other parentheses and bare titles', () => {
    expect(stripLinkKindSuffix('Plan (v2)')).toBe('Plan (v2)')
    expect(stripLinkKindSuffix('Aim 1 draft')).toBe('Aim 1 draft')
    expect(stripLinkKindSuffix('(Google Doc)')).toBe('(Google Doc)')
  })
})
