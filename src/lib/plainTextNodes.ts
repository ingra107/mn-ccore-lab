import type { JSONContent } from '@tiptap/react'

// A task whose body was stored as plain text (no Tiptap JSON yet) loads as one
// text node, and Tiptap's autolink only fires on typing, so bare URLs stayed
// dead. Split them into link-marked nodes on load.
export function plainTextNodes(text: string): JSONContent[] {
  const out: JSONContent[] = []
  const re = /https?:\/\/[^\s<>"]+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const trail = m[0].match(/[.,;:!?)\]}'"]+$/)?.[0] ?? ''
    const url = trail ? m[0].slice(0, -trail.length) : m[0]
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    out.push({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
    last = m.index + url.length
    re.lastIndex = last
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}
