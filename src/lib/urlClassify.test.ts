import { describe, it, expect } from 'vitest'
import {
  normalizeLocalFolderPath,
  buildOpenFolderUri,
  buildWorkOnUri,
  classifyUrl,
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
