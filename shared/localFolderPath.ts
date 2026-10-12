// shared/localFolderPath.ts -- the ONE rule for "my folder for this project"
// (schema-v127 project_member_folders). Imported by the API route (the value
// guard) and the UI (the input's live hint), so the two cannot drift. The
// schema's CHECKs are the arbiter's backstop for the same shape.
//
// Accepted: an absolute local path on the person's own computer.
//   Windows  C:\Users\casey\Box\Sepsis   (or C:/Users/...)
//   macOS    /Users/steven/Library/CloudStorage/Box-Box/Sepsis
// Refused, with a reason a person can act on:
//   - a web link (https://...), a file:// URL, a network share (\\host\share
//     or //host/share), a relative path, ~/ (the launcher would have to guess
//     whose home), a double quote anywhere, a control character, > 1024 chars.
//
// Pasting is forgiving: surrounding whitespace and the double quotes Windows
// Explorer's "Copy as path" adds are stripped, and trailing separators are
// trimmed (a drive root keeps its one). Nothing else is rewritten; the path is
// stored as the person typed it.

export const LOCAL_FOLDER_MAX = 1024

export type LocalFolderCheck =
  | { ok: true; path: string; os: 'windows' | 'posix' }
  | { ok: false; reason: string }

// eslint-disable-next-line no-control-regex -- the point is to find control characters
const CONTROL = /[\u0000-\u001f\u007f]/

export function checkLocalFolderPath(raw: unknown): LocalFolderCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Enter a folder path.' }
  let p = raw.trim()
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1).trim()
  if (!p) return { ok: false, reason: 'Enter a folder path.' }
  if (CONTROL.test(p)) return { ok: false, reason: 'The path has a line break or other control character in it.' }
  if (p.includes('"')) return { ok: false, reason: 'The path cannot contain a double quote (").' }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
    return { ok: false, reason: 'That is a link, not a folder on your computer. Paste the folder path, for example C:\\Users\\you\\Box\\Project.' }
  }
  if (p.startsWith('\\\\') || p.startsWith('//')) {
    return { ok: false, reason: 'Network shares are not supported. Use a folder on your own computer (Box Drive folders are fine).' }
  }
  if (p.startsWith('~')) {
    return { ok: false, reason: 'Write the full path instead of ~ (for example /Users/you/...).' }
  }
  let os: 'windows' | 'posix'
  if (/^[A-Za-z]:[\\/]/.test(p)) {
    os = 'windows'
    p = p.replace(/[\\/]+$/, '')
    if (/^[A-Za-z]:$/.test(p)) p += '\\'
  } else if (p.startsWith('/')) {
    os = 'posix'
    p = p.replace(/\/+$/, '')
    if (!p) return { ok: false, reason: 'Pick a project folder, not the whole disk.' }
  } else {
    return { ok: false, reason: 'Use the full path, starting with a drive letter (C:\\...) or a slash (/Users/...).' }
  }
  if (p.length < 3) return { ok: false, reason: 'Pick a project folder, not the whole disk.' }
  if (p.length > LOCAL_FOLDER_MAX) return { ok: false, reason: `The path is longer than ${LOCAL_FOLDER_MAX} characters.` }
  return { ok: true, path: p, os }
}
