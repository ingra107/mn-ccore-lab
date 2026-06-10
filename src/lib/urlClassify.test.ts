import { describe, it, expect } from 'vitest'
import {
  normalizeLocalFolderPath,
  buildOpenFolderUri,
  buildWorkOnUri,
  classifyUrl,
  obsidianVaultRelPath,
  buildObsidianUri,
  shortLabelForUrl,
  gmailKind,
} from './urlClassify'

// The three real `projects.primary_folder` shapes seen in live /api/projects data.
// normalizeLocalFolderPath must collapse all three to the SAME canonical
// forward-slash form the mnccore:// Windows handler can `if exist`-check.
const FILE_URL = 'file:///C:/Users/ingra107/Box/Research/K%20proposal/.ADHERE-LPV/'
const PLAIN_FORWARD = 'C:/Users/ingra107/Box/CIRCLE/CIRCLE_ORIGIN'
const BACKSLASH_SPACES =
  'C:\\Users\\ingra107\\Box\\Kick_Ingraham\\Nick\\.Attending_Assistant Prof\\ATS Early Career Working Group'

describe('normalizeLocalFolderPath', () => {
  it('strips file:/// prefix, percent-decodes, and trims the trailing slash', () => {
    expect(normalizeLocalFolderPath(FILE_URL)).toBe(
      'C:/Users/ingra107/Box/Research/K proposal/.ADHERE-LPV',
    )
  })

  it('leaves an already-canonical plain forward-slash path unchanged', () => {
    expect(normalizeLocalFolderPath(PLAIN_FORWARD)).toBe(
      'C:/Users/ingra107/Box/CIRCLE/CIRCLE_ORIGIN',
    )
  })

  it('converts backslashes to forward slashes and preserves embedded spaces', () => {
    expect(normalizeLocalFolderPath(BACKSLASH_SPACES)).toBe(
      'C:/Users/ingra107/Box/Kick_Ingraham/Nick/.Attending_Assistant Prof/ATS Early Career Working Group',
    )
  })

  it('returns empty string for empty / falsy input', () => {
    expect(normalizeLocalFolderPath('')).toBe('')
  })

  it('preserves a UNC share root prefix', () => {
    expect(normalizeLocalFolderPath('\\\\server\\share\\folder\\')).toBe('//server/share/folder')
  })

  it('does not throw on a malformed percent escape — returns the path slash-normalized', () => {
    expect(normalizeLocalFolderPath('C:\\bad%path\\here')).toBe('C:/bad%path/here')
  })
})

describe('buildOpenFolderUri / buildWorkOnUri use the normalized path', () => {
  it('builds mnccore://open with a clean path from a file:/// + percent value', () => {
    expect(buildOpenFolderUri(FILE_URL)).toBe(
      'mnccore://open/C:/Users/ingra107/Box/Research/K proposal/.ADHERE-LPV',
    )
  })

  it('builds mnccore://workon with backslashes flipped + spaces preserved', () => {
    expect(buildWorkOnUri(BACKSLASH_SPACES)).toBe(
      'mnccore://workon/C:/Users/ingra107/Box/Kick_Ingraham/Nick/.Attending_Assistant Prof/ATS Early Career Working Group',
    )
  })
})

describe('classifyUrl routes local folders through the normalizer', () => {
  it('a file:/// folder classifies as Folder with a normalized mnccore://open href', () => {
    const c = classifyUrl(FILE_URL)
    expect(c.typeLabel).toBe('Folder')
    expect(c.isHttp).toBe(false)
    expect(c.href).toBe('mnccore://open/C:/Users/ingra107/Box/Research/K proposal/.ADHERE-LPV')
  })

  it('an http URL is untouched', () => {
    const c = classifyUrl('https://github.com/ingra107/mn-ccore-lab')
    expect(c.typeLabel).toBe('Link')
    expect(c.isHttp).toBe(true)
    expect(c.href).toBe('https://github.com/ingra107/mn-ccore-lab')
  })
})

