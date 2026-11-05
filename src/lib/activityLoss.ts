// What a task delete takes with it, for its Undo toast. The delete hard-removes
// the task's activity_entries (applyDelete, api/routes/mutations.ts), so this is
// the one moment to say so. Counts what the viewer's feed shows; @me entries by
// someone else are not in it.

export interface ActivityLossEntry {
  kind: string
  reply_count?: number | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** " with 3 comments and 1 note", or '' when no message goes with the task. */
export function activityLossPhrase(entries: ActivityLossEntry[] | undefined): string {
  let comments = 0
  let notes = 0
  for (const e of entries ?? []) {
    if (e.kind === 'comment') comments++
    else if (e.kind === 'update') notes++
    else continue
    comments += e.reply_count ?? 0
  }
  const parts = [comments && plural(comments, 'comment'), notes && plural(notes, 'note')].filter(Boolean)
  return parts.length ? ` with ${parts.join(' and ')}` : ''
}
