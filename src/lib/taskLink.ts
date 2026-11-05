// The one place a link to a task is built. Every surface that hands out a task
// link (copy link, open in new tab, palette, rail cards, Hermes citations)
// calls this, so the param name cannot drift from what My Tasks reads.
// My Tasks consumes `?open=` through useOpenParam.
import { PATHS } from '../constants/paths'

/** Path + query that opens task `id` in the My Tasks drawer. */
export function taskLinkFor(id: string): string {
  return `${PATHS.myTasks}?open=${encodeURIComponent(id)}`
}
