/**
 * Normalizer fallback tests (B3 Task 8a, 2026-06-21).
 *
 * Verifies that normalizeLink(url)?.type → iconForType(type) yields the
 * correct 15-type brand icon for a raw URL — i.e., the normalizer fallback
 * path used in LinksBar / today/LinkRow / KeyLinksEditor / LinkChip /
 * TaskGridView when no stored link.type is present.
 *
 * Run: npx vitest run --config vitest.config.lib.ts
 */

import { describe, it, expect } from 'vitest'
import { normalizeLink } from '../pbLinks.generated'
import { iconForType } from '../linkIcon'
import { FileText, Mail, PencilLine, Globe, Box, FolderGit2, CircleDot, Sheet } from 'lucide-react'

describe('normalizeLink fallback → iconForType', () => {
  it('Google Doc URL → FileText icon with Google blue token', () => {
    const type = normalizeLink('https://docs.google.com/document/d/abc123/edit')?.type
    expect(type).toBe('google_doc')
    const { Icon, color } = iconForType(type)
    expect(Icon).toBe(FileText)
    expect(color).toBe('var(--link-google-doc)')
  })

  it('Google Sheet URL → Sheet icon', () => {
    const type = normalizeLink('https://docs.google.com/spreadsheets/d/xyzxyz/edit')?.type
    expect(type).toBe('google_sheet')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(Sheet)
  })

  it('Gmail thread URL → Mail icon', () => {
    const type = normalizeLink('https://mail.google.com/mail/u/1/#inbox/thread001')?.type
    expect(type).toBe('gmail_thread')
    const { Icon, color } = iconForType(type)
    expect(Icon).toBe(Mail)
    expect(color).toBe('var(--link-gmail-thread)')
  })

  it('Gmail draft URL → PencilLine icon', () => {
    const type = normalizeLink('https://mail.google.com/mail/u/1/#drafts/msg001')?.type
    expect(type).toBe('gmail_draft')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(PencilLine)
  })

  it('Box folder URL → Box icon', () => {
    const type = normalizeLink('https://umn.box.com/folder/123456')?.type
    expect(type).toBe('box_folder')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(Box)
  })

  it('GitHub repo URL → FolderGit2 icon', () => {
    const type = normalizeLink('https://github.com/nicholas-ingraham/mn-ccore-lab')?.type
    expect(type).toBe('github_repo')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(FolderGit2)
  })

  it('GitHub issue URL → CircleDot icon', () => {
    const type = normalizeLink('https://github.com/nicholas-ingraham/mn-ccore-lab/issues/42')?.type
    expect(type).toBe('github_issue')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(CircleDot)
  })

  it('Generic https URL → Globe icon (web type)', () => {
    const type = normalizeLink('https://example.com/some-page')?.type
    expect(type).toBe('web')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(Globe)
  })

  it('null URL → normalizeLink returns null; iconForType fallback is Globe', () => {
    const link = normalizeLink(null)
    expect(link).toBeNull()
    // When no type, the consumer falls back to iconForType(undefined) = web.
    const { Icon } = iconForType(undefined)
    expect(Icon).toBe(Globe)
  })

  it('unknown URL returns web type and Globe icon', () => {
    // A URL not matched by any rule falls through to the web catch-all.
    const type = normalizeLink('https://not-a-special-domain.org/path')?.type
    expect(type).toBe('web')
    const { Icon } = iconForType(type)
    expect(Icon).toBe(Globe)
  })
})

// ── Stored-type vs normalizer precedence ────────────────────────────────────
// The consumers use `link.type || normalizeLink(url)?.type` — verify that
// when a stored type is provided, it takes precedence over the normalizer.

describe('stored type takes precedence over normalizer fallback', () => {
  it('stored type overrides URL-inferred type', () => {
    // A Gmail URL would normally resolve to gmail_thread, but the stored type
    // says google_doc (hypothetical enrichment/override scenario).
    const storedType = 'google_doc'
    const url = 'https://mail.google.com/mail/u/1/#inbox/thread001'
    const resolvedType = storedType || normalizeLink(url)?.type
    expect(resolvedType).toBe('google_doc')
    const { Icon } = iconForType(resolvedType)
    expect(Icon).toBe(FileText)
  })

  it('normalizer runs when stored type is null', () => {
    const storedType: string | null = null
    const url = 'https://mail.google.com/mail/u/1/#inbox/thread001'
    const resolvedType = storedType || normalizeLink(url)?.type
    expect(resolvedType).toBe('gmail_thread')
  })
})
