// tiptapToMarkdown.ts -- turn a stored Tiptap document (tasks.description_json)
// into the plain markdown `description` holds.
//
// The task body is ONE plain-markdown `description` (Nick, 2026-11-01: "Yes,
// one plain-markdown store (Recommended)"). description_json was the Tiptap
// editor's private store (added 2026-04-08); nothing reads it but the task
// panel. This converter serves two callers and both go away with the column:
//   - descriptionJsonFold(): the panel's read fallback for a row whose
//     description_json still holds text description lacks;
//   - scripts/fold-description-json.ts: the one-off fold of those rows.
// Both classify through descriptionJsonFold(), so the panel shows exactly
// what the fold will write. REMOVE WITH THE description_json COLUMN DROP.
//
// Pure TS, no Tiptap import: it reads the stored JSON shape (StarterKit nodes
// and marks, plus taskList/mention in case an older editor wrote them).

import { stripMeetingMarker } from './textUtils'

interface TNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type?: string; attrs?: Record<string, unknown> }[]
  content?: TNode[]
}

function wrap(text: string, open: string, close = open): string {
  // Markdown emphasis may not start or end on whitespace: keep it outside.
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/)!
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : text
}

function inline(nodes: TNode[] | undefined): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') { out += '\n'; continue }
    if (n.type === 'mention') { out += `@${String(n.attrs?.label ?? n.attrs?.id ?? '')}`; continue }
    if (n.type === 'image') { out += `![${String(n.attrs?.alt ?? '')}](${String(n.attrs?.src ?? '')})`; continue }
    if (n.type !== 'text') { out += inline(n.content); continue }
    let t = n.text ?? ''
    const marks = n.marks ?? []
    const has = (k: string) => marks.some((mk) => mk.type === k)
    if (has('code')) t = wrap(t, '`')
    else {
      if (has('bold')) t = wrap(t, '**')
      if (has('italic')) t = wrap(t, '*')
      if (has('strike')) t = wrap(t, '~~')
    }
    const link = marks.find((mk) => mk.type === 'link')
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : ''
    // A link whose text is its own URL stays a bare URL (BodyText linkifies it).
    if (href) t = t.trim() === href ? t : `[${t}](${href})`
    out += t
  }
  return out
}

function indent(text: string, pad: string): string {
  return text.split('\n').map((l, i) => (i === 0 || l === '' ? l : pad + l)).join('\n')
}

function block(n: TNode): string {
  switch (n.type) {
    case 'paragraph': return inline(n.content)
    case 'heading': {
      const level = Math.min(Math.max(Number(n.attrs?.level) || 2, 1), 6)
      return `${'#'.repeat(level)} ${inline(n.content)}`
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const start = Number(n.attrs?.start) || 1
      return (n.content ?? []).map((li, i) => {
        const marker = n.type === 'orderedList' ? `${start + i}. `
          : n.type === 'taskList' ? `- [${li.attrs?.checked ? 'x' : ' '}] ` : '- '
        const body = (li.content ?? []).map(block).filter(Boolean).join('\n')
        return marker + indent(body, ' '.repeat(marker.length))
      }).join('\n')
    }
    case 'blockquote':
      return blocks(n.content).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')
    case 'codeBlock': {
      const lang = typeof n.attrs?.language === 'string' ? n.attrs.language : ''
      return `\`\`\`${lang}\n${(n.content ?? []).map((c) => c.text ?? '').join('')}\n\`\`\``
    }
    case 'horizontalRule': return '---'
    default: return n.content ? blocks(n.content) : inline([n])
  }
}

function blocks(nodes: TNode[] | undefined): string {
  return (nodes ?? []).map(block).filter((b) => b.trim() !== '').join('\n\n')
}

/** Markdown for a stored Tiptap document; null when it is not a parseable doc. */
export function tiptapJsonToMarkdown(json: string | null | undefined): string | null {
  if (!json) return null
  let doc: TNode
  try { doc = JSON.parse(json) as TNode } catch { return null }
  if (!doc || typeof doc !== 'object') return null
  return blocks(doc.type === 'doc' ? doc.content : [doc]).trim()
}

// Whole words (letters and digits), lowercased: markdown punctuation,
// whitespace and case differ between the two stores without the words
// differing. Whole words, never a joined letter string: "OK" is not inside
// "Return the book" just because its letters are.
const tokens = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []

/** True when `needle` occurs as a contiguous run of whole words in `hay`. */
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0) return true
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let j = 0
    while (j < needle.length && hay[i + j] === needle[j]) j++
    if (j === needle.length) return true
  }
  return false
}

export type DescriptionJsonFold =
  /** Nothing to fold: no JSON, an empty or unparseable doc, or every word of
   *  it is already in description (the editor only loaded it, or it was folded). */
  | { kind: 'none' }
  /** description is empty: the JSON text becomes the body. */
  | { kind: 'fill'; md: string }
  /** description's words occur, in order and unbroken, inside the JSON: the
   *  old editor loaded the plain text and the user added to it. FOLD ONLY:
   *  the panel never lets JSON stand in for the stored description. */
  | { kind: 'supersede'; md: string }
  /** The two say different things: keep both. */
  | { kind: 'append'; md: string }

/**
 * How description_json relates to `description`. The meeting marker is
 * ignored (the old editor loaded the text with it stripped). Any outcome but
 * `none` means the JSON carries words description lacks.
 * REMOVE WITH THE description_json COLUMN DROP.
 */
export function descriptionJsonFold(
  description: string | null | undefined,
  descriptionJson: string | null | undefined,
): DescriptionJsonFold {
  const md = tiptapJsonToMarkdown(descriptionJson)
  const j = md ? tokens(md) : []
  if (!md || j.length === 0) return { kind: 'none' }
  const d = tokens(stripMeetingMarker(description ?? ''))
  const have = new Set(d)
  if (j.every((w) => have.has(w))) return { kind: 'none' }
  if (d.length === 0) return { kind: 'fill', md }
  return containsRun(j, d) ? { kind: 'supersede', md } : { kind: 'append', md }
}
