// The text "Copy summary" puts on the clipboard: what the meeting page shows.
// Action items come in already prepared (lib/meetingActionItems: deduped, open
// first), and people read by first name, never a raw slug.

import { taskShortLabel } from './displayNames'
import { isTaskDone } from './taskGrouping'
import type { TaskRow } from './api'

export function meetingSummaryText(input: {
  title: string
  date: string
  notes?: string | null
  /** The debrief's list, then the ones logged on the page. */
  decisions: readonly string[]
  actionItems: readonly TaskRow[]
  firstName: (slug: string) => string
}): string {
  const lines = [`# ${input.title}`, `Date: ${input.date}`, '']
  if (input.decisions.length > 0) {
    lines.push('## Decisions')
    input.decisions.forEach((d) => lines.push(`- ${d}`))
    lines.push('')
  }
  const open = input.actionItems.filter((a) => !isTaskDone(a))
  if (open.length > 0) {
    lines.push('## Open Action Items')
    open.forEach((a) => lines.push(`- [ ] ${taskShortLabel(a)}${a.assignee ? ` (${input.firstName(a.assignee)})` : ''}`))
    lines.push('')
  }
  if (input.notes) {
    lines.push('## Notes')
    lines.push(input.notes)
  }
  return lines.join('\n')
}
