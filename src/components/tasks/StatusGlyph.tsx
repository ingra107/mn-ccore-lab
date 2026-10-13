// StatusGlyph: the shape that carries a task's status once color is gone
// (Wave 3 item 5, option A). Gray by default; teal only for In Progress;
// orange for stale and red for overdue, the two states that earn a hue
// (rules-ui-design principle 21). The word beside it still names the status,
// and the glyph is aria-hidden so a screen reader hears the word once.
//   To Do = empty ring, In Progress = half fill, Waiting = dashed ring,
//   Blocked = ring with a center dot, Done = solid.

export type StatusGlyphTone = 'stale' | 'overdue'

const SHAPE: Record<string, string> = {
  todo: 'sg-todo', in_progress: 'sg-half', waiting_external: 'sg-wait', blocked: 'sg-blk', done: 'sg-full',
}

export function StatusGlyph({ status, tone }: { status: string; tone?: StatusGlyphTone }) {
  const cls = tone ? `sg sg-full sg-${tone}` : `sg ${SHAPE[status] ?? 'sg-todo'}`
  return <i className={cls} aria-hidden="true" />
}