describe('Obsidian vault markdown classification', () => {
  it('extracts the vault-relative path (no .md) for a work-machine vault note', () => {
    expect(
      obsidianVaultRelPath('C:/Users/ingra107/Peripheral-Brain/Projects/clif/PROJECT.md'),
    ).toBe('Projects/clif/PROJECT')
  })

  it('works for the home-machine user dir too (no hardcoded username)', () => {
    expect(
      obsidianVaultRelPath('C:/Users/ingra/Peripheral-Brain/Context/Topics/rules.md'),
    ).toBe('Context/Topics/rules')
  })

  it('returns null for a non-.md file inside the vault', () => {
    expect(
      obsidianVaultRelPath('C:/Users/ingra107/Peripheral-Brain/data/brain.db'),
    ).toBeNull()
  })

  it('returns null for a .md file outside the vault', () => {
    expect(obsidianVaultRelPath('C:/Users/ingra107/Box/Research/notes.md')).toBeNull()
  })

  it('builds the obsidian://open URI with the verified vault name + slashes intact', () => {
    expect(buildObsidianUri('Projects/clif/PROJECT')).toBe(
      'obsidian://open?vault=Peripheral-Brain&file=Projects/clif/PROJECT',
    )
  })

  it('percent-encodes spaces in the note path but keeps folder slashes', () => {
    expect(buildObsidianUri('Context/Meeting Notes/2026-06-10')).toBe(
      'obsidian://open?vault=Peripheral-Brain&file=Context/Meeting%20Notes/2026-06-10',
    )
  })

  it('classifyUrl routes a vault .md key link to Obsidian, not Explorer', () => {
    const c = classifyUrl(
      'file:///C:/Users/ingra107/Peripheral-Brain/Projects/clif/PROJECT.md',
    )
    expect(c.typeLabel).toBe('Obsidian')
    expect(c.isHttp).toBe(false)
    expect(c.href).toBe('obsidian://open?vault=Peripheral-Brain&file=Projects/clif/PROJECT')
  })

  it('classifyUrl still treats a non-vault .md path as a plain folder open', () => {
    const c = classifyUrl('C:/Users/ingra107/Box/Research/notes.md')
    expect(c.typeLabel).toBe('Folder')
    expect(c.href).toBe('mnccore://open/C:/Users/ingra107/Box/Research/notes.md')
  })

  it('shortLabelForUrl labels a vault note as "Obsidian · <name>"', () => {
    expect(
      shortLabelForUrl('C:/Users/ingra107/Peripheral-Brain/Projects/clif/PROJECT.md'),
    ).toBe('Obsidian · PROJECT')
  })
})

describe('Gmail link vocabulary (TODAY.md parity, 2026-06-10)', () => {
  const THREAD = 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQbdrXmKlPqRsTv'
  const DRAFT = 'https://mail.google.com/mail/u/0/#drafts?compose=ABCdef123'

  it('gmailKind distinguishes thread vs draft vs non-gmail', () => {
    expect(gmailKind(THREAD)).toBe('thread')
    expect(gmailKind(DRAFT)).toBe('draft')
    expect(gmailKind('https://github.com/ingra107/mn-ccore-lab')).toBeNull()
    expect(gmailKind('C:/Users/ingra107/Box')).toBeNull()
  })

  it('classifyUrl gives Gmail links the Gmail typeLabel and keeps them http', () => {
    const c = classifyUrl(THREAD)
    expect(c.typeLabel).toBe('Gmail')
    expect(c.isHttp).toBe(true)
    expect(c.href).toBe(THREAD)
  })

  it('shortLabelForUrl labels Gmail thread and draft semantically', () => {
    expect(shortLabelForUrl(THREAD)).toBe('Gmail thread')
    expect(shortLabelForUrl(DRAFT)).toBe('Gmail draft')
  })
})
