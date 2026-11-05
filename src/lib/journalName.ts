// journalName: how the public site prints a journal, display only. Stored data and
// citation exports keep the source spelling. Two shapes of name arrive wrong:
//   shouting: "JOURNAL OF PALLIATIVE MEDICINE" (no lowercase letter at all)
//   sentence: "Critical care medicine" (later words left lowercase)
// A blanket title case breaks real names, so it never touches a word that already
// has a capital in a mixed name (ATS Scholar, JCI Insight, The FASEB Journal), and a
// shouting name keeps the words on the keep-as-is list (JAMA, CHEST, AIDS).
// A parenthesis, a number and a single letter stay as they came: "Research Square
// (preprint)", "21st", "Alzheimer s & Dementia" (broken in the source, not ours to guess).

const KEEP_CAPS = new Set(['JAMA', 'CHEST', 'AIDS', 'HPB', 'BMC', 'BMJ', 'NEJM', 'PLOS', 'ONE', 'USA', 'UK', 'COPD', 'ARDS', 'ICU', 'HIV'])
const KEEP_LOWER = new Set(['npj'])
const SMALL = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'with'])

function capitalize(word: string): string {
  return word[0].toUpperCase() + word.slice(1)
}

function titleWord(word: string, first: boolean, shouting: boolean): string {
  const core = word.replace(/[.,:;]$/, '')
  const tail = word.slice(core.length)
  if (shouting) {
    if (!/^\p{L}{2,}$/u.test(core) || KEEP_CAPS.has(core)) return word
    const lower = core.toLowerCase()
    return (!first && SMALL.has(lower) ? lower : capitalize(lower)) + tail
  }
  if (!/^\p{Ll}{2,}$/u.test(core) || KEEP_LOWER.has(core) || (!first && SMALL.has(core))) return word
  return capitalize(core) + tail
}

/** The journal as the public site shows it. Empty stays empty. */
export function journalDisplayName(raw: string | null | undefined): string {
  if (!raw) return ''
  const shouting = !/\p{Ll}/u.test(raw)
  return raw.trim().split(/\s+/).map((w, i) => titleWord(w, i === 0, shouting)).join(' ')
}
