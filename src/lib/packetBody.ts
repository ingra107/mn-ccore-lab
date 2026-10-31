// Split a packet's draft body into plain text and numbered highlights, one
// per call anchor. Kept out of PacketBlock.tsx so that file exports only
// components (react-refresh).

import type { DeliverableKind, PacketCall } from '../../shared/packets'

/** Split the body into plain text and numbered highlights, one per call anchor.
 *  An anchor that is missing or overlaps an earlier one is left unmarked. */
export function segmentBody(body: string, calls: PacketCall[]): Array<{ text: string; n?: number }> {
  const spans: { start: number; end: number; n: number }[] = []
  calls.forEach((c, i) => {
    if (!c.anchor) return
    const start = body.indexOf(c.anchor)
    if (start < 0) return
    const end = start + c.anchor.length
    if (spans.some((s) => start < s.end && end > s.start)) return
    spans.push({ start, end, n: i + 1 })
  })
  spans.sort((a, b) => a.start - b.start)
  const out: Array<{ text: string; n?: number }> = []
  let at = 0
  for (const s of spans) {
    if (s.start > at) out.push({ text: body.slice(at, s.start) })
    out.push({ text: body.slice(s.start, s.end), n: s.n })
    at = s.end
  }
  if (at < body.length) out.push({ text: body.slice(at) })
  return out
}

/** Button and note wording per deliverable kind. Only gmail_draft opens a tab;
 *  doc_text copies the body; answer just records the click. */
export function kindCopy(kind: DeliverableKind): { button: string; used: string; dismissed: string } {
  if (kind === 'doc_text') return { button: 'Copy text', used: 'Copied. Paste it where it goes.', dismissed: 'Dismissed.' }
  if (kind === 'answer') return { button: 'Got it', used: 'Marked as used.', dismissed: 'Dismissed.' }
  return { button: 'Use', used: 'Opened in Gmail. Nothing was sent.', dismissed: 'Dismissed here; draft stays in Gmail.' }
}
